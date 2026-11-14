// Client for the partner's Elefin Partner API connection and its admin view. Types
// mirror packages/contracts/src/schema/partner-elefin.ts. The key goes up once, on
// test/connect, and never comes back.
import { PartnerApiError } from '@/lib/partner-api';
import { withViewAs } from '@/lib/view-as';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

export type ElefinResource = 'profile' | 'clients' | 'accounts';
export type ElefinAbilityState = 'ok' | 'forbidden' | 'missing' | 'error' | 'skipped';
export type ElefinProbeOutcome = 'ok' | 'invalid_key' | 'missing_permission' | 'no_logins' | 'rate_limited' | 'unreachable' | 'bad_response' | 'host_not_allowed';
export type ElefinState = 'NOT_CONNECTED' | 'SYNCING' | 'OK' | 'ERROR' | 'PAUSED';

export interface ElefinProbe {
  ok: boolean; outcome: ElefinProbeOutcome; message: string;
  abilities: Record<ElefinResource, ElefinAbilityState>;
  fields: { clients: string[]; accounts: string[] };
  counts: { clients: number | null; accounts: number | null };
  hasLogin: boolean; hasEmail: boolean; missing: string[]; notes: string[]; retryAfter: number | null;
}
export interface ElefinConnection {
  state: ElefinState; brokerId: string | null; keyHint: string | null; baseUrl: string; defaultBaseUrl: string;
  connectedAt: string | null; lastSyncAt: string | null; lastSuccessAt: string | null; nextSyncAt: string | null;
  lastError: string | null; pausedAt: string | null;
  abilities: Record<ElefinResource, ElefinAbilityState> | null; fields: { clients: string[]; accounts: string[] } | null;
  counts: { clients: number | null; accounts: number; verified: number; clientAccounts: number };
  canSyncAt: string | null; syncEveryMinutes: number; outboundIps: string[];
  events: { at: string; status: string; message: string }[];
}
export interface ElefinSyncResult { ok: boolean; skipped?: 'paused' | 'busy' | 'not_connected'; accounts: number; added: number; removed: number; changed: number; rechecked: number; error: string | null }
export interface ElefinConnectResult { probe: ElefinProbe; connection: ElefinConnection; sync: ElefinSyncResult | null }
export interface AdminElefinRow {
  partnerId: string; partnerName: string; partnerEmail: string; partnerStatus: string; state: ElefinState; keyHint: string | null;
  connectedAt: string | null; lastSyncAt: string | null; lastError: string | null; accounts: number; verified: number; clientAccounts: number;
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
