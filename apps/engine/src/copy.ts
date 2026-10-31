// The copy pipeline: one leader fill → an order (or a recorded skip) for every
// active follow. Ported from MirrorPip-X `fanout.ts` with the port-notes fixes:
//  G1 daily loss = today's realized + open unrealized, and it PAUSES the follow;
//  G2 non-terminal orders are polled to an outcome, partial fills reported;
//  G3/G4/G6 sizing via plan.ts (residuals, reduce-only closes, position cap);
//  G4 closes are capped by the size the exchange actually reports;
//  G10 typed exchange errors (bad key pauses copying, margin errors notify);
//  G11 the follow's leverage is set on the contract before the first copy.
// Per-follow failures are isolated and recorded; nothing here throws upward.

import { prisma, type CopyFollow, type CopyLeader, type ExchangeConnection, type LeaderFill, type Prisma } from '@tradinjournal/db';
import { ExchangeError, type FillEvent, type InstrumentInfo, type OrderInfo } from '@tradinjournal/exchange';
import { logger } from '@tradinjournal/logger';
import { SecretKeyError } from '@tradinjournal/secrets';
import type { EngineDeps } from './deps.js';
import { dayStartIn } from './time.js';
import { isKillSwitchOn, markConnectionInvalid, notify } from './guards.js';
import { planCopy, type PlanLeg } from './plan.js';
import { applyFill } from './position.js';

type FollowRow = CopyFollow & { connection: ExchangeConnection };
type LeaderRow = CopyLeader & { connection: ExchangeConnection };

const DONE = new Set(['FILLED', 'CANCELLED', 'REJECTED']);

// ─── leader equity cache (refreshed by reconcile; live read as fallback) ────

const leaderEquity = new Map<string, { usd: number; at: number }>();

export function rememberLeaderEquity(leaderId: string, usd: number, atMs: number): void {
  leaderEquity.set(leaderId, { usd, at: atMs });
}

async function leaderEquityUsd(leader: LeaderRow, deps: EngineDeps): Promise<number> {
  const hit = leaderEquity.get(leader.id);
  if (hit && deps.now().getTime() - hit.at < 90_000) return hit.usd;
  const a = await deps.exchangeFor(leader.connection).getAccount(deps.credsFor(leader.connection));
  rememberLeaderEquity(leader.id, a.equityUsd, deps.now().getTime());
  return a.equityUsd;
}

// ─── per-leader serial queue (fills of one leader are processed in order) ───

const queues = new Map<string, Promise<void>>();

function enqueue(leaderId: string, task: () => Promise<void>): Promise<void> {
  const prev = queues.get(leaderId) ?? Promise.resolve();
  const next = prev.then(task, task).catch((err) => {
    logger.error('[engine] copy task failed', { leaderId, err: String(err) });
  });
  queues.set(leaderId, next);
  void next.finally(() => {
    if (queues.get(leaderId) === next) queues.delete(leaderId);
  });
  return next;
}

// ─── leverage, set once per follow and contract per process ─────────────────

const leverageSet = new Set<string>();

// ─── entry point ────────────────────────────────────────────────────────────

/** Persist a leader fill (idempotent) and copy it to every active follow. */
export function ingestLeaderFill(leader: LeaderRow, fill: FillEvent, deps: EngineDeps): Promise<void> {
  return enqueue(leader.id, () => processFill(leader, fill, deps));
}

async function processFill(leader: LeaderRow, fill: FillEvent, deps: EngineDeps): Promise<void> {
  const data = {
    leaderId: leader.id,
    externalId: fill.externalId,
    symbol: fill.symbol,
    side: fill.side,
    qty: fill.qty,
    price: fill.price,
    reduceOnly: fill.reduceOnly,
    positionAfter: fill.positionAfter ?? null,
    exchTs: fill.timestamp,
  };
  // Delta can deliver one fill on more than one frame; the unique key dedupes.
  const row = await prisma.leaderFill.upsert({ where: { leaderId_externalId: { leaderId: leader.id, externalId: fill.externalId } }, update: {}, create: data }).catch(async (err) => {
    if ((err as { code?: string }).code === 'P2002') return prisma.leaderFill.findUnique({ where: { leaderId_externalId: { leaderId: leader.id, externalId: fill.externalId } } });
    throw err;
  });
  if (!row) return;
  await fanOut(leader, row, fill, deps);
}

