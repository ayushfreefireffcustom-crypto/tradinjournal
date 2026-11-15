// Client + pure helpers for the Trade log v2 page (GET /api/insights/tradelog…).
// Types mirror packages/contracts/src/schema/tradelog-v2.ts — keep them in step.
// Mock mode (NEXT_PUBLIC_USE_MOCKS) is served by app/data/insights/** (lib/mock-insights.ts).
import type { AiLine, DashRange, DashSession } from './dashboard-v2-api';
import type { PositionLevelsDTO, StopMove } from './trade-data-api';
import { isFlat } from './dashboard-v2-format';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${PREFIX}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data as T;
}

// ─── types (mirror contracts) ────────────────────────────────────────────────

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'F'];
export type TlResult = 'win' | 'loss' | 'tp' | 'sl' | 'stopout' | 'manual' | 'bigloss' | 'open';
/** 'user-rule' = one of the trader's own rules (Settings › Trading rules). */
export type TlRuleKey = 'after-losses' | 'revenge' | 'oversized' | 'losing-hour' | 'r-tail' | 'user-rule';
export type TlRuleFilter = 'any' | 'none' | TlRuleKey;
export type TlSort = 'time' | 'net' | 'hold' | 'symbol' | 'r';
export type TlExitReason = 'tp' | 'sl' | 'stopout' | 'other';

export interface TlFlag { key: TlRuleKey; short: string; label: string }
export interface TlRow {
  id: string; symbol: string; side: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED';
  openTime: number; closeTime: number | null; day: string; session: DashSession;
  volume: number; entry: number; exit: number | null; net: number; gross: number; commission: number; swap: number;
  r: number | null; holdSecs: number | null; exitReason: TlExitReason | null; sl: number | null; tp: number | null;
  grade: Grade | null; flags: TlFlag[]; tags: string[]; emotion: string | null; noted: boolean;
  /** The stop was moved after entry (only with recorded stop levels). */
  moved?: StopMove;
}
export interface TlDay { day: string; n: number; wins: number; net: number; ruleBroken: number; results: Array<'w' | 'l'> }
export interface TlSummary {
  trades: number; wins: number; losses: number; open: number; net: number; perTrade: number; winRate: number;
  profitFactor: number | null; avgR: number | null; avgWinR: number | null; avgLossR: number | null; avgWin: number; avgLoss: number;
  avgHoldSecs: number | null; avgHoldWinSecs: number | null; avgHoldLossSecs: number | null;
  ruleBroken: { n: number; net: number } | null; fees: number; commission: number; swap: number;
  gradeMix: Record<Grade, number> | null;
}
export interface TlStripDay { day: string; net: number; n: number; inView: boolean }
export interface TradelogDTO {
  asOf: string;
  window: { from: number | null; to: number | null };
  tz: string;
  counts: { matching: number; inWindow: number; allClosed: number; all: number; withR: number };
  minTrades: number;
  graded: boolean;
  useR: boolean;
  bigLoss: { unit: 'R'; threshold: -1 } | { unit: '$'; threshold: number } | null;
  options: { symbols: Array<{ symbol: string; trades: number }>; tags: string[] };
  views: { all: number; ruleBroken: number | null; gradeDF: number | null; bigLosers: number | null };
  summary: TlSummary | null;
  strip: { days: TlStripDay[]; ai: (AiLine & { rule: TlRuleKey }) | null };
  rows: TlRow[];
  days: TlDay[];
  offset: number;
  limit: number;
  hasMore: boolean;
}
export interface TlReason { key: TlRuleKey; label: string; detail: string }
export interface TlSimilar { criteria: string[]; n: number; wins: number; net: number; results: number[]; ids: string[] }
export interface TradelogTradeDTO {
  row: TlRow;
  graded: boolean;
  reasons: TlReason[];
  similar: TlSimilar | null;
  note: { id: string; body: string; emotion: string | null; tags: string[] } | null;
  balanceBefore: number | null;
  /** Stop / target levels and the editor's state (trade-data). */
  levels?: PositionLevelsDTO;
}
export interface TlPath { id: string; tf: string; points: number[]; lo: number; hi: number; entry: number; exit: number; sl: number | null; tp: number | null }

// ─── params ──────────────────────────────────────────────────────────────────

