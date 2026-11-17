// Client for the partner's Elefin Partner API connection and its admin view. Types
// mirror packages/contracts/src/schema/partner-elefin.ts. The key goes up once, on
// test/connect, and never comes back.
import { PartnerApiError } from '@/lib/partner-api';
import { withViewAs } from '@/lib/view-as';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

export type ElefinProbeOutcome = 'ok' | 'invalid_key' | 'missing_permission' | 'rate_limited' | 'unreachable' | 'bad_response' | 'host_not_allowed' | 'ip_blocked';
export type ElefinState = 'NOT_CONNECTED' | 'SYNCING' | 'OK' | 'ERROR' | 'PAUSED';

export interface ElefinKeyInfo {
  partnerId: number | null; partnerName: string | null; keyName: string | null; abilities: string[]; canReadClients: boolean;
  rateLimitPerMinute: number | null; expiresAt: string | null; tradesFrom: string | null;
}
export interface ElefinProbe {
  ok: boolean; outcome: ElefinProbeOutcome; message: string; key: ElefinKeyInfo | null; clients: number | null;
  clientsRead: 'ok' | 'forbidden' | 'error' | 'skipped'; fields: string[]; missing: string[]; notes: string[]; retryAfter: number | null;
}
export interface ElefinRoster {
  at: string; fullAt: string | null; total: number; active: number; suspended: number; inactive: number; funded: number;
  depositsUsd: number; lots: number; quiet: number; quietDays: number; neverTraded: number; new7d: number; new30d: number;
  newestAt: string | null; weekly: number[];
}
export interface ElefinVerification { referred: number; verified: number; held: number; notFound: number; waiting: number; verifiedFunded: number; lastCheckAt: string | null }
export interface ElefinConnection {
  state: ElefinState; brokerId: string | null; keyHint: string | null; baseUrl: string; defaultBaseUrl: string;
  connectedAt: string | null; lastSyncAt: string | null; lastSuccessAt: string | null; nextSyncAt: string | null;
  lastError: string | null; pausedAt: string | null; key: ElefinKeyInfo | null; roster: ElefinRoster | null; verification: ElefinVerification;
  canSyncAt: string | null; syncEveryMinutes: number; outboundIps: string[];
  events: { at: string; status: string; message: string }[];
}
export interface ElefinSyncResult {
  ok: boolean; skipped?: 'paused' | 'busy' | 'not_connected'; full: boolean; clients: number | null; changed: number;
  lookups: number; verified: number; unverified: number; error: string | null;
}
export interface ElefinConnectResult { probe: ElefinProbe; connection: ElefinConnection; sync: ElefinSyncResult | null }
export interface AdminElefinRow {
  partnerId: string; partnerName: string; partnerEmail: string; partnerStatus: string; state: ElefinState; keyHint: string | null;
  elefinPartner: string | null; keyExpiresAt: string | null; connectedAt: string | null; lastSyncAt: string | null; lastError: string | null;
  clients: number | null; funded: number | null; referred: number; verified: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${withViewAs(path)}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = json?.error?.details as Record<string, string[]> | undefined;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new PartnerApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? 'ERROR', res.status);
  }
  return json.data as T;
}
const send = <T>(method: string, path: string, body?: unknown) => call<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const enc = encodeURIComponent;
const clean = (o: { key?: string; baseUrl?: string }) => ({ ...(o.key ? { key: o.key.trim() } : {}), ...(o.baseUrl?.trim() ? { baseUrl: o.baseUrl.trim() } : {}) });

export const elefinApi = {
  status: () => call<ElefinConnection>(`${P}/partner/brokers/elefin`),
  test: (o: { key?: string; baseUrl?: string } = {}) => send<ElefinProbe>('POST', `${P}/partner/brokers/elefin/test`, clean(o)),
  connect: (key: string, baseUrl?: string) => send<ElefinConnectResult>('POST', `${P}/partner/brokers/elefin/connect`, clean({ key, baseUrl })),
  syncNow: () => send<{ result: ElefinSyncResult | null; connection: ElefinConnection }>('POST', `${P}/partner/brokers/elefin/sync`, {}),
  disconnect: () => send<ElefinConnection>('DELETE', `${P}/partner/brokers/elefin`),
  // Admin
  adminList: () => call<AdminElefinRow[]>(`${P}/admin/partner-program/elefin`),
  adminStatus: (partnerId: string) => call<ElefinConnection>(`${P}/admin/partners/${enc(partnerId)}/elefin`),
  adminSync: (partnerId: string) => send<{ result: ElefinSyncResult | null; connection: ElefinConnection }>('POST', `${P}/admin/partners/${enc(partnerId)}/elefin/sync`, {}),
};

/** "key.secret" with something on both sides of the dot. */
export const looksLikeKey = (s: string): boolean => /^[A-Za-z0-9_\-|~]+\.[A-Za-z0-9_\-|~.=+/]{4,}$/.test(s.trim()) && s.trim().length >= 12;

export const STATE_LABEL: Record<ElefinState, string> = {
  NOT_CONNECTED: 'Not connected', SYNCING: 'Syncing', OK: 'Synced', ERROR: 'Needs attention', PAUSED: 'Paused',
};

/** "$4.8M", "$12.4K", "$950": compact USD for tiles. */
export function usdShort(v: number): string {
  const a = Math.abs(v);
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (a >= 1e6) return `$${trim((v / 1e6).toFixed(a >= 1e8 ? 0 : 1))}M`;
  if (a >= 1e4) return `$${trim((v / 1e3).toFixed(a >= 1e5 ? 0 : 1))}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** "17.7K", "932", "4.2": compact lots. */
export function lotsShort(v: number): string {
  if (v >= 1e4) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`;
  return v >= 100 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10) / 10);
}

/** Whole days until an ISO date (≤ 0 once past); null for no date. */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
}

/** Each verification state's share of referred traders, in percent, for the stacked bar. */
export function verificationShares(v: ElefinVerification): { verified: number; held: number; notFound: number; waiting: number } {
  const total = v.verified + v.held + v.notFound + v.waiting;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return { verified: pct(v.verified), held: pct(v.held), notFound: pct(v.notFound), waiting: pct(v.waiting) };
}
