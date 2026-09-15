import { z } from 'zod';

export const accessSourceSchema = z.enum(['MANUAL_GRANT', 'ELEFIN_VERIFIED']);
export type AccessSourceDto = z.infer<typeof accessSourceSchema>;

export const elefinStatusSchema = z.enum(['PENDING', 'VERIFIED', 'FAILED']);
export type ElefinStatusDto = z.infer<typeof elefinStatusSchema>;

export const activityStatusSchema = z.enum(['UNKNOWN', 'ACTIVE', 'INACTIVE']);
export type ActivityStatusDto = z.infer<typeof activityStatusSchema>;

export const platformAccessStatusSchema = z.enum([
  'FULL_ACCESS',
  'ELEFIN_REQUIRED',
  'INACTIVE',
  'MAINTENANCE',
]);
export type PlatformAccessStatusDto = z.infer<typeof platformAccessStatusSchema>;

export const accessStatusDtoSchema = z.object({
  status: platformAccessStatusSchema,
  source: accessSourceSchema.nullable(),
  elefinStatus: elefinStatusSchema,
  activityStatus: activityStatusSchema,
  tradeCount7d: z.number().int(),
  minTradesRequired: z.number().int(),
  activityWindowDays: z.number().int(),
  isAdmin: z.boolean(),
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string().nullable(),
  }),
});
export type AccessStatusDto = z.infer<typeof accessStatusDtoSchema>;

export const verifyElefinSchema = z.object({
  email: z.string().email().optional(),
  mt5Login: z.coerce.number().int().positive().optional(),
}).refine(d => d.email || d.mt5Login, { message: 'email or mt5Login is required' });
export type VerifyElefinInput = z.infer<typeof verifyElefinSchema>;

export const createAccessGrantSchema = z.object({
  email: z.string().email(),
  note: z.string().min(1).max(2000),
});
export type CreateAccessGrantInput = z.infer<typeof createAccessGrantSchema>;

export const accessGrantDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  note: z.string(),
  grantedBy: z.string(),
  grantedByEmail: z.string(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AccessGrantDto = z.infer<typeof accessGrantDtoSchema>;

export const maintenanceModeSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});
export type MaintenanceModeInput = z.infer<typeof maintenanceModeSchema>;

export const maintenanceModeDtoSchema = z.object({
  enabled: z.boolean(),
  message: z.string().nullable(),
  toggledBy: z.string().nullable(),
  toggledAt: z.string().nullable(),
});
export type MaintenanceModeDto = z.infer<typeof maintenanceModeDtoSchema>;

export const brokerBreakdownItemSchema = z.object({
  broker: z.string(),
  count: z.number().int(),
  elefin: z.boolean(),
});
export type BrokerBreakdownItemDto = z.infer<typeof brokerBreakdownItemSchema>;

export const signupDayCountSchema = z.object({
  date: z.string(),
  count: z.number().int(),
});
export type SignupDayCountDto = z.infer<typeof signupDayCountSchema>;

export const adminAuditItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  actorEmail: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminAuditItemDto = z.infer<typeof adminAuditItemSchema>;