/** Copy one stored leader fill to the follows that haven't handled it yet. */
export async function fanOut(leader: LeaderRow, row: LeaderFill, fill: FillEvent, deps: EngineDeps): Promise<void> {
  const follows = (await prisma.copyFollow.findMany({
    // Paused follows still copy exits (never strand a position the leader closed).
    where: { leaderId: leader.id, status: { in: ['ACTIVE', 'PAUSED'] }, startedAt: { lte: fill.timestamp } },
    include: { connection: true },
  })) as FollowRow[];
  if (!follows.length) return;

  // Halts: record a terminal skip so the fill never executes late when the halt lifts.
  // A paused leader is not a halt: like a paused follow, exits still copy so
  // followers aren't left holding positions the leader closed.
  let halt: string | null = null;
  let leaderPaused = false;
  if (await isKillSwitchOn(deps.now().getTime())) halt = 'copy trading is stopped (kill switch)';
  else {
    const live = await prisma.copyLeader.findUnique({ where: { id: leader.id }, select: { status: true } });
    if (live?.status === 'PAUSED') leaderPaused = true;
    else if (live?.status !== 'VERIFIED') halt = `leader is ${live?.status?.toLowerCase() ?? 'removed'}`;
  }

  let leaderUsd = 0;
  if (!halt && follows.some((f) => f.sizingMode === 'PROPORTIONAL')) {
    leaderUsd = await leaderEquityUsd(leader, deps).catch((err) => {
      logger.warn('[engine] leader equity unavailable', { leaderId: leader.id, err: String(err) });
      return 0;
    });
  }

  for (const follow of follows) {
    try {
      if (await alreadyHandled(follow.id, row.id)) continue;
      if (halt) {
        await recordSkip(follow, row, fill, halt);
        continue;
      }
      await copyToFollow(follow, row, fill, leaderUsd, deps, leaderPaused);
    } catch (err) {
      logger.error('[engine] copy to follow failed', { followId: follow.id, leaderFillId: row.id, err: String(err) });
    }
  }
}

async function alreadyHandled(followId: string, leaderFillId: string): Promise<boolean> {
  return !!(await prisma.exchangeOrder.findFirst({ where: { followId, leaderFillId }, select: { id: true } }));
}

async function recordSkip(follow: FollowRow, row: LeaderFill, fill: FillEvent, reason: string, symbol = fill.symbol): Promise<void> {
  await prisma.exchangeOrder
    .create({
      data: {
        userId: follow.userId,
        connectionId: follow.connectionId,
        source: 'COPY',
        followId: follow.id,
        leaderFillId: row.id,
        clientOrderId: `copy:${follow.id}:${fill.externalId}:skip`,
        symbol,
        side: fill.side,
        type: 'MARKET',
        qty: 0,
        status: 'SKIPPED',
        leaderPrice: fill.price,
        error: reason.slice(0, 500),
      },
    })
    .catch((err) => {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    });
}