/** Filters a saved view stores (the date range is separate, like on the dashboard). */
export interface TlFilters {
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  session?: DashSession;
  result?: TlResult;
  tag?: string;
  grade?: string;
  rule?: TlRuleFilter;
  q?: string;
}
export const FILTER_KEYS: Array<keyof TlFilters> = ['symbol', 'side', 'session', 'result', 'tag', 'grade', 'rule', 'q'];

export interface TlParams extends TlFilters {
  accountId: string;
  range: DashRange;
  from?: number;
  to?: number;
  tz?: string;
  sort?: TlSort;
  dir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export function qs(p: object): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') u.set(k, String(v));
  return u.toString();
}

export const tradelogApi = {
  list: (p: TlParams, signal?: AbortSignal) => call<TradelogDTO>(`/insights/tradelog?${qs(p)}`, { signal }),
  export: (p: Omit<TlParams, 'offset' | 'limit'>) => call<{ rows: TlRow[] }>(`/insights/tradelog/export?${qs(p)}`),
  trade: (accountId: string, id: string, tz?: string, signal?: AbortSignal) => call<TradelogTradeDTO>(`/insights/tradelog/trade?${qs({ accountId, id, tz })}`, { signal }),
  paths: (accountId: string, ids: string[]) => call<{ paths: Record<string, TlPath | null> }>('/insights/tradelog/paths', { method: 'POST', body: JSON.stringify({ accountId, ids }) }),
  tag: (accountId: string, ids: string[], tag: string) => call<{ updated: number; created: number }>('/insights/tradelog/tag', { method: 'POST', body: JSON.stringify({ accountId, ids, tag }) }),
};

export function viewerTz(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

// ─── saved views (this device, per user) ─────────────────────────────────────

export interface SavedView { id: string; name: string; filters: TlFilters }
export type BuiltinView = 'all' | 'rule' | 'grade' | 'bigloss';
export const BUILTIN_FILTERS: Record<BuiltinView, TlFilters> = { all: {}, rule: { rule: 'any' }, grade: { grade: 'D,F' }, bigloss: { result: 'bigloss' } };

/** Only the keys that are set, in a fixed order (so equal filters compare equal). */
export function cleanFilters(f: TlFilters): TlFilters {
  const out: TlFilters = {};
  for (const k of FILTER_KEYS) {
    const v = f[k];
    if (v != null && String(v).trim() !== '') (out as Record<string, string>)[k] = k === 'q' ? String(v).trim() : String(v);
  }
  return out;
}
export const sameFilters = (a: TlFilters, b: TlFilters) => JSON.stringify(cleanFilters(a)) === JSON.stringify(cleanFilters(b));

const viewsKey = (userId: string | null | undefined) => `tl-log-views:${userId || 'anon'}`;
export function loadViews(userId: string | null | undefined): SavedView[] {
  try {
    const raw = localStorage.getItem(viewsKey(userId));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is SavedView => !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.filters === 'object').slice(0, 20) : [];
  } catch { return []; }
}
export function storeViews(userId: string | null | undefined, views: SavedView[]): boolean {
  try { localStorage.setItem(viewsKey(userId), JSON.stringify(views.slice(0, 20))); return true; } catch { return false; }
}

// ─── formatting ──────────────────────────────────────────────────────────────

