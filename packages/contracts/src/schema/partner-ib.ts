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
}

export interface AccessPackageDto {
  id: string;
  name: string;
  description: string | null;
  perks: PerkDto[];
  templates: { id: string; name: string }[];
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
  account: { id: string; login: string; broker: string; server: string } | null;
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
