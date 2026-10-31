// Periodic upkeep. Ported from MirrorPip-X `reconcile.ts`, reworked for scale
// (gap G7): equity points at most every 5 minutes, stats every 5 minutes from
// aggregates instead of reloading every order every 30 s.

import { Prisma, prisma, type CopyLeader, type ExchangeConnection } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { ExchangeError } from '@tradinjournal/exchange';
import { SecretKeyError } from '@tradinjournal/secrets';
import { fanOut, rememberLeaderEquity } from './copy.js';
import { markConnectionInvalid, notify } from './guards.js';
import { inScope, type EngineDeps } from './deps.js';
import { curveStats, WINDOWS } from './stats.js';

const EQUITY_POINT_MS = 5 * 60_000;
const STATS_MS = 5 * 60_000;
const DRIFT_MS = 10 * 60_000;
/** Positions touched this recently may have a copy in flight; leave them for the next sweep. */
const DRIFT_SETTLE_MS = 60_000;
let lastStatsAt = 0;
let lastDriftAt = 0;

export async function reconcile(deps: EngineDeps): Promise<void> {
  await markPositions(deps);
  await refreshLeaders(deps);
  await retryUnclaimedFills(deps);
  const nowMs = deps.now().getTime();
  if (nowMs - lastDriftAt >= DRIFT_MS) {
    lastDriftAt = nowMs;
    await sweepDrift(deps).catch((err) => logger.warn('[engine] drift sweep failed', { err: String(err) }));
  }
}

/**
 * C1.15: compare each live copy's positions with what the exchange holds.
 * When the user closed some or all of a copy by hand, shrink our record to
 * what's really there (closing it at zero), flag the drift and tell them once.
 * Holding more than we copied is fine: that's the user's own trading.
 */
export async function sweepDrift(deps: EngineDeps): Promise<number> {
  const now = deps.now();
  const open = await prisma.exchangePosition.findMany({
    where: { closedAt: null, qty: { gt: 0 }, followId: { not: null }, follow: { status: { in: ['ACTIVE', 'PAUSED'] }, userId: inScope(deps) }, updatedAt: { lt: new Date(now.getTime() - DRIFT_SETTLE_MS) } },
    include: { connection: true, follow: { select: { id: true, userId: true, leader: { select: { displayName: true } } } } },
  });
  const byConn = new Map<string, typeof open>();
  for (const p of open) byConn.set(p.connectionId, [...(byConn.get(p.connectionId) ?? []), p]);
  let changed = 0;
  for (const rows of byConn.values()) {
    const conn = rows[0]!.connection;
    if (conn.status !== 'ACTIVE') continue;
    let real: Map<string, number>;
    try {
      real = new Map((await deps.exchangeFor(conn).getPositions(deps.credsFor(conn))).map((p) => [p.symbol, p.size]));
    } catch (err) {
      if (err instanceof SecretKeyError) await markConnectionInvalid(conn.id, 'the stored key could not be read; reconnect the account');
      else if (err instanceof ExchangeError && err.isCredentialProblem) await markConnectionInvalid(conn.id, err.message);
      continue;
    }
    for (const p of rows) {
      // An order still in flight would make the exchange look different for a moment.
      const inFlight = await prisma.exchangeOrder.count({ where: { followId: p.followId, status: { in: ['PENDING', 'SUBMITTED', 'OPEN'] } } });
      if (inFlight) continue;
      const size = real.get(p.symbol) ?? 0;
      const dir = p.side === 'LONG' ? 1 : -1;
      const held = Math.sign(size) === dir ? Math.abs(size) : 0;
      const tracked = Number(p.qty);
      if (held >= tracked) {
        if (p.driftDetectedAt) await prisma.exchangePosition.update({ where: { id: p.id }, data: { exchangeQty: size, driftDetectedAt: null } });
        continue;
      }
      await prisma.exchangePosition.update({
        where: { id: p.id },
        data: held === 0 ? { qty: 0, closedAt: now, unrealizedPnl: 0, exchangeQty: size, driftDetectedAt: now } : { qty: held, exchangeQty: size, driftDetectedAt: now },
      });
      changed++;
      if (!p.driftDetectedAt && p.follow) {
        await notify(
          p.follow.userId,
          'copy.position_drift',
          `Your ${p.symbol} copy changed on the exchange`,
          held === 0
            ? `Your copy of ${p.follow.leader.displayName} on ${p.symbol} was closed outside TRADElogs. We've closed it on our side too.`
            : `You hold ${held} of the ${tracked} we copied from ${p.follow.leader.displayName} on ${p.symbol}. We'll only close what's still there.`,
          `/copy/following/${p.follow.id}`,
        );
      }
      logger.info('[engine] position drift corrected', { positionId: p.id, symbol: p.symbol, tracked, held });
    }
  }
  return changed;
}

