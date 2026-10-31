// Copy-trading follows: a user copies a leader onto one of their own exchange
// accounts. The engine does the copying; this module creates, edits, pauses and
// stops follows, and reads back what was copied. Stopping can close the
// follow's open copies on the exchange (reduce-only, never more than we copied).
import { prisma, type CopyFollow, type CopyLeader, type ExchangeConnection, type ExchangePosition } from '@tradinjournal/db';
import type {
  CopiedOrderDto,
  CreateFollowInput,
  CursorQuery,
  FollowDetailDto,
  FollowDto,
  FollowPositionDto,
  Page,
  StopFollowResultDto,
  UpdateFollowInput,
} from '@tradinjournal/contracts';
import { ExchangeError, type OrderInfo } from '@tradinjournal/exchange';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { credsOf, type ExchangeDeps } from '../exchanges/exchanges.service.js';
import { adapterFor } from '../exchanges/exchanges.adapters.js';
import { env } from '@tradinjournal/config';
import { requireEncryptionKey } from '@tradinjournal/secrets';

export type FollowDeps = Pick<ExchangeDeps, 'adapterFor' | 'key'> & { sleep: (ms: number) => Promise<void> };

const defaultDeps: FollowDeps = {
  adapterFor,
  key: () => requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const LIVE = { in: ['ACTIVE', 'PAUSED'] as Array<'ACTIVE' | 'PAUSED'> };
const FAILED = ['REJECTED', 'CANCELLED', 'EXPIRED'] as const;
const DONE = new Set(['FILLED', 'CANCELLED', 'REJECTED']);
const ENV_NAME = { TESTNET: 'testnet', LIVE: 'live' } as const;
const VENUE_NAME: Record<string, string> = { DELTA_INDIA: 'Delta Exchange India' };

type FollowRow = CopyFollow & {
  leader: Pick<CopyLeader, 'id' | 'displayName' | 'status'> & { connection: Pick<ExchangeConnection, 'exchange'> };
  connection: Pick<ExchangeConnection, 'id' | 'label' | 'status' | 'environment'>;
};

const followInclude = {
  leader: { select: { id: true, displayName: true, status: true, connection: { select: { exchange: true } } } },
  connection: { select: { id: true, label: true, status: true, environment: true } },
} as const;

const num = (d: unknown) => (d == null ? null : Number(d));
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Aggregates {
  realized: Map<string, number>;
  unrealized: Map<string, number>;
  openPositions: Map<string, number>;
  byStatus: Map<string, { copied: number; skipped: number; failed: number }>;
  lastCopyAt: Map<string, Date>;
}

async function aggregates(follows: FollowRow[]): Promise<Aggregates> {
  const ids = follows.map((f) => f.id);
  const out: Aggregates = { realized: new Map(), unrealized: new Map(), openPositions: new Map(), byStatus: new Map(), lastCopyAt: new Map() };
  if (!ids.length) return out;
  const started = new Map(follows.map((f) => [f.id, f.startedAt]));
  const [orders, positions, last] = await Promise.all([
    prisma.exchangeOrder.findMany({ where: { followId: { in: ids } }, select: { followId: true, status: true, realizedPnl: true, filledAt: true, requestedAt: true } }),
    prisma.exchangePosition.groupBy({ by: ['followId'], where: { followId: { in: ids }, positionKey: { in: ids }, closedAt: null, qty: { gt: 0 } }, _sum: { unrealizedPnl: true }, _count: { _all: true } }),
    prisma.exchangeOrder.groupBy({ by: ['followId'], where: { followId: { in: ids }, status: 'FILLED' }, _max: { filledAt: true } }),
  ]);
  for (const o of orders) {
    const id = o.followId!;
    const since = started.get(id)!;
    // Totals cover the current run of the follow (a re-follow starts at zero).
    if (o.requestedAt < since) continue;
    if (o.filledAt && o.filledAt >= since) out.realized.set(id, (out.realized.get(id) ?? 0) + Number(o.realizedPnl ?? 0));
    const s = out.byStatus.get(id) ?? { copied: 0, skipped: 0, failed: 0 };
    if (o.status === 'FILLED' || o.status === 'PARTIAL') s.copied++;
    else if (o.status === 'SKIPPED') s.skipped++;
    else if ((FAILED as readonly string[]).includes(o.status)) s.failed++;
    out.byStatus.set(id, s);
  }
  for (const p of positions) {
    out.unrealized.set(p.followId!, Number(p._sum.unrealizedPnl ?? 0));
    out.openPositions.set(p.followId!, p._count._all);
  }
  for (const l of last) if (l._max.filledAt) out.lastCopyAt.set(l.followId!, l._max.filledAt);
  return out;
}

function toDto(f: FollowRow, a: Aggregates): FollowDto {
  const s = a.byStatus.get(f.id) ?? { copied: 0, skipped: 0, failed: 0 };
  return {
    id: f.id,
    status: f.status,
    pauseReason: f.status === 'PAUSED' ? f.pauseReason : null,
    leader: { id: f.leader.id, displayName: f.leader.displayName, status: f.leader.status, exchange: f.leader.connection.exchange },
    connection: { id: f.connection.id, label: f.connection.label, status: f.connection.status, environment: f.connection.environment },
    sizingMode: f.sizingMode,
    sizingValue: Number(f.sizingValue),
    leverage: f.leverage,
    maxPositionUsd: num(f.maxPositionUsd),
    dailyLossLimitUsd: num(f.dailyLossLimitUsd),
    maxProfitUsd: num(f.maxProfitUsd),
    copyReverse: f.copyReverse,
    startedAt: f.startedAt.toISOString(),
    pausedAt: f.pausedAt?.toISOString() ?? null,
    stoppedAt: f.stoppedAt?.toISOString() ?? null,
    realizedPnlUsd: round2(a.realized.get(f.id) ?? 0),
    unrealizedPnlUsd: round2(a.unrealized.get(f.id) ?? 0),
    openPositions: a.openPositions.get(f.id) ?? 0,
    copiedOrders: s.copied,
    skippedOrders: s.skipped,
    failedOrders: s.failed,
    lastCopyAt: a.lastCopyAt.get(f.id)?.toISOString() ?? null,
  };
}

async function one(f: FollowRow): Promise<FollowDto> {
  return toDto(f, await aggregates([f]));
}

async function ownFollow(userId: string, id: string): Promise<FollowRow> {
  const f = (await prisma.copyFollow.findFirst({ where: { id, userId }, include: followInclude })) as FollowRow | null;
  if (!f) throw new NotFoundError('Follow not found');
  return f;
}

export async function listFollows(userId: string, opts: { includeStopped?: boolean } = {}): Promise<FollowDto[]> {
  const rows = (await prisma.copyFollow.findMany({
    where: { userId, ...(opts.includeStopped ? {} : { status: LIVE }) },
    include: followInclude,
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
  })) as FollowRow[];
  const a = await aggregates(rows);
  return rows.map((r) => toDto(r, a));
}

function positionDto(p: ExchangePosition): FollowPositionDto {
  return {
    symbol: p.symbol,
    side: p.side,
    qty: Number(p.qty),
    avgEntry: Number(p.avgEntry),
    markPrice: num(p.markPrice),
    unrealizedPnlUsd: round2(Number(p.unrealizedPnl)),
    realizedPnlUsd: round2(Number(p.realizedPnl)),
    openedAt: p.openedAt.toISOString(),
    drift: p.driftDetectedAt != null,
  };
}

export async function getFollow(userId: string, id: string): Promise<FollowDetailDto> {
  const f = await ownFollow(userId, id);
  const [dto, positions, filled] = await Promise.all([
    one(f),
    prisma.exchangePosition.findMany({ where: { followId: f.id, positionKey: f.id, closedAt: null, qty: { gt: 0 } }, orderBy: { openedAt: 'asc' } }),
    prisma.exchangeOrder.findMany({
      where: { followId: f.id, status: 'FILLED', requestedAt: { gte: f.startedAt }, leaderFillId: { not: null } },
      orderBy: { filledAt: 'desc' },
      take: 200,
      select: { slippageBps: true, filledAt: true, leaderFill: { select: { exchTs: true } } },
    }),
  ]);
  const slips = filled.map((o) => num(o.slippageBps)).filter((n): n is number => n != null);
  const lat = filled
    .map((o) => (o.filledAt && o.leaderFill ? o.filledAt.getTime() - o.leaderFill.exchTs.getTime() : null))
    .filter((n): n is number => n != null && n >= 0)
    .sort((a, b) => a - b);
  return {
    ...dto,
    positions: positions.map(positionDto),
    trackingErrorBps: slips.length ? round2(slips.reduce((s, n) => s + Math.abs(n), 0) / slips.length) : null,
    medianLatencyMs: lat.length ? lat[lat.length >> 1]! : null,
  };
}

export async function followOrders(userId: string, id: string, q: CursorQuery): Promise<Page<CopiedOrderDto>> {
  const f = await ownFollow(userId, id);
  const rows = await prisma.exchangeOrder.findMany({
    where: { followId: f.id },
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { leaderFill: { select: { exchTs: true } } },
  });
  const more = rows.length > q.limit;
  const items = rows.slice(0, q.limit).map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    qty: Number(o.qty),
    filledQty: Number(o.filledQty),
    reduceOnly: o.reduceOnly,
    status: o.status,
    leaderPrice: num(o.leaderPrice),
    fillPrice: num(o.avgFillPrice),
    slippageBps: num(o.slippageBps),
    realizedPnlUsd: num(o.realizedPnl),
    error: o.error,
    leaderAt: o.leaderFill?.exchTs.toISOString() ?? null,
    requestedAt: o.requestedAt.toISOString(),
    filledAt: o.filledAt?.toISOString() ?? null,
  }));
  return { items, nextCursor: more ? items[items.length - 1]!.id : null };
}

