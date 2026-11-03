// Client for the IB partner layer: broker IB connections, client verification, partner
// packages, the trader's Access page and the admin programme view. Types mirror
// packages/contracts/src/schema/partner-ib.ts.
import { PartnerApiError } from '@/lib/partner-api';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

export type IbMethod = 'LIST' | 'SHEET' | 'API';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'MANUAL_REVIEW' | 'REJECTED' | 'UNSUPPORTED_BROKER';
export type EntitlementStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'EXPIRED';
export type PackageStatus = 'DRAFT' | 'LIVE' | 'ARCHIVED';
export type Range = '7D' | '30D' | '90D' | 'ALL';

export interface BrokerCatalogEntry { key: string; label: string; listHint: string; methods: IbMethod[] }
export interface Perk { key: string; label: string; description: string; href: string }
export interface PartnerBroker {
  id: string; broker: string; label: string; ibId: string | null; method: IbMethod; sheetUrl: string | null; hasApiKey: boolean;
  serverMatch: string | null; status: 'PENDING' | 'OK' | 'ERROR'; lastSyncAt: string | null; lastError: string | null;
  accountCount: number; clientAccounts: number; verified: number;
}
export interface UploadResult { broker: PartnerBroker; added: number; updated: number; removed: number; skipped: number; rechecked: number }
export interface PartnerPackage {
  id: string; name: string; description: string | null; perks: string[]; templateIds: string[]; brokers: string[];
  requireActive: boolean; accessDays: number | null; status: PackageStatus; holders: number; inGrace: number; createdAt: string;
}
export interface PackageInput {
  name: string; description?: string; perks: string[]; templateIds: string[]; brokers: string[];
  requireActive: boolean; accessDays: number | null; status: PackageStatus;
}
export interface PackagesPage {
  packages: PartnerPackage[]; perks: Perk[];
  templates: { id: string; name: string; status: string; partnerOnly: boolean }[];
  brokers: { key: string; label: string }[]; lockedPerks: string[];
}
export interface TradingSummary { connected: number; trading: number; trades30d: number; lots30d: number; pnl30d: number; profitable: number; losing: number }
export interface IbFunnel { range: Range; clicks: number; signups: number; connected: number; verified: number; active: number; eligible: number }
export interface PartnerIbOverview {
  funnel: IbFunnel; trading: TradingSummary; brokers: PartnerBroker[]; packages: { live: number; holders: number };
  needsAttention: { notFound: number; inReview: number; unsupported: number; syncErrors: number };
}
export interface ClientIb {
  referralId: string; verification: VerificationStatus | 'NO_ACCOUNT'; verifiedBrokers: string[]; eligible: boolean;
  packages: { name: string; status: EntitlementStatus }[]; consent: boolean; pnl30d: number | null; pnlTotal: number | null;
}
export interface AccessAccount {
  id: string; label: string; broker: string; brokerKey: string | null; status: VerificationStatus; reason: string | null;
  brokerEmail: string | null; checkedAt: string | null; reviewRequested: boolean; canRetry: boolean;
}
export interface AccessPackage {
  id: string; name: string; description: string | null; perks: Perk[]; templates: { id: string; name: string }[];
  status: EntitlementStatus | 'LOCKED'; reasons: string[]; grantedAt: string | null; expiresAt: string | null; graceUntil: string | null;
}
export interface ClientAccess {
  partner: { name: string; code: string; status: 'ACTIVE' | 'PAUSED' } | null; canJoin: boolean; accounts: AccessAccount[];
  activity: { active: boolean; trades: number; lots: number; rule: { minTrades: number; windowDays: number; minLots: number }; checkedAt: string | null };
  packages: AccessPackage[]; consent: { share: boolean; at: string | null }; lockedPerks: string[]; myPerks: string[];
}
export interface ProgramSettings { activeMinTrades: number; activeWindowDays: number; activeMinLots: number; graceDays: number; partnerGraceDays: number; lockedPerks: string[] }
export interface ProgramRow {
  id: string; name: string; email: string; code: string | null; status: string; clients: number; connected: number; verified: number;
  active: number; eligible: number; trades30d: number; lots30d: number; pnl30d: number; profitable: number; losing: number; brokerErrors: number;
}
export interface ProgramOverview {
  range: Range;
  partners: { pending: number; needsInfo: number; active: number; suspended: number; rejected: number; revoked: number };
  funnel: IbFunnel; trading: TradingSummary; rows: ProgramRow[]; attention: { reviews: number; flags: number; syncErrors: number };
}
export interface ReviewItem {
  id: string; kind: 'verification' | 'flag'; flag: string | null; partner: { id: string; name: string };
  client: { id: string; name: string; email: string } | null; account: { id: string; login: string; broker: string; server: string } | null;
  status: VerificationStatus | null; signal: string | null; reason: string | null; brokerEmail: string | null; note: string | null; at: string;
}
export interface IbEvent { id: string; at: string; kind: string; message: string; partnerId: string | null; userId: string | null; actorEmail: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
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

export const ibApi = {
  // Partner
  brokers: () => call<{ brokers: PartnerBroker[]; catalog: BrokerCatalogEntry[] }>(`${P}/partner/brokers`),
  saveBroker: (input: { broker: string; method: IbMethod; ibId?: string; sheetUrl?: string; serverMatch?: string }) => send<PartnerBroker>('POST', `${P}/partner/brokers`, input),
  removeBroker: (id: string) => send<void>('DELETE', `${P}/partner/brokers/${enc(id)}`),
  uploadList: (id: string, text: string, mode: 'replace' | 'merge') => send<UploadResult>('POST', `${P}/partner/brokers/${enc(id)}/accounts`, { text, mode }),
  syncBroker: (id: string) => send<PartnerBroker>('POST', `${P}/partner/brokers/${enc(id)}/sync`, {}),
  packages: () => call<PackagesPage>(`${P}/partner/packages`),
  createPackage: (input: PackageInput) => send<PartnerPackage>('POST', `${P}/partner/packages`, input),
  updatePackage: (id: string, input: Partial<PackageInput>) => send<PartnerPackage>('PATCH', `${P}/partner/packages/${enc(id)}`, input),
  templateAudience: (id: string, partnerOnly: boolean) => send<{ id: string; partnerOnly: boolean }>('POST', `${P}/partner/templates/${enc(id)}/audience`, { partnerOnly }),
  // Trader
  access: () => call<ClientAccess>(`${P}/partner-access`),
  perks: () => call<{ locked: string[]; mine: string[] }>(`${P}/partner-access/perks`),
  join: (code: string) => send<ClientAccess>('POST', `${P}/partner-access/join`, { code }),
  verify: (brokerAccountId: string, brokerEmail?: string) => send<ClientAccess>('POST', `${P}/partner-access/verify`, { brokerAccountId, ...(brokerEmail ? { brokerEmail } : {}) }),
  review: (brokerAccountId: string, note?: string) => send<ClientAccess>('POST', `${P}/partner-access/review`, { brokerAccountId, ...(note ? { note } : {}) }),
  consent: (share: boolean) => send<ClientAccess>('POST', `${P}/partner-access/consent`, { share }),
  // Admin
  program: (range: Range = '30D') => call<ProgramOverview>(`${P}/admin/partner-program?range=${range}`),
  reviews: () => call<ReviewItem[]>(`${P}/admin/partner-program/reviews`),
  decide: (id: string, action: 'approve' | 'reject', note?: string) => send<{ status: VerificationStatus }>('POST', `${P}/admin/partner-program/verifications/${enc(id)}`, { action, ...(note ? { note } : {}) }),
  events: (q: { partnerId?: string; kind?: string; limit?: number } = {}) => call<IbEvent[]>(`${P}/admin/partner-program/events?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()}`),
  settings: () => call<ProgramSettings>(`${P}/admin/partner-program/settings`),
  saveSettings: (s: ProgramSettings) => send<ProgramSettings>('PUT', `${P}/admin/partner-program/settings`, s),
  exportUrl: (type: 'clients' | 'partners') => `${API}${P}/admin/partner-program/export?type=${type}`,
  recheck: (partnerId: string) => send<{ rechecked: number }>('POST', `${P}/admin/partners/${enc(partnerId)}/recheck`, {}),
};

export const VERIFY_LABEL: Record<VerificationStatus | 'NO_ACCOUNT', string> = {
  PENDING: 'Not checked', VERIFIED: 'Verified', NOT_FOUND: 'Not found', MANUAL_REVIEW: 'In review', REJECTED: 'Rejected',
  UNSUPPORTED_BROKER: 'Other broker', NO_ACCOUNT: 'No MT5 yet',
};
export const ENT_LABEL: Record<EntitlementStatus | 'LOCKED', string> = {
  ACTIVE: 'Unlocked', GRACE: 'Grace period', SUSPENDED: 'Paused', EXPIRED: 'Ended', LOCKED: 'Locked',
};

/** Signed money, two decimals, with the sign spelled out. */
export function money(v: number): string {
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}$${s}`;
}
