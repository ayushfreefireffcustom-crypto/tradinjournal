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
    history?: number[];
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
  /** FX basket (foreign units per 1 USD) for the strength matrix. */
  fx?: { code: string; rate: number; asOf: string }[];
  engineVer: string;
  /** v2 overview (regime trail, drivers grid, surprises, policy proxy). Optional: older APIs omit it. */
  overview?: MacroOverview;
}

// ── Overview (mirrors packages/contracts/src/schema/macro-v2.ts) ─────────────
export type MacroFactorKey = 'inflation' | 'policy' | 'growth' | 'rates' | 'liquidity' | 'credit' | 'risk' | 'dollar';
export type MacroRegimeName = 'Goldilocks' | 'Reflation' | 'Stagflation' | 'Deflation';

export interface MacroRegimePoint { month: string; growth: number; inflation: number; label: MacroRegimeName }

export interface MacroRegimeTrail {
  label: MacroRegimeName;
  /** YYYY-MM the current quadrant run began. */
  since: string;
  months: number;
  /** ≤ 8 words, deterministic. */
  line: string;
  seriesCount: number;
  near: { label: MacroRegimeName; axis: 'growth' | 'inflation' } | null;
  points: MacroRegimePoint[];
}

export interface MacroOverviewInput {
  key: 'core_cpi' | 'policy' | 'unemployment' | 'net_liquidity';
  label: string;
  sub: string;
  value: number;
  format: 'pct' | 'cuts' | 'usd_mn';
  spark: number[];
  delta: number | null;
  deltaLabel: string;
  tone: 'pos' | 'neg' | 'flat';
  asOf: string;
}

export interface MacroDriver { key: MacroFactorKey; label: string; value: number | null; direction: -1 | 0 | 1; weight: number }

export interface MacroGridRow {
  asset: string;
  score: number;
  label: string;
  net: number;
  netYesterday: number | null;
  cells: { factor: MacroFactorKey; raw: number; cell: number }[];
  flipsIf: { factor: MacroFactorKey; direction: -1 | 1; text: string; label: string } | null;
  trend: number[];
}

export interface MacroSurprise {
  months: string[];
  series: { key: string; label: string; cells: { month: string; level: number | null; actual: string | null; forecast: string | null }[] }[];
  line: string | null;
  releases: number;
}

export interface MacroCutsProxy {
  basis: 'treasury-vs-effr';
  effr: number;
  asOf: string;
  rows: { key: '3m' | '1y' | '2y'; label: string; yield: number; cuts: number; cutsYesterday: number | null }[];
}

/** Cut / hold / hike odds per FOMC meeting from 30-day Fed funds futures (CME FedWatch method). */
export interface MacroFedWatch {
  basis: 'fed-funds-futures';
  asOf: string;
  /** Market-implied effective Fed funds rate now, %. */
  impliedNow: number;
  rows: {
    meeting: string;
    label: string;
    cutPct: number;
    holdPct: number;
    hikePct: number;
    /** Part of the cut (or hike) odds priced as 50 bp or more. */
    bigMovePct: number;
    expectedBp: number;
    rateAfter: number;
    /** 25 bp cuts priced through this meeting (negative = hikes). */
    cumulativeCuts: number;
    cumulativeCutsYesterday: number | null;
  }[];
}

export interface MacroOverview {
  asOf: string;
  regime: MacroRegimeTrail | null;
  inputs: MacroOverviewInput[];
  drivers: MacroDriver[];
  grid: MacroGridRow[];
  surprise: MacroSurprise | null;
  cuts: MacroCutsProxy | null;
  /** Absent on states cached before it existed; null when futures didn't answer. */
  fedwatch?: MacroFedWatch | null;
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
  // Admin-only (server returns 403 for non-admins → callers hide the panel).
  adminMembers: (status?: 'PENDING' | 'APPROVED' | 'REJECTED') =>
    req<MacroMember[]>(`${PREFIX}/macro/admin/members${status ? `?status=${status}` : ''}`),
  adminApprove: (id: string) =>
    req<MacroMember>(`${PREFIX}/macro/admin/members/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  adminReject: (id: string) =>
    req<MacroMember>(`${PREFIX}/macro/admin/members/${id}/reject`, { method: 'POST', body: JSON.stringify({}) }),
  assistant: (question: string) =>
    req<{ answer: string }>(`${PREFIX}/macro/assistant`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  /**
   * SSE stream. Returns true only if at least one text chunk was received, so the
   * caller can fall back to the JSON endpoint when the stream yields nothing
   * (e.g. a mid-stream provider error). `onChunk` is invoked per token.
   */
  async assistantStream(question: string, onChunk: (text: string) => void): Promise<boolean> {
    let got = false;
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
          if (payload === '[DONE]') return got;
          try {
            const json = JSON.parse(payload) as { text?: string; error?: string };
            if (json.error) return got; // fall back to JSON if nothing streamed yet
            if (json.text) {
              got = true;
              onChunk(json.text);
            }
          } catch { /* ignore malformed frame */ }
        }
      }
      return got;
    } catch {
      return got;
    }
  },
};
