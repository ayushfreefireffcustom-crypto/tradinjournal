// Client-side API helper. In this preview the Next.js app exposes /api/* routes
// (mock data) so we use relative URLs by default.
const API = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export type {
  BrokerAccount, Deal, Trade, EquityPoint, SymbolStat, DayStat, AccountStats,
} from './mock-data';

export const api = {
  accounts: {
    connect: (body: { mt5Login: number; password: string; server: string }) =>
      apiFetch<import('./mock-data').BrokerAccount>('/data/accounts', { method: 'POST', body: JSON.stringify(body) }),
    list: () => apiFetch<import('./mock-data').BrokerAccount[]>('/data/accounts'),
  },
  trades: {
    list:  (accountId: string) => apiFetch<import('./mock-data').Trade[]>(`/data/trades?accountId=${encodeURIComponent(accountId)}`),
    deals: (accountId: string) => apiFetch<import('./mock-data').Deal[]>(`/data/trades/deals?accountId=${encodeURIComponent(accountId)}`),
    stats: (accountId: string) => apiFetch<import('./mock-data').AccountStats>(`/data/trades/stats?accountId=${encodeURIComponent(accountId)}`),
  },
};
