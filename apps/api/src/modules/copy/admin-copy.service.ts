// Admin tools for copy trading (C5): review and manage leaders, the global
// kill switch, engine health from what the engine writes, and a user's copy
// trading in their dossier. Every change is audited and the people affected
// are notified.
import { prisma, type CopyLeaderStatus } from '@tradinjournal/db';
import type { AdminLeaderAction, AdminLeaderRowDto, AdminUserCopyDto, EngineHealthDto, KillSwitchDto } from '@tradinjournal/contracts';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { logAdminAction } from '../admin/admin-audit.service.js';
import { listFollows, stopFollow, type FollowDeps } from './follows.service.js';

export const KILL_SWITCH_KEY = 'copy.killSwitch';
export const HEARTBEAT_KEY = 'copy.engineHeartbeat';
/** The engine beats every minute; three missed beats means it's down. */
const ENGINE_STALE_MS = 3 * 60_000;
const LIVE = { in: ['ACTIVE', 'PAUSED'] as Array<'ACTIVE' | 'PAUSED'> };

type Actor = { id: string; email: string };

async function notify(userIds: string[], kind: string, title: string, body: string, href: string): Promise<void> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, kind, title, body, href })) }).catch(() => undefined);
}

const audit = (actor: Actor, action: string, targetId: string, details?: Record<string, unknown>) =>
  logAdminAction({ action, actorId: actor.id, actorEmail: actor.email, targetType: 'copy_leader', targetId, details }).catch(() => undefined);

// ── Leaders ─────────────────────────────────────────────────────────────────

