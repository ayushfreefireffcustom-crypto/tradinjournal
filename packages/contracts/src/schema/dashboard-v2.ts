// Dashboard v2 ("D · AI" pro grid): one call that returns every widget's
// numbers, computed server-side from the account's closed trades, plus the
// deterministic "Ask your journal" answers. Nothing here is sample data: when a
// block can't be computed honestly (too few trades, no R, no MAE/MFE) its field
// is null and the page shows an empty state.
//
// Sessions are by UTC hour of the trade's open (same cut-offs as the AI coach,
// packages/core/src/analysis/context.ts): Asia 22:00–07:00, London 07:00–13:00,
// New York 13:00–22:00.
import { z } from 'zod';

export const DASH_RANGES = ['7D', '30D', '90D', '1Y', 'ALL'] as const;
export type DashRange = (typeof DASH_RANGES)[number];
export const DASH_SESSIONS = ['ASIA', 'LONDON', 'NY'] as const;
export type DashSession = (typeof DASH_SESSIONS)[number];

const filterFields = {
  accountId: z.string().min(1).max(64),
  range: z.enum(DASH_RANGES).default('90D'),
  /** Custom window (epoch ms, both ends included). Overrides `range` when both are set. */
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  symbol: z.string().min(1).max(40).optional(),
  session: z.enum(DASH_SESSIONS).optional(),
  side: z.enum(['LONG', 'SHORT']).optional(),
  tag: z.string().min(1).max(60).optional(),
};

export const dashboardV2QuerySchema = z.object(filterFields);
export type DashboardV2Query = z.infer<typeof dashboardV2QuerySchema>;

export const dashboardAskSchema = z.object({ ...filterFields, q: z.string().trim().min(1).max(300) });
export type DashboardAskInput = z.infer<typeof dashboardAskSchema>;

/** An AI one-liner: a short label plus one number, formatted by the client. */
export interface AiLine {
  text: string;
  value: number | null;
  fmt: 'money' | 'pct' | 'r' | 'int' | 'text';
  tone: 'up' | 'dn' | 'flat';
  /** Shown after the value (e.g. "on 18 trades"). */
  suffix?: string;
  /** How many trades the line is computed from. */
  trades: number;
}

export interface DashKpis {
  netPnl: number;
  /** Balance carried into the window (start of range), the base for % figures. */
  startBalance: number;
  /** netPnl / startBalance, null when the start balance is not positive. */
  returnPct: number | null;
  /** Account balance now and its all-time peak (not filtered). */
  balance: number;
  peakBalance: number;
  /** The last 30 days that had a closed trade. */
  last30: { net: number; days: number; green: number };
  winRate: number;
  /** 20-trade rolling win rate, oldest first (sampled to ≤40 points). */
  rollingWinRate: number[];
  profitFactor: number | null;
  grossProfit: number;
  grossLoss: number;
  expectancy: number;
  expectancyR: number | null;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: { pct: number; amount: number; at: string } | null;
  equitySpark: number[];
}

export interface EquityPointDTO {
  /** Close time, epoch ms. */
  t: number;
  /** Balance after this trade (or day). */
  v: number;
  /** Trade P&L (or day net). */
  pnl: number;
  /** In the top leak (red dot). */
  leak?: 1;
  /** The stop was widened after entry (only with recorded stop levels). */
  moved?: 1;
}

export interface DashEquity {
  start: number;
  trades: EquityPointDTO[];
  days: EquityPointDTO[];
  /** Deepest peak-to-trough fall of the curve. */
  drawdown: { pct: number; amount: number; peakT: number; troughT: number; trades: number } | null;
  /** The leak whose trades are dotted on the curve. */
  dotLabel: string | null;
}

export interface LeakDTO {
  key: string;
  label: string;
  sub: string;
  trades: number;
  wins: number;
  net: number;
}

