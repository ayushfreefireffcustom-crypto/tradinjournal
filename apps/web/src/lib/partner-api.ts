// Client for the partner programme: what a partner sees about the people they
// referred (tracking only — no commissions or payouts), plus the admin view.
// Same conventions as trader-api.ts; types are declared locally but kept in
// lockstep with packages/contracts/src/schema/partner.ts.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

export type PartnerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
/**
 * SIGNED_UP — created an account, no broker yet.
 * CONNECTED — linked MT5 but hasn't traded enough to count as active.
 * ACTIVE    — meets the activity rule (closed trades in the recent window).
 * INACTIVE  — was active, has since dropped below the rule.
 */
export type ReferralStatus = 'SIGNED_UP' | 'CONNECTED' | 'ACTIVE' | 'INACTIVE';
export type PartnerRange = '7D' | '30D' | '90D' | 'ALL';

export interface PartnerProfile {
  id: string;
  name: string;
  status: PartnerStatus;
  code: string;
  since: string;
  activeRule: { minTrades: number; windowDays: number };
  cookieDays: number;
}
/** `converted` = clicks in the range that led to a signup; click → signup % is converted / clicks. */
export interface PartnerFunnel { range: PartnerRange; from: string | null; clicks: number; converted: number; signups: number; connected: number; active: number }
export interface PartnerDailyPoint { date: string; clicks: number; signups: number; clients: number; active: number }
export interface PartnerChannel {
  id: string; label: string; slug: string | null; url: string;
  clicks: number; converted: number; signups: number; connected: number; active: number; createdAt: string;
}
export interface PartnerCode { id: string; code: string; isPrimary: boolean; url: string; clicks: number; signups: number; createdAt: string }
export interface PartnerClient {
  id: string; name: string; city: string | null; country: string | null; channel: string; via: 'link' | 'code' | 'admin';
  signedUpAt: string; connectedAt: string | null; status: ReferralStatus; trades30d: number; lots30d: number; lastActiveAt: string | null;
}
export interface PartnerClientCounts { all: number; SIGNED_UP: number; CONNECTED: number; ACTIVE: number; INACTIVE: number }
export interface PartnerEvent { id: string; at: string; kind: 'signup' | 'connected' | 'active' | 'inactive'; client: string; channel: string }
export interface PartnerClick { id: string; at: string; channel: string; device: 'Mobile' | 'Desktop' | 'Tablet'; country: string | null; converted: boolean }
export interface PartnerOverview {
  partner: PartnerProfile; funnel: PartnerFunnel; daily: PartnerDailyPoint[]; channels: PartnerChannel[];
  activity: PartnerEvent[]; recentClients: PartnerClient[]; totalClients: number;
}
export interface PartnerLinks {
  partner: PartnerProfile; baseUrl: string; codes: PartnerCode[]; channels: PartnerChannel[]; recentClicks: PartnerClick[];
  totals: { clicks: number; converted: number; signups: number };
  limits: { maxChannels: number; maxCodes: number };
}
export interface PaginationMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface ClientsPage { items: PartnerClient[]; counts: PartnerClientCounts; meta: PaginationMeta }
export interface ClientsQuery { status?: ReferralStatus; channel?: string; q?: string; sort?: 'recent' | 'trades' | 'name'; page?: number; pageSize?: number }

export interface AdminPartnerRow {
  id: string; userId: string; name: string; email: string; code: string | null; status: PartnerStatus;
  joinedAt: string; approvedAt: string | null; audience: string | null;
  clicks30d: number; converted30d: number; signups30d: number; clients: number; connected: number; active: number;
}
export interface PartnerNote { id: string; body: string; authorEmail: string; createdAt: string }
export interface AdminPartnerDetail extends PartnerOverview { admin: AdminPartnerRow; codes: PartnerCode[]; notes: PartnerNote[] }
export interface ReservedCode { id: string; code: string; reason: string | null; createdByEmail: string; createdAt: string }
export interface ReferrerLookup {
  query: string;
  user: { id: string; name: string; email: string } | null;
  referredBy: { partner: AdminPartnerRow; client: PartnerClient } | null;
  codeOwner: AdminPartnerRow | null;
}
export type StatusAction = 'approve' | 'decline' | 'suspend' | 'reinstate' | 'revoke';

