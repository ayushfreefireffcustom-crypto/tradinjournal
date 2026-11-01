// Multi-leg option orders (G11) through a connected Delta account. Delta's
// batch endpoint only takes one product, so legs go out one by one; the first
// leg the exchange refuses stops the rest, and nothing already filled is
// unwound without the user deciding to. A repeat of the same requestId
// returns what the first send did.
import type { OptionsBasketDto } from '@tradinjournal/contracts';
import { prisma, type ExchangeConnection } from '@tradinjournal/db';
import { ExchangeError, type OrderInfo } from '@tradinjournal/exchange';
import { ConflictError, ValidationError } from '../../http/errors.js';
import { credsOf, ExchangeRejectedError } from '../exchanges/exchanges.service.js';
import { tradableConnection } from '../trading/ticket.service.js';
import { defaultTradingDeps, orderDtoById, type TradingDeps } from '../trading/trading.service.js';
import { chainOf, defaultOptionsDeps, type OptEnv, type OptionsDeps } from './options.service.js';

const DONE = new Set(['FILLED', 'CANCELLED', 'REJECTED']);
const envOf = (c: ExchangeConnection): OptEnv => (c.environment === 'TESTNET' ? 'testnet' : 'live');
const decimals = (step: number) => Math.max(0, Math.min(10, Math.ceil(-Math.log10(step) - 1e-9)));
const toTick = (v: number, tick: number, up: boolean) => (tick > 0 ? Number(((up ? Math.ceil(v / tick - 1e-9) : Math.floor(v / tick + 1e-9)) * tick).toFixed(decimals(tick))) : v);

export interface PlannedLeg { symbol: string; side: 'BUY' | 'SELL'; qty: number; type: 'LIMIT' | 'MARKET'; limitPrice: number | null; refPrice: number | null; cost: number | null }
export interface BasketPlan { env: OptEnv; connectionLabel: string; legs: PlannedLeg[]; netCost: number | null; availableUsd: number | null; equityUsd: number | null; warnings: string[] }

async function plan(userId: string, b: OptionsBasketDto, deps: TradingDeps, odeps: OptionsDeps): Promise<{ c: ExchangeConnection; plan: BasketPlan }> {
  const c = await tradableConnection(userId, b.connectionId);
  if (c.exchange !== 'DELTA_INDIA') throw new ConflictError('Options trade on Delta Exchange India accounts only.');
  const env = envOf(c);
  const chain = await chainOf(env, b.underlying, odeps);
  const warnings: string[] = [];
  const legs = b.legs.map((l, i): PlannedLeg => {
    const q = chain.quotes.find((x) => x.kind === l.kind && x.strike === l.strike && x.expiryCode === l.expiry);
    if (!q) throw new ValidationError(`Leg ${i + 1}: ${b.underlying} ${l.kind} ${l.strike} ${l.expiry} isn't listed${env === 'testnet' ? ' on testnet' : ''}.`);
    const buy = l.side === 1;
    const touch = buy ? q.ask : q.bid;
    let limitPrice: number | null = null;
    if (b.pricing === 'touch') {
      if (touch == null) throw new ValidationError(`Leg ${i + 1}: ${q.symbol} has no ${buy ? 'ask' : 'bid'} to price against. Use the mark instead.`);
      limitPrice = touch;
    } else if (b.pricing === 'mark') {
      if (q.mark == null) throw new ValidationError(`Leg ${i + 1}: ${q.symbol} has no mark price.`);
      // Round towards the other side so the price is on the tick and no worse than the mark.
      limitPrice = toTick(q.mark, chain.tickSize, !buy);
    }
    const ref = limitPrice ?? touch ?? q.mark;
    return { symbol: q.symbol, side: buy ? 'BUY' : 'SELL', qty: l.qty, type: b.pricing === 'market' ? 'MARKET' : 'LIMIT', limitPrice, refPrice: ref, cost: ref != null ? (buy ? 1 : -1) * l.qty * chain.contractValue * ref : null };
  });
  if (b.pricing === 'market') warnings.push('Market orders on options can fill well away from the mark when the book is thin.');
  if (b.pricing === 'mark') warnings.push('Limit orders at the mark may not fill straight away; unfilled legs wait on the exchange.');
  if (legs.length > 1) warnings.push('Legs are sent one at a time. If one is refused, the rest aren’t sent and what already filled stays open.');
  let account: { equityUsd: number | null; availableUsd: number | null };
  try { account = await deps.adapterFor(c.exchange, c.environment).getAccount(credsOf(c, deps.key())); }
  catch (err) { if (err instanceof ExchangeError) throw new ExchangeRejectedError(err); throw err; }
  const netCost = legs.every((l) => l.cost != null) ? legs.reduce((a, l) => a + l.cost!, 0) : null;
  if (netCost != null && account.availableUsd != null && netCost > account.availableUsd) warnings.push(`It costs more than the ${account.availableUsd.toFixed(2)} USD available on this account.`);
  return { c, plan: { env, connectionLabel: c.label, legs, netCost, availableUsd: account.availableUsd, equityUsd: account.equityUsd, warnings } };
}