const settingsData = (input: Partial<CreateFollowInput>) => ({
  ...(input.sizingMode !== undefined ? { sizingMode: input.sizingMode } : {}),
  ...(input.sizingValue !== undefined ? { sizingValue: input.sizingValue } : {}),
  ...(input.leverage !== undefined ? { leverage: input.leverage } : {}),
  ...(input.maxPositionUsd !== undefined ? { maxPositionUsd: input.maxPositionUsd } : {}),
  ...(input.dailyLossLimitUsd !== undefined ? { dailyLossLimitUsd: input.dailyLossLimitUsd } : {}),
  ...(input.maxProfitUsd !== undefined ? { maxProfitUsd: input.maxProfitUsd } : {}),
  ...(input.copyReverse !== undefined ? { copyReverse: input.copyReverse } : {}),
});

export async function createFollow(userId: string, input: CreateFollowInput, now = new Date()): Promise<FollowDto> {
  const leader = await prisma.copyLeader.findFirst({ where: { id: input.leaderId, status: { not: 'DELISTED' } }, include: { connection: true } });
  const existing = await prisma.copyFollow.findUnique({ where: { userId_leaderId: { userId, leaderId: input.leaderId } } });
  // An unlisted leader can only be (re)followed by someone already following it.
  if (!leader || (!leader.listed && !(existing && existing.status !== 'STOPPED'))) throw new NotFoundError('Leader not found');
  if (leader.userId === userId) throw new ConflictError("You can't copy your own trades.");
  if (leader.status !== 'VERIFIED') throw new ConflictError('This leader is not taking new followers right now.');
  if (existing && existing.status !== 'STOPPED') throw new ConflictError('You already copy this leader. Edit or resume that follow instead.');

  if (leader.maxFollowers != null) {
    const n = await prisma.copyFollow.count({ where: { leaderId: leader.id, status: LIVE } });
    if (n >= leader.maxFollowers) throw new ConflictError('This leader has reached their follower limit.');
  }

  const conn = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId, status: { not: 'REVOKED' } }, include: { leader: { select: { id: true } } } });
  if (!conn) throw new NotFoundError('Exchange account not found');
  if (conn.exchange !== leader.connection.exchange || conn.environment !== leader.connection.environment) {
    const venue = VENUE_NAME[leader.connection.exchange] ?? leader.connection.exchange;
    throw new ConflictError(`This leader trades on ${venue} (${ENV_NAME[leader.connection.environment]}). Connect a ${venue} ${ENV_NAME[leader.connection.environment]} account to copy them.`);
  }
  if (conn.status !== 'ACTIVE') throw new ConflictError('Reconnect this exchange account first: the exchange rejected its key.');
  if (!conn.canTrade) throw new ConflictError('This API key cannot trade. Enable the Trading permission on the key and reconnect.');
  if (conn.leader) throw new ConflictError("Your leader account can't copy other leaders. Use a different exchange account.");
  // Two follows on one account would net their positions on the exchange and
  // break the per-follow tracking the engine relies on.
  const busy = await prisma.copyFollow.findFirst({ where: { connectionId: conn.id, status: LIVE, NOT: { leaderId: leader.id } }, include: { leader: { select: { displayName: true } } } });
  if (busy) throw new ConflictError(`This account is already copying ${busy.leader.displayName}. Use another account, or stop that follow first.`);

  const base = {
    connectionId: conn.id,
    ...settingsData(input),
    status: 'ACTIVE' as const,
    startedAt: now,
    pausedAt: null,
    pauseReason: null,
    stoppedAt: null,
    residuals: {},
    riskAcceptedAt: now,
    riskVersion: input.riskVersion,
  };
  const row = existing
    ? // Re-follow: same row, fresh start (copy-from-now, residuals and totals reset).
      await prisma.copyFollow.update({
        where: { id: existing.id },
        data: { leverage: null, maxPositionUsd: null, dailyLossLimitUsd: null, maxProfitUsd: null, copyReverse: false, ...base },
        include: followInclude,
      })
    : await prisma.copyFollow.create({ data: { userId, leaderId: leader.id, ...base }, include: followInclude }).catch((err) => {
        if ((err as { code?: string }).code === 'P2002') throw new ConflictError('You already copy this leader.');
        throw err;
      });
  return one(row as FollowRow);
}

