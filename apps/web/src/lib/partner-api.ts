// Client for the partner programme: what a partner sees about the people they
// referred (tracking only — no commissions or payouts yet), plus the admin
// view across all partners. Same conventions as trader-api.ts.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

/**
 * SIGNED_UP — created an account, no broker yet.
 * CONNECTED — linked MT5 but hasn't traded enough to count as active.
 * ACTIVE    — meets the activity rule (closed trades in the recent window).
 * INACTIVE  — was active, has since dropped below the rule.
 */
export type ReferralStatus = 'SIGNED_UP' | 'CONNECTED' | 'ACTIVE' | 'INACTIVE';
export type PartnerStatus = 'ACTIVE' | 'PENDING' | 'PAUSED';

export interface PartnerProfile {
  id: string;
  name: string;
  code: string;
  status: PartnerStatus;
  since: string;
  /** Activity rule used for "active trader", mirrored from platform access. */
  activeRule: { minTrades: number; windowDays: number };
}

export interface PartnerChannel {
  id: string;
  label: string;
  /** `null` for the default link with no channel tag. */
  slug: string | null;
  url: string;
  clicks: number;
  signups: number;
  connected: number;
  active: number;
  createdAt: string;
}

export interface PartnerClient {
  id: string;
  name: string;
  country: string;
  city: string;
  channel: string;
  via: 'link' | 'code';
  signedUpAt: string;
  connectedAt: string | null;
  status: ReferralStatus;
  trades30d: number;
  lots30d: number;
  lastActiveAt: string | null;
}

export interface PartnerEvent {
  id: string;
  at: string;
  kind: 'signup' | 'connected' | 'active' | 'inactive';
  client: string;
  channel: string;
}

export interface PartnerClick {
  id: string;
  at: string;
  channel: string;
  device: 'Mobile' | 'Desktop' | 'Tablet';
  country: string;
  converted: boolean;
}

export interface PartnerOverview {
  partner: PartnerProfile;
  daily: { date: string; clicks: number }[];
  clients: PartnerClient[];
  channels: PartnerChannel[];
  activity: PartnerEvent[];
}

export interface PartnerLinks {
  partner: PartnerProfile;
  baseUrl: string;
  channels: PartnerChannel[];
  recentClicks: PartnerClick[];
}

export interface AdminPartnerRow {
  id: string;
  name: string;
  email: string;
  code: string;
  status: PartnerStatus;
  joinedAt: string;
  audience: string;
  clicks30d: number;
  signups30d: number;
  clients: number;
  connected: number;
  active: number;
}

export interface AdminPartnerDetail extends PartnerOverview {
  admin: AdminPartnerRow;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

export const partnerApi = {
  overview: () => req<PartnerOverview>(`${P}/partner/overview`),
  links: () => req<PartnerLinks>(`${P}/partner/links`),
  createChannel: (label: string) => req<PartnerChannel>(`${P}/partner/links`, { method: 'POST', body: JSON.stringify({ label }) }),
  adminList: () => req<AdminPartnerRow[]>(`${P}/admin/partners`),
  adminDetail: (id: string) => req<AdminPartnerDetail>(`${P}/admin/partners/${encodeURIComponent(id)}`),
};

export const STATUS_LABEL: Record<ReferralStatus, string> = {
  SIGNED_UP: 'Signed up', CONNECTED: 'MT5 connected', ACTIVE: 'Active trader', INACTIVE: 'Inactive',
};
