// Client for the IB partner layer: broker IB connections, client verification, partner
// packages, the trader's Access page and the admin programme view. Types mirror
// packages/contracts/src/schema/partner-ib.ts.
import { PartnerApiError, rangeQuery, type RangeSel } from '@/lib/partner-api';
import { withViewAs } from '@/lib/view-as';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';
const P = USE_MOCKS ? '/data' : '/api';

export type IbMethod = 'LIST' | 'SHEET' | 'API';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'MANUAL_REVIEW' | 'REJECTED' | 'UNSUPPORTED_BROKER';
export type EntitlementStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'EXPIRED';
export type PackageStatus = 'DRAFT' | 'LIVE' | 'ARCHIVED';
export type Range = '7D' | '30D' | '90D' | 'ALL' | 'CUSTOM';
export type { RangeSel };
const rq = (r: RangeSel, extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...extra, ...rangeQuery(r) }).filter(([, v]) => v !== undefined) as [string, string][]).toString();

export interface BrokerCatalogEntry { key: string; label: string; listHint: string; methods: IbMethod[] }
export interface Perk { key: string; label: string; description: string; href: string }
export interface PartnerBroker {
  id: string; broker: string; label: string; ibId: string | null; method: IbMethod; sheetUrl: string | null; hasApiKey: boolean;
  serverMatch: string | null; status: 'PENDING' | 'OK' | 'ERROR'; lastSyncAt: string | null; lastError: string | null;
  accountCount: number; clientAccounts: number; verified: number;
}
export interface UploadResult { broker: PartnerBroker; added: number; updated: number; removed: number; skipped: number; rechecked: number }
export interface PartnerPackage {
  id: string; name: string; description: string | null; perks: string[]; templateIds: string[]; productIds: string[]; brokers: string[];
  adminHold: boolean; adminNote: string | null;
  requireActive: boolean; accessDays: number | null; endsOn: string | null; ended: boolean; status: PackageStatus; holders: number; inGrace: number; createdAt: string;
}
export interface PackageInput {
  name: string; description?: string; perks: string[]; templateIds: string[]; productIds: string[]; brokers: string[];
  requireActive: boolean; accessDays: number | null; endsOn: string | null; status: PackageStatus;
}
export interface PackagesPage {
  packages: PartnerPackage[]; perks: Perk[];
  templates: { id: string; name: string; status: string; partnerOnly: boolean }[];
  brokers: { key: string; label: string }[]; lockedPerks: string[];
  products: { id: string; name: string; type: string; status: string }[];
  permissions: { canOfferProducts: boolean; maxPackages: number };
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
  kind: 'mt5' | 'external'; platform: string;
}
export interface AccessPackage {
  id: string; name: string; description: string | null; perks: Perk[]; templates: { id: string; name: string }[];
  products: { id: string; name: string; type: string }[];
  status: EntitlementStatus | 'LOCKED'; reasons: string[]; grantedAt: string | null; expiresAt: string | null; graceUntil: string | null;
  /** Last day the package is on offer (YYYY-MM-DD, UTC), or null. */
  endsOn: string | null;
}
export interface ClientAccess {
  partner: { name: string; code: string; status: 'ACTIVE' | 'PAUSED' } | null; canJoin: boolean; accounts: AccessAccount[];
  activity: { active: boolean; trades: number; lots: number; rule: { minTrades: number; windowDays: number; minLots: number }; checkedAt: string | null };
  packages: AccessPackage[]; consent: { share: boolean; at: string | null }; lockedPerks: string[]; myPerks: string[];
  products: ClientProduct[];
}
export interface ProgramSettings {
  activeMinTrades: number; activeWindowDays: number; activeMinLots: number; graceDays: number; partnerGraceDays: number; lockedPerks: string[];
  ibApiHosts: string[];
}
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
  client: { id: string; name: string; email: string } | null; account: { id: string; login: string; broker: string; server: string; platform: string } | null;
  status: VerificationStatus | null; signal: string | null; reason: string | null; brokerEmail: string | null; note: string | null; at: string;
}
export type ProductType = 'INDICATOR' | 'CHART_TEMPLATE' | 'JOURNAL_TEMPLATE' | 'ALGORITHM' | 'GUIDE';
export interface PartnerProduct {
  id: string; type: ProductType; name: string; description: string | null; platform: string | null; content: string | null; url: string | null;
  fileName: string | null; fileSize: number | null; version: number; status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  reviewNote: string | null; updatedAt: string; packages: string[]; opens30d: number; users30d: number;
}
export interface ProductInput { type: ProductType; name: string; description?: string; platform?: string; content?: string; url?: string }
export interface ClientProduct {
  id: string; type: ProductType; name: string; description: string | null; platform: string | null; hasContent: boolean;
  url: string | null; fileName: string | null; fileSize: number | null; version: number; partner: string;
}
export interface ApiConfig {
  baseUrl: string; auth: 'jwt-login' | 'bearer' | 'header' | 'basic'; authPath?: string; username?: string; headerName?: string;
  clientsPath: string; listKey?: string; fields: { accountId: string; email?: string; lots?: string; deposit?: string };
}
export interface Integration {
  postbackUrl: string; postbackParams: { name: string; meaning: string }[];
  api: { config: ApiConfig | null; hasSecret: boolean; allowedHosts: string[] };
  events: { id: string; at: string; kind: string; accountId: string | null; status: string; error: string | null }[];
}
/** IB commission as the partner's brokers report it. */
export interface Earnings {
  ib: { total: number; currency: string; byMonth: { month: string; amount: number }[]; recent: { id: string; at: string; accountId: string | null; amount: number; currency: string; source: string }[] };
}
export interface CohortRow { month: string; signups: number; connected: number; verified: number; everActive: number; activeNow: number; unlockedNow: number }
export interface Reports {
  range: Range;
  daily: { date: string; clicks: number; signups: number; connected: number; verified: number; unlocked: number }[];
  cohorts: CohortRow[];
  channels: { label: string; clicks: number; signups: number; verified: number; unlocked: number }[];
  products: { id: string; name: string; type: string; opens: number; users: number }[];
  features: { key: string; label: string; users: number; views: number }[];
  marketplace: { packageSubs: { name: string; active: number; total: number }[]; strategySubs: { name: string; active: number; total: number }[] };
  earningsByMonth: { month: string; ib: number }[];
}
export interface ProgramSummary {
  todo: { applications: number; tools: number; reviews: number; flags: number; syncErrors: number; total: number };
  totals: { activePartners: number; suspendedPartners: number; clients: number; verified: number; unlocked: number };
}
export interface AdminPackageRow extends PartnerPackage { partnerId: string; partner: string }
export interface Terms { permissions: { canOfferProducts: boolean; maxPackages: number } }
export interface AdminProduct extends PartnerProduct { partner: { id: string; name: string } }
export interface IbEvent { id: string; at: string; kind: string; message: string; partnerId: string | null; userId: string | null; actorEmail: string | null }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${withViewAs(path)}`, {
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
  programSummary: () => call<ProgramSummary>(`${P}/admin/partner-program/summary`),
  viewAs: (partnerId: string) => send<{ id: string; name: string; status: string }>('POST', `${P}/admin/partners/${enc(partnerId)}/view-as`, {}),
  program: (range: RangeSel = '30D') => call<ProgramOverview>(`${P}/admin/partner-program?${rq(range)}`),
  reviews: () => call<ReviewItem[]>(`${P}/admin/partner-program/reviews`),
  decide: (id: string, action: 'approve' | 'reject', note?: string) => send<{ status: VerificationStatus }>('POST', `${P}/admin/partner-program/verifications/${enc(id)}`, { action, ...(note ? { note } : {}) }),
  events: (q: { partnerId?: string; kind?: string; limit?: number } = {}) => call<IbEvent[]>(`${P}/admin/partner-program/events?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()}`),
  settings: () => call<ProgramSettings>(`${P}/admin/partner-program/settings`),
  saveSettings: (s: ProgramSettings) => send<ProgramSettings>('PUT', `${P}/admin/partner-program/settings`, s),
  exportUrl: (type: 'clients' | 'partners', range: RangeSel = 'ALL') => `${API}${P}/admin/partner-program/export?${rq(range, { type })}`,
  recheck: (partnerId: string) => send<{ rechecked: number }>('POST', `${P}/admin/partners/${enc(partnerId)}/recheck`, {}),

  // Partner: integrations, tools, money, reports
  integration: (id: string) => call<Integration>(`${P}/partner/brokers/${enc(id)}/integration`),
  rotatePostback: (id: string) => send<Integration>('POST', `${P}/partner/brokers/${enc(id)}/postback/rotate`, {}),
  saveApi: (id: string, config: ApiConfig, secret?: string) => send<{ ok: boolean; accounts: number; error?: string }>('PUT', `${P}/partner/brokers/${enc(id)}/api`, { config, ...(secret ? { secret } : {}) }),
  uploadEarnings: (id: string, text: string, currency: string) => send<{ added: number; duplicates: number; skipped: number }>('POST', `${P}/partner/brokers/${enc(id)}/earnings`, { text, currency }),
  products: () => call<PartnerProduct[]>(`${P}/partner/products`),
  createProduct: (input: ProductInput) => send<PartnerProduct>('POST', `${P}/partner/products`, input),
  updateProduct: (id: string, input: Partial<ProductInput> & { archived?: boolean }) => send<PartnerProduct>('PATCH', `${P}/partner/products/${enc(id)}`, input),
  productFile: (id: string, fileName: string, fileType: string, data: string) => send<PartnerProduct>('POST', `${P}/partner/products/${enc(id)}/file`, { fileName, fileType, data }),
  submitProduct: (id: string) => send<PartnerProduct>('POST', `${P}/partner/products/${enc(id)}/submit`, {}),
  earnings: () => call<Earnings>(`${P}/partner/earnings`),
  reports: (range: RangeSel) => call<Reports>(`${P}/partner/reports?${rq(range)}`),
  partnerExportUrl: (range: RangeSel = 'ALL') => `${API}${withViewAs(`${P}/partner/export?${rq(range)}`)}`,
  // Trader
  clientProduct: (id: string) => call<ClientProduct & { content: string | null }>(`${P}/partner-access/products/${enc(id)}`),
  clientProductFileUrl: (id: string) => `${API}${P}/partner-access/products/${enc(id)}/file`,
  addAccount: (input: { platform: string; login: string; server: string; broker: string; brokerEmail?: string }) => send<ClientAccess>('POST', `${P}/partner-access/accounts`, input),
  removeAccount: (id: string) => send<ClientAccess>('DELETE', `${P}/partner-access/accounts/${enc(id)}`),
  // Admin
  productQueue: () => call<AdminProduct[]>(`${P}/admin/partner-program/products`),
  adminProduct: (id: string) => call<{ id: string; name: string; type: string; platform: string | null; content: string | null; url: string | null; fileName: string | null; fileSize: number | null; description: string | null; version: number; status: string }>(`${P}/admin/partner-program/products/${enc(id)}`),
  adminProductFileUrl: (id: string) => `${API}${P}/admin/partner-program/products/${enc(id)}/file`,
  reviewProduct: (id: string, action: 'approve' | 'reject', note?: string) => send<{ status: string }>('POST', `${P}/admin/partner-program/products/${enc(id)}/review`, { action, ...(note ? { note } : {}) }),
  adminPackages: () => call<AdminPackageRow[]>(`${P}/admin/partner-program/packages`),
  holdPackage: (id: string, adminHold: boolean, note?: string) => send<{ ok: boolean }>('POST', `${P}/admin/partner-program/packages/${enc(id)}/hold`, { adminHold, ...(note ? { note } : {}) }),
  terms: (partnerId: string) => call<Terms>(`${P}/admin/partners/${enc(partnerId)}/terms`),
  saveTerms: (partnerId: string, input: { permissions: Terms['permissions'] }) => send<Terms>('PUT', `${P}/admin/partners/${enc(partnerId)}/terms`, input),
  cohorts: (partnerId?: string) => call<CohortRow[]>(`${P}/admin/partner-program/cohorts${partnerId ? `?partnerId=${enc(partnerId)}` : ''}`),
};

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  INDICATOR: 'Indicator', CHART_TEMPLATE: 'Chart template', JOURNAL_TEMPLATE: 'Journal template', ALGORITHM: 'Algorithm / EA', GUIDE: 'Guide',
};

/** "2026-12-31" → "31 Dec 2026", read as a UTC calendar day. */
export const dayUtc = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Today's UTC calendar day, "YYYY-MM-DD". */
export const todayUtc = () => new Date().toISOString().slice(0, 10);

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