async function copyToFollow(follow: FollowRow, row: LeaderFill, fill: FillEvent, leaderUsd: number, deps: EngineDeps, leaderPaused = false): Promise<void> {
  if (follow.connection.status !== 'ACTIVE') {
    await recordSkip(follow, row, fill, 'your exchange account needs reconnecting');
    return;
  }
  const exchange = deps.exchangeFor(follow.connection);
  let creds;
  try {
    creds = deps.credsFor(follow.connection);
  } catch (err) {
    if (!(err instanceof SecretKeyError)) throw err;
    await markConnectionInvalid(follow.connectionId, 'the stored key could not be read; reconnect the account');
    await recordSkip(follow, row, fill, 'your exchange account needs reconnecting');
    return;
  }

  let inst: InstrumentInfo | null;
  try {
    inst = await exchange.resolveInstrument(fill);
  } catch (err) {
    // Catalogue down: leave the fill unclaimed so reconcile retries it.
    logger.warn('[engine] instrument lookup failed; will retry', { followId: follow.id, err: String(err) });
    return;
  }
  if (!inst || !inst.live) {
    await recordSkip(follow, row, fill, `no live ${fill.baseAsset ?? fill.symbol} contract on your exchange`);
    return;
  }

  const exitsOnly = follow.status === 'PAUSED' || leaderPaused;

  // G1 / C1.10: a hit loss limit or profit target pauses the follow. The fill is
  // still planned so a leader exit closes the follower (never strand a position).
  const limit = exitsOnly ? null : await limitReached(follow, deps);

  // Follower position: what we track for this follow, capped by what the exchange holds.
  const posRow = await prisma.exchangePosition.findUnique({ where: { connectionId_symbol_positionKey: { connectionId: follow.connectionId, symbol: inst.symbol, positionKey: follow.id } } });
  const tracked = posRow && Number(posRow.qty) > 0 ? (posRow.side === 'LONG' ? 1 : -1) * Number(posRow.qty) : 0;
  let followerPosition = tracked;
  let followerEquityUsd = 0;
  try {
    const [positions, account] = await Promise.all([
      tracked !== 0 ? exchange.getPositions(creds) : Promise.resolve(null),
      follow.sizingMode === 'PROPORTIONAL' ? exchange.getAccount(creds) : Promise.resolve(null),
    ]);
    followerEquityUsd = account?.equityUsd ?? 0;
    if (positions) {
      const real = positions.find((p) => p.symbol === inst!.symbol)?.size ?? 0;
      followerPosition = Math.sign(real) === Math.sign(tracked) ? Math.sign(tracked) * Math.min(Math.abs(tracked), Math.abs(real)) : 0;
      if (followerPosition !== tracked && posRow) {
        await prisma.exchangePosition.update({ where: { id: posRow.id }, data: { exchangeQty: real, driftDetectedAt: deps.now() } });
      }
    }
  } catch (err) {
    await handleExchangeError(follow, err);
    await recordSkip(follow, row, fill, `could not read your exchange account: ${errText(err)}`, inst.symbol);
    return;
  }

  const residuals = (follow.residuals ?? {}) as Record<string, number>;
  const plan = planCopy({
    fill: { side: fill.side, qty: fill.qty, price: fill.price, positionAfter: fill.positionAfter, contractMultiplier: fill.contractMultiplier },
    sizingMode: follow.sizingMode,
    sizingValue: Number(follow.sizingValue),
    copyReverse: follow.copyReverse,
    leaderEquityUsd: leaderUsd,
    followerEquityUsd,
    maxPositionUsd: follow.maxPositionUsd != null ? Number(follow.maxPositionUsd) : null,
    followerPosition,
    instrument: inst,
    residual: Number(residuals[inst.symbol] ?? 0),
  });
  if ((plan.residual ?? 0) !== Number(residuals[inst.symbol] ?? 0)) {
    await prisma.copyFollow.update({ where: { id: follow.id }, data: { residuals: { ...residuals, [inst.symbol]: plan.residual } as Prisma.InputJsonValue } });
  }
  if (limit) {
    await prisma.copyFollow.update({ where: { id: follow.id }, data: { status: 'PAUSED', pausedAt: deps.now(), pauseReason: limit.pauseReason } });
    await notify(follow.userId, limit.kind, limit.title, limit.body);
  }
  if (exitsOnly || limit) plan.legs = plan.legs.filter((l) => l.kind === 'CLOSE');
  if (plan.skipReason || !plan.legs.length) {
    await recordSkip(follow, row, fill, plan.skipReason ?? limit?.skip ?? (leaderPaused ? 'leader is paused: only exits are copied' : 'follow is paused: only exits are copied'), inst.symbol);
    return;
  }

  // Final gate right before sending: a kill switch or delisting mid-flight stops
  // it; an admin pause mid-flight still lets closes through.
  const live = await prisma.copyLeader.findUnique({ where: { id: follow.leaderId }, select: { status: true } });
  const closesOnly = plan.legs.every((l) => l.kind === 'CLOSE');
  if (!(live?.status === 'VERIFIED' || (live?.status === 'PAUSED' && closesOnly)) || (await isKillSwitchOn(deps.now().getTime()))) {
    await recordSkip(follow, row, fill, 'copying was stopped before the order was sent', inst.symbol);
    return;
  }

  // G11: the follow's leverage on this contract, once per process.
  if (follow.leverage != null && !leverageSet.has(`${follow.id}:${inst.symbol}`)) {
    try {
      await exchange.setLeverage(creds, inst.symbol, follow.leverage);
      leverageSet.add(`${follow.id}:${inst.symbol}`);
    } catch (err) {
      logger.warn('[engine] set leverage failed; using the account setting', { followId: follow.id, err: errText(err) });
    }
  }

  for (let i = 0; i < plan.legs.length; i++) {
    const ok = await placeLeg(follow, row, fill, inst, plan.legs[i]!, i, deps);
    if (!ok) break;
  }
}

