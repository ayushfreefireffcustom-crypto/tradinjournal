import { z } from 'zod';

// Partner programme — referral tracking only. See apps/api/openapi/partners.openapi.yaml.

export const partnerStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED']);
export type PartnerStatusDto = z.infer<typeof partnerStatusSchema>;

export const referralStatusSchema = z.enum(['SIGNED_UP', 'CONNECTED', 'ACTIVE', 'INACTIVE']);
export type ReferralStatusDto = z.infer<typeof referralStatusSchema>;

export const partnerRangeSchema = z.enum(['7D', '30D', '90D', 'ALL']);
export type PartnerRange = z.infer<typeof partnerRangeSchema>;

/** 3–20 letters, numbers, hyphens or underscores. Stored upper-case. */
export const partnerCodeInputSchema = z
  .string()
  .trim()
  .min(3, 'Codes are 3–20 characters')
  .max(20, 'Codes are 3–20 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores only')
  .transform(s => s.toUpperCase());

// ── Inputs ────────────────────────────────────────────────────────────────────

export const partnerRangeQuerySchema = z.object({
  range: partnerRangeSchema.default('30D'),
});

export const partnerClientsQuerySchema = z.object({
  status: referralStatusSchema.optional(),
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
  action: z.enum(['approve', 'decline', 'suspend', 'reinstate', 'revoke']),
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
}

export interface PartnerFunnelDto {
  range: PartnerRange;
  from: string | null;
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
  via: 'link' | 'code' | 'admin';
  signedUpAt: string;
  connectedAt: string | null;
  status: ReferralStatusDto;
  trades30d: number;
  lots30d: number;
  lastActiveAt: string | null;
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
