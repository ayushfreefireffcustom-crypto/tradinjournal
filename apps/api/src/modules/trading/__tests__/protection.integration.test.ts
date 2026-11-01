// Edit TP/SL on an open position (D5) with a stateful fake exchange.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeError, type Exchange, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
const KEY = randomBytes(32);

class Book {
  position = 2;
  open: OrderInfo[] = [];
  failPlace: ExchangeError | null = null;
  failCancel = false;
  n = 0;
  add(type: OrderInfo['type'], price: number, qty = 2, id = `x${++this.n}`, trail: number | null = null): OrderInfo {
    const o: OrderInfo = { exchangeOrderId: id, clientOrderId: null, symbol: 'BTCUSD', side: this.position > 0 ? 'SELL' : 'BUY', type, status: 'PENDING', qty, filledQty: 0, avgFillPrice: null, limitPrice: null, stopPrice: price, trailAmount: trail, reduceOnly: true, createdAt: new Date() };
    this.open.push(o);
    return o;
  }
  ex(): Exchange {
    return {
      getPositions: async () => (this.position ? [{ symbol: 'BTCUSD', size: this.position, avgEntry: 70_000, markPrice: 70_000, unrealizedPnl: 0, liquidationPrice: null, leverage: null }] : []),
      getOpenOrders: async () => this.open,
      getInstrument: async () => ({ symbol: 'BTCUSD', contractMultiplier: 0.001, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 100, live: true }),
      getMarkPrice: async () => 70_000,
      placeOrder: async (_c: unknown, o: PlaceOrderRequest) => {
        if (this.failPlace) throw this.failPlace;
        // A trailing stop starts at the mark minus (long) or plus (short) the trail.
        if (o.trailAmount) return this.add(o.type, o.side === 'SELL' ? 70_000 - o.trailAmount : 70_000 + o.trailAmount, o.qty, undefined, o.trailAmount);
        return this.add(o.type, o.stopPrice!, o.qty);
      },
      cancelOrder: async (_c: unknown, ref: { exchangeOrderId: string }) => {
        if (this.failCancel) throw new ExchangeError('UNAVAILABLE', 'timeout');
        const i = this.open.findIndex((o) => o.exchangeOrderId === ref.exchangeOrderId);
        if (i < 0) throw new ExchangeError('ORDER_NOT_FOUND', 'The exchange has no such order.');
        const [o] = this.open.splice(i, 1);
        return { ...o!, status: 'CANCELLED' };
      },
    } as unknown as Exchange;
  }
}