interface LimitHit {
  pauseReason: string;
  skip: string;
  kind: string;
  title: string;
  body: string;
}

/** Daily loss limit (today's realized + open unrealized) or profit target (since start). */
async function limitReached(follow: FollowRow, deps: EngineDeps): Promise<LimitHit | null> {
  if (follow.dailyLossLimitUsd == null && follow.maxProfitUsd == null) return null;
  const pnlSince = async (since: Date) => {
    const [realized, open] = await Promise.all([
      prisma.exchangeOrder.aggregate({ where: { followId: follow.id, filledAt: { gte: since } }, _sum: { realizedPnl: true } }),
      prisma.exchangePosition.aggregate({ where: { followId: follow.id, closedAt: null }, _sum: { unrealizedPnl: true } }),
    ]);
    return Number(realized._sum.realizedPnl ?? 0) + Number(open._sum.unrealizedPnl ?? 0);
  };
  if (follow.dailyLossLimitUsd != null) {
    // "Today" is the follower's own day (their notification time zone, UTC if unset).
    const pref = await prisma.notificationPreference.findUnique({ where: { userId: follow.userId }, select: { timezone: true } });
    const today = await pnlSince(dayStartIn(pref?.timezone ?? 'UTC', deps.now()));
    const cap = Math.abs(Number(follow.dailyLossLimitUsd));
    if (cap > 0 && today <= -cap) {
      return {
        pauseReason: `Daily loss limit of $${cap} reached`,
        skip: 'daily loss limit reached; copying paused',
        kind: 'copy.loss_limit',
        title: 'Copying paused: daily loss limit hit',
        body: `Today's loss on this follow reached $${Math.abs(today).toFixed(2)} (limit $${cap}). Open copies still close when the leader exits. Resume it when you're ready.`,
      };
    }
  }
  if (follow.maxProfitUsd != null) {
    const total = await pnlSince(follow.startedAt);
    const target = Math.abs(Number(follow.maxProfitUsd));
    if (target > 0 && total >= target) {
      return {
        pauseReason: `Profit target of $${target} reached`,
        skip: 'profit target reached; copying paused',
        kind: 'copy.profit_target',
        title: 'Copying paused: profit target reached',
        body: `This follow is up $${total.toFixed(2)} (target $${target}). Open copies still close when the leader exits.`,
      };
    }
  }
  return null;
}

