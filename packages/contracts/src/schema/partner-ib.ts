import { z } from 'zod';
import { partnerCodeInputSchema, partnerRangeSchema, type PartnerRange } from './partner.js';

// IB partner layer (Phase 1 of the IB partner doc): broker IB connections, client
// verification, partner packages and access. See reports/partner-ib-plan.md.

export const ibMethodSchema = z.enum(['LIST', 'SHEET', 'API']);
export type IbMethodDto = z.infer<typeof ibMethodSchema>;
export type IbConnectionStatusDto = 'PENDING' | 'OK' | 'ERROR';
export type VerificationStatusDto = 'PENDING' | 'VERIFIED' | 'NOT_FOUND' | 'MANUAL_REVIEW' | 'REJECTED' | 'UNSUPPORTED_BROKER';
export type PackageStatusDto = 'DRAFT' | 'LIVE' | 'ARCHIVED';
export type EntitlementStatusDto = 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'EXPIRED';

// ── Inputs ────────────────────────────────────────────────────────────────────

const socialSchema = z.object({
  platform: z.string().trim().min(1).max(30),
  url: z.string().trim().url().max(300),
});

/** Richer application (replaces the audience-only form). */
export const partnerApplicationSchema = z.object({
  audience: z.string().trim().min(2).max(120),
  code: partnerCodeInputSchema.optional(),
  brokers: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  socials: z.array(socialSchema).max(8).default([]),
  audienceSize: z.string().trim().max(40).optional(),
  pitch: z.string().trim().max(2000).optional(),
});
export type PartnerApplicationInput = z.infer<typeof partnerApplicationSchema>;

export const partnerBrokerUpsertSchema = z.object({
  broker: z.string().trim().min(1).max(30),
  ibId: z.string().trim().max(60).optional(),
  method: ibMethodSchema.default('LIST'),
  sheetUrl: z.string().trim().url().max(500).optional(),
  apiKey: z.string().trim().min(8).max(500).optional(),
  /** Only for broker "other": text the MT5 server name contains, e.g. "AcmeFX-Live". */
  serverMatch: z.string().trim().min(3).max(60).optional(),
});
export type PartnerBrokerUpsertInput = z.infer<typeof partnerBrokerUpsertSchema>;

export const ibListUploadSchema = z.object({
  /** CSV / TSV / pasted rows: account id and (optionally) email per line. */
  text: z.string().max(2_000_000),
  /** replace = the list is the full current list; merge = add to it. */
  mode: z.enum(['replace', 'merge']).default('replace'),
});
export type IbListUploadInput = z.infer<typeof ibListUploadSchema>;

export const partnerPackageSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(400).optional(),
  perks: z.array(z.string().min(1).max(40)).max(20).default([]),
  templateIds: z.array(z.string().min(1).max(40)).max(20).default([]),
  brokers: z.array(z.string().min(1).max(30)).max(10).default([]),
  requireActive: z.boolean().default(true),
  accessDays: z.number().int().min(1).max(3650).nullable().optional(),
  productIds: z.array(z.string().min(1).max(40)).max(30).default([]),
  status: z.enum(['DRAFT', 'LIVE', 'ARCHIVED']).default('DRAFT'),
});
export type PartnerPackageInput = z.infer<typeof partnerPackageSchema>;
export const partnerPackagePatchSchema = partnerPackageSchema.partial();

export const accessJoinSchema = z.object({ code: partnerCodeInputSchema });
export const accessVerifySchema = z.object({
  brokerAccountId: z.string().min(1).max(40),
  brokerEmail: z.string().trim().toLowerCase().email().optional(),
});
export const accessReviewSchema = z.object({
  brokerAccountId: z.string().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});
export const accessConsentSchema = z.object({ share: z.boolean() });

export const programSettingsSchema = z.object({
  activeMinTrades: z.number().int().min(0).max(1000),
  activeWindowDays: z.number().int().min(1).max(365),
  activeMinLots: z.number().min(0).max(100_000),
  graceDays: z.number().int().min(0).max(90),
  partnerGraceDays: z.number().int().min(0).max(90),
  lockedPerks: z.array(z.string().min(1).max(40)).max(40),
  /** Hosts partners may point the broker REST adapter at (admin-controlled, stops SSRF). */
  ibApiHosts: z.array(z.string().trim().toLowerCase().min(3).max(120)).max(30).default([]),
});
export type ProgramSettingsDto = z.infer<typeof programSettingsSchema>;