export async function adminListLeaders(status?: CopyLeaderStatus): Promise<AdminLeaderRowDto[]> {
  const rows = await prisma.copyLeader.findMany({
    where: status ? { status } : {},
    include: {
      user: { select: { id: true, name: true, email: true } },
      connection: { select: { id: true, label: true, exchange: true, environment: true, status: true, keyLast4: true } },
      stats: true,
    },
    // Pending first (the queue), then newest.
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  });
  const ids = rows.map((r) => r.id);
  const [followers, lastFills, equity] = await Promise.all([
    prisma.copyFollow.groupBy({ by: ['leaderId'], where: { leaderId: { in: ids }, status: LIVE }, _count: { _all: true } }),
    prisma.leaderFill.groupBy({ by: ['leaderId'], where: { leaderId: { in: ids } }, _max: { exchTs: true }, _count: { _all: true } }),
    ids.length
      ? prisma.$queryRaw<Array<{ leaderId: string; v: number }>>`
          SELECT DISTINCT ON ("leaderId") "leaderId", "equityUsd"::float AS v FROM leader_equity_point
          WHERE "leaderId" = ANY(${ids}) ORDER BY "leaderId", ts DESC`
      : Promise.resolve([]),
  ]);
  const order: Record<string, number> = { PENDING: 0, VERIFIED: 1, PAUSED: 2, DELISTED: 3 };
  return rows
    .map((r) => {
      const s30 = r.stats.find((s) => s.window === '30d');
      const sAll = r.stats.find((s) => s.window === 'all');
      const lf = lastFills.find((x) => x.leaderId === r.id);
      return {
        id: r.id,
        displayName: r.displayName,
        bio: r.bio,
        status: r.status,
        listed: r.listed,
        user: r.user,
        connection: r.connection,
        followers: followers.find((x) => x.leaderId === r.id)?._count._all ?? 0,
        roi30dPct: s30 ? Number(s30.roiPct) : null,
        maxDrawdownAllPct: sAll ? Number(sAll.maxDrawdownPct) : null,
        equityUsd: equity.find((e) => e.leaderId === r.id)?.v ?? null,
        tradeCount: lf?._count._all ?? 0,
        lastTradeAt: lf?._max.exchTs?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    })
    .sort((a, b) => order[a.status]! - order[b.status]!);
}

const NEXT: Record<AdminLeaderAction, { from: CopyLeaderStatus[]; to: CopyLeaderStatus | null }> = {
  approve: { from: ['PENDING'], to: 'VERIFIED' },
  reject: { from: ['PENDING'], to: null },
  pause: { from: ['VERIFIED'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'VERIFIED' },
  delist: { from: ['VERIFIED', 'PAUSED'], to: 'DELISTED' },
};

const VERB: Record<AdminLeaderAction, string> = { approve: 'approve', reject: 'reject', pause: 'pause', resume: 'resume', delist: 'remove' };

export async function adminLeaderAction(
  actor: Actor,
  id: string,
  action: AdminLeaderAction,
  reason: string | undefined,
  deps?: FollowDeps,
): Promise<{ id: string; status: CopyLeaderStatus | 'REJECTED' }> {
  const l = await prisma.copyLeader.findUnique({ where: { id }, include: { connection: { select: { status: true } } } });
  if (!l) throw new NotFoundError('Leader not found');
  const step = NEXT[action];
  if (!step.from.includes(l.status)) throw new ConflictError(`Can't ${VERB[action]} a leader that is ${l.status.toLowerCase()}.`);
  if (step.to === 'VERIFIED' && l.connection.status !== 'ACTIVE') {
    throw new ConflictError("The leader's exchange key isn't working. They need to reconnect it first.");
  }
  const why = reason ? ` Reason: ${reason}` : '';

  if (action === 'reject') {
    // Deleting a pending application lets them fix it and apply again.
    const gone = await prisma.copyLeader.deleteMany({ where: { id, status: 'PENDING' } });
    if (!gone.count) throw new ConflictError('This application was already decided.');
    await notify([l.userId], 'copy.leader_rejected', 'Your leader application wasn’t approved', `You can update your profile and apply again.${why}`, '/copy/lead');
    await audit(actor, 'copy.leader_reject', id, { reason });
    return { id, status: 'REJECTED' };
  }

  // Compare-and-set, so two admins acting at once can't both apply.
  const changed = await prisma.copyLeader.updateMany({ where: { id, status: l.status }, data: { status: step.to! } });
  if (!changed.count) throw new ConflictError('Someone else changed this leader just now. Refresh and try again.');

  const follows = await prisma.copyFollow.findMany({ where: { leaderId: id, status: LIVE }, select: { id: true, userId: true } });
  const followerIds = follows.map((f) => f.userId);
  if (action === 'approve') {
    await notify([l.userId], 'copy.leader_approved', 'You’re a leader now', 'Your profile is live on the leaderboard and people can copy you.', '/copy/lead');
  } else if (action === 'pause') {
    await notify([l.userId], 'copy.leader_paused', 'Copying of your trades is paused', `New trades aren’t copied for now; closes still are.${why}`, '/copy/lead');
    await notify(followerIds, 'copy.leader_paused', `${l.displayName} is paused`, 'New trades from this leader aren’t copied for now. When they close a trade, your copy still closes.', '/copy/following');
  } else if (action === 'resume') {
    await notify([l.userId], 'copy.leader_resumed', 'Copying of your trades is back on', 'Followers copy your new trades again.', '/copy/lead');
    await notify(followerIds, 'copy.leader_resumed', `${l.displayName} is back`, 'New trades from this leader are copied again.', '/copy/following');
  } else if (action === 'delist') {
    // Nothing more can be copied from a removed leader, so their follows stop.
    // Open copies stay open on followers' accounts; we tell them.
    for (const f of follows) await stopFollow(f.userId, f.id, false, deps);
    await notify([l.userId], 'copy.leader_delisted', 'Your leader profile was removed', `Your followers have stopped copying you.${why}`, '/copy/lead');
    await notify(followerIds, 'copy.leader_delisted', `${l.displayName} was removed`, 'Your copy has stopped. Any copies still open are on your exchange account for you to manage.', '/copy/following');
  }
  await audit(actor, `copy.leader_${action}`, id, { from: l.status, to: step.to, reason, followers: followerIds.length });
  return { id, status: step.to! };
}

// ── Kill switch ─────────────────────────────────────────────────────────────

export async function getKillSwitch(): Promise<KillSwitchDto> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KILL_SWITCH_KEY } });
  const v = (row?.value ?? {}) as Partial<KillSwitchDto>;
  return { enabled: !!v.enabled, reason: v.reason ?? null, by: v.by ?? null, at: v.at ?? row?.updatedAt.toISOString() ?? null };
}

export async function setKillSwitch(actor: Actor, enabled: boolean, reason?: string): Promise<KillSwitchDto> {
  const value = { enabled, reason: reason ?? null, by: actor.email, at: new Date().toISOString() };
  await prisma.systemSetting.upsert({ where: { key: KILL_SWITCH_KEY }, update: { value }, create: { key: KILL_SWITCH_KEY, value } });
  await logAdminAction({ action: enabled ? 'copy.kill_switch_on' : 'copy.kill_switch_off', actorId: actor.id, actorEmail: actor.email, targetType: 'system_setting', targetId: KILL_SWITCH_KEY, details: { reason } }).catch(() => undefined);
  return value;
}

// ── Engine health ───────────────────────────────────────────────────────────

const pctl = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : null);

