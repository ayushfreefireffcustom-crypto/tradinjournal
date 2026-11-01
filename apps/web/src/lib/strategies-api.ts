// Client for the strategy builder (Part F). Types mirror the v2 spec in
// @tradinjournal/core/strategy.
import { ApiError } from '@/lib/copy-api';
import type { IndicatorOperand, Operand, IaOperator } from '@/lib/indicator-alerts-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type Interval = (typeof INTERVALS)[number];
export const VENUES: Record<'delta_india' | 'binance' | 'bybit', { label: string; maxLeverage: number }> = {
  delta_india: { label: 'Delta Exchange India', maxLeverage: 100 },
  binance: { label: 'Binance USDⓈ-M', maxLeverage: 125 },
  bybit: { label: 'Bybit USDT perpetual', maxLeverage: 100 },
};
export type Venue = keyof typeof VENUES;

export interface StrategyCondition { left: IndicatorOperand; operator: IaOperator; right: Operand; barsAgo?: number; rightBarsAgo?: number; timeframe?: Interval }
export interface SignalGroup { match: 'all' | 'any'; conditions: StrategyCondition[] }
export interface SessionWindow { days: number[]; start: string; end: string }
export type Sizing =
  | { mode: 'risk_pct' | 'equity_pct' | 'qty' | 'notional'; value: number }
  | { mode: 'atr'; value: number; atrLength?: number }
  | { mode: 'kelly'; value: number; kellyFraction?: number };
export interface StrategySpec {
  version: 2;
  market: { venue: Venue; instrument: 'perpetual'; symbols: Array<{ symbol: string; leverage?: number }>; direction: 'long' | 'short' | 'both'; marginMode: 'isolated' | 'cross'; leverage: number };
  session: { interval: Interval; timezone: string; mode: '24_7' | 'windows'; windows: SessionWindow[] };
  entry: { long: SignalGroup | null; short: SignalGroup | 'mirror' | null; atTimes: string[] | null };
  exit: { onOppositeSignal: boolean; long: SignalGroup | null; short: SignalGroup | 'mirror' | null };
  risk: {
    takeProfit: { mode: 'pct' | 'points' | 'price' | 'rr'; value: number } | null;
    stopLoss: { mode: 'pct' | 'atr' | 'points' | 'price'; value: number; atrLength?: number } | null;
    trailing: { mode: 'pct' | 'atr'; value: number; atrLength?: number; activateAtR?: number } | null;
    timeStopBars: number | null;
    partials: Array<{ atR: number; closePct: number }>;
    breakEvenAtR: number | null;
  };
  sizing: Sizing;
  advanced: { entryType: 'market' | 'limit'; limitOffsetPct: number; limitExpiryBars: number; reentryCooldownBars: number; maxTradesPerDay: number | null };
  limits: { dailyLossPct: number | null; maxConsecutiveLosses: number | null };
}
export interface Issue { code: string; message: string; path?: string }
export interface Validation { blockers: Issue[]; warnings: Issue[]; live: Issue[]; warmupBars: number }
export interface Metrics {
  startEquity: number; endEquity: number; totalReturnPct: number; cagrPct: number | null; trades: number; winRatePct: number | null; profitFactor: number | null;
  avgTradePct: number | null; bestTradePct: number | null; worstTradePct: number | null; expectancyR: number | null; maxDrawdownPct: number; sharpe: number | null; sortino: number | null;
  exposurePct: number; fees: number; slippage: number; avgSlippageBps: number | null; longTrades: number; shortTrades: number; avgBarsHeld: number | null;
}
export interface Trade { symbol: string; side: 'long' | 'short'; entryTime: number; entryPrice: number; exitTime: number; exitPrice: number; qty: number; notional: number; pnl: number; pnlPct: number; rMultiple: number | null; fees: number; slippage: number; barsHeld: number; reason: string; partialFills: number }
export interface BacktestResult { metrics: Metrics; equity: Array<{ t: number; equity: number }>; trades: Trade[]; tradesTotal?: number; perSymbol: Array<{ symbol: string; trades: number; pnl: number; winRatePct: number | null }>; notes: string[]; range: { from: number | null; to: number | null; bars: number } }
export interface BacktestParams { from: string; to: string; capital: number; slippageBps: number; fees?: { takerBps: number; makerBps: number } }
export interface BacktestSummary { id: string; version: number; params: BacktestParams; metrics: Metrics; createdAt: string }
export interface StrategyRow {
  id: string; name: string; description: string | null; status: string; source: string; version: number; symbols: string[]; interval: string; direction: string; blockers: number;
  createdAt: string; updatedAt: string; lastBacktest: { metrics: Metrics; at: string; version: number } | null;
}
export interface StrategyDetail {
  id: string; name: string; description: string | null; status: string; source: string; version: number; baselineBacktestId: string | null;
  spec: StrategySpec; validation: Validation; readback: string[];
  versions: Array<{ version: number; note: string | null; createdAt: string }>;
  backtests: BacktestSummary[];
  createdAt: string; updatedAt: string;
}

