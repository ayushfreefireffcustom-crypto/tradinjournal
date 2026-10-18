// Client for the Trader Master API. Same conventions as market-api.ts:
// NEXT_PUBLIC_API_URL, cookie auth, unwrap `{ data }`. Types are declared
// locally (the web app stays decoupled from backend packages) but kept in
// lockstep with @tradinjournal/contracts.
export const TRADER_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export type TraderTimeframe = (typeof TRADER_TIMEFRAMES)[number];

export type TraderDirection = 'LONG' | 'SHORT' | 'WAIT';
export type TraderOutcome = 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED' | 'SKIPPED';
export type TraderHitLevel = 'T1' | 'T2' | 'T3';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
/** Mock mode serves the trader routes from Next's /data handlers. */
const P = USE_MOCKS ? '/data' : '/api';

export interface TraderLevel {
  price: number;
  label: string;
}

export interface TraderTimeframeRead {
  tf: TraderTimeframe;
  trend: 'up' | 'down' | 'range';
  rsi: number;
  atr: number;
  note: string;
}

export interface TraderLaneResult {
  id: 'technical' | 'macro' | 'flow' | 'news' | 'ml';
  score: number;
  weight: number;
  rationale: string;
  source?: string;
  asOf?: string;
  stale?: boolean;
}

export interface TraderAnalysis {
  id?: string;
  symbol: string;
  assetClass: string;
  timeframes: TraderTimeframe[];
  direction: TraderDirection;
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  support: TraderLevel[];
  resistance: TraderLevel[];
  confidence: number;
  rationale: string;
  invalidation: string;
  detail: string;
  perTimeframe: TraderTimeframeRead[];
  laneBreakdown?: TraderLaneResult[];
  confidenceSource?: 'heuristic' | 'meta_v1' | 'meta_lgbm';
  rawConfidence?: number;
  aiUsed: boolean;
  asOf: string;
  engineVer: string;
  outcome?: TraderOutcome | null;
  hitLevel?: TraderHitLevel | null;
  gradedAt?: string | null;
  horizonBars?: number | null;
  horizonTf?: TraderTimeframe | null;
  mfePct?: number | null;
  maePct?: number | null;
}

export interface TraderStrategyRules {
  kind: 'ema_cross' | 'rsi_threshold' | 'price_vs_ema' | 'breakout' | 'macd_cross';
  direction: 'LONG' | 'SHORT' | 'BOTH';
  symbol?: string;
  timeframe?: TraderTimeframe;
  fast?: number;
  slow?: number;
  rsiPeriod?: number;
  rsiAbove?: number;
  rsiBelow?: number;
  lookback?: number;
  stopAtr?: number;
  targetR?: number;
  horizonBars?: number;
}

export interface TraderBacktestSlice {
  trades: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  expectancyPct: number | null;
  maxDrawdownPct: number | null;
}

export interface TraderPaperPosition {
  id: string;
  symbol: string;
  timeframe: string;
  side: string;
  entry: number;
  stop: number;
  target: number;
  status: string;
  pnlPct: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface TraderStrategy {
  id: string;
  name: string;
  prompt: string;
  rules: TraderStrategyRules;
  status: string;
  lastBacktest: (TraderBacktestSlice & {
    symbol?: string;
    timeframe?: TraderTimeframe;
    inSample?: TraderBacktestSlice;
    holdout?: TraderBacktestSlice;
    promote?: { ok: boolean; reasons: string[] };
  }) | null;
  positions?: TraderPaperPosition[];
  emailOn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TraderCalibrationBucket {
  bucket: string;
  predicted: number;
  count: number;
  hitRate: number | null;
  targetHits: number;
  stopHits: number;
  expired: number;
}

export interface TraderTrackRecord {
  sampleSize: number;
  graded: number;
  pending: number;
  skipped: number;
  targetHits: number;
  stopHits: number;
  expired: number;
  hitRate: number | null;
  expectancyR: number | null;
  calibration: TraderCalibrationBucket[];
  bySymbol: Array<{
    symbol: string;
    count: number;
    hitRate: number | null;
    targetHits: number;
    stopHits: number;
  }>;
  methodology: string;
  disclaimer: string;
  asOf: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const traderApi = {
  analyze: (symbol: string, timeframes: TraderTimeframe[]) =>
    req<TraderAnalysis>(`${P}/trader/analyze`, {
      method: 'POST',
      body: JSON.stringify({ symbol, timeframes }),
    }),
  history: () => req<TraderAnalysis[]>(`${P}/trader/history`),
  trackRecord: (scope: 'all' | 'me' = 'all') =>
    req<TraderTrackRecord>(`${P}/trader/track-record?scope=${scope}`),
  strategies: () => req<TraderStrategy[]>(`${P}/trader/strategies`),
  createStrategy: (prompt: string, symbol?: string, timeframe?: TraderTimeframe) =>
    req<TraderStrategy>(`${P}/trader/strategies`, {
      method: 'POST',
      body: JSON.stringify({ prompt, symbol, timeframe }),
    }),
  backtestStrategy: (id: string, symbol: string, timeframe: TraderTimeframe = '1h') =>
    req<TraderStrategy>(`${P}/trader/strategies/${id}/backtest`, {
      method: 'POST',
      body: JSON.stringify({ symbol, timeframe }),
    }),
  promoteStrategy: (id: string) =>
    req<{ id: string; status: string; emailOn: boolean }>(`${P}/trader/strategies/${id}/promote`, {
      method: 'POST',
    }),
  archiveStrategy: (id: string) =>
    req<{ id: string; status: string }>(`${P}/trader/strategies/${id}/archive`, { method: 'POST' }),
};