export async function engineHealth(now = new Date()): Promise<EngineHealthDto> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [beat, killSwitch, leaderCounts, followCounts, watched, lastFill, byStatus, filled, reasons, broken, drift] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: HEARTBEAT_KEY } }),
    getKillSwitch(),
    prisma.copyLeader.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.copyFollow.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.copyLeader.count({ where: { status: { in: ['VERIFIED', 'PAUSED'] }, connection: { status: 'ACTIVE' }, follows: { some: { status: LIVE } } } }),
    prisma.leaderFill.aggregate({ _max: { exchTs: true } }),
    prisma.exchangeOrder.groupBy({ by: ['status'], where: { source: 'COPY', requestedAt: { gte: since } }, _count: { _all: true } }),
    prisma.exchangeOrder.findMany({
      where: { source: 'COPY', status: 'FILLED', requestedAt: { gte: since }, leaderFillId: { not: null } },
      select: { filledAt: true, slippageBps: true, leaderFill: { select: { exchTs: true } } },
      orderBy: { requestedAt: 'desc' },
      take: 2000,
    }),
    prisma.exchangeOrder.groupBy({
      by: ['error'],
      where: { source: 'COPY', requestedAt: { gte: since }, status: { in: ['SKIPPED', 'REJECTED', 'CANCELLED', 'EXPIRED'] }, error: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { error: 'desc' } },
      take: 6,
    }),
    prisma.exchangeConnection.count({ where: { status: 'INVALID', OR: [{ follows: { some: { status: LIVE } } }, { leader: { status: { in: ['VERIFIED', 'PAUSED'] } } }] } }),
    prisma.exchangePosition.count({ where: { closedAt: null, qty: { gt: 0 }, driftDetectedAt: { not: null } } }),
  ]);
  const b = (beat?.value ?? null) as { at?: string; startedAt?: string; liveWatchers?: number } | null;
  const lat = filled
    .map((o) => (o.filledAt && o.leaderFill ? o.filledAt.getTime() - o.leaderFill.exchTs.getTime() : null))
    .filter((n): n is number => n != null && n >= 0)
    .sort((x, y) => x - y);
  const slips = filled.map((o) => (o.slippageBps == null ? null : Math.abs(Number(o.slippageBps)))).filter((n): n is number => n != null);
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
  const lc = (s: string) => leaderCounts.find((x) => x.status === s)?._count._all ?? 0;
  const fc = (s: string) => followCounts.find((x) => x.status === s)?._count._all ?? 0;
  return {
    engine: {
      up: !!b?.at && now.getTime() - new Date(b.at).getTime() < ENGINE_STALE_MS,
      lastBeatAt: b?.at ?? null,
      startedAt: b?.startedAt ?? null,
      liveWatchers: b?.liveWatchers ?? null,
    },
    killSwitch,
    leaders: { PENDING: lc('PENDING'), VERIFIED: lc('VERIFIED'), PAUSED: lc('PAUSED'), DELISTED: lc('DELISTED') },
    follows: { ACTIVE: fc('ACTIVE'), PAUSED: fc('PAUSED'), STOPPED: fc('STOPPED') },
    watchedLeaders: watched,
    lastLeaderFillAt: lastFill._max.exchTs?.toISOString() ?? null,
    last24h: {
      filled: count('FILLED') + count('PARTIAL'),
      skipped: count('SKIPPED'),
      rejected: count('REJECTED') + count('CANCELLED') + count('EXPIRED'),
      medianLatencyMs: pctl(lat, 0.5),
      p90LatencyMs: pctl(lat, 0.9),
      meanAbsSlippageBps: slips.length ? Math.round((slips.reduce((s, n) => s + n, 0) / slips.length) * 100) / 100 : null,
      topReasons: reasons.map((r) => ({ reason: r.error!, count: r._count._all })),
    },
    brokenConnections: broken,
    driftPositions: drift,
  };
}

// ── A user's copy trading, for the admin dossier ────────────────────────────

export async function adminUserCopy(userId: string): Promise<AdminUserCopyDto> {
  const [conns, leader, follows] = await Promise.all([
    prisma.exchangeConnection.findMany({
      where: { userId },
      select: { id: true, label: true, exchange: true, environment: true, status: true, lastError: true, keyLast4: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.copyLeader.findFirst({ where: { userId }, select: { id: true, displayName: true, status: true } }),
    listFollows(userId, { includeStopped: true }),
  ]);
  return { connections: conns.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })), leader, follows };
}

export async function adminStopFollow(actor: Actor, followId: string, reason: string, deps?: FollowDeps) {
  const f = await prisma.copyFollow.findUnique({ where: { id: followId }, include: { leader: { select: { displayName: true } } } });
  if (!f) throw new NotFoundError('Follow not found');
  if (f.status === 'STOPPED') throw new ConflictError('This follow is already stopped.');
  const r = await stopFollow(f.userId, f.id, false, deps);
  await notify([f.userId], 'copy.follow_stopped_by_admin', `Copying ${f.leader.displayName} was stopped`, `TRADElogs support stopped this copy. Any copies still open are on your exchange account. Reason: ${reason}`, `/copy/following/${f.id}`);
  await logAdminAction({ action: 'copy.follow_stop', actorId: actor.id, actorEmail: actor.email, targetType: 'copy_follow', targetId: f.id, details: { reason, userId: f.userId } }).catch(() => undefined);
  return r;
}