// The Chart layout (F11): the strategy drawn on recent bars.
export type ChartGroup = 'long' | 'short' | 'exitLong' | 'exitShort';
export interface ChartSeries { key: string; label: string; pane: string; scale: 'price' | 'percent' | 'centered' | 'volume' | 'ratio'; values: Array<number | null> }
export interface ChartThreshold { group: ChartGroup; index: number; pane: string; seriesKey: string; label: string; operator: IaOperator; value: number; mirrored: boolean }
export interface ChartPreview {
  symbol: string; interval: Interval;
  candles: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  series: ChartSeries[]; panes: string[]; thresholds: ChartThreshold[];
  signals: { long: number[]; short: number[] };
  trades: Array<{ side: 'long' | 'short'; entryT: number; entryPrice: number; exitT: number | null; exitPrice: number | null; pnl: number | null; reason: string | null }>;
  risk: { side: 'long' | 'short'; entry: number; stop: number | null; target: number | null; atr: number | null } | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/strategies${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const strategiesApi = {
  list: () => call<StrategyRow[]>(''),
  get: (id: string) => call<StrategyDetail>(`/${id}`),
  create: (b: { name: string; description?: string; spec?: StrategySpec }) => call<StrategyDetail>('', body('POST', b)),
  update: (id: string, b: { name?: string; description?: string | null; spec?: StrategySpec; note?: string; baselineBacktestId?: string | null; status?: 'draft' | 'archived' }) => call<StrategyDetail>(`/${id}`, body('PATCH', b)),
  duplicate: (id: string) => call<StrategyDetail>(`/${id}/duplicate`, { method: 'POST' }),
  restore: (id: string, version: number) => call<StrategyDetail>(`/${id}/versions/${version}/restore`, { method: 'POST' }),
  inspect: (spec: StrategySpec) => call<{ validation: Validation; readback: string[] }>('/inspect', body('POST', spec)),
  preview: (spec: StrategySpec, params: BacktestParams) => call<{ result: BacktestResult; cached: boolean }>('/preview', body('POST', { spec, params })),
  backtest: (id: string, params: BacktestParams) => call<{ id: string; version: number; result: BacktestResult; cached: boolean; createdAt: string }>(`/${id}/backtests`, body('POST', params)),
  getBacktest: (id: string, bid: string) => call<{ id: string; version: number; params: BacktestParams; metrics: Metrics; result: BacktestResult; createdAt: string }>(`/${id}/backtests/${bid}`),
  generate: (b: { prompt: string; symbol: string; interval: Interval }) => call<StrategyDetail>('/generate', body('POST', b)),
  chart: (spec: StrategySpec, symbol?: string, bars?: number) => call<ChartPreview>('/chart', body('POST', { spec, ...(symbol ? { symbol } : {}), ...(bars ? { bars } : {}) })),
};

// ── Small helpers shared by the builder ───────────────────────────────────────
export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0.5 * 10 ** -d ? '+' : v <= -0.5 * 10 ** -d ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
export const num = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toFixed(d));
export const usd = (v: number | null | undefined) => (v == null ? '—' : `${v <= -0.005 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
export const tone = (v: number | null | undefined) => (v == null || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'pos' : 'neg');
export const RANGE_PRESETS = [
  { id: '30d', label: '30 days', days: 30 }, { id: '90d', label: '90 days', days: 90 }, { id: '180d', label: '6 months', days: 180 }, { id: '365d', label: '1 year', days: 365 },
] as const;
export function rangeParams(days: number, capital = 10_000, slippageBps = 5): BacktestParams {
  const to = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  return { from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString(), capital, slippageBps };
}
export const emptyCondition = (): StrategyCondition => ({ left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 14 } }, operator: 'crosses_above', right: { kind: 'value', value: 30 } });

// ── Deployments (F15-F18, F23) ────────────────────────────────────────────────
export interface DeploymentTrade { symbol: string; side: string; qty: number; entryPrice: number; entryTime: string; exitPrice: number; exitTime: string; pnl: number; pnlPct: number; fees: number; rMultiple: number | null; reason: string }
export interface OpenPos { symbol: string; side: 'long' | 'short'; qty: number; entryPrice: number; entryTime: number; stop: number | null; target: number | null; lastPrice: number; unrealized: number }
export interface DeploymentRow {
  id: string; strategyId: string; name: string; version: number; mode: 'paper' | 'live'; status: 'running' | 'paused' | 'stopping' | 'stopped' | 'errored' | 'archived';
  capital: number; multiplier: number; connectionId: string | null; startedAt: string; stoppedAt: string | null; stopReason: string | null;
  lastEvaluatedAt: string | null; lastBarTime: string | null; error: string | null; closedPnl: number; openPnl: number; tradeCount: number; open: OpenPos[]; killed: boolean; spark: number[];
  recentTrades?: DeploymentTrade[];
}
export interface DeploymentEvent { id: string; at: string; symbol: string | null; kind: string; message: string; data: { conditions?: Array<{ text: string; met: boolean | null }> } | null }
export interface DeploymentDetail extends DeploymentRow {
  strategyVersion: number; strategyName: string;
  /** Marketplace runs: the rules are the creator's and aren't sent. */
  private?: boolean; interval: string; spec: StrategySpec | null; metrics: Metrics | null; equity: Array<{ t: number; equity: number }>;
  pending: Array<{ symbol: string; side: string; kind: string }>; pauses: Array<{ from: number; to: number | null }>; sizeSchedule: Array<{ from: number; multiplier: number }>;
  trades: DeploymentTrade[]; events: DeploymentEvent[];
}
export type DeployAction = 'pause' | 'resume' | 'stop' | 'settle' | 'emergency_close' | 'archive';
export interface Report { mode: 'paper' | 'live'; days: number | null; capital: number; deployments: Array<{ id: string; name: string; strategyId: string; status: string; capital: number; startedAt: string }>; trades: Array<DeploymentTrade & { deploymentId: string; deployment: string }> }

async function dcall<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/deployments${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  return json!.data as T;
}
export const deploymentsApi = {
  create: (strategyId: string, b: { mode: 'paper' | 'live'; capital?: number; connectionId?: string; sizeMultiplier?: number; confirmLive?: boolean }) => call<DeploymentDetail>(`/${strategyId}/deployments`, body('POST', b)),
  forStrategy: (strategyId: string) => call<DeploymentRow[]>(`/${strategyId}/deployments`),
  list: () => dcall<DeploymentRow[]>(''),
  get: (id: string) => dcall<DeploymentDetail>(`/${id}`),
  act: (id: string, action: DeployAction) => dcall<DeploymentDetail>(`/${id}/${action}`, { method: 'POST' }),
  size: (id: string, multiplier: number) => dcall<DeploymentDetail>(`/${id}/size`, { method: 'POST', body: JSON.stringify({ multiplier }) }),
  report: (mode: 'paper' | 'live', days: number | 'all') => dcall<Report>(`/report?mode=${mode}&days=${days}`),
};
export const STATUS_TEXT: Record<DeploymentRow['status'], string> = { running: 'Running', paused: 'Paused', stopping: 'Stopping', stopped: 'Stopped', errored: 'Needs attention', archived: 'Archived' };
