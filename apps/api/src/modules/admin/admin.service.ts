import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import type {
  AccessGrantDto,
  AdminEngagementDto,
  AdminOverviewDto,
  AdminUserDossierDto,
  AdminUserRowDto,
  CreateAccessGrantInput,
  MaintenanceModeDto,
} from '@tradinjournal/contracts';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { logAdminAction } from './admin-audit.service.js';
import { getMaintenanceMode, setMaintenanceMode } from './settings.service.js';
import { recheckUserAccess, syncManualGrant } from './access.service.js';

function grantToDto(row: {
  id: string;
  email: string;
  note: string;
  grantedBy: string;
  grantedByEmail: string;
  revokedAt: Date | null;
  createdAt: Date;
}): AccessGrantDto {
  return {
    id: row.id,
    email: row.email,
    note: row.note,
    grantedBy: row.grantedBy,
    grantedByEmail: row.grantedByEmail,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isElefinBroker(broker: string, server: string): boolean {
  const hay = `${broker} ${server}`.toLowerCase();
  return hay.includes('elefin');
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

async function distinctUsageUsers(since: Date): Promise<number> {
  const rows = await prisma.usageSession.groupBy({
    by: ['userId'],
    where: { lastSeenAt: { gte: since } },
  });
  return rows.length;
}

export async function getAdminOverview(): Promise<AdminOverviewDto> {
  const now = new Date();
  const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = startOfUtcDay(now);
  const liveCutoff = new Date(now.getTime() - 2 * 60 * 1000);

  const [
    totalUsers,
    verifiedUsers,
    manualGrantsActive,
    elefinVerified,
    elefinPending,
    elefinFailed,
    activeTraders,
    inactiveTraders,
    brokerAccounts,
    elefinBrokerAccounts,
    usersWithBrokersGroup,
    signups7d,
    signups30d,
    activeSessionsNow,
    usersActive24hGroup,
    totalTrades7d,
    totalTrades30d,
    openTrades,
    journalEntries,
    oauthUsersGroup,
    syncHealthy,
    brokerRows,
    recentUsers,
    recentAuditRows,
    maintenance,
    grantCohort,
    elefinCohort,
    recentSignupUsers,
    usageSessions7d,
    usageSessionsToday,
    liveUsageSessions,
    featureEvents7d,
    firstBrokers,
    elefinVerifiedRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.accessGrant.count({ where: { revokedAt: null } }),
    prisma.userAccess.count({ where: { elefinStatus: 'VERIFIED' } }),
    prisma.userAccess.count({ where: { elefinStatus: 'PENDING' } }),
    prisma.userAccess.count({ where: { elefinStatus: 'FAILED' } }),
    prisma.userAccess.count({ where: { activityStatus: 'ACTIVE' } }),
    prisma.userAccess.count({ where: { activityStatus: 'INACTIVE' } }),
    prisma.brokerAccount.count(),
    prisma.brokerAccount.count({
      where: {
        OR: [
          { broker: { contains: 'elefin', mode: 'insensitive' } },
          { server: { contains: 'elefin', mode: 'insensitive' } },
        ],
      },
    }),
    prisma.brokerAccount.groupBy({ by: ['userId'] }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.session.groupBy({ by: ['userId'], where: { updatedAt: { gte: d24 } } }),
    prisma.trade.count({ where: { status: 'CLOSED', closeTime: { gte: d7 } } }),
    prisma.trade.count({ where: { status: 'CLOSED', closeTime: { gte: d30 } } }),
    prisma.trade.count({ where: { status: 'OPEN' } }),
    prisma.journalEntry.count(),
    prisma.account.groupBy({ by: ['userId'], where: { providerId: 'google' } }),
    prisma.brokerAccount.count({ where: { lastSyncAt: { gte: d24 } } }),
    prisma.brokerAccount.findMany({ select: { broker: true, server: true } }),
    prisma.user.findMany({ where: { createdAt: { gte: d7 } }, select: { createdAt: true } }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, action: true, actorEmail: true, targetType: true, targetId: true, createdAt: true },
    }),
    getMaintenanceMode(),
    prisma.userAccess.count({ where: { source: 'MANUAL_GRANT' } }),
    prisma.userAccess.count({ where: { source: 'ELEFIN_VERIFIED' } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, email: true, name: true, createdAt: true },
    }),
    prisma.usageSession.findMany({
      where: { startedAt: { gte: d7 } },
      select: { userId: true, durationSec: true, startedAt: true },
    }),
    prisma.usageSession.findMany({
      where: { startedAt: { gte: todayStart } },
      select: { userId: true, durationSec: true },
    }),
    prisma.usageSession.count({
      where: { endedAt: null, lastSeenAt: { gte: liveCutoff } },
    }),
    prisma.usageEvent.findMany({
      where: { createdAt: { gte: d7 }, feature: { not: null } },
      select: { feature: true, userId: true },
    }),
    prisma.brokerAccount.findMany({
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      distinct: ['userId'],
    }),
    prisma.userAccess.findMany({
      where: { elefinVerifiedAt: { not: null } },
      select: { userId: true, elefinVerifiedAt: true },
    }),
  ]);

  const usersWithBrokers = usersWithBrokersGroup.length;
  const oauthUsers = oauthUsersGroup.length;
  const emailOnlyUsers = Math.max(0, totalUsers - oauthUsers);

  const brokerMap = new Map<string, { count: number; elefin: boolean }>();
  for (const row of brokerRows) {
    const key = row.broker.trim() || 'Unknown';
    const prev = brokerMap.get(key) ?? { count: 0, elefin: false };
    brokerMap.set(key, {
      count: prev.count + 1,
      elefin: prev.elefin || isElefinBroker(row.broker, row.server),
    });
  }
  const brokerBreakdown = [...brokerMap.entries()]
    .map(([broker, v]) => ({ broker, count: v.count, elefin: v.elefin }))
    .sort((a, b) => b.count - a.count);

  const signupTrend = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(todayStart);
    day.setUTCDate(day.getUTCDate() - (6 - i));
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const count = recentUsers.filter(u => u.createdAt >= day && u.createdAt < next).length;
    return { date: day.toISOString().slice(0, 10), count };
  });

  const [dau, wau, mau] = await Promise.all([
    distinctUsageUsers(todayStart),
    distinctUsageUsers(d7),
    distinctUsageUsers(d30),
  ]);

  const totalSec7d = usageSessions7d.reduce((s, r) => s + r.durationSec, 0);
  const usersWithUsage7d = new Set(usageSessions7d.map(r => r.userId)).size || 1;
  const avgSessionMin7d = round1(totalSec7d / 60 / usersWithUsage7d);
  const totalUsageHours7d = round1(totalSec7d / 3600);

  const totalSecToday = usageSessionsToday.reduce((s, r) => s + r.durationSec, 0);
  const usersToday = new Set(usageSessionsToday.map(r => r.userId)).size || 1;
  const avgSessionMinToday = round1(totalSecToday / 60 / usersToday);
  const stickiness = wau > 0 ? round1(dau / wau) : 0;

  const featureMap = new Map<string, { events: number; users: Set<string> }>();
  for (const e of featureEvents7d) {
    if (!e.feature) continue;
    const cur = featureMap.get(e.feature) ?? { events: 0, users: new Set() };
    cur.events += 1;
    cur.users.add(e.userId);
    featureMap.set(e.feature, cur);
  }
  const featureUsage7d = [...featureMap.entries()]
    .map(([feature, v]) => ({ feature, events: v.events, uniqueUsers: v.users.size }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 10);

  // Onboarding medians
  const userCreated = await prisma.user.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...firstBrokers.map(b => b.userId),
            ...elefinVerifiedRows.map(e => e.userId),
          ]),
        ],
      },
    },
    select: { id: true, createdAt: true },
  });
  const createdMap = new Map(userCreated.map(u => [u.id, u.createdAt]));
  const hoursToBroker: number[] = [];
  for (const b of firstBrokers) {
    const c = createdMap.get(b.userId);
    if (!c) continue;
    hoursToBroker.push((b.createdAt.getTime() - c.getTime()) / 3600000);
  }
  const hoursToElefin: number[] = [];
  for (const e of elefinVerifiedRows) {
    const c = createdMap.get(e.userId);
    if (!c || !e.elefinVerifiedAt) continue;
    hoursToElefin.push((e.elefinVerifiedAt.getTime() - c.getTime()) / 3600000);
  }

  return {
    totalUsers,
    verifiedUsers,
    manualGrantsActive,
    elefinVerified,
    elefinPending,
    elefinFailed,
    activeTraders,
    inactiveTraders,
    brokerAccounts,
    elefinBrokerAccounts,
    usersWithBrokers,
    usersWithNoBrokers: totalUsers - usersWithBrokers,
    signups7d,
    signups30d,
    activeSessionsNow,
    usersActive24h: usersActive24hGroup.length,
    totalTrades7d,
    totalTrades30d,
    openTrades,
    journalEntries,
    oauthUsers,
    emailOnlyUsers,
    syncHealthy,
    syncStale: Math.max(0, brokerAccounts - syncHealthy),
    dau,
    wau,
    mau,
    avgSessionMinToday,
    avgSessionMin7d,
    totalUsageHours7d,
    stickiness,
    liveUsageSessions,
    featureUsage7d,
    funnel: {
      signups: totalUsers,
      emailVerified: verifiedUsers,
      elefinVerified,
      withBroker: usersWithBrokers,
      activeTraders,
    },
    cohorts: {
      grantUsers: grantCohort,
      elefinUsers: elefinCohort,
    },
    onboarding: {
      medianHoursToBroker: median(hoursToBroker.map(h => round1(h))),
      medianHoursToElefin: median(hoursToElefin.map(h => round1(h))),
    },
    elefinVerifyMode: env.ELEFIN_VERIFY_MODE,
    brokerBreakdown,
    signupTrend,
    recentAudit: recentAuditRows.map(r => ({
      id: r.id,
      action: r.action,
      actorEmail: r.actorEmail,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
    })),
    recentSignups: recentSignupUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
    })),
    maintenance,
  };
}

