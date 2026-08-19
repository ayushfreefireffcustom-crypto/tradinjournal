// Client for the Trader Master API. Same conventions as market-api.ts:
// NEXT_PUBLIC_API_URL, cookie auth, unwrap `{ data }`. Types are declared
// locally (the web app stays decoupled from backend packages) but kept in
// lockstep with @tradinjournal/contracts.
export const TRADER_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export type TraderTimeframe = (typeof TRADER_TIMEFRAMES)[number];

export type TraderDirection = 'LONG' | 'SHORT' | 'WAIT';

const API = process.env.NEXT_PUBLIC_API_URL || '';

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
  aiUsed: boolean;
  asOf: string;
  engineVer: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const traderApi = {
  analyze: (symbol: string, timeframes: TraderTimeframe[]) =>
    req<TraderAnalysis>('/api/trader/analyze', {
      method: 'POST',
      body: JSON.stringify({ symbol, timeframes }),
    }),
  history: () => req<TraderAnalysis[]>('/api/trader/history'),
};
