// Client for indicator alerts (E3/E4). Types mirror @tradinjournal/contracts
// and the core indicator catalogue; the catalogue itself comes from the API.
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export const IA_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const;
export type IaTimeframe = (typeof IA_TIMEFRAMES)[number];
export const IA_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'crosses_above', 'crosses_below'] as const;
export type IaOperator = (typeof IA_OPERATORS)[number];
export const OPERATOR_LABEL: Record<IaOperator, string> = {
  crosses_above: 'crosses above', crosses_below: 'crosses below', gt: 'is above', gte: 'is at or above', lt: 'is below', lte: 'is at or below', eq: 'equals',
};

export type Scale = 'price' | 'percent' | 'centered' | 'volume' | 'ratio';
export interface CatalogueItem {
  id: string;
  label: string;
  group: 'trend' | 'oscillator' | 'volatility' | 'volume' | 'price';
  params: Array<{ key: string; label: string; min: number; max: number; default: number; step: number }>;
  outputs: Array<{ key: string; label: string; scale: Scale }>;
}
export interface IndicatorOperand { kind: 'indicator'; id: string; output: string; params?: Record<string, number> }
export type Operand = IndicatorOperand | { kind: 'value'; value: number };

export interface RuleBody {
  symbol: string;
  timeframe: IaTimeframe;
  left: IndicatorOperand;
  operator: IaOperator;
  right: Operand;
  cooldownSec?: number;
  recurring?: boolean;
  note?: string;
}
export interface IndicatorAlert extends Required<Omit<RuleBody, 'note'>> {
  id: string;
  description: string;
  status: 'active' | 'paused' | 'triggered';
  note: string | null;
  lastBarTime: string | null;
  lastLeft: number | null;
  lastRight: number | null;
  lastFiredAt: string | null;
  fireCount: number;
  createdAt: string;
  /** H12: the catalogue rule it is, and what it means in plain English. */
  rule: { id: string; name: string } | null;
  explanation: { what: string; why: string; caution: string };
}
export interface WatchRule { id: string; name: string; category: 'momentum' | 'trend' | 'volatility' | 'volume'; bias: 'bullish' | 'bearish' | 'neutral'; timeframe: string; cooldownSec: number; condition: string; explain: { what: string; why: string; caution: string } }
export interface Firing { id: string; alertId: string; symbol: string; timeframe: string; description: string; firedAt: string; barTime: string; leftValue: number; rightValue: number }
export interface Preview { symbol: string; timeframe: string; barTime: string; bars: number; enoughData: boolean; met: boolean | null; left: number | null; right: number | null; leftLabel: string; rightLabel: string; description: string }

/** Same rule the server applies: like with like (see core validateCondition). */
export function comparable(a: { id: string; scale: Scale }, b: { id: string; scale: Scale }): boolean {
  if (a.scale !== b.scale) return false;
  if (a.scale === 'price' || a.scale === 'percent') return true;
  const vol = new Set(['volume', 'volsma']);
  return a.id === b.id || (vol.has(a.id) && vol.has(b.id));
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api/indicator-alerts${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const post = (b: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(b) });

export const indicatorAlertsApi = {
  catalogue: () => call<CatalogueItem[]>('/catalogue'),
  list: () => call<IndicatorAlert[]>(''),
  firings: (limit = 50) => call<Firing[]>(`/firings?limit=${limit}`),
  preview: (b: RuleBody) => call<Preview>('/preview', post(b)),
  create: (b: RuleBody) => call<IndicatorAlert>('', post(b)),
  update: (id: string, b: { status?: 'active' | 'paused'; cooldownSec?: number; recurring?: boolean; note?: string | null }) => call<IndicatorAlert>(`/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  remove: (id: string) => call<{ ok: boolean }>(`/${id}`, { method: 'DELETE' }),
  watchRules: () => call<WatchRule[]>('/watch-rules'),
  watch: (b: { ruleId: string; symbol: string; timeframe?: string }) => call<IndicatorAlert>('/watch', post(b)),
};
