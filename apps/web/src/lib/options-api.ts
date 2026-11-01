// Client for options (Part G). Types mirror @tradinjournal/core/options and
// apps/api/src/modules/options.
import { ApiError } from '@/lib/copy-api';
import { fmtNum as num, fmtUsd as usd } from './format';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export type OptEnv = 'live' | 'testnet';
export type OptionKind = 'call' | 'put';
export interface OptionQuote {
  symbol: string; kind: OptionKind; strike: number; expiry: number; expiryCode: string; productId?: number;
  mark: number | null; last: number | null; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null;
  markIv: number | null; bidIv: number | null; askIv: number | null;
  delta: number | null; gamma: number | null; theta: number | null; vega: number | null; rho: number | null;
  oi: number; oiUsd: number | null; volume: number; turnoverUsd: number | null; change24h: number | null; oiChangeUsd6h: number | null;
}
export interface ExpiryStats {
  expiry: number; code: string; days: number; atmStrike: number | null; atmIv: number | null; straddle: number | null; sigmaMove: number | null;
  rr25: number | null; fly25: number | null; callOi: number; putOi: number; volume: number; maxPain: number | null;
}
export interface Underlying { underlying: string; spot: number | null; contracts: number; oiUsd: number; volumeUsd: number; expiries: number }
export interface ChainData {
  env: OptEnv; underlying: string; spot: number; contractValue: number; tickSize: number; asOf: number;
  expiries: Array<{ code: string; expiry: number; days: number; contracts: number }>;
  expiry: string; stats: ExpiryStats; quotes: OptionQuote[];
}
export interface StrikeRow { strike: number; callOi: number; putOi: number; callIv: number | null; putIv: number | null; callVolume: number; putVolume: number; gex: number }
export interface OverviewData {
  env: OptEnv; underlying: string; spot: number; asOf: number; expiries: ExpiryStats[];
  term: Array<{ expiry: number; days: number; atmIv: number | null }>; termSlope: number | null;
  callOi: number; putOi: number; putCallOi: number | null; gammaCentre: number | null; gammaFlip: number | null; netGex: number;
  expiry: string | null; strikes: StrikeRow[]; allStrikes: StrikeRow[];
}
export interface ContractData {
  env: OptEnv; underlying: string; spot: number; contractValue: number; tickSize: number; quote: OptionQuote; days: number;
  book: { bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> };
}
export interface Candle { t: number; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null }
export type CandleKind = 'price' | 'mark' | 'oi' | 'iv';
export type Resolution = '5m' | '15m' | '1h' | '4h' | '1d';
export interface PremiumSeries { underlying: string; expiry: string; resolution: Resolution; kind: 'straddle' | 'strangle'; points: Array<{ t: number; spot: number; callStrike: number; putStrike: number; premium: number }> }
export interface TemplateInfo { id: string; name: string; categories: Array<'popular' | 'bullish' | 'bearish' | 'neutral' | 'hedging'>; about: string; legs: number; needsFar: boolean }
export interface LegInput { kind: OptionKind | 'future'; side: 1 | -1; qty: number; strike?: number; expiry?: string; price?: number; iv?: number }
export interface Analysis {
  env: OptEnv; underlying: string; spot: number; contractValue: number; asOf: number; at: number; vol: number | null;
  legs: Array<{ kind: OptionKind | 'future'; side: 1 | -1; qty: number; strike?: number; expiry?: number; expiryCode: string | null; price: number; iv?: number; symbol?: string; mark: number | null }>;
  summary: {
    netPremium: number; maxProfit: number | null; maxLoss: number | null; breakevens: number[]; riskReward: number | null; probProfit: number | null;
    greeks: { delta: number; gamma: number; theta: number; vega: number };
  };
  payoff: Array<{ s: number; expiry: number; now: number }>;
  analysis: {
    premiumAtRisk: number | null; decayPerDayPct: number | null; toBreakevenPct: number | null;
    legs: Array<{ symbol: string; spreadPct: number | null; topSize: number | null; fill: 'easy' | 'ok' | 'hard' | 'no_quote'; ivEdge: number | null; richCheap: 'rich' | 'cheap' | 'fair' | null; deltaWeightedOi: number | null; gexAtStrike: number | null }>;
  };
  sigma: { lo: number; hi: number } | null;
}

export interface ReplayFrame { t: number; spot: number; pnl: number; values: number[]; greeks: { delta: number; gamma: number; theta: number; vega: number }; band: { lo: number; hi: number } | null; curve: number[] }
export interface ReplayData {
  env: OptEnv; underlying: string; spot: number; contractValue: number; asOf: number; vol: number | null; path: 'flat' | 'recorded'; recorded: { from: number; to: number } | null;
  legs: Array<{ kind: OptionKind | 'future'; side: 1 | -1; qty: number; strike?: number; expiry?: number; price: number; iv?: number; symbol?: string }>;
  replay: { start: number; end: number; grid: number[]; frames: ReplayFrame[]; expiryCurve: number[] };
}