export async function updateFollow(userId: string, id: string, input: UpdateFollowInput, now = new Date()): Promise<FollowDto> {
  const f = await ownFollow(userId, id);
  if (f.status === 'STOPPED') throw new ConflictError("This follow is stopped. Start copying again from the leader's page.");

  const data: Record<string, unknown> = settingsData(input);
  // Carried unsent size is in the old sizing's terms; start clean.
  if (input.sizingMode !== undefined && (input.sizingMode !== f.sizingMode || input.sizingValue !== Number(f.sizingValue))) data.residuals = {};

  if (input.action === 'pause' && f.status === 'ACTIVE') Object.assign(data, { status: 'PAUSED', pausedAt: now, pauseReason: 'Paused by you' });
  if (input.action === 'resume' && f.status === 'PAUSED') {
    if (f.connection.status !== 'ACTIVE') throw new ConflictError('Reconnect your exchange account before resuming.');
    if (f.leader.status !== 'VERIFIED') throw new ConflictError("The leader isn't trading on TRADElogs right now, so copying can't resume.");
    Object.assign(data, { status: 'ACTIVE', pausedAt: null, pauseReason: null });
  }
  const updated = (await prisma.copyFollow.update({ where: { id: f.id }, data, include: followInclude })) as FollowRow;
  return one(updated);
}

