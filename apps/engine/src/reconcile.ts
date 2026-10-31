// Periodic upkeep. Ported from MirrorPip-X `reconcile.ts`, reworked for scale
// (gap G7): equity points at most every 5 minutes, stats every 5 minutes from
// aggregates instead of reloading every order every 30 s.

import { prisma, type CopyLeader, type ExchangeConnection } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { fanOut, rememberLeaderEquity } from './copy.js';
import type { EngineDeps } from './deps.js';
import { curveStats, WINDOWS } from './stats.js';

const EQUITY_POINT_MS = 5 * 60_000;
const STATS_MS = 5 * 60_000;
let lastStatsAt = 0;

export async function reconcile(deps: EngineDeps): Promise<void> {
  await markPositions(deps);
  await refreshLeaders(deps);
  await retryUnclaimedFills(deps);
}

/** Mark open copy positions to market with public mark prices. */
export async function markPositions(deps: EngineDeps): Promise<void> {
  const open = await prisma.exchangePosition.findMany({ where: { closedAt: null, qty: { gt: 0 } }, include: { connection: { select: { exchange: true, environment: true } } } });
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
  const leaders = (await prisma.copyLeader.findMany({ where: { status: { in: ['VERIFIED', 'PAUSED'] }, connection: { status: 'ACTIVE' } }, include: { connection: true } })) as Array<CopyLeader & { connection: ExchangeConnection }>;
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