export const adminOverviewDtoSchema = z.object({
  totalUsers: z.number().int(),
  verifiedUsers: z.number().int(),
  manualGrantsActive: z.number().int(),
  elefinVerified: z.number().int(),
  elefinPending: z.number().int(),
  elefinFailed: z.number().int(),
  activeTraders: z.number().int(),
  inactiveTraders: z.number().int(),
  brokerAccounts: z.number().int(),
  elefinBrokerAccounts: z.number().int(),
  usersWithBrokers: z.number().int(),
  usersWithNoBrokers: z.number().int(),
  signups7d: z.number().int(),
  signups30d: z.number().int(),
  activeSessionsNow: z.number().int(),
  usersActive24h: z.number().int(),
  totalTrades7d: z.number().int(),
  totalTrades30d: z.number().int(),
  openTrades: z.number().int(),
  journalEntries: z.number().int(),
  oauthUsers: z.number().int(),
  emailOnlyUsers: z.number().int(),
  syncHealthy: z.number().int(),
  syncStale: z.number().int(),
  // Engagement (usage tracking)
  dau: z.number().int(),
  wau: z.number().int(),
  mau: z.number().int(),
  avgSessionMinToday: z.number(),
  avgSessionMin7d: z.number(),
  totalUsageHours7d: z.number(),
  stickiness: z.number(),
  liveUsageSessions: z.number().int(),
  featureUsage7d: z.array(z.object({
    feature: z.string(),
    events: z.number().int(),
    uniqueUsers: z.number().int(),
  })),
  funnel: z.object({
    signups: z.number().int(),
    emailVerified: z.number().int(),
    elefinVerified: z.number().int(),
    withBroker: z.number().int(),
    activeTraders: z.number().int(),
  }),
  cohorts: z.object({
    grantUsers: z.number().int(),
    elefinUsers: z.number().int(),
  }),
  onboarding: z.object({
    medianHoursToBroker: z.number().nullable(),
    medianHoursToElefin: z.number().nullable(),
  }),
  elefinVerifyMode: z.string(),
  brokerBreakdown: z.array(brokerBreakdownItemSchema),
  signupTrend: z.array(signupDayCountSchema),
  recentAudit: z.array(adminAuditItemSchema),
  recentSignups: z.array(z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    createdAt: z.string(),
  })),
  maintenance: maintenanceModeDtoSchema,
});
export type AdminOverviewDto = z.infer<typeof adminOverviewDtoSchema>;

export const adminEngagementDaySchema = z.object({
  date: z.string(),
  dau: z.number().int(),
  avgSessionMin: z.number(),
  totalMinutes: z.number(),
});
export type AdminEngagementDayDto = z.infer<typeof adminEngagementDaySchema>;

export const adminEngagementDtoSchema = z.object({
  range: z.string(),
  days: z.array(adminEngagementDaySchema),
});
export type AdminEngagementDto = z.infer<typeof adminEngagementDtoSchema>;

export const adminBrokerDetailSchema = z.object({
  broker: z.string(),
  server: z.string(),
  mt5Login: z.string(),
  status: z.string(),
  lastSyncAt: z.string().nullable(),
});
export type AdminBrokerDetailDto = z.infer<typeof adminBrokerDetailSchema>;

export const adminUserRowDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  source: accessSourceSchema.nullable(),
  elefinStatus: elefinStatusSchema,
  elefinVerifiedAt: z.string().nullable(),
  activityStatus: activityStatusSchema,
  activityCheckedAt: z.string().nullable(),
  lastDeniedReason: z.string().nullable(),
  tradeCount7d: z.number().int(),
  totalTrades: z.number().int(),
  openTrades: z.number().int(),
  brokerCount: z.number().int(),
  brokers: z.array(z.string()),
  brokerDetails: z.array(adminBrokerDetailSchema),
  authProviders: z.array(z.string()),
  sessionCount: z.number().int(),
  lastActiveAt: z.string().nullable(),
  lastIp: z.string().nullable(),
  activeToday: z.boolean(),
  avgSessionMin7d: z.number(),
  usageMinToday: z.number(),
  lastProductAt: z.string().nullable(),
  topFeature: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type AdminUserRowDto = z.infer<typeof adminUserRowDtoSchema>;

export const adminUserDossierDtoSchema = adminUserRowDtoSchema.extend({
  usageSessions7d: z.array(z.object({
    id: z.string(),
    startedAt: z.string(),
    durationSec: z.number().int(),
    pagePath: z.string().nullable(),
  })),
  recentFeatures: z.array(z.object({
    feature: z.string(),
    count: z.number().int(),
  })),
});
export type AdminUserDossierDto = z.infer<typeof adminUserDossierDtoSchema>;

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
  filter: z.enum(['all', 'elefin', 'grant', 'inactive', 'no_broker', 'active_today']).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const activityCheckResultSchema = z.object({
  active: z.boolean(),
  tradeCount7d: z.number().int(),
  minTradesRequired: z.number().int(),
  activityWindowDays: z.number().int(),
});
export type ActivityCheckResult = z.infer<typeof activityCheckResultSchema>;