export async function getAdminEngagement(range: '7d' | '14d' | '30d' = '14d'): Promise<AdminEngagementDto> {
  const daysCount = range === '30d' ? 30 : range === '7d' ? 7 : 14;
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const since = new Date(todayStart);
  since.setUTCDate(since.getUTCDate() - (daysCount - 1));

  const sessions = await prisma.usageSession.findMany({
    where: { startedAt: { gte: since } },
    select: { userId: true, durationSec: true, startedAt: true },
  });

  const days = Array.from({ length: daysCount }, (_, i) => {
    const day = new Date(since);
    day.setUTCDate(since.getUTCDate() + i);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const daySessions = sessions.filter(s => s.startedAt >= day && s.startedAt < next);
    const users = new Set(daySessions.map(s => s.userId));
    const totalSec = daySessions.reduce((a, s) => a + s.durationSec, 0);
    const avgSessionMin = users.size ? round1(totalSec / 60 / users.size) : 0;
    return {
      date: day.toISOString().slice(0, 10),
      dau: users.size,
      avgSessionMin,
      totalMinutes: round1(totalSec / 60),
    };
  });

  return { range: `${daysCount}d`, days };
}

export async function listGrants(): Promise<AccessGrantDto[]> {
  const rows = await prisma.accessGrant.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map(grantToDto);
}

