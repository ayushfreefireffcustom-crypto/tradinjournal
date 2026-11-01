// Client for chart patterns (E8) and their explanations (E9).
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export const PATTERN_TFS = ['15m', '1h', '4h', '1d', '1w'] as const;
export interface PatternPoint { time: number; price: number; label?: string }
export interface PatternLine { a: PatternPoint; b: PatternPoint; role: 'support' | 'resistance' | 'upper' | 'lower' | 'neckline' | 'pole' }
export interface ChartPattern {
  id: string;
  kind: string;
  family: 'level' | 'channel' | 'triangle' | 'wedge' | 'double' | 'flag';
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  status: 'forming' | 'broke_up' | 'broke_down' | 'confirmed' | 'target_hit';
  startTime: number;
  endTime: number;
  lines: PatternLine[];
  points: PatternPoint[];
  breakout: number | null;
  invalidation: number | null;
  target: number | null;
  quality: number;
  touches?: number;
}
export interface PatternsResult { symbol: string; tf: string; barTime: string | null; bars: number; price: number | null; patterns: ChartPattern[] }
export interface Explanation { id: string; source: 'ai' | 'rules'; whatItIs: string; whyItMatters: string; whereItsWrong: string; measuredMove: string }

export const STATUS_LABEL: Record<ChartPattern['status'], string> = { forming: 'Forming', broke_up: 'Broke up', broke_down: 'Broke down', confirmed: 'Confirmed', target_hit: 'Target hit' };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/patterns${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  return json!.data as T;
}

export const patternsApi = {
  find: (symbol: string, tf: string) => call<PatternsResult>(`?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`),
  explain: (symbol: string, tf: string, id: string) => call<Explanation>('/explain', { method: 'POST', body: JSON.stringify({ symbol, tf, id }) }),
};