export async function previewBasket(userId: string, b: OptionsBasketDto, deps: TradingDeps = defaultTradingDeps, odeps: OptionsDeps = defaultOptionsDeps): Promise<BasketPlan> {
  return (await plan(userId, b, deps, odeps)).plan;
}

export type LegOutcome = 'filled' | 'partial' | 'resting' | 'rejected' | 'unconfirmed' | 'skipped';
const outcomeOf = (o: OrderInfo, wanted: number): LegOutcome => (o.filledQty >= wanted ? 'filled' : o.filledQty > 0 ? 'partial' : o.status === 'OPEN' || o.status === 'PENDING' ? 'resting' : o.status === 'CANCELLED' || o.status === 'REJECTED' ? 'rejected' : 'unconfirmed');
const STATUS: Record<Exclude<LegOutcome, 'skipped'>, 'FILLED' | 'PARTIAL' | 'OPEN' | 'SUBMITTED' | 'REJECTED'> = { filled: 'FILLED', partial: 'PARTIAL', resting: 'OPEN', unconfirmed: 'SUBMITTED', rejected: 'REJECTED' };
const clientId = (userId: string, requestId: string, i: number) => `opt:${userId.slice(-8)}:${requestId}:${i}`;

export interface BasketResult { message: string; legs: Array<{ symbol: string; outcome: LegOutcome; message: string; order: Awaited<ReturnType<typeof orderDtoById>> }> }