export async function createGrant(
  input: CreateAccessGrantInput,
  actor: { id: string; email: string },
): Promise<AccessGrantDto> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.accessGrant.findUnique({ where: { email } });
  if (existing && !existing.revokedAt) {
    throw new ConflictError('An active grant already exists for this email');
  }

  const row = existing
    ? await prisma.accessGrant.update({
        where: { email },
        data: {
          note: input.note.trim(),
          grantedBy: actor.id,
          grantedByEmail: actor.email,
          revokedAt: null,
        },
      })
    : await prisma.accessGrant.create({
        data: {
          email,
          note: input.note.trim(),
          grantedBy: actor.id,
          grantedByEmail: actor.email,
        },
      });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) await syncManualGrant(user.id, email);

  await logAdminAction({
    action: 'grant.created',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'access_grant',
    targetId: row.id,
    details: { email, note: input.note },
  });

  return grantToDto(row);
}

export async function revokeGrant(
  id: string,
  actor: { id: string; email: string },
): Promise<AccessGrantDto> {
  const row = await prisma.accessGrant.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Grant not found');
  if (row.revokedAt) return grantToDto(row);

  const updated = await prisma.accessGrant.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { email: row.email }, select: { id: true } });
  if (user) {
    // Only clear MANUAL_GRANT rows — do not wipe a real Elefin verification.
    await prisma.userAccess.updateMany({
      where: { userId: user.id, source: 'MANUAL_GRANT' },
      data: {
        source: null,
        lastDeniedReason: 'Manual grant revoked',
      },
    });
  }

  await logAdminAction({
    action: 'grant.revoked',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'access_grant',
    targetId: id,
    details: { email: row.email },
  });

  return grantToDto(updated);
}