async function placeLeg(follow: FollowRow, row: LeaderFill, fill: FillEvent, inst: InstrumentInfo, leg: PlanLeg, index: number, deps: EngineDeps): Promise<boolean> {
  const exchange = deps.exchangeFor(follow.connection);
  const creds = deps.credsFor(follow.connection);
  const clientOrderId = `copy:${follow.id}:${fill.externalId}:${index}`;

  // Claim first: the unique clientOrderId makes a retry a no-op.
  let order;
  try {
    order = await prisma.exchangeOrder.create({
      data: {
        userId: follow.userId,
        connectionId: follow.connectionId,
        source: 'COPY',
        followId: follow.id,
        leaderFillId: row.id,
        clientOrderId,
        symbol: inst.symbol,
        side: leg.side,
        type: 'MARKET',
        timeInForce: 'IOC',
        reduceOnly: leg.reduceOnly,
        qty: leg.qty,
        leaderPrice: fill.price,
        status: 'PENDING',
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }

  let result: OrderInfo;
  try {
    result = await exchange.placeOrder(creds, { symbol: inst.symbol, side: leg.side, qty: leg.qty, type: 'MARKET', reduceOnly: leg.reduceOnly, clientOrderId });
    // G2: a market order should finish at once; poll briefly if it hasn't.
    for (let i = 0; i < 4 && !DONE.has(result.status) && result.exchangeOrderId; i++) {
      await deps.sleep(500);
      result = (await exchange.getOrder(creds, { exchangeOrderId: result.exchangeOrderId })) ?? result;
    }
  } catch (err) {
    const code = err instanceof ExchangeError ? err.code : 'REQUEST';
    await prisma.exchangeOrder.update({ where: { id: order.id }, data: { status: 'REJECTED', errorCode: code, error: errText(err).slice(0, 500) } });
    await handleExchangeError(follow, err);
    if (err instanceof ExchangeError && err.code === 'INSUFFICIENT_MARGIN') {
      await notify(follow.userId, 'copy.rejected', 'A copied trade was rejected', `Not enough margin on your exchange account to copy ${leg.side.toLowerCase()} ${leg.qty} ${inst.symbol}.`);
    }
    logger.warn('[engine] copy order rejected', { followId: follow.id, code, err: errText(err) });
    return false;
  }

  const filled = result.filledQty;
  const price = result.avgFillPrice ?? fill.price;
  let realized: number | null = null;
  if (filled > 0) realized = await applyToPosition(follow, inst, leg.side, filled, price, deps);

  const status = result.status === 'PENDING' ? 'SUBMITTED' : result.status;
  await prisma.exchangeOrder.update({
    where: { id: order.id },
    data: {
      status,
      exchangeOrderId: result.exchangeOrderId || null,
      filledQty: filled,
      avgFillPrice: result.avgFillPrice,
      slippageBps: result.avgFillPrice && fill.price > 0 ? ((result.avgFillPrice - fill.price) / fill.price) * 10_000 * (leg.side === 'BUY' ? 1 : -1) : null,
      realizedPnl: realized,
      submittedAt: deps.now(),
      filledAt: filled > 0 ? deps.now() : null,
    },
  });
  if (filled > 0 && filled < leg.qty) {
    await notify(follow.userId, 'copy.partial', 'A copied trade only partly filled', `${filled} of ${leg.qty} ${inst.symbol} filled; the exchange cancelled the rest.`);
  }
  if (filled === 0 && status === 'CANCELLED') {
    await notify(follow.userId, 'copy.unfilled', 'A copied trade did not fill', `The exchange cancelled ${leg.side.toLowerCase()} ${leg.qty} ${inst.symbol} without a fill.`);
  }
  logger.info('[engine] copied fill', { followId: follow.id, symbol: inst.symbol, side: leg.side, kind: leg.kind, qty: leg.qty, filled, status });
  return filled > 0;
}

async function applyToPosition(follow: FollowRow, inst: InstrumentInfo, side: 'BUY' | 'SELL', qty: number, price: number, deps: EngineDeps): Promise<number> {
  const where = { connectionId_symbol_positionKey: { connectionId: follow.connectionId, symbol: inst.symbol, positionKey: follow.id } };
  const existing = await prisma.exchangePosition.findUnique({ where });
  const current = existing && Number(existing.qty) > 0 ? { side: existing.side, qty: Number(existing.qty), avgEntry: Number(existing.avgEntry) } : null;
  const r = applyFill(current, side, qty, price, inst.contractMultiplier);
  await prisma.exchangePosition.upsert({
    where,
    update: {
      side: r.side,
      qty: r.qty,
      avgEntry: r.avgEntry,
      realizedPnl: { increment: r.realizedDelta },
      closedAt: r.closed ? deps.now() : null,
      ...(current ? {} : { openedAt: deps.now() }),
      ...(r.closed ? { unrealizedPnl: 0 } : {}),
    },
    create: { connectionId: follow.connectionId, followId: follow.id, positionKey: follow.id, source: 'COPY', symbol: inst.symbol, side: r.side, qty: r.qty, avgEntry: r.avgEntry, openedAt: deps.now() },
  });
  return r.realizedDelta;
}

async function handleExchangeError(follow: FollowRow, err: unknown): Promise<void> {
  if (err instanceof ExchangeError && err.isCredentialProblem) await markConnectionInvalid(follow.connectionId, err.message);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