/** Error with the API's machine code (e.g. PARTNER_PENDING) so pages can branch on it. */
export class PartnerApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: PaginationMeta }> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = json?.error?.details as Record<string, string[]> | undefined;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new PartnerApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code ?? 'ERROR', res.status);
  }
  return json as { data: T; meta?: PaginationMeta };
}
const get = async <T>(path: string) => (await call<T>(path)).data;
const send = async <T>(method: string, path: string, body?: unknown) =>
  (await call<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).data;
const qs = (o: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : '';
};

async function clientsPage(base: string, q: ClientsQuery): Promise<ClientsPage> {
  const r = await call<{ items: PartnerClient[]; counts: PartnerClientCounts }>(`${base}${qs({ ...q })}`);
  return { ...r.data, meta: r.meta! };
}

export const partnerApi = {
  me: () => get<PartnerProfile | null>(`${P}/partner/me`),
  apply: (input: { audience: string; code?: string }) => send<PartnerProfile>('POST', `${P}/partner/apply`, input),
  overview: (range: PartnerRange = '30D') => get<PartnerOverview>(`${P}/partner/overview${qs({ range })}`),
  clients: (q: ClientsQuery = {}) => clientsPage(`${P}/partner/clients`, q),
  links: () => get<PartnerLinks>(`${P}/partner/links`),
  createChannel: (label: string) => send<PartnerChannel>('POST', `${P}/partner/channels`, { label }),
  archiveChannel: (id: string) => send<void>('DELETE', `${P}/partner/channels/${encodeURIComponent(id)}`),
  reserveCode: (code: string) => send<PartnerCode>('POST', `${P}/partner/codes`, { code }),
  releaseCode: (id: string) => send<void>('DELETE', `${P}/partner/codes/${encodeURIComponent(id)}`),
  checkCode: (code: string) => get<{ valid: boolean; partnerName: string | null }>(`${P}/referrals/check${qs({ code })}`),

  adminList: (status?: PartnerStatus) => get<AdminPartnerRow[]>(`${P}/admin/partners${qs({ status })}`),
  adminCreate: (input: { email: string; code?: string; audience?: string }) => send<AdminPartnerRow>('POST', `${P}/admin/partners`, input),
  adminDetail: (id: string, range: PartnerRange = 'ALL') => get<AdminPartnerDetail>(`${P}/admin/partners/${encodeURIComponent(id)}${qs({ range })}`),
  adminClients: (id: string, q: ClientsQuery = {}) => clientsPage(`${P}/admin/partners/${encodeURIComponent(id)}/clients`, q),
  adminStatus: (id: string, action: StatusAction, reason?: string) => send<AdminPartnerRow>('POST', `${P}/admin/partners/${encodeURIComponent(id)}/status`, { action, ...(reason ? { reason } : {}) }),
  adminNote: (id: string, body: string) => send<PartnerNote>('POST', `${P}/admin/partners/${encodeURIComponent(id)}/notes`, { body }),
  adminAssign: (id: string, input: { email: string; reason?: string; force?: boolean }) => send<PartnerClient>('POST', `${P}/admin/partners/${encodeURIComponent(id)}/clients`, input),
  adminUnlink: (id: string, clientId: string, reason?: string) => send<void>('DELETE', `${P}/admin/partners/${encodeURIComponent(id)}/clients/${encodeURIComponent(clientId)}${qs({ reason })}`),
  adminMove: (id: string, toPartnerId: string, reason?: string) => send<{ moved: number }>('POST', `${P}/admin/partners/${encodeURIComponent(id)}/move-clients`, { toPartnerId, ...(reason ? { reason } : {}) }),
  adminRevokeCode: (id: string, codeId: string) => send<void>('DELETE', `${P}/admin/partners/${encodeURIComponent(id)}/codes/${encodeURIComponent(codeId)}`),
  adminLookup: (q: string) => get<ReferrerLookup>(`${P}/admin/partners/lookup${qs({ q })}`),
  reservedList: () => get<ReservedCode[]>(`${P}/admin/partner-codes/reserved`),
  reserveName: (code: string, reason?: string) => send<ReservedCode>('POST', `${P}/admin/partner-codes/reserved`, { code, ...(reason ? { reason } : {}) }),
  releaseName: (id: string) => send<void>('DELETE', `${P}/admin/partner-codes/reserved/${encodeURIComponent(id)}`),
};

export const STATUS_LABEL: Record<ReferralStatus, string> = {
  SIGNED_UP: 'Signed up', CONNECTED: 'MT5 connected', ACTIVE: 'Active trader', INACTIVE: 'Inactive',
};
export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  PENDING: 'Pending', ACTIVE: 'Active', SUSPENDED: 'Suspended', REVOKED: 'Revoked',
};
