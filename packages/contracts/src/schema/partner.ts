import { z } from 'zod';

// Partner programme — referral tracking only. See apps/api/openapi/partners.openapi.yaml.

export const partnerStatusSchema = z.enum(['PENDING', 'NEEDS_INFO', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'REVOKED']);
export type PartnerStatusDto = z.infer<typeof partnerStatusSchema>;

export const referralStatusSchema = z.enum(['SIGNED_UP', 'CONNECTED', 'ACTIVE', 'INACTIVE']);
export type ReferralStatusDto = z.infer<typeof referralStatusSchema>;

export const partnerRangeSchema = z.enum(['7D', '30D', '90D', 'ALL', 'CUSTOM']);
export type PartnerRange = z.infer<typeof partnerRangeSchema>;

/** Longest custom range, in days (inclusive). Daily series are capped to this. */
export const MAX_RANGE_DAYS = 366;
export const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Not a real date');

/**
 * A reporting window: a preset (7D / 30D / 90D / ALL), or CUSTOM with `from` and `to`
 * (UTC calendar days, both inclusive). `from` / `to` are ignored for presets.
 */
export const rangeFields = { range: partnerRangeSchema.default('30D'), from: isoDaySchema.optional(), to: isoDaySchema.optional() };
export function checkRange(v: { range: PartnerRange; from?: string; to?: string }, ctx: z.RefinementCtx): void {
  if (v.range !== 'CUSTOM') return;
  if (!v.from || !v.to) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.from ? 'to' : 'from'], message: 'A custom range needs a from and a to date' }); return; }
  if (v.from > v.to) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date is before the start date' }); return; }
  const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `A custom range can be at most ${MAX_RANGE_DAYS} days` });
}
export type PartnerRangeQuery = { range: PartnerRange; from?: string; to?: string };

/** 3–20 letters, numbers, hyphens or underscores. Stored upper-case. */
export const partnerCodeInputSchema = z
  .string()
  .trim()
  .min(3, 'Codes are 3–20 characters')
  .max(20, 'Codes are 3–20 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only')
  .transform(s => s.toUpperCase());

// ── Inputs ────────────────────────────────────────────────────────────────────

export const partnerRangeQuerySchema = z.object(rangeFields).superRefine(checkRange);

export const partnerClientsQuerySchema = z.object({
  status: referralStatusSchema.optional(),
  /** IB filter: verified under the partner's IB, not (yet), or holding a package. */
  ib: z.enum(['VERIFIED', 'UNVERIFIED', 'ELIGIBLE']).optional(),
  channel: z.string().max(40).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['recent', 'trades', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
export type PartnerClientsQuery = z.infer<typeof partnerClientsQuerySchema>;

export const partnerApplySchema = z.object({
  audience: z.string().trim().min(2).max(120),
  code: partnerCodeInputSchema.optional(),
  brokers: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  socials: z.array(z.object({ platform: z.string().trim().min(1).max(30), url: z.string().trim().url().max(300) })).max(8).default([]),
  audienceSize: z.string().trim().max(40).optional(),
  pitch: z.string().trim().max(2000).optional(),
});
export type PartnerApplyInput = z.infer<typeof partnerApplySchema>;

export const createPartnerChannelSchema = z.object({
  label: z.string().trim().min(1).max(40),
});

export const reservePartnerCodeSchema = z.object({ code: partnerCodeInputSchema });

export const referralCheckQuerySchema = z.object({ code: z.string().trim().min(1).max(40) });

export const adminCreatePartnerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: partnerCodeInputSchema.optional(),
  audience: z.string().trim().max(120).optional(),
});
export type AdminCreatePartnerInput = z.infer<typeof adminCreatePartnerSchema>;

export const adminPartnerListQuerySchema = z.object({ status: partnerStatusSchema.optional() });

export const adminPartnerStatusSchema = z.object({
  action: z.enum(['approve', 'decline', 'reject', 'request_info', 'suspend', 'reinstate', 'revoke']),
  reason: z.string().trim().max(300).optional(),
});
export type AdminPartnerStatusInput = z.infer<typeof adminPartnerStatusSchema>;

export const adminPartnerNoteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const adminAssignClientSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  reason: z.string().trim().max(300).optional(),
  force: z.boolean().optional(),
});
export type AdminAssignClientInput = z.infer<typeof adminAssignClientSchema>;

export const adminMoveClientsSchema = z.object({
  toPartnerId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
});

export const adminLookupQuerySchema = z.object({ q: z.string().trim().min(2).max(120) });