export async function toggleMaintenance(
  enabled: boolean,
  actor: { id: string; email: string },
  message?: string,
): Promise<MaintenanceModeDto> {
  const result = await setMaintenanceMode(enabled, actor.email, message);
  await logAdminAction({
    action: enabled ? 'maintenance.enabled' : 'maintenance.disabled',
    actorId: actor.id,
    actorEmail: actor.email,
    details: { enabled, message: result.message },
  });
  return result;
}

type UserFilter = 'all' | 'elefin' | 'grant' | 'inactive' | 'no_broker' | 'active_today';

async function enrichUsers(users: Array<{
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  country: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  accounts: { providerId: string }[];
  brokerAccounts: {
    id: string;
    broker: string;
    server: string;
    mt5Login: bigint;
    status: string;
    lastSyncAt: Date | null;
  }[];
  sessions: { updatedAt: Date; ipAddress: string | null }[];
  _count: { sessions: number };
}>): Promise<AdminUserRowDto[]> {
  const userIds = users.map(u => u.id);
  const brokerIds = users.flatMap(u => u.brokerAccounts.map(b => b.id));
  const todayStart = startOfUtcDay(new Date());
  const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [accessRows, tradeTotals, openTradeCounts, closed7dCounts, usageSessions, featureEvents] =
    await Promise.all([
      prisma.userAccess.findMany({ where: { userId: { in: userIds } } }),
      brokerIds.length
        ? prisma.trade.groupBy({
            by: ['brokerAccountId'],
            where: { brokerAccountId: { in: brokerIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      brokerIds.length
        ? prisma.trade.groupBy({
            by: ['brokerAccountId'],
            where: { brokerAccountId: { in: brokerIds }, status: 'OPEN' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      brokerIds.length
        ? prisma.trade.groupBy({
            by: ['brokerAccountId'],
            where: {
              brokerAccountId: { in: brokerIds },
              status: 'CLOSED',
              closeTime: { gte: d7 },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      prisma.usageSession.findMany({
        where: { userId: { in: userIds }, startedAt: { gte: d7 } },
        select: { userId: true, durationSec: true, startedAt: true, lastSeenAt: true },
      }),
      prisma.usageEvent.findMany({
        where: { userId: { in: userIds }, createdAt: { gte: d7 }, feature: { not: null } },
        select: { userId: true, feature: true },
      }),
    ]);

  const accessByUser = new Map(accessRows.map(r => [r.userId, r]));
  const brokerToUser = new Map<string, string>();
  for (const u of users) {
    for (const b of u.brokerAccounts) brokerToUser.set(b.id, u.id);
  }

  function sumForUser(
    groups: { brokerAccountId: string; _count: { _all: number } }[],
  ): Map<string, number> {
    const out = new Map<string, number>();
    for (const g of groups) {
      const uid = brokerToUser.get(g.brokerAccountId);
      if (!uid) continue;
      out.set(uid, (out.get(uid) ?? 0) + g._count._all);
    }
    return out;
  }

  const totalTradesByUser = sumForUser(tradeTotals);
  const openTradesByUser = sumForUser(openTradeCounts);
  const closed7dByUser = sumForUser(closed7dCounts);

  const usageByUser = new Map<string, { sec7d: number; secToday: number; last: Date | null }>();
  for (const s of usageSessions) {
    const cur = usageByUser.get(s.userId) ?? { sec7d: 0, secToday: 0, last: null };
    cur.sec7d += s.durationSec;
    if (s.startedAt >= todayStart) cur.secToday += s.durationSec;
    if (!cur.last || s.lastSeenAt > cur.last) cur.last = s.lastSeenAt;
    usageByUser.set(s.userId, cur);
  }

  const topFeatureByUser = new Map<string, string>();
  const featureCount = new Map<string, Map<string, number>>();
  for (const e of featureEvents) {
    if (!e.feature) continue;
    const m = featureCount.get(e.userId) ?? new Map();
    m.set(e.feature, (m.get(e.feature) ?? 0) + 1);
    featureCount.set(e.userId, m);
  }
  for (const [uid, m] of featureCount) {
    let best: string | null = null;
    let bestN = 0;
    for (const [f, n] of m) {
      if (n > bestN) { best = f; bestN = n; }
    }
    if (best) topFeatureByUser.set(uid, best);
  }

  return users.map(u => {
    const access = accessByUser.get(u.id);
    const lastSession = u.sessions[0];
    const lastActiveAt = lastSession?.updatedAt ?? null;
    const usage = usageByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
      source: access?.source ?? null,
      elefinStatus: access?.elefinStatus ?? 'PENDING',
      elefinVerifiedAt: access?.elefinVerifiedAt?.toISOString() ?? null,
      activityStatus: access?.activityStatus ?? 'UNKNOWN',
      activityCheckedAt: access?.activityCheckedAt?.toISOString() ?? null,
      lastDeniedReason: access?.lastDeniedReason ?? null,
      tradeCount7d: closed7dByUser.get(u.id) ?? access?.tradeCount7d ?? 0,
      totalTrades: totalTradesByUser.get(u.id) ?? 0,
      openTrades: openTradesByUser.get(u.id) ?? 0,
      brokerCount: u.brokerAccounts.length,
      brokers: u.brokerAccounts.map(b => b.broker),
      brokerDetails: u.brokerAccounts.map(b => ({
        broker: b.broker,
        server: b.server,
        mt5Login: b.mt5Login.toString(),
        status: b.status,
        lastSyncAt: b.lastSyncAt?.toISOString() ?? null,
      })),
      authProviders: [
        ...new Set(u.accounts.map(a => (a.providerId === 'credential' ? 'email' : a.providerId))),
      ],
      sessionCount: u._count.sessions,
      lastActiveAt: lastActiveAt?.toISOString() ?? null,
      lastIp: lastSession?.ipAddress ?? null,
      activeToday: lastActiveAt ? lastActiveAt >= todayStart : false,
      avgSessionMin7d: round1((usage?.sec7d ?? 0) / 60),
      usageMinToday: round1((usage?.secToday ?? 0) / 60),
      lastProductAt: usage?.last?.toISOString() ?? null,
      topFeature: topFeatureByUser.get(u.id) ?? null,
      country: u.country ?? null,
      city: u.city ?? null,
      postalCode: u.postalCode ?? null,
      lat: u.lat ?? null,
      lng: u.lng ?? null,
    };
  });
}

export async function listAdminUsers(
  page: number,
  limit: number,
  q?: string,
  filter: UserFilter = 'all',
): Promise<{
  users: AdminUserRowDto[];
  total: number;
  page: number;
  limit: number;
}> {
  const skip = (page - 1) * limit;
  const search = q?.trim().toLowerCase();
  const todayStart = startOfUtcDay(new Date());

  // Pre-filter user IDs for access-based filters
  let idFilter: string[] | undefined;
  if (filter === 'elefin') {
    const rows = await prisma.userAccess.findMany({
      where: { elefinStatus: 'VERIFIED' },
      select: { userId: true },
    });
    idFilter = rows.map(r => r.userId);
  } else if (filter === 'grant') {
    const rows = await prisma.userAccess.findMany({
      where: { source: 'MANUAL_GRANT' },
      select: { userId: true },
    });
    idFilter = rows.map(r => r.userId);
  } else if (filter === 'inactive') {
    const rows = await prisma.userAccess.findMany({
      where: { activityStatus: 'INACTIVE' },
      select: { userId: true },
    });
    idFilter = rows.map(r => r.userId);
  } else if (filter === 'no_broker') {
    const withBroker = await prisma.brokerAccount.groupBy({ by: ['userId'] });
    const all = await prisma.user.findMany({ select: { id: true } });
    const has = new Set(withBroker.map(b => b.userId));
    idFilter = all.map(u => u.id).filter(id => !has.has(id));
  } else if (filter === 'active_today') {
    const rows = await prisma.session.groupBy({
      by: ['userId'],
      where: { updatedAt: { gte: todayStart } },
    });
    idFilter = rows.map(r => r.userId);
  }

  const where = {
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(idFilter ? { id: { in: idFilter } } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        createdAt: true,
        country: true,
        city: true,
        postalCode: true,
        lat: true,
        lng: true,
        accounts: { select: { providerId: true } },
        brokerAccounts: {
          select: {
            id: true,
            broker: true,
            server: true,
            mt5Login: true,
            status: true,
            lastSyncAt: true,
          },
        },
        sessions: {
          select: { updatedAt: true, ipAddress: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        _count: { select: { sessions: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: await enrichUsers(users),
    total,
    page,
    limit,
  };
}

export async function getAdminUserDossier(userId: string): Promise<AdminUserDossierDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      country: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
      accounts: { select: { providerId: true } },
      brokerAccounts: {
        select: {
          id: true,
          broker: true,
          server: true,
          mt5Login: true,
          status: true,
          lastSyncAt: true,
        },
      },
      sessions: {
        select: { updatedAt: true, ipAddress: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
      _count: { select: { sessions: true } },
    },
  });
  if (!user) throw new NotFoundError('User not found');

  const [rows, usageSessions7d, recentFeatures] = await Promise.all([
    enrichUsers([user]),
    prisma.usageSession.findMany({
      where: {
        userId,
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { id: true, startedAt: true, durationSec: true, pagePath: true },
    }),
    prisma.usageEvent.groupBy({
      by: ['feature'],
      where: {
        userId,
        feature: { not: null },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
      orderBy: { _count: { feature: 'desc' } },
      take: 8,
    }),
  ]);

  const base = rows[0]!;
  return {
    ...base,
    usageSessions7d: usageSessions7d.map(s => ({
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      durationSec: s.durationSec,
      pagePath: s.pagePath,
    })),
    recentFeatures: recentFeatures
      .filter(f => f.feature)
      .map(f => ({ feature: f.feature!, count: f._count._all })),
  };
}

export async function listAdminAudit(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        targetType: true,
        targetId: true,
        createdAt: true,
      },
    }),
    prisma.adminAuditLog.count(),
  ]);
  return {
    items: rows.map(r => ({
      id: r.id,
      action: r.action,
      actorEmail: r.actorEmail,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  };
}

export async function adminRecheckUser(
  userId: string,
  actor: { id: string; email: string },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User not found');
  await recheckUserAccess(userId);
  await logAdminAction({
    action: 'user.recheck',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'user',
    targetId: userId,
  });
}