describe.skipIf(!local)('position protection (TP/SL edit)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../protection.service.js');
  const tag = `prot${Date.now()}`;
  const book = new Book();
  const deps = { adapterFor: () => book.ex(), key: () => KEY, sleep: async () => undefined };
  let me = '';
  let conn = '';
  let theirs = '';
  let ro = '';

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../protection.service.js');
    const { encryptWithKey } = await import('@tradinjournal/secrets');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    const other = (await prisma.user.create({ data: { name: 'o', email: `${tag}-o@trading.test` } })).id;
    const mk = async (userId: string, label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey('k', KEY), apiSecretEnc: encryptWithKey('s', KEY), keyLast4: 'abcd', keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conn = await mk(me, 'Main');
    ro = await mk(me, 'RO', { canTrade: false });
    theirs = await mk(other, 'Theirs');
  });
  beforeEach(() => Object.assign(book, { position: 2, open: [], failPlace: null, failCancel: false }));
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('reads TP and SL live on the exchange, including ones placed elsewhere', async () => {
    book.add('TAKE_PROFIT_MARKET', 72_000, 2, 'external-tp');
    book.add('STOP_MARKET', 69_000);
    book.open.push({ ...book.add('LIMIT', 60_000), reduceOnly: false }); // a plain limit isn't protection
    book.open = book.open.filter((o, i, a) => a.findIndex((x) => x.exchangeOrderId === o.exchangeOrderId) === i);
    const p = await svc.getProtection(me, conn, 'BTCUSD', deps);
    expect(p).toMatchObject({ position: 2, markPrice: 70_000, tickSize: 0.5 });
    expect(p.takeProfit).toEqual([{ exchangeOrderId: 'external-tp', price: 72_000, trail: null, qty: 2, ours: false }]);
    expect(p.stopLoss.map((o) => o.price)).toEqual([69_000]);
    // Reading works on a read-only key; not on someone else's.
    await expect(svc.getProtection(me, ro, 'BTCUSD', deps)).resolves.toBeTruthy();
    await expect(svc.getProtection(me, theirs, 'BTCUSD', deps)).rejects.toThrow(/not found/i);
  });

  it('adds a TP and SL for the whole position, rounded to the tick', async () => {
    const r = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', takeProfit: 72_000.3, stopLoss: 69_000 }, new Date(), deps);
    expect(r.changes.map((c) => [c.kind, c.action, c.ok])).toEqual([['TP', 'placed', true], ['SL', 'placed', true]]);
    expect(r.protection.takeProfit).toEqual([expect.objectContaining({ price: 72_000.5, qty: 2, ours: true })]);
    expect(r.protection.stopLoss).toEqual([expect.objectContaining({ price: 69_000, qty: 2, ours: true })]);
  });

  it('moves a stop by placing the new one before cancelling the old', async () => {
    book.add('STOP_MARKET', 69_000, 2, 'old-sl');
    const r = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 69_500 }, new Date(), deps);
    expect(r.changes[0]).toMatchObject({ kind: 'SL', action: 'replaced', ok: true });
    expect(r.protection.stopLoss.map((o) => o.price)).toEqual([69_500]);
    expect(book.open.some((o) => o.exchangeOrderId === 'old-sl')).toBe(false);
    // Untouched kinds stay as they are.
    expect(r.changes.length).toBe(1);
  });

  it('keeps the old stop if the new one is refused', async () => {
    book.add('STOP_MARKET', 69_000, 2, 'old-sl');
    book.failPlace = new ExchangeError('REJECTED', 'The exchange rejected the order.');
    const r = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 69_800 }, new Date(), deps);
    expect(r.changes[0]).toMatchObject({ ok: false });
    expect(r.changes[0]!.message).toMatch(/wasn't changed: The exchange rejected the order\. The old one is still in place/);
    expect(book.open.map((o) => o.exchangeOrderId)).toEqual(['old-sl']);
  });

  it('removes a TP, leaves an identical one alone, and reports a cancel it could not do', async () => {
    book.add('TAKE_PROFIT_MARKET', 72_000, 2, 'tp1');
    book.add('STOP_MARKET', 69_000, 2, 'sl1');
    const same = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 69_000 }, new Date(), deps);
    expect(same.changes[0]).toMatchObject({ action: 'kept', ok: true });
    const rm = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', takeProfit: null }, new Date(), deps);
    expect(rm.changes[0]).toMatchObject({ kind: 'TP', action: 'removed', ok: true, message: 'Take-profit removed.' });
    expect(book.open.map((o) => o.exchangeOrderId)).toEqual(['sl1']);
    book.failCancel = true;
    const stuck = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: null }, new Date(), deps);
    expect(stuck.changes[0]).toMatchObject({ ok: false });
    expect(stuck.changes[0]!.message).toMatch(/couldn't be removed; check the Pending tab/);
  });

  it('refuses prices that would trigger at once, for longs and shorts, before changing anything', async () => {
    book.add('STOP_MARKET', 69_000, 2, 'sl1');
    await expect(svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', takeProfit: 69_000, stopLoss: 68_000 }, new Date(), deps)).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/take-profit must be above the mark/) });
    expect(book.open.map((o) => o.exchangeOrderId)).toEqual(['sl1']); // the valid SL wasn't applied either
    book.position = -2;
    await expect(svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 69_000 }, new Date(), deps)).rejects.toThrow(/stop-loss must be above the mark/);
    const ok = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', takeProfit: 68_000, stopLoss: 71_000 }, new Date(), deps);
    expect(ok.changes.every((c) => c.ok)).toBe(true);
    expect(book.open.filter((o) => o.exchangeOrderId !== 'sl1').every((o) => o.side === 'BUY')).toBe(true);
  });

  it('needs an open position, a trading key and your own account', async () => {
    book.position = 0;
    await expect(svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 1 }, new Date(), deps)).rejects.toThrow(/no open BTCUSD position/);
    book.position = 2;
    await expect(svc.setProtection(me, { connectionId: ro, symbol: 'BTCUSD', stopLoss: 1 }, new Date(), deps)).rejects.toThrow(/read-only/);
    await expect(svc.setProtection(me, { connectionId: theirs, symbol: 'BTCUSD', stopLoss: 1 }, new Date(), deps)).rejects.toThrow(/not found/i);
  });

  it('sets a trailing stop in place of a fixed one, and back again', async () => {
    book.add('STOP_MARKET', 69_000, 2, 'fixed');
    const r = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLossTrail: 500.2 }, new Date(), deps);
    expect(r.changes[0]).toMatchObject({ kind: 'SL', action: 'replaced', ok: true, message: 'Trailing stop set 500 behind the price for 2 contracts.' });
    expect(r.protection.stopLoss).toEqual([expect.objectContaining({ trail: 500, price: 69_500, ours: true })]);
    expect(book.open.some((o) => o.exchangeOrderId === 'fixed')).toBe(false);
    // Same trail again: nothing to do.
    expect((await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLossTrail: 500 }, new Date(), deps)).changes[0]!.action).toBe('kept');
    // A fixed stop at the trailing stop's current trigger is still a change: it stops trailing.
    const back = await svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLoss: 69_500 }, new Date(), deps);
    expect(back.changes[0]!.action).toBe('replaced');
    expect(back.protection.stopLoss).toEqual([expect.objectContaining({ trail: null, price: 69_500 })]);
  });

  it('refuses a silly trail before touching anything', async () => {
    book.add('STOP_MARKET', 69_000, 2, 'fixed');
    await expect(svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLossTrail: 40_000 }, new Date(), deps)).rejects.toThrow(/more than half the price/);
    await expect(svc.setProtection(me, { connectionId: conn, symbol: 'BTCUSD', stopLossTrail: 0.1 }, new Date(), deps)).rejects.toThrow(/smaller than one price step/);
    expect(book.open.map((o) => o.exchangeOrderId)).toEqual(['fixed']);
  });
});