export interface HeatCellDTO { session: DashSession; day: number; n: number; wins: number; net: number }
export interface DashHeatmap {
  /** UTC weekdays shown, 1=Mon … 0=Sun (Sat/Sun only when traded). */
  days: number[];
  cells: HeatCellDTO[];
  sessions: Array<{ session: DashSession; n: number; wins: number; net: number }>;
  dayTotals: Array<{ day: number; n: number; wins: number; net: number }>;
  best: { session: DashSession; day: number } | null;
  worst: { session: DashSession; day: number } | null;
}

export interface DashMaeMfe {
  unit: '$' | 'R';
  points: Array<{ mae: number; mfe: number; win: boolean }>;
  /** Losers that were in profit by at least their final loss first. */
  gaveBack: { trades: number; net: number } | null;
}

export interface DashDistribution {
  unit: '$' | 'R';
  bins: Array<{ from: number; to: number; n: number }>;
  mean: number;
  /** Tail: R < −1.25, or (in $) losses larger than 1.5× the average loss. */
  tail: { threshold: number; trades: number; net: number; excess: number } | null;
}

export interface DashRolling {
  unit: '$' | 'R';
  window: number;
  points: Array<{ i: number; t: number; v: number }>;
  now: number;
  low: { i: number; t: number; v: number };
}

export interface DashBehaviour {
  score: number;
  last30: number;
  parts: Array<{ key: 'discipline' | 'risk' | 'timing'; label: string; score: number; last30: number }>;
}

export interface DashPlanRule {
  icon: 'clock' | 'target' | 'scales' | 'hourglass' | 'lock';
  text: string;
  value: number;
  fmt: 'money' | 'pct';
  tone: 'up' | 'dn' | 'flat';
}

export interface DashSymbolRow {
  symbol: string;
  trades: number;
  winRate: number;
  profitFactor: number | null;
  avg: number;
  avgUnit: '$' | 'R';
  net: number;
  spark: number[];
  tag: { kind: 'share' | 'pause'; pct?: number } | null;
}

export type ProcessGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export interface DashRecentTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  openTime: string;
  closeTime: string;
  net: number;
  r: number | null;
  grade: ProcessGrade | null;
  reasons: string[];
}

export interface HourCellDTO { symbol: string; side: 'LONG' | 'SHORT'; hour: number; n: number; wins: number; net: number }

export interface DashboardV2DTO {
  asOf: string;
  window: { from: number | null; to: number | null };
  options: { symbols: Array<{ symbol: string; trades: number }>; tags: string[] };
  counts: { trades: number; inWindow: number; allClosed: number; withR: number; withMae: number };
  /** Fewer than this many trades: behaviour score, grades and plan stay hidden. */
  minTrades: number;
  kpis: DashKpis | null;
  equity: DashEquity | null;
  leaks: { rows: LeakDTO[]; ai: AiLine | null };
  heatmap: DashHeatmap | null;
  maeMfe: DashMaeMfe | null;
  distribution: DashDistribution | null;
  rolling: DashRolling | null;
  behaviour: DashBehaviour | null;
  plan: DashPlanRule[];
  symbols: DashSymbolRow[];
  recent: DashRecentTrade[];
  hours: HourCellDTO[];
  ai: {
    equity: AiLine | null;
    heatmap: AiLine | null;
    maeMfe: AiLine | null;
    distribution: AiLine | null;
    rolling: AiLine | null;
    behaviour: AiLine | null;
    plan: AiLine | null;
    symbols: AiLine | null;
  };
}

export type AskIntent = 'weekday' | 'one-day' | 'hour' | 'session' | 'after-loss' | 'side' | 'symbol';
export interface AskBarDTO { label: string; value: number; n: number; wins: number; hl?: 'dn' | 'up' }
export type DashboardAskDTO =
  | {
    kind: 'chart';
    intent: AskIntent;
    /** Title line: text + value (≤8 words). */
    title: AiLine;
    /** Optional second line under the chart. */
    note: string | null;
    bars: AskBarDTO[];
    used: number;
    followups: string[];
  }
  | { kind: 'none'; used: number };
