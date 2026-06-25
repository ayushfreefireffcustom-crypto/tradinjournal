const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
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
      apiFetch<BrokerAccount>('/api/accounts', { method: 'POST', body: JSON.stringify(body) }),
    list: () => apiFetch<BrokerAccount[]>('/api/accounts'),
  },
  trades: {
    list:  (accountId: string) => apiFetch<Trade[]>(`/api/trades?accountId=${encodeURIComponent(accountId)}`),
    deals: (accountId: string) => apiFetch<Deal[]>(`/api/trades/deals?accountId=${encodeURIComponent(accountId)}`),
    stats: (accountId: string) => apiFetch<AccountStats>(`/api/trades/stats?accountId=${encodeURIComponent(accountId)}`),
  },
};
