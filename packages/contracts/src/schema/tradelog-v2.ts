// Trade log v2 ("D · AI" trade log): server-side filtered, sorted and paged
// list of an account's positions, with the dashboard's per-trade process grade
// and rule flags, a summary of the current filter, a daily P&L strip, and
// compact price paths for the rows on screen. Nothing here is sample data:
// anything that can't be computed honestly (too few trades for grades, no R,
// no price data for a symbol) comes back null and the page hides it.
//
// Conventions shared with Dashboard v2 (schema/dashboard-v2.ts):
//   • Sessions and hours are by the UTC hour of the trade's OPEN.
//   • A win is net P&L > 0 (fees and swap included).
//   • Grades use the whole account's closed history as the baseline, so a
//     trade's grade doesn't change with the filter (needs ≥ 20 closed trades).
//   • Days are the viewer's calendar days (`tz`), by close time.
import { z } from 'zod';
import { DASH_RANGES, DASH_SESSIONS, type AiLine, type DashSession, type ProcessGrade } from './dashboard-v2.js';
import type { PositionLevelsDTO, StopMove } from './trade-data.js';

export const TL_RESULTS = ['win', 'loss', 'tp', 'sl', 'stopout', 'manual', 'bigloss', 'open'] as const;
export type TlResult = (typeof TL_RESULTS)[number];
/** 'user-rule' = one of the trader's own rules (Settings › Trading rules). */
export const TL_RULES = ['after-losses', 'revenge', 'oversized', 'losing-hour', 'r-tail', 'user-rule'] as const;
export type TlRuleKey = (typeof TL_RULES)[number];
export const TL_RULE_FILTERS = ['any', 'none', ...TL_RULES] as const;
export type TlRuleFilter = (typeof TL_RULE_FILTERS)[number];
export const TL_SORTS = ['time', 'net', 'hold', 'symbol', 'r'] as const;
export type TlSort = (typeof TL_SORTS)[number];

const id = z.string().min(1).max(64);
const filterFields = {
  accountId: id,
  range: z.enum(DASH_RANGES).default('ALL'),
  /** Custom window (epoch ms, both ends included, by close time). Overrides `range`. */
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  symbol: z.string().min(1).max(40).optional(),
  side: z.enum(['LONG', 'SHORT']).optional(),
  session: z.enum(DASH_SESSIONS).optional(),
  result: z.enum(TL_RESULTS).optional(),
  tag: z.string().min(1).max(60).optional(),
  /** Comma list of grades, e.g. "D,F". */
  grade: z.string().regex(/^[ABCDF](,[ABCDF]){0,4}$/).optional(),
  rule: z.enum(TL_RULE_FILTERS).optional(),
  /** Search: symbol, ticket, tag, emotion or note text. */
  q: z.string().trim().max(80).optional(),
  /** IANA time zone for day grouping (falls back to UTC when unknown). */
  tz: z.string().max(64).optional(),
};

