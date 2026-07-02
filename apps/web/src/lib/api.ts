// Client-side API helper.
//
// Two modes, switched by NEXT_PUBLIC_USE_MOCKS:
//   • "true"  → hit the local Next.js /data/* mock routes (mock-data.ts), no
//               backend required. Used for backend-free UI preview.
//   • else    → hit the real Express API (apps/api) at NEXT_PUBLIC_API_URL,
//               with better-auth session cookies.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    // Real API auth rides on cookies; mock routes are same-origin and need none.
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrokerAccount {
  id: string;
  broker: string;
  mt5Login: string;
  server: string;
  baseCurrency: string;
  marginMode: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface Deal {
  dealTicket: string;
  orderTicket: string;
  positionId: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'BALANCE';
  entry: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';
  volume: string;
  price: string;
  profit: string;
  commission: string;
  swap: string;
  fee: string;
  dealTime: string;
  comment: string;
}

export interface Trade {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  openTime: string;
  closeTime: string | null;
  entryPrice: number;
  exitPrice: number | null;
  volume: number;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
  durationSecs: number | null;
  deals: Deal[];
  // UI-only, sourced from the trade's JournalEntry (not returned by the trades
  // API). Populated client-side on the journal/trades views.
  tags?: string[];
  emotion?: string;
}

export interface EquityPoint { time: string; equity: number; }

export interface SymbolStat {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
}

export interface DayStat { day: string; trades: number; netPnl: number; }

export interface JournalEntry {
  id: string;
  userId: string;
  brokerAccountId: string | null;
  title: string | null;
  body: string;
  emotion: string | null;
  tags: string[];
  tradeId: string | null;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountStats {
  netPnl: number;
  totalTrades: number;
  openTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdownPct: number;
  grossProfit: number;
  grossLoss: number;
  avgDurationSecs: number;
  startingBalance: number;
  currentEquity: number;
  equityCurve: EquityPoint[];
  bySymbol: SymbolStat[];
  byDay: DayStat[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  accounts: {
    connect: (body: { mt5Login: number; password: string; server: string }) =>
      apiFetch<BrokerAccount>(`${PREFIX}/accounts`, { method: 'POST', body: JSON.stringify(body) }),
    list: () => apiFetch<BrokerAccount[]>(`${PREFIX}/accounts`),
  },
  trades: {
    list:  (accountId: string) => apiFetch<Trade[]>(`${PREFIX}/trades?accountId=${encodeURIComponent(accountId)}`),
    deals: (accountId: string) => apiFetch<Deal[]>(`${PREFIX}/trades/deals?accountId=${encodeURIComponent(accountId)}`),
    stats: (accountId: string) => apiFetch<AccountStats>(`${PREFIX}/trades/stats?accountId=${encodeURIComponent(accountId)}`),
  },
  journal: {
    list: (accountId?: string) => apiFetch<JournalEntry[]>(`${PREFIX}/journal${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
    create: (body: { title?: string; body: string; emotion?: string; tags?: string[]; tradeId?: string; brokerAccountId?: string; entryDate?: string }) =>
      apiFetch<JournalEntry>(`${PREFIX}/journal`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ title: string; body: string; emotion: string; tags: string[]; entryDate: string }>) =>
      apiFetch<JournalEntry>(`${PREFIX}/journal/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`${PREFIX}/journal/${id}`, { method: 'DELETE' }),
  },
};
