// Trading desk (Part D, first slice): a user's live positions, open orders and
// recent closed trades across their exchange connections (D1), manual closes,
// full or partial (D3, D4), and the log of every order we sent (D12). The
// exchange is the truth for what's open; our order table is the truth for what
// we sent and what came back.
import { randomBytes } from 'node:crypto';
import { env } from '@tradinjournal/config';
import { prisma, type ExchangeConnection, type Prisma } from '@tradinjournal/db';
import type {
  ClosePositionInput,
  ClosePositionResultDto,
  DeskClosedTradeDto,
  DeskOrderDto,
  DeskOrdersQuery,
  DeskOverviewDto,
  DeskPendingOrderDto,
  DeskPositionDto,
} from '@tradinjournal/contracts';
import { closedTrades, ExchangeError, type Exchange, type OrderInfo } from '@tradinjournal/exchange';
import { requireEncryptionKey } from '@tradinjournal/secrets';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { adapterFor } from '../exchanges/exchanges.adapters.js';
import { credsOf, ExchangeRejectedError, type ExchangeDeps } from '../exchanges/exchanges.service.js';

export type TradingDeps = Pick<ExchangeDeps, 'adapterFor' | 'key'> & { sleep: (ms: number) => Promise<void>; timeoutMs?: number };
const defaultDeps: TradingDeps = {
  adapterFor,
  key: () => requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const DAY = 24 * 3600_000;
const CLOSED_WINDOW_MS = 30 * DAY;
const HISTORY_TTL_MS = 60_000;
const DONE = new Set(['FILLED', 'CANCELLED', 'REJECTED']);
const historyCache = new Map<string, { at: number; rows: DeskClosedTradeDto[] }>();
/** After a close, the exchange's fill history lags a few seconds: read it fresh for a while instead of caching a stale copy. */
const FRESH_AFTER_CLOSE_MS = 30_000;
const freshUntil = new Map<string, number>();
const forgetHistory = (connectionId: string, now: Date) => { historyCache.delete(connectionId); freshUntil.set(connectionId, now.getTime() + FRESH_AFTER_CLOSE_MS); };

/** A copy is managing this, so closing it by hand needs an explicit yes. */
export class CopyManagedError extends AppError {
  constructor(leaderName: string) {
    super(409, 'COPY_MANAGED', `This position is copied from ${leaderName}. Closing it by hand takes it out of that copy's control.`);
  }
}

const ref = (c: Pick<ExchangeConnection, 'id' | 'label' | 'exchange' | 'environment'>) => ({ connectionId: c.id, connectionLabel: c.label, exchange: c.exchange, environment: c.environment });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new ExchangeError('UNAVAILABLE', 'The exchange took too long to answer.')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Positions, open orders and recent closed trades from every active connection, read in parallel. */
export async function deskOverview(userId: string, now = new Date(), deps: TradingDeps = defaultDeps): Promise<DeskOverviewDto> {
  const conns = await prisma.exchangeConnection.findMany({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  const ms = deps.timeoutMs ?? 8000;
  const [copied, rejected] = await Promise.all([
    prisma.exchangePosition.findMany({
      where: { connectionId: { in: conns.map((c) => c.id) }, closedAt: null, followId: { not: null }, follow: { status: { in: ['ACTIVE', 'PAUSED'] } } },
      select: { connectionId: true, symbol: true, followId: true, follow: { select: { leader: { select: { displayName: true } } } } },
    }),
    prisma.exchangeOrder.count({ where: { userId, status: 'REJECTED', requestedAt: { gte: new Date(now.getTime() - CLOSED_WINDOW_MS) } } }),
  ]);
  const out: DeskOverviewDto = { positions: [], pending: [], closed: [], counts: { open: 0, pending: 0, closed: 0, rejected }, errors: [] };
  await Promise.all(conns.map(async (c) => {
    const ex = deps.adapterFor(c.exchange, c.environment);
    const creds = credsOf(c, deps.key());
    try {
      const [positions, orders] = await Promise.all([withTimeout(ex.getPositions(creds), ms), withTimeout(ex.getOpenOrders(creds), ms)]);
      const closed = await withTimeout(closedHistory(c, ex, creds, positions, now), ms);
      for (const p of positions) {
        if (p.size === 0) continue;
        const cp = copied.find((x) => x.connectionId === c.id && x.symbol === p.symbol);
        out.positions.push({
          ...ref(c),
          symbol: p.symbol,
          side: p.size > 0 ? 'LONG' : 'SHORT',
          size: Math.abs(p.size),
          avgEntry: p.avgEntry,
          markPrice: p.markPrice,
          unrealizedPnl: p.unrealizedPnl,
          liquidationPrice: p.liquidationPrice,
          copiedFrom: cp?.followId ? { followId: cp.followId, leaderName: cp.follow?.leader.displayName ?? 'a leader' } : null,
        } satisfies DeskPositionDto);
      }
      for (const o of orders) out.pending.push(pendingDto(c, o));
      out.closed.push(...closed);
    } catch (err) {
      out.errors.push({ ...ref(c), message: err instanceof ExchangeError ? err.message : 'Could not read this account right now.' });
    }
  }));
  out.positions.sort((a, b) => a.connectionLabel.localeCompare(b.connectionLabel) || a.symbol.localeCompare(b.symbol));
  out.pending.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  out.closed.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  out.counts.open = out.positions.length;
  out.counts.pending = out.pending.length;
  out.counts.closed = out.closed.length;
  return out;
}

function pendingDto(c: ExchangeConnection, o: OrderInfo): DeskPendingOrderDto {
  return {
    ...ref(c),
    exchangeOrderId: o.exchangeOrderId,
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: o.qty,
    filledQty: o.filledQty,
    limitPrice: o.limitPrice,
    stopPrice: o.stopPrice,
    reduceOnly: o.reduceOnly,
    createdAt: o.createdAt?.toISOString() ?? null,
  };
}

/**
 * Signed position after each fill, walked back from the position held now. The
 * fill history alone can't say what was already open when the window starts;
 * the current size can. Fills are newest first. A fill that already carries the
 * venue's own figure resets the walk to it.
 */
export function anchorPositions<T extends { symbol: string; side: 'BUY' | 'SELL'; qty: number; positionAfter?: number }>(newestFirst: T[], current: Array<{ symbol: string; size: number }>): Array<T & { positionAfter: number }> {
  const running = new Map(current.map((p) => [p.symbol, p.size]));
  return newestFirst.map((f) => {
    const after = f.positionAfter ?? running.get(f.symbol) ?? 0;
    running.set(f.symbol, after - (f.side === 'BUY' ? f.qty : -f.qty));
    return { ...f, positionAfter: after };
  });
}

/** Fills younger than this may not be reflected in the position yet (Delta lags ~10 s), so the result isn't cached. */
const SETTLE_MS = 30_000;

/** Round trips closed in the last 30 days, from the exchange's own fill history. Cached a minute per account. */
async function closedHistory(c: ExchangeConnection, ex: Exchange, creds: ReturnType<typeof credsOf>, current: Array<{ symbol: string; size: number }>, now: Date): Promise<DeskClosedTradeDto[]> {
  const hit = historyCache.get(c.id);
  const fresh = (freshUntil.get(c.id) ?? 0) > now.getTime();
  if (hit && !fresh && now.getTime() - hit.at < HISTORY_TTL_MS) return hit.rows;
  const since = new Date(now.getTime() - CLOSED_WINDOW_MS);
  const newestFirst = (await ex.getFills(creds, { since, limit: 1000 })).filter((f) => f.timestamp >= since).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const fills = anchorPositions(newestFirst, current).reverse();
  const mults = new Map<string, number | null>();
  for (const f of fills) if (!mults.has(f.symbol)) mults.set(f.symbol, f.contractMultiplier ?? (await ex.getInstrument(f.symbol).catch(() => null))?.contractMultiplier ?? null);
  const rows = closedTrades(
    fills.map((f) => ({ symbol: f.symbol, side: f.side, qty: f.qty, price: f.price, positionAfter: f.positionAfter, ts: f.timestamp })),
    (s) => mults.get(s) ?? null,
  ).map((t) => ({ ...ref(c), ...t, pnlUsd: Math.round(t.pnlUsd * 100) / 100, openedAt: t.openedAt.toISOString(), closedAt: t.closedAt.toISOString() }));
  if (!newestFirst.length || now.getTime() - newestFirst[0]!.timestamp.getTime() > SETTLE_MS) historyCache.set(c.id, { at: now.getTime(), rows });
  return rows;
}

const orderInclude = { connection: { select: { id: true, label: true, exchange: true, environment: true } }, follow: { select: { leader: { select: { displayName: true } } } } } as const;
type OrderRow = Prisma.ExchangeOrderGetPayload<{ include: typeof orderInclude }>;

function orderDto(o: OrderRow): DeskOrderDto {
  return {
    ...ref(o.connection),
    id: o.id,
    source: o.source,
    leaderName: o.follow?.leader.displayName ?? null,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    reduceOnly: o.reduceOnly,
    qty: Number(o.qty),
    filledQty: Number(o.filledQty),
    avgFillPrice: o.avgFillPrice != null ? Number(o.avgFillPrice) : null,
    status: o.status,
    error: o.error,
    exchangeOrderId: o.exchangeOrderId,
    clientOrderId: o.clientOrderId,
    requestedAt: o.requestedAt.toISOString(),
    filledAt: o.filledAt?.toISOString() ?? null,
  };
}

/** Everything we sent (or decided not to send), newest first (D12). */
export async function deskOrders(userId: string, q: DeskOrdersQuery): Promise<{ items: DeskOrderDto[]; nextCursor: string | null }> {
  const status: Prisma.ExchangeOrderWhereInput['status'] =
    q.status === 'rejected' ? 'REJECTED' : q.status === 'filled' ? { in: ['FILLED', 'PARTIAL'] } : q.status === 'open' ? { in: ['PENDING', 'SUBMITTED', 'OPEN'] } : undefined;
  const rows = await prisma.exchangeOrder.findMany({
    where: { userId, ...(status ? { status } : {}), ...(q.source ? { source: q.source } : {}) },
    include: orderInclude,
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  return { items: page.map(orderDto), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
}

/** Close all or part of a position with a reduce-only market order (D3, D4). */
export async function closePosition(userId: string, input: ClosePositionInput, now = new Date(), deps: TradingDeps = defaultDeps): Promise<ClosePositionResultDto> {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it on the Exchanges page first.');
  if (!c.canTrade) throw new ConflictError('This exchange key is read-only, so it can’t close positions.');
  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());

  let size: number;
  let step = 1;
  let min = 1;
  try {
    const [positions, inst] = await Promise.all([ex.getPositions(creds), ex.getInstrument(input.symbol)]);
    size = positions.find((p) => p.symbol === input.symbol)?.size ?? 0;
    if (inst) { step = inst.qtyStep || 1; min = inst.minQty || step; }
  } catch (err) {
    throw err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
  }
  if (size === 0) throw new ConflictError(`There's no open ${input.symbol} position on this account.`);

  const copied = await prisma.exchangePosition.findFirst({
    where: { connectionId: c.id, symbol: input.symbol, closedAt: null, followId: { not: null }, follow: { status: { in: ['ACTIVE', 'PAUSED'] } } },
    select: { follow: { select: { leader: { select: { displayName: true } } } } },
  });
  if (copied && !input.confirmCopied) throw new CopyManagedError(copied.follow?.leader.displayName ?? 'a leader');

  const want = Math.min(input.qty ?? Math.abs(size), Math.abs(size));
  const qty = Math.floor(want / step + 1e-9) * step;
  if (qty < min) throw new ValidationError(`The smallest amount you can close is ${min} ${min === 1 ? 'contract' : 'contracts'}.`);
  const side = size > 0 ? ('SELL' as const) : ('BUY' as const);
  const clientOrderId = `manual:${now.getTime()}:${randomBytes(4).toString('hex')}`;
  const row = await prisma.exchangeOrder.create({
    data: { userId, connectionId: c.id, source: 'MANUAL', clientOrderId, symbol: input.symbol, side, type: 'MARKET', timeInForce: 'IOC', reduceOnly: true, qty, status: 'PENDING' },
  });

  let result: OrderInfo;
  try {
    result = await ex.placeOrder(creds, { symbol: input.symbol, side, qty, type: 'MARKET', reduceOnly: true, clientOrderId });
    for (let i = 0; i < 4 && !DONE.has(result.status) && result.exchangeOrderId; i++) {
      await deps.sleep(500);
      result = (await ex.getOrder(creds, { exchangeOrderId: result.exchangeOrderId }).catch(() => null)) ?? result;
    }
  } catch (err) {
    const e = err instanceof ExchangeError ? err : null;
    const saved = await prisma.exchangeOrder.update({
      where: { id: row.id },
      data: { status: 'REJECTED', errorCode: e?.code ?? 'UNKNOWN', error: (e?.message ?? String(err)).slice(0, 500) },
      include: orderInclude,
    });
    forgetHistory(c.id, now);
    return { order: orderDto(saved), message: `The exchange didn't accept the close: ${e?.message ?? 'unknown error'}` };
  }

  const filled = result.filledQty;
  const status = filled >= qty ? 'FILLED' : filled > 0 ? 'PARTIAL' : result.status === 'REJECTED' ? 'REJECTED' : result.status === 'CANCELLED' ? 'CANCELLED' : 'SUBMITTED';
  const saved = await prisma.exchangeOrder.update({
    where: { id: row.id },
    data: { exchangeOrderId: result.exchangeOrderId || null, status, filledQty: filled, avgFillPrice: result.avgFillPrice, submittedAt: now, filledAt: filled > 0 ? new Date() : null },
    include: orderInclude,
  });
  forgetHistory(c.id, now);
  const price = result.avgFillPrice != null ? ` at ${result.avgFillPrice}` : '';
  const message =
    status === 'FILLED' ? `Closed ${filled} ${input.symbol}${price}.`
    : status === 'PARTIAL' ? `Closed ${filled} of ${qty} ${input.symbol}${price}; the rest didn't fill.`
    : status === 'SUBMITTED' ? 'Sent to the exchange; it hasn’t confirmed yet. Check Open in a moment.'
    : 'The exchange didn’t fill the close. Nothing changed.';
  return { order: orderDto(saved), message };
}
