// Edit the take-profit and stop-loss of an open position (D5). Reads the
// protective orders that are live on the exchange, whoever placed them, and
// replaces them safely: the new order goes in before the old one is cancelled,
// so the position is never left unprotected in between.
import { randomBytes } from 'node:crypto';
import type { ProtectionDto, ProtectionOrderDto, SetProtectionInput, SetProtectionResultDto } from '@tradinjournal/contracts';
import { prisma, type ExchangeConnection } from '@tradinjournal/db';
import { ExchangeError, type Exchange, type OrderInfo } from '@tradinjournal/exchange';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors.js';
import { credsOf, ExchangeRejectedError } from '../exchanges/exchanges.service.js';
import { toTick } from './ticket.plan.js';
import { defaultTradingDeps, type TradingDeps } from './trading.service.js';

type Creds = ReturnType<typeof credsOf>;

async function ownConnection(userId: string, connectionId: string, needTrade: boolean): Promise<ExchangeConnection> {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it on the Exchanges page first.');
  if (needTrade && !c.canTrade) throw new ConflictError('This exchange key is read-only, so it can’t change orders.');
  return c;
}

const isTp = (o: OrderInfo) => o.reduceOnly && (o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT_LIMIT');
const isSl = (o: OrderInfo) => o.reduceOnly && (o.type === 'STOP_MARKET' || o.type === 'STOP_LIMIT');

async function read(userId: string, c: ExchangeConnection, ex: Exchange, creds: Creds, symbol: string): Promise<ProtectionDto> {
  try {
    const [positions, orders, inst, mark] = await Promise.all([ex.getPositions(creds), ex.getOpenOrders(creds, symbol), ex.getInstrument(symbol), ex.getMarkPrice(symbol).catch(() => null)]);
    if (!inst) throw new NotFoundError(`${symbol} isn't a contract on this exchange.`);
    const pos = positions.find((p) => p.symbol === symbol);
    const mine = orders.length
      ? new Set((await prisma.exchangeOrder.findMany({ where: { userId, connectionId: c.id, exchangeOrderId: { in: orders.map((o) => o.exchangeOrderId) } }, select: { exchangeOrderId: true } })).map((r) => r.exchangeOrderId))
      : new Set<string | null>();
    const dto = (o: OrderInfo): ProtectionOrderDto => ({ exchangeOrderId: o.exchangeOrderId, price: o.stopPrice ?? o.limitPrice ?? 0, trail: o.trailAmount ?? null, qty: o.qty - o.filledQty, ours: mine.has(o.exchangeOrderId) });
    const forSymbol = orders.filter((o) => o.symbol === symbol);
    return {
      symbol,
      position: pos?.size ?? 0,
      avgEntry: pos ? pos.avgEntry : null,
      markPrice: mark ?? pos?.markPrice ?? null,
      tickSize: inst.tickSize,
      takeProfit: forSymbol.filter(isTp).map(dto),
      stopLoss: forSymbol.filter(isSl).map(dto),
    };
  } catch (err) {
    throw err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
  }
}

export async function getProtection(userId: string, connectionId: string, symbol: string, deps: TradingDeps = defaultTradingDeps): Promise<ProtectionDto> {
  const c = await ownConnection(userId, connectionId, false);
  return read(userId, c, deps.adapterFor(c.exchange, c.environment), credsOf(c, deps.key()), symbol);
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(4));

export async function setProtection(userId: string, input: SetProtectionInput, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<SetProtectionResultDto> {
  const c = await ownConnection(userId, input.connectionId, true);
  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());
  const cur = await read(userId, c, ex, creds, input.symbol);
  if (cur.position === 0) throw new ConflictError(`There's no open ${input.symbol} position to protect.`);
  const long = cur.position > 0;
  const ref = cur.markPrice ?? cur.avgEntry;
  const qty = Math.abs(cur.position);

  // Check both before touching anything: a half-applied change is worse than none.
  const want: Array<{ kind: 'TP' | 'SL'; price: number | null; trail?: number }> = [];
  const problems: string[] = [];
  if (input.stopLossTrail !== undefined) {
    const trail = toTick(input.stopLossTrail, cur.tickSize);
    if (!(trail > 0)) problems.push(`The trailing distance is smaller than one price step (${cur.tickSize}).`);
    else if (ref != null && trail >= ref * 0.5) problems.push(`A trail of ${fmt(trail)} is more than half the price (${fmt(ref)}); check it isn't a typo.`);
    else want.push({ kind: 'SL', price: null, trail });
  }
  for (const [kind, v] of [['TP', input.takeProfit], ['SL', input.stopLoss]] as const) {
    if (v === undefined) continue;
    if (v === null) { want.push({ kind, price: null }); continue; }
    const p = toTick(v, cur.tickSize);
    if (ref != null) {
      const above = p > ref;
      if (kind === 'TP' && long !== above) problems.push(`For a ${long ? 'long' : 'short'}, the take-profit must be ${long ? 'above' : 'below'} the mark (${fmt(ref)}), or it would trigger straight away.`);
      if (kind === 'SL' && long === above) problems.push(`For a ${long ? 'long' : 'short'}, the stop-loss must be ${long ? 'below' : 'above'} the mark (${fmt(ref)}), or it would trigger straight away.`);
    }
    want.push({ kind, price: p });
  }
  if (problems.length) throw new ValidationError(problems[0]!, { protection: problems });

  const changes: SetProtectionResultDto['changes'] = [];
  for (const w of want) {
    const existing = w.kind === 'TP' ? cur.takeProfit : cur.stopLoss;
    const label = w.kind === 'TP' ? 'Take-profit' : 'Stop-loss';
    if (w.trail !== undefined) {
      if (existing.length === 1 && existing[0]!.trail === w.trail && existing[0]!.qty === qty) {
        changes.push({ kind: 'SL', action: 'kept', ok: true, message: `Already trailing by ${w.trail}.` });
        continue;
      }
      const placed = await placeOne(userId, c, ex, creds, input.symbol, 'SL', long ? 'SELL' : 'BUY', qty, null, now, w.trail);
      if (!placed.ok) {
        changes.push({ kind: 'SL', action: existing.length ? 'replaced' : 'placed', ok: false, message: `Trailing stop wasn't set: ${(placed.error ?? 'unknown error').replace(/\.$/, '')}.${existing.length ? ' The old stop-loss is still in place.' : ''}` });
        continue;
      }
      const r = await cancelAll(userId, c, ex, creds, input.symbol, existing);
      changes.push({ kind: 'SL', action: existing.length ? 'replaced' : 'placed', ok: r.failed === 0, message: `Trailing stop set ${w.trail} behind the price for ${qty} ${qty === 1 ? 'contract' : 'contracts'}.${r.failed ? ` The old stop-loss couldn't be removed; check the Pending tab.` : ''}` });
      continue;
    }
    if (w.price === null) {
      const r = await cancelAll(userId, c, ex, creds, input.symbol, existing);
      changes.push({ kind: w.kind, action: 'removed', ok: r.failed === 0, message: existing.length === 0 ? `There was no ${label.toLowerCase()} to remove.` : r.failed ? `${label}: ${r.failed} couldn't be removed; check the Pending tab.` : `${label} removed.` });
      continue;
    }
    if (existing.length === 1 && existing[0]!.trail == null && existing[0]!.price === w.price && existing[0]!.qty === qty) {
      changes.push({ kind: w.kind, action: 'kept', ok: true, message: `${label} already at ${w.price}.` });
      continue;
    }
    // New first, then the old ones: never a moment without protection.
    const placed = await placeOne(userId, c, ex, creds, input.symbol, w.kind, long ? 'SELL' : 'BUY', qty, w.price, now);
    if (!placed.ok) {
      changes.push({ kind: w.kind, action: existing.length ? 'replaced' : 'placed', ok: false, message: `${label} wasn't changed: ${(placed.error ?? 'unknown error').replace(/\.$/, '')}.${existing.length ? ' The old one is still in place.' : ''}` });
      continue;
    }
    const r = await cancelAll(userId, c, ex, creds, input.symbol, existing);
    changes.push({
      kind: w.kind, action: existing.length ? 'replaced' : 'placed', ok: r.failed === 0,
      message: `${label} set at ${w.price} for ${qty} ${qty === 1 ? 'contract' : 'contracts'}.${r.failed ? ` The old one couldn't be removed; check the Pending tab.` : ''}`,
    });
  }
  return { protection: await read(userId, c, ex, creds, input.symbol), changes };
}

async function placeOne(userId: string, c: ExchangeConnection, ex: Exchange, creds: Creds, symbol: string, kind: 'TP' | 'SL', side: 'BUY' | 'SELL', qty: number, price: number | null, now: Date, trail?: number): Promise<{ ok: boolean; error?: string }> {
  const type = kind === 'TP' ? ('TAKE_PROFIT_MARKET' as const) : ('STOP_MARKET' as const);
  const clientOrderId = `prot:${now.getTime()}:${randomBytes(4).toString('hex')}`;
  const row = await prisma.exchangeOrder.create({ data: { userId, connectionId: c.id, source: 'MANUAL', clientOrderId, symbol, side, type, reduceOnly: true, qty, stopPrice: price, status: 'PENDING' } });
  try {
    const o = await ex.placeOrder(creds, { symbol, side, qty, type, ...(trail ? { trailAmount: trail } : { stopPrice: price! }), reduceOnly: true, clientOrderId });
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { exchangeOrderId: o.exchangeOrderId || null, status: o.status === 'REJECTED' ? 'REJECTED' : 'OPEN', submittedAt: now } });
    return o.status === 'REJECTED' ? { ok: false, error: 'the exchange rejected it' } : { ok: true };
  } catch (err) {
    const e = err instanceof ExchangeError ? err : null;
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'REJECTED', errorCode: e?.code ?? 'UNKNOWN', error: (e?.message ?? String(err)).slice(0, 500) } });
    return { ok: false, error: e?.message ?? 'unknown error' };
  }
}

async function cancelAll(userId: string, c: ExchangeConnection, ex: Exchange, creds: Creds, symbol: string, orders: ProtectionOrderDto[]): Promise<{ failed: number }> {
  let failed = 0;
  for (const o of orders) {
    try {
      await ex.cancelOrder(creds, { symbol, exchangeOrderId: o.exchangeOrderId });
    } catch (err) {
      if (!(err instanceof ExchangeError && err.code === 'ORDER_NOT_FOUND')) { failed++; continue; }
    }
    await prisma.exchangeOrder.updateMany({ where: { userId, connectionId: c.id, exchangeOrderId: o.exchangeOrderId }, data: { status: 'CANCELLED' } });
  }
  return { failed };
}
