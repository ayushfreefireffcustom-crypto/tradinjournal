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

// Cached AI performance narrative for the dashboard.
export interface AiReport {
  content: string;
  /** Served from cache — the underlying data hasn't changed. */
  cached: boolean;
  /** False when this is the deterministic fallback rather than a written review. */
  generated: boolean;
  /** Cached text served after a failed regeneration. */
  stale: boolean;
  updatedAt: string;
  model?: string;
}

// Weekly review email opt-in. Absent server-side row reads as { enabled: false }.
export interface WeeklyReviewPref {
  enabled: boolean;
  lastSentAt: string | null;
}

export interface AiChatResult {
  conversationId?: string;
  // Web citations the coach used for this reply, if any.
  sources?: AiSource[];
  // True when the caller aborted mid-stream (Stop). The tokens received so far
  // are still valid — the server persists the partial turn.
  stopped?: boolean;
}

export interface AiChatOptions {
  onError?: (msg: string) => void;
  onStatus?: (status: 'searching') => void;
  /** Abort the stream early (Stop button). Resolves with `stopped: true`. */
  signal?: AbortSignal;
}

// Streams the coach reply over SSE, invoking `onToken` per chunk. `onStatus` fires
// when the coach starts a web search ('searching'). Resolves with the (possibly
// newly-created) conversationId and any web sources once the stream completes. In
// mock mode there is no backend, so a canned reply is emitted instead.
async function aiChat(
  body: { accountId: string; conversationId?: string; messages: AiChatMessage[]; regenerate?: boolean },
  onToken: (t: string) => void,
  opts: AiChatOptions = {},
): Promise<AiChatResult> {
  const { onError, onStatus, signal } = opts;

  if (USE_MOCKS) {
    const text = 'Preview mode: connect the real backend to chat with your AI coach about your trading data.';
    for (const word of text.split(' ')) onToken(word + ' ');
    return {};
  }

  let res: Response;
  try {
    res = await fetch(`${API}/api/ai/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // Stopped before the first byte arrived — nothing was generated.
    if (signal?.aborted) return { stopped: true };
    throw err;
  }

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
  try {
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
  } catch (err) {
    // A Stop press aborts the reader — that's a normal outcome, not a failure.
    // Anything else is a real transport error and propagates to the caller.
    if (!signal?.aborted) throw err;
    return { conversationId, sources, stopped: true };
  }

  return { conversationId, sources };
}

// ── Phase 2: Economic calendar ────────────────────────────────────────────────

export type EventImpact = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CalendarEvent {
  id: string;
  title: string;
  country: string; // ISO-3166 alpha-2 (for the flag)
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTime: string; // ISO UTC
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  actualAt: string | null;
  watched: boolean;
}

export interface CalendarEventDetail extends Omit<CalendarEvent, 'watched'> {
  sources: unknown;
}

export interface CalendarFilters {
  from?: string;
  to?: string;
  impact?: EventImpact;
  currency?: string;
  category?: string;
}

function calendarQuery(f: CalendarFilters): string {
  const q = new URLSearchParams();
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (f.impact) q.set('impact', f.impact);
  if (f.currency) q.set('currency', f.currency);
  if (f.category) q.set('category', f.category);
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ── Phase 2: News feed ─────────────────────────────────────────────────────────

export type Sentiment = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type NewsCategory = 'CRYPTO' | 'MACRO' | 'GEOPOLITICAL' | 'REGULATORY' | 'MARKETS';

export interface NewsItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  outlets: string[];
  imageUrl: string | null;
  publishedAt: string;
  country: string | null;
  category: NewsCategory | null;
  sentiment: Sentiment | null;
  relevance: number | null;
  impact: EventImpact | null;
  marketMoving: boolean;
}

export interface NewsPage {
  items: NewsItem[];
  nextCursor: string | null;
}

export interface NewsFilters {
  category?: NewsCategory;
  country?: string;
  impact?: EventImpact;
  sentiment?: Sentiment;
  cursor?: string;
  limit?: number;
}

function newsQuery(f: NewsFilters): string {
  const q = new URLSearchParams();
  if (f.category) q.set('category', f.category);
  if (f.country) q.set('country', f.country);
  if (f.impact) q.set('impact', f.impact);
  if (f.sentiment) q.set('sentiment', f.sentiment);
  if (f.cursor) q.set('cursor', f.cursor);
  if (f.limit) q.set('limit', String(f.limit));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Read an SSE GET stream, invoking `onEvent` per `data:` payload until closed/aborted. */
async function sseGet(path: string, onEvent: (payload: Record<string, unknown>) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API}${path}`, { credentials: 'include', signal });
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const evt of events) {
      const line = evt.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        /* ignore non-JSON (comments/heartbeats) */
      }
    }
  }
}

