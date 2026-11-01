// Order ticket (D10, D11, D13): quote → preview → place. The plan rules live in
// ticket.plan.ts; this file talks to the exchange and records every order.
import type { OrderTicketInput, PlaceTicketResultDto, TicketOutcome, TicketPreviewDto, TicketQuoteDto } from '@tradinjournal/contracts';
import { prisma, type ExchangeConnection } from '@tradinjournal/db';
import { ExchangeError, type Exchange, type OrderInfo, type OrderType } from '@tradinjournal/exchange';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { credsOf } from '../exchanges/exchanges.service.js';
import { ExchangeRejectedError } from '../exchanges/exchanges.service.js';
import { planTicket } from './ticket.plan.js';
import { defaultTradingDeps, orderDtoById, type TradingDeps } from './trading.service.js';

const DONE = new Set(['FILLED', 'CANCELLED', 'REJECTED']);

async function tradableConnection(userId: string, connectionId: string): Promise<ExchangeConnection> {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it on the Exchanges page first.');
  if (!c.canTrade) throw new ConflictError('This exchange key is read-only, so it can’t place orders.');
  return c;
}

async function quoteFor(c: ExchangeConnection, symbol: string, deps: TradingDeps): Promise<TicketQuoteDto> {
  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());
  try {
    const [inst, mark, account, positions, lev] = await Promise.all([
      ex.getInstrument(symbol),
      ex.getMarkPrice(symbol).catch(() => null),
      ex.getAccount(creds),
      ex.getPositions(creds),
      ex.getLeverage ? ex.getLeverage(creds, symbol).catch(() => null) : Promise.resolve(null),
    ]);
    if (!inst) throw new NotFoundError(`${symbol} isn't a contract on this exchange.`);
    return {
      symbol: inst.symbol,
      live: inst.live,
      markPrice: mark,
      contractMultiplier: inst.contractMultiplier,
      qtyStep: inst.qtyStep,
      minQty: inst.minQty,
      tickSize: inst.tickSize,
      maxLeverage: inst.maxLeverage,
      currentLeverage: lev,
      equityUsd: account.equityUsd,
      availableUsd: account.availableUsd,
      position: positions.find((p) => p.symbol === inst.symbol)?.size ?? 0,
      environment: c.environment,
    };
  } catch (err) {
    throw err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
  }
}

export async function ticketQuote(userId: string, connectionId: string, symbol: string, deps: TradingDeps = defaultTradingDeps): Promise<TicketQuoteDto> {
  return quoteFor(await tradableConnection(userId, connectionId), symbol, deps);
}

export async function previewTicket(userId: string, t: OrderTicketInput, deps: TradingDeps = defaultTradingDeps): Promise<TicketPreviewDto> {
  const c = await tradableConnection(userId, t.connectionId);
  return planTicket(t, await quoteFor(c, t.symbol, deps));
}

const clientIdFor = (userId: string, requestId: string) => `ticket:${userId.slice(-8)}:${requestId}`;

function outcomeOf(o: OrderInfo, wanted: number): TicketOutcome {
  if (o.filledQty >= wanted) return 'filled';
  if (o.filledQty > 0) return 'partial';
  if (o.status === 'OPEN' || o.status === 'PENDING') return 'resting';
  if (o.status === 'CANCELLED' || o.status === 'REJECTED') return 'rejected';
  return 'unconfirmed';
}

const STATUS_OF: Record<TicketOutcome, 'FILLED' | 'PARTIAL' | 'OPEN' | 'SUBMITTED' | 'REJECTED'> = { filled: 'FILLED', partial: 'PARTIAL', resting: 'OPEN', unconfirmed: 'SUBMITTED', rejected: 'REJECTED' };

