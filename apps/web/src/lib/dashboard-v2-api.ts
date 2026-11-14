// Client for Dashboard v2 (GET /api/insights/dashboard, POST /api/insights/ask).
// Types mirror packages/contracts/src/schema/dashboard-v2.ts — keep them in step.
// Mock mode (NEXT_PUBLIC_USE_MOCKS) has no /data route for this: previews and
// Playwright supply responses with route mocks, so no sample data ships here.
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

export type DashRange = '7D' | '30D' | '90D' | '1Y' | 'ALL';
export type DashSession = 'ASIA' | 'LONDON' | 'NY';
export interface DashParams {
  accountId: string;
  range: DashRange;
  from?: number;
  to?: number;
  symbol?: string;
  session?: DashSession;
  side?: 'LONG' | 'SHORT';
  tag?: string;
}

function qs(p: DashParams): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') u.set(k, String(v));
  return u.toString();
}

export const dashV2 = {
  get: (p: DashParams) => call<DashboardV2DTO>(`/insights/dashboard?${qs(p)}`),
  ask: (p: DashParams & { q: string }) => call<DashboardAskDTO>('/insights/ask', { method: 'POST', body: JSON.stringify(p) }),
};

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