export const adminVerificationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

export const programRangeQuerySchema = z.object({ range: partnerRangeSchema.default('30D') });
export const programEventsQuerySchema = z.object({
  partnerId: z.string().max(40).optional(),
  kind: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export const programExportQuerySchema = z.object({ type: z.enum(['clients', 'partners']).default('clients') });

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface BrokerCatalogEntryDto {
  key: string;
  label: string;
  /** What the referred-accounts list should contain, in the broker's own words. */
  listHint: string;
  /** Methods this broker supports today. API appears once an adapter exists. */
  methods: IbMethodDto[];
}

export interface PerkDto {
  key: string;
  label: string;
  description: string;
  href: string;
}

export interface PartnerBrokerDto {
  id: string;
  broker: string;
  label: string;
  ibId: string | null;
  method: IbMethodDto;
  sheetUrl: string | null;
  hasApiKey: boolean;
  serverMatch: string | null;
  status: IbConnectionStatusDto;
  lastSyncAt: string | null;
  lastError: string | null;
  accountCount: number;
  /** Referred clients with an account at this broker, and how many of them matched. */
  clientAccounts: number;
  verified: number;
}

export interface IbUploadResultDto {
  broker: PartnerBrokerDto;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  /** Verifications re-run because the list changed. */
  rechecked: number;
}

export interface PartnerPackageDto {
  id: string;
  name: string;
  description: string | null;
  perks: string[];
  templateIds: string[];
  productIds: string[];
  adminHold: boolean;
  adminNote: string | null;
  brokers: string[];
  requireActive: boolean;
  accessDays: number | null;
  status: PackageStatusDto;
  holders: number;
  inGrace: number;
  createdAt: string;
}

export interface PartnerTemplateOptionDto {
  id: string;
  name: string;
  status: string;
  partnerOnly: boolean;
}

export interface PartnerPackagesDto {
  packages: PartnerPackageDto[];
  perks: PerkDto[];
  templates: PartnerTemplateOptionDto[];
  brokers: { key: string; label: string }[];
  lockedPerks: string[];
  products: { id: string; name: string; type: string; status: string }[];
  permissions: PartnerPermissionsDto;
}

export interface TradingSummaryDto {
  connected: number;
  /** Connected clients with at least one closed trade in the last 30 days. */
  trading: number;
  trades30d: number;
  lots30d: number;
  pnl30d: number;
  profitable: number;
  losing: number;
}

export interface IbFunnelDto {
  range: PartnerRange;
  clicks: number;
  signups: number;
  connected: number;
  verified: number;
  active: number;
  eligible: number;
}

export interface PartnerIbOverviewDto {
  funnel: IbFunnelDto;
  trading: TradingSummaryDto;
  brokers: PartnerBrokerDto[];
  packages: { live: number; holders: number };
  needsAttention: { notFound: number; inReview: number; unsupported: number; syncErrors: number };
}

export interface ClientIbDto {
  referralId: string;
  verification: VerificationStatusDto | 'NO_ACCOUNT';
  verifiedBrokers: string[];
  eligible: boolean;
  packages: { name: string; status: EntitlementStatusDto }[];
  consent: boolean;
  /** Only when the client consented (or for admins). */
  pnl30d: number | null;
  pnlTotal: number | null;
}

export interface AccessAccountDto {
  id: string;
  label: string;
  broker: string;
  brokerKey: string | null;
  status: VerificationStatusDto;
  reason: string | null;
  brokerEmail: string | null;
  checkedAt: string | null;
  reviewRequested: boolean;
  canRetry: boolean;
  /** MT5 synced through TRADElogs, or an account added for checking only (MT4 and others). */
  kind: 'mt5' | 'external';
  platform: string;
}

export interface AccessPackageDto {
  id: string;
  name: string;
  description: string | null;
  perks: PerkDto[];
  templates: { id: string; name: string }[];
  products: { id: string; name: string; type: string }[];
  status: EntitlementStatusDto | 'LOCKED';
  reasons: string[];
  grantedAt: string | null;
  expiresAt: string | null;
  graceUntil: string | null;
}

export interface ClientAccessDto {
  partner: { name: string; code: string; status: 'ACTIVE' | 'PAUSED' } | null;
  /** True when the user has no partner yet and can enter a code. */
  canJoin: boolean;
  accounts: AccessAccountDto[];
  activity: { active: boolean; trades: number; lots: number; rule: { minTrades: number; windowDays: number; minLots: number }; checkedAt: string | null };
  packages: AccessPackageDto[];
  consent: { share: boolean; at: string | null };
  /** Perks the admin has locked to package holders, and the ones this user may use. */
  lockedPerks: string[];
  myPerks: string[];
  /** Partner tools the client can open now. */
  products: ClientProductDto[];
}

export interface ProgramPartnerRowDto {
  id: string;
  name: string;
  email: string;
  code: string | null;
  status: string;
  clients: number;
  connected: number;
  verified: number;
  active: number;
  eligible: number;
  trades30d: number;
  lots30d: number;
  pnl30d: number;
  profitable: number;
  losing: number;
  brokerErrors: number;
}

export interface ProgramOverviewDto {
  range: PartnerRange;
  partners: { pending: number; needsInfo: number; active: number; suspended: number; rejected: number; revoked: number };
  funnel: IbFunnelDto;
  trading: TradingSummaryDto;
  rows: ProgramPartnerRowDto[];
  attention: { reviews: number; flags: number; syncErrors: number };
}

export interface ReviewItemDto {
  id: string;
  kind: 'verification' | 'flag';
  /** For flags: what was spotted. */
  flag: string | null;
  partner: { id: string; name: string };
  client: { id: string; name: string; email: string } | null;
  account: { id: string; login: string; broker: string; server: string; platform: string } | null;
  status: VerificationStatusDto | null;
  signal: string | null;
  reason: string | null;
  brokerEmail: string | null;
  note: string | null;
  at: string;
}

export interface PartnerEventDto2 {
  id: string;
  at: string;
  kind: string;
  message: string;
  partnerId: string | null;
  userId: string | null;
  actorEmail: string | null;
}

export interface AdminPartnerIbDto {
  application: { brokers: string[]; socials: { platform: string; url: string }[]; audienceSize: string | null; pitch: string | null; reviewNote: string | null; reviewedAt: string | null };
  ib: PartnerIbOverviewDto;
  packages: PartnerPackageDto[];
  events: PartnerEventDto2[];
}

// ── Phase 2: broker adapters, partner tools, reports ──

export const ibApiConfigSchema = z.object({
  baseUrl: z.string().trim().url().max(300),
  /** jwt-login: POST {login, password} to authPath, use the returned token (Exness style). */
  auth: z.enum(['jwt-login', 'bearer', 'header', 'basic']),
  authPath: z.string().trim().max(200).optional(),
  username: z.string().trim().max(200).optional(),
  headerName: z.string().trim().max(60).optional(),
  /** Path of the endpoint that lists referred clients, from the broker's API schema. */
  clientsPath: z.string().trim().min(1).max(300),
  /** Dot path to the array in the response, e.g. "data" or "results". Empty = the response itself. */
  listKey: z.string().trim().max(60).optional(),
  fields: z.object({
    accountId: z.string().trim().min(1).max(60),
    email: z.string().trim().max(60).optional(),
    lots: z.string().trim().max(60).optional(),
    deposit: z.string().trim().max(60).optional(),
  }),
});
export type IbApiConfig = z.infer<typeof ibApiConfigSchema>;

export const ibApiConnectSchema = z.object({
  config: ibApiConfigSchema,
  /** Password / API key. Stored encrypted, never returned. Omit to keep the saved one. */
  secret: z.string().min(1).max(500).optional(),
});

export const earningsUploadSchema = z.object({ text: z.string().max(2_000_000), currency: z.string().trim().length(3).toUpperCase().default('USD') });

export const externalAccountSchema = z.object({
  platform: z.enum(['MT4', 'MT5', 'CTRADER', 'OTHER']),
  login: z.string().trim().regex(/^[A-Za-z0-9_-]{3,30}$/, 'Account number: 3–30 letters or digits'),
  server: z.string().trim().min(2).max(80),
  broker: z.string().trim().min(2).max(60),
  brokerEmail: z.string().trim().toLowerCase().email().optional(),
});

export const PRODUCT_TYPES = ['INDICATOR', 'CHART_TEMPLATE', 'JOURNAL_TEMPLATE', 'ALGORITHM', 'GUIDE'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export type ProductStatusDto = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

export const partnerProductSchema = z.object({
  type: z.enum(PRODUCT_TYPES),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
  platform: z.enum(['TradingView', 'MT4', 'MT5', 'TRADElogs', 'Other']).optional(),
  content: z.string().max(200_000).optional(),
  url: z.string().trim().url().max(500).optional().or(z.literal('')),
});
export const partnerProductPatchSchema = partnerProductSchema.partial().extend({ archived: z.boolean().optional() });
export const productFileSchema = z.object({
  fileName: z.string().trim().min(1).max(120).regex(/^[^/\\]+$/),
  fileType: z.string().trim().max(100).optional(),
  /** Base64, at most 2 MB once decoded. */
  data: z.string().min(4).max(2_800_000),
});
export const productReviewSchema = z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });

export const adminPackageSchema = z.object({ adminHold: z.boolean(), note: z.string().trim().max(300).optional() });
export const adminPartnerTermsSchema = z.object({
  permissions: z.object({
    canOfferProducts: z.boolean(),
    maxPackages: z.number().int().min(0).max(50),
  }),
});

export interface PartnerPermissionsDto { canOfferProducts: boolean; maxPackages: number }

export interface BrokerEventDto { id: string; at: string; kind: string; accountId: string | null; status: string; error: string | null }
export interface BrokerIntegrationDto {
  postbackUrl: string;
  /** Parameter names the postback understands, for the broker's setup form. */
  postbackParams: { name: string; meaning: string }[];
  api: { config: IbApiConfig | null; hasSecret: boolean; allowedHosts: string[] };
  events: BrokerEventDto[];
}

export interface PartnerProductDto {
  id: string; type: ProductType; name: string; description: string | null; platform: string | null;
  content: string | null; url: string | null; fileName: string | null; fileSize: number | null;
  version: number; status: ProductStatusDto; reviewNote: string | null; updatedAt: string;
  /** Packages that include it, and how many clients opened it in the last 30 days. */
  packages: string[]; opens30d: number; users30d: number;
}
export interface ClientProductDto {
  id: string; type: ProductType; name: string; description: string | null; platform: string | null;
  hasContent: boolean; url: string | null; fileName: string | null; fileSize: number | null; version: number; partner: string;
}
export interface ClientProductDetailDto extends ClientProductDto { content: string | null }

/** IB commission the partner's brokers report (postback, API or uploaded report). TRADElogs takes no payments. */
export interface PartnerEarningsDto {
  ib: { total: number; currency: string; byMonth: { month: string; amount: number }[]; recent: { id: string; at: string; accountId: string | null; amount: number; currency: string; source: string }[] };
}

export interface CohortRowDto { month: string; signups: number; connected: number; verified: number; everActive: number; activeNow: number; unlockedNow: number }
export interface PartnerReportsDto {
  range: PartnerRange;
  daily: { date: string; clicks: number; signups: number; connected: number; verified: number; unlocked: number }[];
  cohorts: CohortRowDto[];
  channels: { label: string; clicks: number; signups: number; verified: number; unlocked: number }[];
  products: { id: string; name: string; type: string; opens: number; users: number }[];
  features: { key: string; label: string; users: number; views: number }[];
  /** Package holders (from entitlements) and strategy subscribers. */
  marketplace: { packageSubs: { name: string; active: number; total: number }[]; strategySubs: { name: string; active: number; total: number }[] };
  earningsByMonth: { month: string; ib: number }[];
}

export interface AdminPackageRowDto extends PartnerPackageDto { partnerId: string; partner: string; adminHold: boolean; adminNote: string | null }