/** Send a ticket. Re-checks everything first; a repeat of the same requestId returns the first send. */
export async function placeTicket(userId: string, t: OrderTicketInput, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<PlaceTicketResultDto> {
  const clientOrderId = clientIdFor(userId, t.requestId);
  const repeat = await alreadySent(userId, clientOrderId);
  if (repeat) return repeat;

  const c = await tradableConnection(userId, t.connectionId);
  const quote = await quoteFor(c, t.symbol, deps);
  const plan = planTicket(t, quote);
  if (!plan.ok) throw new ValidationError(plan.errors[0]!, { ticket: plan.errors });

  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());

  // Leverage first: an order must never go out at a leverage the user didn't choose.
  if (t.leverage && !plan.reduceOnly && t.leverage !== quote.currentLeverage) {
    try {
      await ex.setLeverage(creds, plan.symbol, t.leverage);
    } catch (err) {
      const msg = err instanceof ExchangeError ? err.message : 'unknown error';
      return { outcome: 'rejected', message: `Couldn't set ${t.leverage}× leverage, so nothing was sent: ${msg}`, order: null, protective: [] };
    }
  }

  const type: OrderType = plan.type;
  let row;
  try {
    row = await prisma.exchangeOrder.create({
      data: {
        userId, connectionId: c.id, source: 'MANUAL', clientOrderId, symbol: plan.symbol, side: plan.side, type,
        timeInForce: plan.type === 'MARKET' ? 'IOC' : plan.tif, reduceOnly: plan.reduceOnly, qty: plan.qty,
        limitPrice: plan.limitPrice, stopPrice: plan.stopPrice, status: 'PENDING',
      },
    });
  } catch (err) {
    // A second send of the same ticket raced the first (double click): the unique id stopped it.
    if ((err as { code?: string }).code === 'P2002') {
      const r2 = await alreadySent(userId, clientOrderId);
      if (r2) return r2;
    }
    throw err;
  }

  let result: OrderInfo | null = null;
  let failure: ExchangeError | null = null;
  try {
    result = await ex.placeOrder(creds, {
      symbol: plan.symbol, side: plan.side, qty: plan.qty, type,
      limitPrice: plan.limitPrice ?? undefined, stopPrice: plan.stopPrice ?? undefined,
      tif: plan.type === 'MARKET' ? undefined : plan.tif ?? undefined, postOnly: plan.postOnly || undefined,
      reduceOnly: plan.reduceOnly, clientOrderId,
    });
    for (let i = 0; i < 4 && plan.type === 'MARKET' && !DONE.has(result.status) && result.exchangeOrderId; i++) {
      await deps.sleep(500);
      result = (await ex.getOrder(creds, { exchangeOrderId: result.exchangeOrderId }).catch(() => null)) ?? result;
    }
  } catch (err) {
    if (err instanceof ExchangeError && err.code !== 'UNAVAILABLE') failure = err;
    else {
      // A timeout or dropped connection: the order may or may not exist. Look it up once by our id.
      result = await ex.getOrder(creds, { clientOrderId }).catch(() => null);
    }
  }

  if (failure) {
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'REJECTED', errorCode: failure.code, error: failure.message.slice(0, 500), submittedAt: now } });
    const hint = failure.isCredentialProblem ? ' Check the key on the Exchanges page.' : '';
    return { outcome: 'rejected', message: `The exchange turned it down: ${failure.message}${hint}`, order: await orderDtoById(row.id), protective: [] };
  }
  if (!result) {
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'SUBMITTED', submittedAt: now } });
    return { outcome: 'unconfirmed', message: 'Sent, but the exchange didn’t confirm it. Check the Open and Pending tabs before trying again.', order: await orderDtoById(row.id), protective: [] };
  }

  const outcome = outcomeOf(result, plan.qty);
  await prisma.exchangeOrder.update({
    where: { id: row.id },
    data: { exchangeOrderId: result.exchangeOrderId || null, status: STATUS_OF[outcome], filledQty: result.filledQty, avgFillPrice: result.avgFillPrice, submittedAt: now, filledAt: result.filledQty > 0 ? new Date() : null },
  });

  // Take-profit / stop-loss for what actually filled, as closing stop orders.
  const protective: PlaceTicketResultDto['protective'] = [];
  if (plan.type === 'MARKET' && result.filledQty > 0) {
    for (const [kind, price] of [['TP', plan.takeProfit], ['SL', plan.stopLoss]] as const) {
      if (!price) continue;
      protective.push(await placeProtective(userId, c, ex, creds, kind, plan.side === 'BUY' ? 'SELL' : 'BUY', plan.symbol, result.filledQty, price, `${clientOrderId}:${kind}`, now));
    }
  }

  const at = result.avgFillPrice != null ? ` at ${result.avgFillPrice}` : '';
  const what = `${plan.side === 'BUY' ? 'Bought' : 'Sold'} ${result.filledQty} ${plan.symbol}${at}`;
  const message =
    outcome === 'filled' ? `${what}.`
    : outcome === 'partial' ? `${what}; the rest (${plan.qty - result.filledQty}) didn't fill.`
    : outcome === 'resting' ? `Order placed: it's waiting on the exchange (Pending tab).`
    : outcome === 'rejected' ? 'The exchange didn’t fill it. Nothing changed.'
    : 'Sent, but not confirmed yet. Check the Open and Pending tabs before trying again.';
  return { outcome, message, order: await orderDtoById(row.id), protective };
}