const MINUS = '−';
/** 2h 11m · 52m · 3d 4h · 45s */
export function fmtHold(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs)) return '—';
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
/** +$697.60 · −$12.00 */
export function money2(v: number, plus = true): string {
  const a = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${isFlat(v) ? '' : v < 0 ? MINUS : plus && v > 0 ? '+' : ''}$${a}`;
}
export const rStr = (v: number) => `${isFlat(v) ? '' : v < 0 ? MINUS : v > 0 ? '+' : ''}${Math.abs(v).toFixed(2)}R`;
/** Day key "2026-11-13" → "Fri 13 Nov" (the key is already the viewer's day). */
export function dayTitle(day: string, today?: string): string {
  if (day === 'open') return 'Open positions';
  if (today && day === today) return 'Today';
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${WEEKDAYS[dt.getUTCDay()]} ${d} ${MONTHS[m! - 1]}`;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "25 Sep" in the viewer's zone. */
export const shortDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
/** Local wall-clock time of an epoch ms. */
export const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
/** Smallest bar (px) a day with a non-zero result gets in the daily strip. */
export const STRIP_MIN_BAR = 4;
/**
 * Daily strip bar: height in px (linear in |net| up to `room`) and side.
 * A non-zero day never shrinks below STRIP_MIN_BAR, so a +$5.2k day doesn't
 * flatten a −$40 day into the baseline; a day that shows as $0.00 is 'flat'.
 */
export function stripBar(net: number, max: number, room: number): { h: number; dir: 'up' | 'dn' | 'flat' } {
  if (isFlat(net)) return { h: 1.5, dir: 'flat' };
  const h = Math.min(room, Math.max(STRIP_MIN_BAR, (Math.abs(net) / Math.max(max, 1e-9)) * room));
  return { h, dir: net > 0 ? 'up' : 'dn' };
}
/** "Tue 14:06": weekday and wall-clock time in the viewer's zone (what the trade log shows). */
export const dayClock = (ms: number) => `${WEEKDAYS[new Date(ms).getDay()]} ${clock(ms)}`;
export const localDayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Grade tone for the grade box. */
export const gradeTone = (g: Grade | null) => (g === 'A' || g === 'B' ? 'up' : g === 'C' ? 'mid' : g ? 'dn' : '');

export const RESULT_LABEL: Record<TlResult, string> = {
  win: 'Winners', loss: 'Losers', tp: 'Hit take-profit', sl: 'Hit stop-loss', stopout: 'Stop-out', manual: 'Closed by hand / EA', bigloss: 'Big losers', open: 'Open positions',
};
export const RULE_LABEL: Record<TlRuleFilter, string> = {
  any: 'Any rule', none: 'All rules kept', 'after-losses': 'After 2 losses', revenge: 'Within 15 min of a loss', oversized: 'Oversized', 'losing-hour': 'Losing hour', 'r-tail': 'Past −1.25R', 'user-rule': 'Your rules',
};

// ─── CSV ─────────────────────────────────────────────────────────────────────

export const CSV_HEADERS = ['Position ID', 'Symbol', 'Direction', 'Status', 'Open Time', 'Close Time', 'Volume', 'Entry Price', 'Exit Price', 'Gross P&L', 'Commission', 'Swap', 'Net P&L', 'R', 'Duration (s)', 'Exit', 'AI grade', 'Rules broken', 'Tags'];
export function csvRow(r: TlRow): Array<string | number> {
  return [
    r.id, r.symbol, r.side, r.status, new Date(r.openTime).toISOString(), r.closeTime ? new Date(r.closeTime).toISOString() : '', r.volume,
    r.entry, r.exit ?? '', r.gross, r.commission, r.swap, r.net, r.r ?? '', r.holdSecs ?? '', r.exitReason ?? '', r.grade ?? '',
    r.flags.map(f => f.label).join('; '), [...(r.emotion ? [r.emotion] : []), ...r.tags].join('; '),
  ];
}

// ─── mini path geometry ──────────────────────────────────────────────────────

export interface PathGeom { d: string; end: [number, number]; start: [number, number]; sl: number | null; tp: number | null; entryY: number }
/** SVG geometry for a path in a w×h box (y grows down). SL/TP lines only when inside a sane range. */
export function pathGeom(p: TlPath, w: number, h: number, pad = 3): PathGeom {
  const span0 = p.hi - p.lo || Math.abs(p.entry) * 0.001 || 1;
  // Include SL/TP when they're within 1.5× the traded range, so a far stop doesn't flatten the path.
  const near = (v: number | null) => v != null && v >= p.lo - span0 * 1.5 && v <= p.hi + span0 * 1.5;
  const lo = Math.min(p.lo, near(p.sl) ? p.sl! : Infinity, near(p.tp) ? p.tp! : Infinity);
  const hi = Math.max(p.hi, near(p.sl) ? p.sl! : -Infinity, near(p.tp) ? p.tp! : -Infinity);
  const span = hi - lo || 1;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  const n = p.points.length;
  const x = (i: number) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad * 2));
  const d = p.points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return { d, start: [x(0), y(p.points[0]!)], end: [x(n - 1), y(p.points[n - 1]!)], sl: near(p.sl) ? y(p.sl!) : null, tp: near(p.tp) ? y(p.tp!) : null, entryY: y(p.entry) };
}
