// Client-side API helper.
//
// Two modes, switched by NEXT_PUBLIC_USE_MOCKS:
//   • "true"  → hit the local Next.js /data/* mock routes (mock-data.ts), no
//               backend required. Used for backend-free UI preview.
//   • else    → hit the real Express API (apps/api) at NEXT_PUBLIC_API_URL,
//               with better-auth session cookies.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    // Real API auth rides on cookies; mock routes are same-origin and need none.
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) {
    // Preserve the machine-readable code (e.g. BROKER_AUTH_FAILED) alongside the
    // human message so callers can branch on it (show an "update password" CTA).
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
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

export interface DirectionStat { trades: number; wins: number; netPnl: number; }

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
  // Extended metrics (populated by the client statsForRange/computeStats).
  byDirection: { long: DirectionStat; short: DirectionStat };
  maxWinStreak: number;
  maxLossStreak: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

// ─── AI coach types ─────────────────────────────────────────────────────────

// A web-search citation the coach used to ground an external/current-facts answer.
export interface AiSource {
  title: string;
  url: string;
  snippet: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // Web citations for an assistant message (present only for web/hybrid answers).
  sources?: AiSource[];
}

export interface AiMessage extends AiChatMessage {
  id: string;
  createdAt: string;
}

export interface AiConversationSummary {
  id: string;
  title: string | null;
  brokerAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiMessage[];
}

export interface AiChatResult {
  conversationId?: string;
  // Web citations the coach used for this reply, if any.
  sources?: AiSource[];
}

// Streams the coach reply over SSE, invoking `onToken` per chunk. `onStatus` fires
// when the coach starts a web search ('searching'). Resolves with the (possibly
// newly-created) conversationId and any web sources once the stream completes. In
// mock mode there is no backend, so a canned reply is emitted instead.
async function aiChat(
  body: { accountId: string; conversationId?: string; messages: AiChatMessage[] },
  onToken: (t: string) => void,
  onError?: (msg: string) => void,
  onStatus?: (status: 'searching') => void,
): Promise<AiChatResult> {
  if (USE_MOCKS) {
    const text = 'Preview mode: connect the real backend to chat with your AI coach about your trading data.';
    for (const word of text.split(' ')) onToken(word + ' ');
    return {};
  }

  const res = await fetch(`${API}/api/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let conversationId: string | undefined;
  let sources: AiSource[] | undefined;

  // Parse the SSE stream: events are separated by a blank line, payload on `data:`.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith('data:')) continue;
      let payload: {
        token?: string;
        error?: string;
        done?: boolean;
        conversationId?: string;
        status?: 'searching';
        sources?: AiSource[];
      };
      try {
        payload = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (payload.status && onStatus) onStatus(payload.status);
      if (payload.token) onToken(payload.token);
      if (payload.sources) sources = payload.sources;
      if (payload.error && onError) onError(payload.error);
      if (payload.done) conversationId = payload.conversationId;
    }
  }

  return { conversationId, sources };
}

export const api = {
  accounts: {
    connect: (body: { mt5Login: number; password: string; server: string; broker?: string }) =>
      apiFetch<BrokerAccount>(`${PREFIX}/accounts`, { method: 'POST', body: JSON.stringify(body) }),
    list: () => apiFetch<BrokerAccount[]>(`${PREFIX}/accounts`),
    updateCredentials: (id: string, password: string) =>
      apiFetch<BrokerAccount>(`${PREFIX}/accounts/${id}/credentials`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`${PREFIX}/accounts/${id}`, { method: 'DELETE' }),
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
  ai: {
    chat: aiChat,
    conversations: () => apiFetch<AiConversationSummary[]>(`${PREFIX}/ai/conversations`),
    conversation: (id: string) => apiFetch<AiConversationDetail>(`${PREFIX}/ai/conversations/${id}`),
  },
};