async function alreadySent(userId: string, clientOrderId: string): Promise<PlaceTicketResultDto | null> {
  const earlier = await prisma.exchangeOrder.findUnique({ where: { clientOrderId } });
  if (!earlier) return null;
  if (earlier.userId !== userId) throw new ConflictError('That request was already used.');
  const outcome: TicketOutcome = earlier.status === 'FILLED' ? 'filled' : earlier.status === 'PARTIAL' ? 'partial' : earlier.status === 'OPEN' ? 'resting' : earlier.status === 'REJECTED' ? 'rejected' : 'unconfirmed';
  return { outcome, message: 'This order was already sent; nothing new was placed.', order: await orderDtoById(earlier.id), protective: [] };
}

async function placeProtective(
  userId: string, c: ExchangeConnection, ex: Exchange, creds: ReturnType<typeof credsOf>,
  kind: 'TP' | 'SL', side: 'BUY' | 'SELL', symbol: string, qty: number, price: number, clientOrderId: string, now: Date,
): Promise<PlaceTicketResultDto['protective'][number]> {
  const type: OrderType = kind === 'TP' ? 'TAKE_PROFIT_MARKET' : 'STOP_MARKET';
  const row = await prisma.exchangeOrder.create({ data: { userId, connectionId: c.id, source: 'MANUAL', clientOrderId, symbol, side, type, reduceOnly: true, qty, stopPrice: price, status: 'PENDING' } });
  const label = kind === 'TP' ? 'Take-profit' : 'Stop-loss';
  try {
    const o = await ex.placeOrder(creds, { symbol, side, qty, type, stopPrice: price, reduceOnly: true, clientOrderId });
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { exchangeOrderId: o.exchangeOrderId || null, status: o.status === 'REJECTED' ? 'REJECTED' : 'OPEN', submittedAt: now } });
    return { kind, ok: o.status !== 'REJECTED', message: `${label} set at ${price}.`, order: await orderDtoById(row.id) };
  } catch (err) {
    const e = err instanceof ExchangeError ? err : null;
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'REJECTED', errorCode: e?.code ?? 'UNKNOWN', error: (e?.message ?? String(err)).slice(0, 500) } });
    return { kind, ok: false, message: `${label} wasn't placed: ${e?.message ?? 'unknown error'}. The position is open without it.`, order: await orderDtoById(row.id) };
  }
}

// Live perpetuals per venue and environment; public data, so one list serves everyone.
const INSTRUMENTS_TTL_MS = 10 * 60_000;
const instrumentCache = new Map<string, { at: number; rows: Array<{ symbol: string; base: string }> }>();

/**
 * The contracts each of the user's active accounts can trade (live
 * perpetuals), so other pages only offer "Trade" where a contract exists.
 * An account whose venue can't be reached comes back with no symbols.
 */
export async function tradableInstruments(userId: string, now = Date.now(), deps: TradingDeps = defaultTradingDeps) {
  const conns = await prisma.exchangeConnection.findMany({ where: { userId, status: 'ACTIVE', canTrade: true }, orderBy: { createdAt: 'asc' } });
  return Promise.all(conns.map(async (c) => {
    const key = `${c.exchange}:${c.environment}`;
    let hit = instrumentCache.get(key);
    if (!hit || now - hit.at > INSTRUMENTS_TTL_MS) {
      try {
        const list = await deps.adapterFor(c.exchange, c.environment).listInstruments();
        hit = { at: now, rows: list.filter((i) => i.kind === 'PERPETUAL' && i.live).map((i) => ({ symbol: i.symbol, base: i.baseAsset })) };
        instrumentCache.set(key, hit);
      } catch {
        hit = instrumentCache.get(key); // stale beats nothing
      }
    }
    return { connectionId: c.id, label: c.label, environment: c.environment, instruments: hit?.rows ?? [] };
  }));
}