// G11 orders.
export type Pricing = 'touch' | 'mark' | 'market';
export interface BasketLeg { kind: OptionKind; side: 1 | -1; qty: number; strike: number; expiry: string }
export interface BasketPlan {
  env: OptEnv; connectionLabel: string; netCost: number | null; availableUsd: number | null; equityUsd: number | null; warnings: string[];
  legs: Array<{ symbol: string; side: 'BUY' | 'SELL'; qty: number; type: 'LIMIT' | 'MARKET'; limitPrice: number | null; refPrice: number | null; cost: number | null }>;
}
export type LegOutcome = 'filled' | 'partial' | 'resting' | 'rejected' | 'unconfirmed' | 'skipped';
export interface BasketResult { message: string; legs: Array<{ symbol: string; outcome: LegOutcome; message: string }> }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/options${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const q = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const optionsApi = {
  underlyings: (env: OptEnv) => call<Underlying[]>(`/underlyings${q({ env })}`),
  chain: (env: OptEnv, underlying: string, expiry?: string) => call<ChainData>(`/chain${q({ env, underlying, expiry })}`),
  overview: (env: OptEnv, underlying: string, expiry?: string | null) => call<OverviewData>(`/overview${q({ env, underlying, expiry })}`),
  contract: (env: OptEnv, symbol: string) => call<ContractData>(`/contracts/${symbol}${q({ env })}`),
  candles: (env: OptEnv, symbol: string, kind: CandleKind, resolution: Resolution, days: number) => call<{ candles: Candle[] }>(`/contracts/${symbol}/candles${q({ env, kind, resolution, days })}`),
  premium: (env: OptEnv, underlying: string, expiry: string, resolution: Resolution, days: number, strangle?: { put: number; call: number }) =>
    call<PremiumSeries>(`/premium${q({ env, underlying, expiry, resolution, days, put: strangle?.put, call: strangle?.call })}`),
  templates: () => call<TemplateInfo[]>('/templates'),
  template: (b: { env: OptEnv; underlying: string; template: string; expiry: string; qty: number }) => call<LegInput[]>('/template', { method: 'POST', body: JSON.stringify(b) }),
  analyze: (b: { env: OptEnv; underlying: string; legs: LegInput[]; at?: number; vol?: number }) => call<Analysis>('/analyze', { method: 'POST', body: JSON.stringify(b) }),
  orderPreview: (b: { connectionId: string; requestId: string; underlying: string; legs: BasketLeg[]; pricing: Pricing }) => call<BasketPlan>('/orders/preview', { method: 'POST', body: JSON.stringify(b) }),
  orderPlace: (b: { connectionId: string; requestId: string; underlying: string; legs: BasketLeg[]; pricing: Pricing }) => call<BasketResult>('/orders', { method: 'POST', body: JSON.stringify(b) }),
  replay: (b: { env: OptEnv; underlying: string; legs: LegInput[]; path: 'flat' | 'recorded' }) => call<ReplayData>('/replay', { method: 'POST', body: JSON.stringify(b) }),
};

// ── Shared context: underlying and data source, remembered per device ──
const CTX_KEY = 'tradelogs.options.ctx';
export interface OptionsCtx { underlying: string; env: OptEnv }
export function loadCtx(): OptionsCtx {
  try { const v = JSON.parse(localStorage.getItem(CTX_KEY) ?? 'null') as OptionsCtx | null; if (v && (v.env === 'live' || v.env === 'testnet') && /^[A-Z0-9]{2,12}$/.test(v.underlying)) return v; } catch { /* ignore */ }
  return { underlying: 'BTC', env: 'live' };
}
export function saveCtx(c: OptionsCtx) { try { localStorage.setItem(CTX_KEY, JSON.stringify(c)); } catch { /* ignore */ } }

/** Legs waiting for the builder (added from the chain or a contract). */
const LEGS_KEY = 'tradelogs.options.legs';
export interface SavedLegs { underlying: string; env: OptEnv; legs: LegInput[] }
export function loadLegs(): SavedLegs | null { try { return JSON.parse(localStorage.getItem(LEGS_KEY) ?? 'null') as SavedLegs | null; } catch { return null; } }
export function saveLegs(v: SavedLegs) { try { localStorage.setItem(LEGS_KEY, JSON.stringify(v)); } catch { /* ignore */ } }
export function addLeg(ctx: OptionsCtx, leg: LegInput) {
  const cur = loadLegs();
  const legs = cur && cur.underlying === ctx.underlying && cur.env === ctx.env ? cur.legs : [];
  saveLegs({ ...ctx, legs: [...legs, leg].slice(0, 8) });
}

// ── Formatting ──
export const ivPct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
export const fmtNum = (v: number | null | undefined, d = 2) => num(v, { digits: d });
export const fmtUsd = (v: number | null | undefined, d = 2) => usd(v, { digits: d, minDigits: 0 });
export { fmtCompact } from './format';
export const expiryLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const daysLabel = (d: number) => (d < 1 ? `${Math.max(0, Math.round(d * 24))}h` : `${Math.round(d)}d`);
