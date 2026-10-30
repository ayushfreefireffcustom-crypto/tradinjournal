// In-memory mock of the admin API (NEXT_PUBLIC_USE_MOCKS=true), shaped like the
// real /api/admin/* responses so the command center can be built and reviewed
// without the API. Seeded so reloads look the same; dates anchor to "now".
import type {
  AccessGrantDto, AdminAuditItemDto, AdminEngagementDto, AdminGeoDto, AdminOverviewDto, AdminUserDossierDto,
  AdminUserFilter, AdminUserRowDto, MaintenanceModeDto,
} from '@/lib/admin-api';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ME = 'admin@tradelogs.com';

const FIRST = ['Aarav', 'Priya', 'Rohit', 'Ananya', 'Kabir', 'Sneha', 'Arjun', 'Meera', 'Karan', 'Riya', 'Vikram', 'Zoya', 'Imran', 'Tanvi', 'Dev', 'Sara', 'Omar', 'Neha', 'Yash', 'Divya', 'Farhan', 'Pooja', 'Manav', 'Ayesha'];
const LAST = ['Sharma', 'Patel', 'Gupta', 'Singh', 'Reddy', 'Nair', 'Iyer', 'Mehta', 'Kapoor', 'Khan', 'Rao', 'Das'];
const PLACES: [string, string, string, number, number][] = [
  ['IN', 'Mumbai', '400001', 19.076, 72.877], ['IN', 'Delhi', '110001', 28.613, 77.209], ['IN', 'Bengaluru', '560001', 12.972, 77.594],
  ['IN', 'Pune', '411001', 18.52, 73.856], ['IN', 'Hyderabad', '500001', 17.385, 78.486], ['AE', 'Dubai', '00000', 25.204, 55.27],
  ['PK', 'Lahore', '54000', 31.52, 74.358], ['GB', 'London', 'EC1A', 51.507, -0.128], ['SG', 'Singapore', '018989', 1.352, 103.82],
];
const BROKERS = ['Elefin Markets', 'XM Global', 'Exness', 'IC Markets', 'Vantage', 'FXTM'];
const FEATURES = ['dashboard', 'trades', 'journal', 'charts', 'coach', 'macro', 'calendar', 'analytics'];
const ELEFIN = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'PENDING', 'FAILED'];
const ACTIVITY = ['ACTIVE', 'ACTIVE', 'INACTIVE', 'UNKNOWN'];