export async function placeBasket(userId: string, b: OptionsBasketDto, now = new Date(), deps: TradingDeps = defaultTradingDeps, odeps: OptionsDeps = defaultOptionsDeps): Promise<BasketResult> {
  // Already sent? Return what happened then.
  const earlier = await prisma.exchangeOrder.findMany({ where: { clientOrderId: { startsWith: `opt:${userId.slice(-8)}:${b.requestId}:` } }, orderBy: { clientOrderId: 'asc' } });
  if (earlier.length) {
    if (earlier.some((o) => o.userId !== userId)) throw new ConflictError('That request was already used.');
    return { message: 'This order was already sent; nothing new was placed.', legs: await Promise.all(earlier.map(async (o) => ({ symbol: o.symbol, outcome: (o.status === 'FILLED' ? 'filled' : o.status === 'PARTIAL' ? 'partial' : o.status === 'OPEN' ? 'resting' : o.status === 'REJECTED' ? 'rejected' : 'unconfirmed') as LegOutcome, message: 'Sent earlier.', order: await orderDtoById(o.id) }))) };
  }
  const { c, plan: p } = await plan(userId, b, deps, odeps);
  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());
  const out: BasketResult['legs'] = [];
  let stopped = false;
  for (const [i, l] of p.legs.entries()) {
    if (stopped) { out.push({ symbol: l.symbol, outcome: 'skipped', message: 'Not sent: an earlier leg was refused.', order: null }); continue; }
    const cid = clientId(userId, b.requestId, i);
    const row = await prisma.exchangeOrder.create({
      data: { userId, connectionId: c.id, source: 'MANUAL', clientOrderId: cid, symbol: l.symbol, side: l.side, type: l.type, timeInForce: l.type === 'MARKET' ? 'IOC' : 'GTC', reduceOnly: false, qty: l.qty, limitPrice: l.limitPrice, status: 'PENDING' },
    });
    let res: OrderInfo | null = null;
    let fail: ExchangeError | null = null;
    try {
      res = await ex.placeOrder(creds, { symbol: l.symbol, side: l.side, qty: l.qty, type: l.type, limitPrice: l.limitPrice ?? undefined, tif: l.type === 'MARKET' ? undefined : 'GTC', reduceOnly: false, clientOrderId: cid });
      for (let k = 0; k < 4 && !DONE.has(res.status) && res.exchangeOrderId && res.filledQty < l.qty; k++) {
        await deps.sleep(500);
        res = (await ex.getOrder(creds, { exchangeOrderId: res.exchangeOrderId }).catch(() => null)) ?? res;
      }
    } catch (err) {
      if (err instanceof ExchangeError && err.code !== 'UNAVAILABLE') fail = err;
      else res = await ex.getOrder(creds, { clientOrderId: cid }).catch(() => null);
    }
    if (fail) {
      await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'REJECTED', errorCode: fail.code, error: fail.message.slice(0, 500), submittedAt: now } });
      out.push({ symbol: l.symbol, outcome: 'rejected', message: `Refused: ${fail.message}`, order: await orderDtoById(row.id) });
      stopped = true;
      continue;
    }
    if (!res) {
      await prisma.exchangeOrder.update({ where: { id: row.id }, data: { status: 'SUBMITTED', submittedAt: now } });
      out.push({ symbol: l.symbol, outcome: 'unconfirmed', message: 'Sent, but not confirmed. Check Pending before trying again.', order: await orderDtoById(row.id) });
      stopped = true; // don't build on a leg we can't see
      continue;
    }
    const o = outcomeOf(res, l.qty);
    await prisma.exchangeOrder.update({ where: { id: row.id }, data: { exchangeOrderId: res.exchangeOrderId || null, status: STATUS[o as Exclude<LegOutcome, 'skipped'>], filledQty: res.filledQty, avgFillPrice: res.avgFillPrice, submittedAt: now, filledAt: res.filledQty > 0 ? new Date() : null } });
    const verb = l.side === 'BUY' ? 'Bought' : 'Sold';
    out.push({
      symbol: l.symbol, outcome: o, order: await orderDtoById(row.id),
      message: o === 'filled' ? `${verb} ${res.filledQty}${res.avgFillPrice != null ? ` at ${res.avgFillPrice}` : ''}.` : o === 'partial' ? `${verb} ${res.filledQty} of ${l.qty}; the rest waits on the exchange.` : o === 'resting' ? `Waiting on the exchange at ${l.limitPrice}.` : o === 'rejected' ? 'The exchange didn’t accept it.' : 'Sent, not confirmed yet.',
    });
    if (o === 'rejected') stopped = true;
  }
  const n = out.filter((x) => x.outcome === 'filled').length;
  const message = n === out.length ? `All ${n} leg${n === 1 ? '' : 's'} filled.` : stopped ? `${out.filter((x) => x.outcome !== 'skipped' && x.outcome !== 'rejected').length} of ${out.length} legs went out; the rest stopped at a refused leg.` : `${n} of ${out.length} legs filled; the others wait on the exchange.`;
  return { message, legs: out };
}
