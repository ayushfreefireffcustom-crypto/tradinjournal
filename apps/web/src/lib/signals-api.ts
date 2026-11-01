// Client for the signals table (E7). Types mirror the API's rating shape.
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export const SIGNAL_TFS = ['1h', '4h', '1d'] as const;
export type SignalTf = (typeof SIGNAL_TFS)[number];
export type RatingLabel = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';
export const RATING_TEXT: Record<RatingLabel, string> = { strong_sell: 'Strong sell', sell: 'Sell', neutral: 'Neutral', buy: 'Buy', strong_buy: 'Strong buy' };

export interface SignalCell { score: number | null; label: RatingLabel | null; ma: number | null; osc: number | null }
export interface SignalRow { symbol: string; base: string; price: number; change24h: number; volume24h: number; ratings: Record<SignalTf, SignalCell | null> }
export interface SignalsList { asOf: string; barTimes: Partial<Record<SignalTf, string>>; rows: SignalRow[] }
export interface RatingComponent { name: string; value: number | null; vote: 1 | 0 | -1; reason: string }
export interface RatingGroup { score: number | null; label: RatingLabel | null; buy: number; sell: number; neutral: number; components: RatingComponent[] }
export interface TfRating { tf: SignalTf; barTime: string | null; bars: number; score: number | null; label: RatingLabel | null; price: number | null; ma: RatingGroup | null; osc: RatingGroup | null }
export interface SymbolSignals { symbol: string; minBars: number; timeframes: TfRating[] }

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api/signals${path}`, { credentials: 'include' });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  return json!.data as T;
}

export const signalsApi = {
  list: (universe: 25 | 50 | 100) => call<SignalsList>(`?universe=${universe}`),
  symbol: (symbol: string) => call<SymbolSignals>(`/${encodeURIComponent(symbol)}`),
};