const USERS: AdminUserDossierDto[] = Array.from({ length: 47 }, (_, i) => {
  const r = rng(1000 + i);
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const place = PLACES[Math.floor(r() * PLACES.length)]!;
  const brokerCount = r() < 0.2 ? 0 : r() < 0.8 ? 1 : 2;
  const brokers = Array.from({ length: brokerCount }, (_, k) => BROKERS[(i + k * 2) % BROKERS.length]!);
  const elefinStatus = ELEFIN[Math.floor(r() * ELEFIN.length)]!;
  const activityStatus = brokerCount ? ACTIVITY[Math.floor(r() * ACTIVITY.length)]! : 'UNKNOWN';
  const tradeCount7d = activityStatus === 'ACTIVE' ? 2 + Math.floor(r() * 30) : Math.floor(r() * 2);
  const activeToday = r() < 0.35;
  const lastActive = activeToday ? Math.floor(r() * 10 * HOUR) : Math.floor(r() * 20 * DAY) + DAY;
  const located = r() < 0.85;
  return {
    id: `u-${String(i + 1).padStart(3, '0')}`,
    email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
    name,
    emailVerified: r() < 0.9,
    createdAt: ago(Math.floor(r() * 120 * DAY) + HOUR),
    source: i % 5 === 0 ? 'MANUAL_GRANT' : 'ELEFIN',
    elefinStatus,
    elefinVerifiedAt: elefinStatus === 'VERIFIED' ? ago(Math.floor(r() * 60 * DAY)) : null,
    activityStatus,
    activityCheckedAt: ago(Math.floor(r() * 6 * HOUR)),
    lastDeniedReason: elefinStatus === 'FAILED' ? 'Elefin could not find a funded account for this email.' : null,
    tradeCount7d,
    totalTrades: tradeCount7d * 6 + Math.floor(r() * 80),
    openTrades: Math.floor(r() * 4),
    brokerCount,
    brokers,
    brokerDetails: brokers.map((b, k) => ({
      broker: b, server: `${b.replace(/\s+/g, '')}-MT5 ${k + 1}`, mt5Login: String(30000000 + Math.floor(r() * 9_000_000)),
      status: r() < 0.9 ? 'CONNECTED' : 'DISCONNECTED', lastSyncAt: ago(Math.floor(r() * 30 * HOUR)),
    })),
    authProviders: r() < 0.4 ? ['google'] : [],
    sessionCount: 1 + Math.floor(r() * 40),
    lastActiveAt: ago(lastActive),
    lastIp: `103.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`,
    activeToday,
    avgSessionMin7d: Math.floor(r() * 45),
    usageMinToday: activeToday ? 1 + Math.floor(r() * 70) : 0,
    lastProductAt: ago(lastActive + Math.floor(r() * HOUR)),
    topFeature: FEATURES[Math.floor(r() * FEATURES.length)]!,
    country: located ? place[0] : null,
    city: located ? place[1] : null,
    postalCode: located ? place[2] : null,
    lat: located ? place[3] + (r() - 0.5) * 0.1 : null,
    lng: located ? place[4] + (r() - 0.5) * 0.1 : null,
    usageSessions7d: Array.from({ length: Math.floor(r() * 6) }, (_, k) => ({
      id: `s-${i}-${k}`, startedAt: ago(k * 9 * HOUR + Math.floor(r() * 5 * HOUR)), durationSec: 60 + Math.floor(r() * 3000),
      pagePath: ['/dashboard', '/trades', '/journal', '/charts', '/coach'][k % 5]!,
    })),
    recentFeatures: FEATURES.slice(0, 2 + Math.floor(r() * 4)).map((f, k) => ({ feature: f, count: 30 - k * 6 })),
  };
});

const state: { grants: AccessGrantDto[]; maintenance: MaintenanceModeDto; audit: AdminAuditItemDto[] } = {
  grants: [
    { id: 'g-1', email: 'mentor.desk@example.com', note: 'Prop-firm mentor, reviewing the journal for his students', grantedBy: 'u-admin', grantedByEmail: ME, revokedAt: null, createdAt: ago(12 * DAY) },
    { id: 'g-2', email: 'qa.tester@example.com', note: 'QA access for the release checklist', grantedBy: 'u-admin', grantedByEmail: ME, revokedAt: null, createdAt: ago(5 * DAY) },
    { id: 'g-3', email: 'trial.user@example.com', note: 'Two-week trial from the webinar', grantedBy: 'u-admin', grantedByEmail: ME, revokedAt: ago(2 * DAY), createdAt: ago(30 * DAY) },
  ],
  maintenance: { enabled: false, message: null, toggledBy: ME, toggledAt: ago(9 * DAY) },
  audit: [
    ['grant.create', 'AccessGrant', 2 * HOUR], ['user.recheck', 'User', 7 * HOUR], ['maintenance.disable', 'Maintenance', 9 * DAY],
    ['grant.revoke', 'AccessGrant', 2 * DAY], ['partner.approve', 'Partner', 3 * DAY], ['grant.create', 'AccessGrant', 5 * DAY],
  ].map(([action, targetType, t], i) => ({ id: `a-${i}`, action: action as string, actorEmail: ME, targetType: targetType as string, targetId: null, createdAt: ago(t as number) })),
};

function log(action: string, targetType: string) {
  state.audit.unshift({ id: `a-${Date.now()}`, action, actorEmail: ME, targetType, targetId: null, createdAt: new Date().toISOString() });
}