export const adminReserveCodeSchema = z.object({
  code: partnerCodeInputSchema,
  reason: z.string().trim().max(200).optional(),
});

export const partnerRefreshStatsSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface PartnerProfileDto {
  id: string;
  name: string;
  status: PartnerStatusDto;
  code: string;
  since: string;
  activeRule: { minTrades: number; windowDays: number };
  cookieDays: number;
  /** The admin's last message on the application (why it was rejected, or what to add). */
  reviewNote?: string | null;
}

export interface PartnerFunnelDto {
  range: PartnerRange;
  from: string | null;
  /** Exclusive end of the window (start of the day after `to`); null = up to now. */
  to: string | null;
  clicks: number;
  /** Clicks in the range that led to a signup — the basis for click → signup %. */
  converted: number;
  signups: number;
  connected: number;
  active: number;
}

export interface PartnerDailyPointDto {
  date: string;
  clicks: number;
  signups: number;
  clients: number;
  active: number;
}

export interface PartnerChannelDto {
  id: string;
  label: string;
  slug: string | null;
  url: string;
  clicks: number;
  /** Clicks on this channel that led to a signup. */
  converted: number;
  signups: number;
  connected: number;
  active: number;
  createdAt: string;
}

export interface PartnerCodeDto {
  id: string;
  code: string;
  isPrimary: boolean;
  url: string;
  clicks: number;
  signups: number;
  createdAt: string;
}

export interface PartnerClientDto {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  channel: string;
  via: 'link' | 'code' | 'admin' | 'late';
  signedUpAt: string;
  connectedAt: string | null;
  status: ReferralStatusDto;
  trades30d: number;
  lots30d: number;
  lastActiveAt: string | null;
  /** IB verification, access and consent-gated P&L. */
  ib?: import('./partner-ib.js').ClientIbDto;
}

export interface PartnerClientCountsDto {
  all: number;
  SIGNED_UP: number;
  CONNECTED: number;
  ACTIVE: number;
  INACTIVE: number;
}

export interface PartnerEventDto {
  id: string;
  at: string;
  kind: 'signup' | 'connected' | 'active' | 'inactive';
  client: string;
  channel: string;
}

export interface PartnerClickDto {
  id: string;
  at: string;
  channel: string;
  device: 'Mobile' | 'Desktop' | 'Tablet';
  country: string | null;
  converted: boolean;
}

export interface PartnerOverviewDto {
  partner: PartnerProfileDto;
  funnel: PartnerFunnelDto;
  daily: PartnerDailyPointDto[];
  channels: PartnerChannelDto[];
  activity: PartnerEventDto[];
  recentClients: PartnerClientDto[];
  totalClients: number;
  /** IB funnel, trading summary and broker health. */
  ib?: import('./partner-ib.js').PartnerIbOverviewDto;
}

export interface PartnerLinksDto {
  partner: PartnerProfileDto;
  baseUrl: string;
  codes: PartnerCodeDto[];
  channels: PartnerChannelDto[];
  recentClicks: PartnerClickDto[];
  /** All-time totals across every code and channel, including released/archived ones. */
  totals: { clicks: number; converted: number; signups: number };
  limits: { maxChannels: number; maxCodes: number };
}

export interface AdminPartnerRowDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  code: string | null;
  status: PartnerStatusDto;
  joinedAt: string;
  approvedAt: string | null;
  audience: string | null;
  clicks30d: number;
  /** Clicks in the last 30 days that led to a signup. */
  converted30d: number;
  signups30d: number;
  clients: number;
  connected: number;
  active: number;
}

export interface PartnerNoteDto {
  id: string;
  body: string;
  authorEmail: string;
  createdAt: string;
}

export interface AdminPartnerDetailDto extends PartnerOverviewDto {
  admin: AdminPartnerRowDto;
  codes: PartnerCodeDto[];
  notes: PartnerNoteDto[];
  application?: import('./partner-ib.js').AdminPartnerIbDto['application'];
  packages?: import('./partner-ib.js').PartnerPackageDto[];
  events?: import('./partner-ib.js').PartnerEventDto2[];
}

export interface ReservedPartnerCodeDto {
  id: string;
  code: string;
  reason: string | null;
  createdByEmail: string;
  createdAt: string;
}

export interface AdminReferrerLookupDto {
  query: string;
  user: { id: string; name: string; email: string } | null;
  referredBy: { partner: AdminPartnerRowDto; client: PartnerClientDto } | null;
  codeOwner: AdminPartnerRowDto | null;
}