export const tradelogQuerySchema = z.object({
  ...filterFields,
  sort: z.enum(TL_SORTS).default('time'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  offset: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TradelogQuery = z.infer<typeof tradelogQuerySchema>;

/** Every row matching the filters (CSV export), no paging. */
export const tradelogExportSchema = z.object({
  ...filterFields,
  sort: z.enum(TL_SORTS).default('time'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type TradelogExportQuery = z.infer<typeof tradelogExportSchema>;

export const tradelogTradeQuerySchema = z.object({ accountId: id, id, tz: z.string().max(64).optional() });
export type TradelogTradeQuery = z.infer<typeof tradelogTradeQuerySchema>;

export const tradelogPathsSchema = z.object({ accountId: id, ids: z.array(id).min(1).max(40) });
export type TradelogPathsInput = z.infer<typeof tradelogPathsSchema>;

export const tradelogTagSchema = z.object({ accountId: id, ids: z.array(id).min(1).max(500), tag: z.string().trim().min(1).max(40) });
export type TradelogTagInput = z.infer<typeof tradelogTagSchema>;

export type TlExitReason = 'tp' | 'sl' | 'stopout' | 'other';

/** A rule the trade broke (the same checks as the dashboard's process grade). */
export interface TlFlag {
  key: TlRuleKey;
  /** Chip text, 2–3 words ("After 2L"). */
  short: string;
  /** Longer form with the trade's own number ("After 3 losses that day"). */
  label: string;
}

export interface TlRow {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  /** Epoch ms. */
  openTime: number;
  closeTime: number | null;
  /** Viewer-local close day "YYYY-MM-DD" ("open" while the position is open). */
  day: string;
  session: DashSession;
  volume: number;
  entry: number;
  exit: number | null;
  net: number;
  gross: number;
  commission: number;
  swap: number;
  /** Stored R-multiple (needs a stop at entry). */
  r: number | null;
  holdSecs: number | null;
  exitReason: TlExitReason | null;
  /** Stop / target price, only when the closing deal says it was hit ("[sl 1.0812]"). */
  sl: number | null;
  tp: number | null;
  grade: ProcessGrade | null;
  flags: TlFlag[];
  tags: string[];
  emotion: string | null;
  /** Has a journal note with text. */
  noted: boolean;
  /** The stop was moved after entry (only with recorded stop levels). */
  moved?: StopMove;
}

export interface TlDay {
  day: string;
  n: number;
  wins: number;
  net: number;
  /** Trades that broke at least one rule. */
  ruleBroken: number;
  /** Win/loss per trade in time order (≤ 12), for the dots. */
  results: Array<'w' | 'l'>;
}

export interface TlSummary {
  trades: number;
  wins: number;
  losses: number;
  /** Open positions matching the filter (not in the numbers below). */
  open: number;
  net: number;
  perTrade: number;
  winRate: number;
  profitFactor: number | null;
  /** R figures only when most trades in the view have R. */
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  avgWin: number;
  avgLoss: number;
  avgHoldSecs: number | null;
  avgHoldWinSecs: number | null;
  avgHoldLossSecs: number | null;
  /** null when grades aren't available. */
  ruleBroken: { n: number; net: number } | null;
  /** Commission + swap (negative = paid). */
  fees: number;
  commission: number;
  swap: number;
  gradeMix: Record<ProcessGrade, number> | null;
}

export interface TlStripDay { day: string; net: number; n: number; inView: boolean }

export interface TlViewCounts {
  all: number;
  ruleBroken: number | null;
  gradeDF: number | null;
  bigLosers: number | null;
}

export interface TradelogDTO {
  asOf: string;
  window: { from: number | null; to: number | null };
  tz: string;
  counts: {
    /** Rows matching every filter (open positions included). */
    matching: number;
    /** Positions in the date window (no other filters). */
    inWindow: number;
    /** Closed trades on the account, any date. */
    allClosed: number;
    /** All positions on the account, any date (open included). */
    all: number;
    withR: number;
  };
  minTrades: number;
  /** Grades and rule flags are available (enough closed trades). */
  graded: boolean;
  /** R columns are shown (most trades in the window carry R). */
  useR: boolean;
  /** How "big loser" is measured in this window. */
  bigLoss: { unit: 'R'; threshold: -1 } | { unit: '$'; threshold: number } | null;
  options: { symbols: Array<{ symbol: string; trades: number }>; tags: string[] };
  views: TlViewCounts;
  summary: TlSummary | null;
  strip: { days: TlStripDay[]; ai: (AiLine & { rule: TlRuleKey }) | null };
  rows: TlRow[];
  /** Totals over every matching trade, for the days that appear in `rows`. */
  days: TlDay[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface TlReason { key: TlRuleKey; label: string; detail: string }
/** Same matching as the full trade review (insights/trade-review.ts similarTrades). */
export interface TlSimilar {
  /** What matched, e.g. ["NAS100", "Shorts", "NY session", "After 2 losses"]. */
  criteria: string[];
  n: number;
  wins: number;
  net: number;
  /** Net of the most recent matches, oldest first (≤ 12). */
  results: number[];
  ids: string[];
}
export interface TradelogTradeDTO {
  row: TlRow;
  graded: boolean;
  reasons: TlReason[];
  similar: TlSimilar | null;
  note: { id: string; body: string; emotion: string | null; tags: string[] } | null;
  /** Account balance before this trade closed (for % figures); null when unknown. */
  balanceBefore: number | null;
  /** Stop / target levels and the editor's state (trade-data). */
  levels?: PositionLevelsDTO;
}

/** Compact price path for a row's mini chart: closes between entry and exit. */
export interface TlPath {
  id: string;
  tf: string;
  /** Prices from the entry fill to the exit fill (≤ 48 points). */
  points: number[];
  lo: number;
  hi: number;
  entry: number;
  exit: number;
  sl: number | null;
  tp: number | null;
}
export interface TradelogPathsDTO { paths: Record<string, TlPath | null> }
export interface TradelogTagDTO { updated: number; created: number }