/** Mark open copy positions to market with public mark prices. */
export async function markPositions(deps: EngineDeps): Promise<void> {
  const open = await prisma.exchangePosition.findMany({ where: { closedAt: null, qty: { gt: 0 }, connection: { userId: inScope(deps) } }, include: { connection: { select: { exchange: true, environment: true } } } });
  const marks = new Map<string, { price: number | null; mult: number }>();
  for (const p of open) {
    const key = `${p.connection.exchange}:${p.connection.environment}:${p.symbol}`;
    if (!marks.has(key)) {
      const ex = deps.exchangeFor(p.connection);
      const [price, inst] = await Promise.all([ex.getMarkPrice(p.symbol).catch(() => null), ex.getInstrument(p.symbol).catch(() => null)]);
      marks.set(key, { price, mult: inst?.contractMultiplier ?? 1 });
    }
    const m = marks.get(key)!;
    if (m.price == null) continue;
    const entry = Number(p.avgEntry);
    const unrealized = (p.side === 'LONG' ? m.price - entry : entry - m.price) * Number(p.qty) * m.mult;
    await prisma.exchangePosition.update({ where: { id: p.id }, data: { markPrice: m.price, unrealizedPnl: unrealized } }).catch(() => undefined);
  }
}

/** Leader equity (cached for sizing, stored every 5 min) and leaderboard stats. */
async function refreshLeaders(deps: EngineDeps): Promise<void> {
  const leaders = (await prisma.copyLeader.findMany({ where: { status: { in: ['VERIFIED', 'PAUSED'] }, connection: { status: 'ACTIVE' }, userId: inScope(deps) }, include: { connection: true } })) as Array<CopyLeader & { connection: ExchangeConnection }>;
  const nowMs = deps.now().getTime();
  for (const leader of leaders) {
    try {
      const a = await deps.exchangeFor(leader.connection).getAccount(deps.credsFor(leader.connection));
      rememberLeaderEquity(leader.id, a.equityUsd, nowMs);
      const last = await prisma.leaderEquityPoint.findFirst({ where: { leaderId: leader.id }, orderBy: { ts: 'desc' }, select: { ts: true } });
      if (!last || nowMs - last.ts.getTime() >= EQUITY_POINT_MS) {
        await prisma.leaderEquityPoint.create({ data: { leaderId: leader.id, equityUsd: a.equityUsd, ts: deps.now() } });
      }
    } catch (err) {
      logger.debug('[engine] leader equity read failed', { leaderId: leader.id, err: String(err) });
    }
  }
  if (nowMs - lastStatsAt >= STATS_MS) {
    lastStatsAt = nowMs;
    for (const leader of leaders) await recomputeStats(leader.id, nowMs).catch((err) => logger.warn('[engine] stats failed', { leaderId: leader.id, err: String(err) }));
  }
}