/**
 * Stop copying. With `closePositions`, close what this follow opened: a
 * reduce-only market order per position, sized to the smaller of our record
 * and the exchange's (so a manual position on the same contract is never
 * touched beyond what we copied). Positions left open are detached from the
 * follow and reported back.
 */
export async function stopFollow(userId: string, id: string, closePositions: boolean, deps: FollowDeps = defaultDeps, now = new Date()): Promise<StopFollowResultDto> {
  const f = await ownFollow(userId, id);
  if (f.status !== 'STOPPED') {
    // Stop first, so the engine places nothing new while we close.
    await prisma.copyFollow.update({ where: { id: f.id }, data: { status: 'STOPPED', stoppedAt: now } });
  }
  const open = await prisma.exchangePosition.findMany({ where: { followId: f.id, positionKey: f.id, closedAt: null, qty: { gt: 0 } } });
  const closes: StopFollowResultDto['closes'] = [];

  if (closePositions && open.length) {
    const conn = await prisma.exchangeConnection.findUniqueOrThrow({ where: { id: f.connectionId } });
    const exchange = deps.adapterFor(conn.exchange, conn.environment);
    let creds;
    let real: Map<string, number> | null = null;
    try {
      creds = credsOf(conn, deps.key());
      real = new Map((await exchange.getPositions(creds)).map((p) => [p.symbol, p.size]));
    } catch (err) {
      const msg = err instanceof ExchangeError ? err.message : 'Could not read your exchange account.';
      for (const p of open) closes.push({ symbol: p.symbol, ok: false, qty: 0, message: msg });
    }
    if (creds && real) {
      for (const p of open) closes.push(await closeOne(p, real.get(p.symbol) ?? 0, f, exchange, creds, deps, now));
    }
  }

  // Whatever is still open is no longer tracked by this follow.
  const left = await prisma.exchangePosition.findMany({ where: { followId: f.id, positionKey: f.id, closedAt: null } });
  for (const p of left) {
    await prisma.exchangePosition.update({ where: { id: p.id }, data: { positionKey: `left:${f.id}:${now.getTime()}`, closedAt: now } });
    if (!closePositions && Number(p.qty) > 0) closes.push({ symbol: p.symbol, ok: false, qty: Number(p.qty), message: 'Left open on your exchange account.' });
  }
  return { follow: await one(await ownFollow(userId, id)), closes };
}

