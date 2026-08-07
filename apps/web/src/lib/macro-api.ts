// Client for the macro segment.
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

export interface MacroMember {
  id: string;
  exchange: string;
  exchangeUid: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  plan: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MacroMemberApplyInput {
  exchange: 'DELTA' | 'COINDCX';
  exchangeUid: string;
}

export interface MacroSignal {
  id?: string;
  asset: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  stop: number;
  t1: number;
  t2: number;
  t3: number;
  confidence: number;
  rationale: string;
  invalidation: string;
  accountSize: number;
  qty: number | null;
  asOf: string;
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
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const macroApi = {
  state: () => req<MacroState>(`${PREFIX}/macro/state`),
  membership: () => req<MacroMember | null>(`${PREFIX}/macro/membership`),
  apply: (body: MacroMemberApplyInput) =>
    req<MacroMember>(`${PREFIX}/macro/membership/apply`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  signals: () => req<MacroSignal[]>(`${PREFIX}/macro/signals`),
  assistant: (question: string) =>
    req<{ answer: string }>(`${PREFIX}/macro/assistant`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  /**
   * SSE stream. Returns true if streaming worked; false to fall back to JSON.
   */
  async assistantStream(question: string, onChunk: (text: string) => void): Promise<boolean> {
    try {
      const res = await fetch(`${API}${PREFIX}/macro/assistant/stream`, {
        method: 'POST',
        ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok || !res.body) return false;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/event-stream')) return false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const line of parts) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (payload === '[DONE]') return true;
          try {
            const json = JSON.parse(payload) as { text?: string; error?: string };
            if (json.text) onChunk(json.text);
          } catch { /* ignore */ }
        }
      }
      return true;
    } catch {
      return false;
    }
  },
};
