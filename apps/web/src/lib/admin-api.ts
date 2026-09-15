export interface AccessGrantDto {
  id: string;
  email: string;
  note: string;
  grantedBy: string;
  grantedByEmail: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface MaintenanceModeDto {
  enabled: boolean;
  message: string | null;
  toggledBy: string | null;
  toggledAt: string | null;
}

export interface BrokerBreakdownItemDto {
  broker: string;
  count: number;
  elefin: boolean;
}

export interface SignupDayCountDto {
  date: string;
  count: number;
}

export interface AdminAuditItemDto {
  id: string;
  action: string;
  actorEmail: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
}

export interface FeatureUsageDto {
  feature: string;
  events: number;
  uniqueUsers: number;
}

export interface AdminOverviewDto {
  totalUsers: number;
  verifiedUsers: number;
  manualGrantsActive: number;
  elefinVerified: number;
  elefinPending: number;
  elefinFailed: number;
  activeTraders: number;
  inactiveTraders: number;
  brokerAccounts: number;
  elefinBrokerAccounts: number;
  usersWithBrokers: number;
  usersWithNoBrokers: number;
  signups7d: number;
  signups30d: number;
  activeSessionsNow: number;
  usersActive24h: number;
  totalTrades7d: number;
  totalTrades30d: number;
  openTrades: number;
  journalEntries: number;
  oauthUsers: number;
  emailOnlyUsers: number;
  syncHealthy: number;
  syncStale: number;
  dau: number;
  wau: number;
  mau: number;
  avgSessionMinToday: number;
  avgSessionMin7d: number;
  totalUsageHours7d: number;
  stickiness: number;
  liveUsageSessions: number;
  featureUsage7d: FeatureUsageDto[];
  funnel: {
    signups: number;
    emailVerified: number;
    elefinVerified: number;
    withBroker: number;
    activeTraders: number;
  };
  cohorts: { grantUsers: number; elefinUsers: number };
  onboarding: {
    medianHoursToBroker: number | null;
    medianHoursToElefin: number | null;
  };
  elefinVerifyMode: string;
  brokerBreakdown: BrokerBreakdownItemDto[];
  signupTrend: SignupDayCountDto[];
  recentAudit: AdminAuditItemDto[];
  recentSignups: Array<{ id: string; email: string; name: string; createdAt: string }>;
  maintenance: MaintenanceModeDto;
}

export interface AdminEngagementDto {
  range: string;
  days: Array<{ date: string; dau: number; avgSessionMin: number; totalMinutes: number }>;
}

export interface CreateAccessGrantInput {
  email: string;
  note: string;
}

export interface MaintenanceModeInput {
  enabled: boolean;
  message?: string;
}

export interface AdminBrokerDetailDto {
  broker: string;
  server: string;
  mt5Login: string;
  status: string;
  lastSyncAt: string | null;
}

export interface AdminUserRowDto {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
  source: string | null;
  elefinStatus: string;
  elefinVerifiedAt: string | null;
  activityStatus: string;
  activityCheckedAt: string | null;
  lastDeniedReason: string | null;
  tradeCount7d: number;
  totalTrades: number;
  openTrades: number;
  brokerCount: number;
  brokers: string[];
  brokerDetails: AdminBrokerDetailDto[];
  authProviders: string[];
  sessionCount: number;
  lastActiveAt: string | null;
  lastIp: string | null;
  activeToday: boolean;
  avgSessionMin7d: number;
  usageMinToday: number;
  lastProductAt: string | null;
  topFeature: string | null;
  country: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AdminUserDossierDto extends AdminUserRowDto {
  usageSessions7d: Array<{
    id: string;
    startedAt: string;
    durationSec: number;
    pagePath: string | null;
  }>;
  recentFeatures: Array<{ feature: string; count: number }>;
}

export interface AdminUsersResponse {
  users: AdminUserRowDto[];
  total: number;
  page: number;
  limit: number;
}

export type AdminUserFilter = 'all' | 'elefin' | 'grant' | 'inactive' | 'no_broker' | 'active_today';

export interface AdminGeoPointDto {
  country: string;
  city: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  userCount: number;
}

export interface AdminGeoDto {
  points: AdminGeoPointDto[];
  unlocated: number;
  totalUsers: number;
  locatedUsers: number;
}

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data as T;
}

export const adminApi = {
  overview: () => req<AdminOverviewDto>('/api/admin/overview'),
  traderOps: () =>
    req<{
      champion: 'heuristic' | 'logistic' | 'lgbm';
      sampleSize: number;
      lastTrain: string | null;
      lgbm: { trained: boolean; serving: boolean; reason: string | null; auc: number | null };
      vendors: Array<{ id: string; at: string | null; ok: boolean | null }>;
      openPaperPositions: number;
    }>('/api/admin/trader'),
  engagement: (range: '7d' | '14d' | '30d' = '14d') =>
    req<AdminEngagementDto>(`/api/admin/engagement?range=${range}`),
  geo: () => req<AdminGeoDto>('/api/admin/geo'),
  users: (page = 1, limit = 25, q?: string, filter: AdminUserFilter = 'all') => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), filter });
    if (q?.trim()) params.set('q', q.trim());
    return req<AdminUsersResponse>(`/api/admin/users?${params}`);
  },
  user: (id: string) => req<AdminUserDossierDto>(`/api/admin/users/${id}`),
  grants: () => req<AccessGrantDto[]>('/api/admin/grants'),
  createGrant: (body: CreateAccessGrantInput) =>
    req<AccessGrantDto>('/api/admin/grants', { method: 'POST', body: JSON.stringify(body) }),
  revokeGrant: (id: string) =>
    req<AccessGrantDto>(`/api/admin/grants/${id}`, { method: 'DELETE' }),
  maintenance: () => req<MaintenanceModeDto>('/api/admin/maintenance'),
  setMaintenance: (body: MaintenanceModeInput) =>
    req<MaintenanceModeDto>('/api/admin/maintenance', { method: 'POST', body: JSON.stringify(body) }),
  audit: (page = 1, limit = 50) =>
    req<{ items: AdminAuditItemDto[]; total: number; page: number; limit: number }>(
      `/api/admin/audit?page=${page}&limit=${limit}`,
    ),
  recheckUser: (id: string) =>
    req<{ ok: boolean }>(`/api/admin/users/${id}/recheck`, { method: 'POST' }),
};