// ── Phase 2: Notifications ─────────────────────────────────────────────────────

export interface NotificationPrefs {
  timezone: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  minImpact: EventImpact;
  currencies: string[];
  categories: string[];
  leadMinutes: number;
  newsAlerts: boolean;
  pushAvailable: boolean;
  vapidPublicKey: string | null;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
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
    deleteConversation: (id: string) =>
      apiFetch<{ ok: boolean }>(`${PREFIX}/ai/conversations/${id}`, { method: 'DELETE' }),
    // `force` rewrites the review even when the cached one is still current.
    report: (accountId: string, force = false) =>
      apiFetch<AiReport>(
        `${PREFIX}/ai/report?accountId=${encodeURIComponent(accountId)}${force ? '&force=1' : ''}`,
      ),
    weeklyReview: () => apiFetch<WeeklyReviewPref>(`${PREFIX}/ai/weekly-review`),
    setWeeklyReview: (enabled: boolean) =>
      apiFetch<WeeklyReviewPref>(`${PREFIX}/ai/weekly-review`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    // Reached from an email link — POST, not GET, so inbox scanners that
    // prefetch links can't unsubscribe someone who never clicked.
    unsubscribeWeeklyReview: (token: string) =>
      apiFetch<{ ok: boolean }>(`${PREFIX}/ai/weekly-review/unsubscribe`, {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  },
  calendar: {
    list: (filters: CalendarFilters = {}) =>
      apiFetch<CalendarEvent[]>(`${PREFIX}/calendar${calendarQuery(filters)}`),
    get: (id: string) => apiFetch<CalendarEventDetail>(`${PREFIX}/calendar/${id}`),
    watch: (id: string) => apiFetch<{ watched: boolean }>(`${PREFIX}/calendar/${id}/watch`, { method: 'POST' }),
    unwatch: (id: string) => apiFetch<{ watched: boolean }>(`${PREFIX}/calendar/${id}/watch`, { method: 'DELETE' }),
  },
  news: {
    list: (filters: NewsFilters = {}) => apiFetch<NewsPage>(`${PREFIX}/news${newsQuery(filters)}`),
    // Live feed. Calls onItems with each pushed batch until the signal aborts.
    stream: (onItems: (items: NewsItem[]) => void, signal?: AbortSignal) =>
      sseGet(
        `${PREFIX}/news/stream`,
        p => { if (Array.isArray(p.items)) onItems(p.items as NewsItem[]); },
        signal,
      ),
    // Streamed AI morning brief.
    brief: (onToken: (t: string) => void, onDone: () => void, signal?: AbortSignal) =>
      sseGet(
        `${PREFIX}/news/brief/stream`,
        p => {
          if (typeof p.token === 'string') onToken(p.token);
          if (p.done) onDone();
        },
        signal,
      ),
  },
  notifications: {
    preferences: () => apiFetch<NotificationPrefs>(`${PREFIX}/notifications/preferences`),
    setPreferences: (body: Partial<Omit<NotificationPrefs, 'pushAvailable' | 'vapidPublicKey'>>) =>
      apiFetch<NotificationPrefs>(`${PREFIX}/notifications/preferences`, { method: 'PATCH', body: JSON.stringify(body) }),
    list: () => apiFetch<{ items: AppNotification[]; unread: number }>(`${PREFIX}/notifications`),
    markRead: () => apiFetch<{ ok: boolean }>(`${PREFIX}/notifications/read`, { method: 'POST' }),
  },
  push: {
    subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
      apiFetch<{ ok: boolean }>(`${PREFIX}/push/subscribe`, { method: 'POST', body: JSON.stringify(sub) }),
    unsubscribe: (endpoint: string) =>
      apiFetch<{ ok: boolean }>(`${PREFIX}/push/unsubscribe`, { method: 'POST', body: JSON.stringify({ endpoint }) }),
  },
};