async function closeOne(
  p: ExchangePosition,
  realSize: number,
  f: FollowRow,
  exchange: ReturnType<FollowDeps['adapterFor']>,
  creds: ReturnType<typeof credsOf>,
  deps: FollowDeps,
  now: Date,
): Promise<StopFollowResultDto['closes'][number]> {
  const dir = p.side === 'LONG' ? 1 : -1;
  const tracked = Number(p.qty);
  const qty = Math.sign(realSize) === dir ? Math.min(tracked, Math.abs(realSize)) : 0;
  if (qty <= 0) {
    await prisma.exchangePosition.update({ where: { id: p.id }, data: { qty: 0, closedAt: now, exchangeQty: realSize } });
    return { symbol: p.symbol, ok: true, qty: 0, message: 'Already closed on the exchange.' };
  }
  const side = dir > 0 ? ('SELL' as const) : ('BUY' as const);
  const clientOrderId = `stop:${f.id}:${p.symbol}:${now.getTime()}`;
  const order = await prisma.exchangeOrder.create({
    data: { userId: f.userId, connectionId: f.connectionId, source: 'COPY', followId: f.id, clientOrderId, symbol: p.symbol, side, type: 'MARKET', timeInForce: 'IOC', reduceOnly: true, qty, status: 'PENDING' },
  });
  let result: OrderInfo;
  try {
    result = await exchange.placeOrder(creds, { symbol: p.symbol, side, qty, type: 'MARKET', reduceOnly: true, clientOrderId });
    for (let i = 0; i < 4 && !DONE.has(result.status) && result.exchangeOrderId; i++) {
      await deps.sleep(500);
      result = (await exchange.getOrder(creds, { exchangeOrderId: result.exchangeOrderId })) ?? result;
    }
  } catch (err) {
    const e = err instanceof ExchangeError ? err : null;
    await prisma.exchangeOrder.update({ where: { id: order.id }, data: { status: 'REJECTED', errorCode: e?.code ?? 'UNKNOWN', error: (e?.message ?? String(err)).slice(0, 500) } });
    return { symbol: p.symbol, ok: false, qty: 0, message: e?.message ?? 'The exchange did not accept the close order.' };
  }

  const filled = result.filledQty;
  const avg = result.avgFillPrice;
  const mult = (await exchange.getInstrument(p.symbol).catch(() => null))?.contractMultiplier ?? 1;
  const pnl = filled > 0 && avg != null ? (avg - Number(p.avgEntry)) * dir * filled * mult : 0;
  const status = filled >= qty ? 'FILLED' : filled > 0 ? 'PARTIAL' : result.status === 'REJECTED' ? 'REJECTED' : 'CANCELLED';
  await prisma.exchangeOrder.update({
    where: { id: order.id },
    data: { exchangeOrderId: result.exchangeOrderId, status, filledQty: filled, avgFillPrice: avg, realizedPnl: round2(pnl), submittedAt: now, filledAt: filled > 0 ? new Date() : null },
  });
  // Beyond `qty` the exchange holds nothing of ours, so only qty − filled can remain.
  const remaining = qty - filled;
  await prisma.exchangePosition.update({
    where: { id: p.id },
    data: { qty: Math.max(0, remaining), realizedPnl: { increment: round2(pnl) }, ...(remaining <= 0 ? { closedAt: now, unrealizedPnl: 0 } : {}) },
  });
  if (filled <= 0) return { symbol: p.symbol, ok: false, qty: 0, message: 'The close order did not fill. Close it on the exchange.' };
  if (filled < qty) return { symbol: p.symbol, ok: false, qty: filled, message: `Closed ${filled} of ${qty}; the rest is left open on your exchange account.` };
  return { symbol: p.symbol, ok: true, qty: filled, message: `Closed ${filled} at ${avg}.` };
}