function overview(): AdminOverviewDto {
  const n = USERS.length;
  const count = (f: (u: AdminUserRowDto) => boolean) => USERS.filter(f).length;
  const brokerAccounts = USERS.reduce((a, u) => a + u.brokerCount, 0);
  const byBroker = new Map<string, number>();
  USERS.forEach(u => u.brokers.forEach(b => byBroker.set(b, (byBroker.get(b) ?? 0) + 1)));
  const elefinVerified = count(u => u.elefinStatus === 'VERIFIED');
  const activeTraders = count(u => u.activityStatus === 'ACTIVE');
  const withBroker = count(u => u.brokerCount > 0);
  return {
    totalUsers: n, verifiedUsers: count(u => u.emailVerified), manualGrantsActive: state.grants.filter(g => !g.revokedAt).length,
    elefinVerified, elefinPending: count(u => u.elefinStatus === 'PENDING'), elefinFailed: count(u => u.elefinStatus === 'FAILED'),
    activeTraders, inactiveTraders: count(u => u.activityStatus === 'INACTIVE'),
    brokerAccounts, elefinBrokerAccounts: byBroker.get('Elefin Markets') ?? 0, usersWithBrokers: withBroker, usersWithNoBrokers: n - withBroker,
    signups7d: count(u => Date.now() - +new Date(u.createdAt) < 7 * DAY), signups30d: count(u => Date.now() - +new Date(u.createdAt) < 30 * DAY),
    activeSessionsNow: 9, usersActive24h: count(u => u.activeToday), totalTrades7d: USERS.reduce((a, u) => a + u.tradeCount7d, 0),
    totalTrades30d: USERS.reduce((a, u) => a + u.totalTrades, 0), openTrades: USERS.reduce((a, u) => a + u.openTrades, 0), journalEntries: 412,
    oauthUsers: count(u => u.authProviders.length > 0), emailOnlyUsers: count(u => u.authProviders.length === 0),
    syncHealthy: Math.max(0, brokerAccounts - 4), syncStale: Math.min(4, brokerAccounts),
    dau: count(u => u.activeToday), wau: 31, mau: 42, avgSessionMinToday: 18, avgSessionMin7d: 22, totalUsageHours7d: 96, stickiness: 0.39,
    liveUsageSessions: 4,
    featureUsage7d: FEATURES.map((f, i) => ({ feature: f, events: 900 - i * 97, uniqueUsers: 34 - i * 3 })),
    funnel: { signups: n, emailVerified: count(u => u.emailVerified), elefinVerified, withBroker, activeTraders },
    cohorts: { grantUsers: count(u => u.source === 'MANUAL_GRANT'), elefinUsers: count(u => u.source === 'ELEFIN') },
    onboarding: { medianHoursToBroker: 3.4, medianHoursToElefin: 11 },
    elefinVerifyMode: 'stub',
    brokerBreakdown: [...byBroker.entries()].sort((a, b) => b[1] - a[1]).map(([broker, c]) => ({ broker, count: c, elefin: broker === 'Elefin Markets' })),
    signupTrend: Array.from({ length: 14 }, (_, i) => ({ date: ago((13 - i) * DAY).slice(0, 10), count: 1 + ((i * 5) % 4) })),
    recentAudit: state.audit.slice(0, 5),
    recentSignups: [...USERS].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5).map(u => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt })),
    maintenance: state.maintenance,
  };
}

function engagement(range: string): AdminEngagementDto {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 14;
  const r = rng(77);
  return {
    range,
    days: Array.from({ length: days }, (_, i) => {
      const dau = 8 + Math.floor(r() * 14) + Math.floor(i / 3);
      const avg = 12 + Math.floor(r() * 18);
      return { date: ago((days - 1 - i) * DAY).slice(0, 10), dau, avgSessionMin: avg, totalMinutes: dau * avg };
    }),
  };
}

function geo(): AdminGeoDto {
  const pts = new Map<string, AdminGeoDto['points'][number]>();
  for (const u of USERS) {
    if (!u.country || u.lat == null || u.lng == null) continue;
    const k = `${u.country}-${u.city}`;
    const p = pts.get(k);
    if (p) p.userCount++;
    else pts.set(k, { country: u.country, city: u.city, postalCode: u.postalCode, lat: u.lat, lng: u.lng, userCount: 1 });
  }
  const located = [...pts.values()].reduce((a, p) => a + p.userCount, 0);
  return { points: [...pts.values()], unlocated: USERS.length - located, totalUsers: USERS.length, locatedUsers: located };
}

const FILTER: Record<AdminUserFilter, (u: AdminUserRowDto) => boolean> = {
  all: () => true,
  elefin: u => u.elefinStatus === 'VERIFIED',
  grant: u => u.source === 'MANUAL_GRANT',
  inactive: u => u.activityStatus === 'INACTIVE',
  no_broker: u => u.brokerCount === 0,
  active_today: u => u.activeToday,
};

