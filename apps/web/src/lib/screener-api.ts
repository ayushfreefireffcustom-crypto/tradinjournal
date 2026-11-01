// Client for the screener (E5/E6). Types mirror @tradinjournal/contracts.
import { ApiError } from '@/lib/copy-api';
import type { IaOperator, IndicatorOperand, Operand } from '@/lib/indicator-alerts-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export const SCREENER_TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;
export type ScreenerTimeframe = (typeof SCREENER_TIMEFRAMES)[number];
export const SCREENER_UNIVERSES = [50, 100, 200] as const;
export type ScreenerField = 'price' | 'change24h' | 'volume24h' | 'funding' | 'openInterest';
export const FIELD_LABEL: Record<ScreenerField, string> = { price: 'Price', change24h: '24h change %', volume24h: '24h volume (USDT)', funding: 'Funding rate %', openInterest: 'Open interest (USDT)' };

export type ScreenerFilter =
  | { type: 'indicator'; left: IndicatorOperand; operator: IaOperator; right: Operand }
  | { type: 'field'; field: ScreenerField; operator: 'gt' | 'gte' | 'lt' | 'lte'; value: number };
export interface ScreenDefinition {
  timeframe: ScreenerTimeframe;
  universe: 50 | 100 | 200;
  groups: ScreenerFilter[][];
  columns?: IndicatorOperand[];
  sort?: { by: string; dir: 'asc' | 'desc' };
}
export interface ScreenRow { symbol: string; base: string; price: number; change24h: number; volume24h: number; funding: number | null; openInterest: number | null; values: Array<number | null> }
export interface ScreenResult {
  timeframe: string;
  asOf: string;
  barTime: string | null;
  universe: number;
  scanned: number;
  matched: number;
  noData: string[];
  fundingSource: 'bybit' | 'binance' | null;
  columns: Array<{ key: string; label: string }>;
  rows: ScreenRow[];
}
export interface SavedScreen { id: string; name: string; definition: ScreenDefinition; createdAt: string; updatedAt: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/screener${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const post = (b: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(b) });

export const screenerApi = {
  run: (d: ScreenDefinition) => call<ScreenResult>('/run', post(d)),
  screens: () => call<SavedScreen[]>('/screens'),
  save: (name: string, definition: ScreenDefinition) => call<SavedScreen>('/screens', post({ name, definition })),
  update: (id: string, b: { name?: string; definition?: ScreenDefinition }) => call<SavedScreen>(`/screens/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  remove: (id: string) => call<{ ok: boolean }>(`/screens/${id}`, { method: 'DELETE' }),
};
