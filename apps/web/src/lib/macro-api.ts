// Client for the macro segment. The API serializes Decimals to numbers and
// timestamps to ISO strings, so these DTOs use number/string. Web defines its
// own client types (contracts is the shared API↔worker package).
export interface MacroState {
  asOf: string;
  regime: { growth: 'up' | 'down'; inflation: 'up' | 'down'; label: string; recessionOdds?: number } | null;
  macro: {
    key: string;
    label: string;
    value: number;
    prev?: number | null;
    forecast?: number | null;
    unit?: string | null;
    source: string;
    asOf: string;
  }[];
  markets: { symbol: string; price: number; changePct?: number | null; asOf: string }[];
  bias: { asset: string; score: number; label: string; supporting: string[]; opposing: string[] }[];
  events: {
    title: string;
    country?: string | null;
    impact?: string | null;
    at: string;
    actual?: string | null;
    forecast?: string | null;
    prev?: string | null;
  }[];
  headlines: { title: string; source?: string | null; url: string; at: string }[];
  engineVer: string;
}

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';

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

export const macroApi = {
  state: () => req<MacroState>(`${PREFIX}/macro/state`),
};