type Out = { status: number; body: unknown };
const data = (d: unknown): Out => ({ status: 200, body: { data: d } });
const fail = (status: number, message: string, code = 'BAD_REQUEST'): Out => ({ status, body: { error: { code, message } } });

export function handleAdminMock(method: string, path: string[], q: URLSearchParams, body: Record<string, unknown>): Out {
  const [head, id, sub] = path;
  if (method === 'GET' && head === 'overview') return data(overview());
  if (method === 'GET' && head === 'engagement') return data(engagement(q.get('range') ?? '14d'));
  if (method === 'GET' && head === 'geo') return data(geo());
  if (method === 'GET' && head === 'trader') {
    return data({
      champion: 'logistic', sampleSize: 1284, lastTrain: ago(20 * HOUR),
      lgbm: { trained: true, serving: false, reason: 'Challenger AUC 0.61 is below the 0.63 promotion bar.', auc: 0.61 },
      vendors: [{ id: 'unusual_whales', at: ago(4 * MIN), ok: true }, { id: 'deribit', at: ago(2 * MIN), ok: true }, { id: 'benzinga', at: ago(3 * HOUR), ok: false }, { id: 'santiment', at: null, ok: null }],
      openPaperPositions: 6,
    });
  }
  if (head === 'users' && !id && method === 'GET') {
    const page = Math.max(1, Number(q.get('page') ?? 1));
    const limit = Math.max(1, Number(q.get('limit') ?? 25));
    const term = (q.get('q') ?? '').toLowerCase();
    const list = USERS.filter(FILTER[(q.get('filter') as AdminUserFilter) ?? 'all'] ?? FILTER.all)
      .filter(u => !term || u.email.includes(term) || u.name.toLowerCase().includes(term))
      .sort((a, b) => +new Date(b.lastActiveAt ?? 0) - +new Date(a.lastActiveAt ?? 0));
    const users = list.slice((page - 1) * limit, page * limit).map(({ usageSessions7d: _s, recentFeatures: _f, ...row }) => row);
    return data({ users, total: list.length, page, limit });
  }
  if (head === 'users' && id) {
    const u = USERS.find(x => x.id === id);
    if (!u) return fail(404, 'User not found', 'NOT_FOUND');
    if (method === 'POST' && sub === 'recheck') { u.activityCheckedAt = new Date().toISOString(); log('user.recheck', 'User'); return data({ ok: true }); }
    if (method === 'GET') return data(u);
  }
  if (head === 'grants') {
    if (method === 'GET') return data(state.grants);
    if (method === 'POST') {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!/\S+@\S+\.\S+/.test(email)) return fail(400, 'Enter a valid email.');
      const g: AccessGrantDto = { id: `g-${Date.now()}`, email, note: String(body.note ?? ''), grantedBy: 'u-admin', grantedByEmail: ME, revokedAt: null, createdAt: new Date().toISOString() };
      state.grants.unshift(g); log('grant.create', 'AccessGrant');
      return data(g);
    }
    if (method === 'DELETE' && id) {
      const g = state.grants.find(x => x.id === id);
      if (!g) return fail(404, 'Grant not found', 'NOT_FOUND');
      g.revokedAt = new Date().toISOString(); log('grant.revoke', 'AccessGrant');
      return data(g);
    }
  }
  if (head === 'maintenance') {
    if (method === 'POST') {
      state.maintenance = { enabled: !!body.enabled, message: (body.message as string) || null, toggledBy: ME, toggledAt: new Date().toISOString() };
      log(state.maintenance.enabled ? 'maintenance.enable' : 'maintenance.disable', 'Maintenance');
    }
    return data(state.maintenance);
  }
  if (method === 'GET' && head === 'audit') {
    const page = Math.max(1, Number(q.get('page') ?? 1));
    const limit = Math.max(1, Number(q.get('limit') ?? 50));
    return data({ items: state.audit.slice((page - 1) * limit, page * limit), total: state.audit.length, page, limit });
  }
  return fail(404, 'Not found', 'NOT_FOUND');
}
