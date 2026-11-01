// Trading desk (Part D, first slice): a user's live positions, open orders and
// recent closed trades across their exchange connections (D1), manual closes,
// full or partial (D3, D4), and the log of every order we sent (D12). The
// exchange is the truth for what's open; our order table is the truth for what
// we sent and what came back.
import { randomBytes } from 'node:crypto';
import { env } from '@tradinjournal/config';
import { prisma, type ExchangeConnection, type Prisma } from '@tradinjournal/db';
import type {
  CancelOrderInput,
  CloseManyInput,
  CloseManyResultDto,
  DeskOrderFilters,
  DeskOrdersSummaryDto,
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
export const defaultTradingDeps: TradingDeps = {
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
export async function deskOverview(userId: string, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<DeskOverviewDto> {
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
    try {
      // Inside the try: one account whose keys can't be read mustn't take the whole desk down.
      const ex = deps.adapterFor(c.exchange, c.environment);
      const creds = credsOf(c, deps.key());
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

/** The order-log filters as a query, always scoped to the user (D2). */
function orderWhere(userId: string, f: DeskOrderFilters): Prisma.ExchangeOrderWhereInput {
  const status: Prisma.ExchangeOrderWhereInput['status'] =
    f.status === 'rejected' ? 'REJECTED' : f.status === 'filled' ? { in: ['FILLED', 'PARTIAL'] } : f.status === 'open' ? { in: ['PENDING', 'SUBMITTED', 'OPEN'] } : undefined;
  return {
    userId,
    ...(status ? { status } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.side ? { side: f.side } : {}),
    ...(f.symbol ? { symbol: f.symbol } : {}),
    ...(f.connectionId ? { connectionId: f.connectionId } : {}),
    ...(f.from || f.to ? { requestedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q ? { OR: [{ exchangeOrderId: f.q }, { clientOrderId: f.q }, { id: f.q }] } : {}),
  };
}

/** One order as a log row; null if it isn't there. */
export async function orderDtoById(id: string): Promise<DeskOrderDto | null> {
  const o = await prisma.exchangeOrder.findUnique({ where: { id }, include: orderInclude });
  return o ? orderDto(o) : null;
}

/** Everything we sent (or decided not to send), newest first (D12). */
export async function deskOrders(userId: string, q: DeskOrdersQuery): Promise<{ items: DeskOrderDto[]; nextCursor: string | null }> {
  const rows = await prisma.exchangeOrder.findMany({
    where: orderWhere(userId, q),
    include: orderInclude,
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  return { items: page.map(orderDto), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
}

/** Counts and filled notional for the same filters as the log (D12 KPIs). */
export async function deskOrdersSummary(userId: string, f: DeskOrderFilters, deps: TradingDeps = defaultTradingDeps): Promise<DeskOrdersSummaryDto> {
  const where = orderWhere(userId, f);
  const [byStatus, filled] = await Promise.all([
    prisma.exchangeOrder.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.exchangeOrder.findMany({
      where: { ...where, filledQty: { gt: 0 }, avgFillPrice: { not: null } },
      select: { symbol: true, filledQty: true, avgFillPrice: true, connection: { select: { exchange: true, environment: true } } },
      take: 20_000,
    }),
  ]);
  const n = (...st: string[]) => byStatus.filter((r) => st.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  // Notional = contracts × price × contract size, so it needs each contract's size.
  const mults = new Map<string, number | null>();
  let notional: number | null = 0;
  for (const o of filled) {
    const key = `${o.connection.exchange}:${o.connection.environment}:${o.symbol}`;
    if (!mults.has(key)) {
      const inst = await deps.adapterFor(o.connection.exchange, o.connection.environment).getInstrument(o.symbol).catch(() => null);
      mults.set(key, inst?.contractMultiplier ?? null);
    }
    const m = mults.get(key);
    if (m == null) { notional = null; break; }
    notional += Number(o.filledQty) * Number(o.avgFillPrice) * m;
  }
  return {
    placed: n('PENDING', 'SUBMITTED', 'OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'),
    filled: n('FILLED'),
    partial: n('PARTIAL'),
    rejected: n('REJECTED'),
    inFlight: n('PENDING', 'SUBMITTED', 'OPEN'),
    skipped: n('SKIPPED'),
    cancelled: n('CANCELLED', 'EXPIRED'),
    filledNotionalUsd: notional == null ? null : Math.round(notional * 100) / 100,
  };
}

const CSV_MAX = 5000;
/** A cell for a spreadsheet: quoted, and never read as a formula (=, +, -, @ lead to code in Excel/Sheets). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The filtered log as CSV, newest first, at most 5000 rows (D2). */
export async function deskOrdersCsv(userId: string, f: DeskOrderFilters): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const rows = await prisma.exchangeOrder.findMany({ where: orderWhere(userId, f), include: orderInclude, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: CSV_MAX + 1 });
  const head = ['sent_at_utc', 'account', 'environment', 'source', 'leader', 'symbol', 'side', 'type', 'reduce_only', 'qty', 'filled_qty', 'avg_fill_price', 'status', 'error', 'exchange_order_id', 'client_order_id', 'filled_at_utc'];
  const lines = rows.slice(0, CSV_MAX).map((r) => {
    const o = orderDto(r);
    return [o.requestedAt, o.connectionLabel, o.environment, o.source, o.leaderName, o.symbol, o.side, o.type, o.reduceOnly, o.qty, o.filledQty, o.avgFillPrice, o.status, o.error, o.exchangeOrderId, o.clientOrderId, o.filledAt].map(csvCell).join(',');
  });
  return { csv: [head.join(','), ...lines].join('\r\n') + '\r\n', rows: lines.length, truncated: rows.length > CSV_MAX };
}

/**
 * Close several positions, one after another (D7, D8). Each result stands on its
 * own: one failure doesn't stop the rest, and nothing is retried.
 */
export async function closeMany(userId: string, input: CloseManyInput, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<CloseManyResultDto> {
  const seen = new Set<string>();
  const results: CloseManyResultDto['results'] = [];
  for (const it of input.items) {
    const key = `${it.connectionId}:${it.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const r = await closePosition(userId, { connectionId: it.connectionId, symbol: it.symbol, confirmCopied: input.confirmCopied }, now, deps);
      const ok = ['FILLED', 'PARTIAL', 'SUBMITTED'].includes(r.order.status);
      results.push({ ...it, ok, message: r.message, order: r.order });
    } catch (err) {
      results.push({ ...it, ok: false, message: err instanceof Error ? err.message : 'Could not close this one.', order: null });
    }
  }
  return { results };
}

const PROTECTIVE_TYPES = ['STOP_MARKET', 'STOP_LIMIT', 'TAKE_PROFIT_MARKET', 'TAKE_PROFIT_LIMIT'] as const;

/** Cancel the reduce-only take-profit / stop-loss orders we placed on a symbol that is now flat. */
async function cancelProtective(userId: string, c: ExchangeConnection, ex: Exchange, creds: ReturnType<typeof credsOf>, symbol: string): Promise<{ cancelled: number; failed: number }> {
  const rows = await prisma.exchangeOrder.findMany({
    where: { userId, connectionId: c.id, symbol, reduceOnly: true, type: { in: [...PROTECTIVE_TYPES] }, status: { in: ['OPEN', 'PENDING', 'SUBMITTED'] }, exchangeOrderId: { not: null } },
  });
  let cancelled = 0;
  let failed = 0;
  for (const o of rows) {
    try {
      await ex.cancelOrder(creds, { symbol, exchangeOrderId: o.exchangeOrderId! });
      await prisma.exchangeOrder.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
      cancelled++;
    } catch (err) {
      // Already gone on the exchange (triggered or cancelled there): mark it so it isn't retried forever.
      if (err instanceof ExchangeError && err.code === 'ORDER_NOT_FOUND') {
        await prisma.exchangeOrder.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
      } else failed++;
    }
  }
  return { cancelled, failed };
}

/** Cancel a waiting order. Our log is updated when the order is one we sent. */
export async function cancelOrder(userId: string, input: CancelOrderInput, deps: TradingDeps = defaultTradingDeps): Promise<{ message: string; status: string }> {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: input.connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it on the Exchanges page first.');
  if (!c.canTrade) throw new ConflictError('This exchange key is read-only, so it can’t cancel orders.');
  const ex = deps.adapterFor(c.exchange, c.environment);
  let o: OrderInfo;
  try {
    o = await ex.cancelOrder(credsOf(c, deps.key()), { symbol: input.symbol, exchangeOrderId: input.exchangeOrderId });
  } catch (err) {
    throw err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
  }
  await prisma.exchangeOrder.updateMany({
    where: { connectionId: c.id, exchangeOrderId: input.exchangeOrderId, userId },
    data: { status: o.filledQty > 0 ? 'PARTIAL' : 'CANCELLED', filledQty: o.filledQty, ...(o.avgFillPrice != null ? { avgFillPrice: o.avgFillPrice } : {}) },
  });
  historyCache.delete(c.id);
  return { status: o.status, message: o.filledQty > 0 ? `Cancelled; ${o.filledQty} had already filled.` : 'Order cancelled.' };
}

/** Close all or part of a position with a reduce-only market order (D3, D4). */
export async function closePosition(userId: string, input: ClosePositionInput, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<ClosePositionResultDto> {
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
  // A fully closed position mustn't leave its take-profit / stop-loss behind: a stale stop
  // could close a position opened later. Only orders TRADElogs placed are touched.
  const flat = filled >= Math.abs(size);
  const cleaned = flat ? await cancelProtective(userId, c, ex, creds, input.symbol) : { cancelled: 0, failed: 0 };
  const tail = cleaned.cancelled ? ` Its ${cleaned.cancelled === 1 ? 'take-profit/stop-loss order was' : `${cleaned.cancelled} take-profit/stop-loss orders were`} cancelled.` : '';
  const warn = cleaned.failed ? ` ${cleaned.failed === 1 ? 'One take-profit/stop-loss order' : `${cleaned.failed} take-profit/stop-loss orders`} couldn't be cancelled: check the Pending tab.` : '';
  const price = result.avgFillPrice != null ? ` at ${result.avgFillPrice}` : '';
  const message =
    status === 'FILLED' ? `Closed ${filled} ${input.symbol}${price}.${tail}${warn}`
    : status === 'PARTIAL' ? `Closed ${filled} of ${qty} ${input.symbol}${price}; the rest didn't fill.`
    : status === 'SUBMITTED' ? 'Sent to the exchange; it hasn’t confirmed yet. Check Open in a moment.'
    : 'The exchange didn’t fill the close. Nothing changed.';
  return { order: orderDto(saved), message };
}