export async function recomputeStats(leaderId: string, nowMs: number): Promise<void> {
  const [followerCount, tradeCount, copied, closedPositions, points] = await Promise.all([
    prisma.copyFollow.count({ where: { leaderId, status: 'ACTIVE' } }),
    prisma.leaderFill.count({ where: { leaderId } }),
    prisma.$queryRaw<Array<{ usd: number | null }>>`
      SELECT SUM(o."filledQty" * o."avgFillPrice")::float AS usd
      FROM exchange_order o JOIN copy_follow f ON f.id = o."followId"
      WHERE f."leaderId" = ${leaderId} AND o."filledQty" > 0`,
    prisma.exchangePosition.findMany({ where: { follow: { leaderId }, closedAt: { not: null } }, select: { realizedPnl: true } }),
    prisma.leaderEquityPoint.findMany({ where: { leaderId }, orderBy: { ts: 'asc' }, select: { equityUsd: true, ts: true } }),
  ]);
  // Win rate needs closed positions; with none it is unknown, not 0%.
  const winRatePct = closedPositions.length ? (closedPositions.filter((p) => Number(p.realizedPnl) > 0).length / closedPositions.length) * 100 : null;
  const curve = points.map((p) => ({ equityUsd: Number(p.equityUsd), ts: p.ts }));
  for (const [window, span] of Object.entries(WINDOWS)) {
    const { roiPct, maxDrawdownPct } = curveStats(curve, span ? nowMs - span : 0);
    const data = { followerCount, tradeCount, totalCopiedUsd: copied[0]?.usd ?? 0, winRatePct, roiPct, maxDrawdownPct };
    await prisma.leaderStat.upsert({ where: { leaderId_window: { leaderId, window } }, update: data, create: { leaderId, window, ...data } });
  }
}

/**
 * Leader fills from the last 24 h that an ACTIVE follow never handled (the
 * fan-out died on a transient error before claiming an order). Replaying is
 * safe: fan-out skips follows that already have an order for the fill.
 */
async function retryUnclaimedFills(deps: EngineDeps): Promise<void> {
  const since = new Date(deps.now().getTime() - 24 * 3600_000);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT lf.id FROM leader_fill lf
    JOIN copy_leader l ON l.id = lf."leaderId" AND l.status IN ('VERIFIED', 'PAUSED')
    JOIN copy_follow f ON f."leaderId" = l.id AND f.status = 'ACTIVE' AND f."startedAt" <= lf."exchTs"
    WHERE lf."exchTs" >= ${since.toISOString()}::timestamp
      ${deps.scopeUserIds ? Prisma.sql`AND f."userId" IN (${Prisma.join(deps.scopeUserIds.length ? deps.scopeUserIds : [''])})` : Prisma.empty}
      AND NOT EXISTS (SELECT 1 FROM exchange_order o WHERE o."followId" = f.id AND o."leaderFillId" = lf.id)
    GROUP BY lf.id, lf."exchTs" ORDER BY lf."exchTs" ASC LIMIT 200`;
  for (const { id } of rows) {
    const lf = await prisma.leaderFill.findUnique({ where: { id }, include: { leader: { include: { connection: true } } } });
    if (!lf) continue;
    const ex = deps.exchangeFor(lf.leader.connection);
    const inst = await ex.getInstrument(lf.symbol).catch(() => null);
    if (!inst) continue;
    logger.info('[engine] retrying unclaimed leader fill', { leaderFillId: id });
    await fanOut(lf.leader, lf, {
      externalId: lf.externalId,
      symbol: lf.symbol,
      side: lf.side,
      qty: Number(lf.qty),
      price: Number(lf.price),
      reduceOnly: lf.reduceOnly,
      positionAfter: lf.positionAfter != null ? Number(lf.positionAfter) : undefined,
      timestamp: lf.exchTs,
      baseAsset: inst.baseAsset,
      quoteAsset: inst.quoteAsset,
      contractMultiplier: inst.contractMultiplier,
    }, deps);
  }
}
