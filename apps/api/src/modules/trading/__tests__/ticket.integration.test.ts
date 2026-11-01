// Order ticket (D10, D11, D13) against the local test DB with a fake exchange.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderTicketInput } from '@tradinjournal/contracts';
import { ExchangeError, type Exchange, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
const KEY = randomBytes(32);

class Fake {
  placed: PlaceOrderRequest[] = [];
  leverageSet: number[] = [];
  leverage = 10;
  position = 0;
  fill = 1;
  reject: ExchangeError | null = null;
  rejectProtective = false;
  dropOnPlace = false;
  leverageFails = false;
  byClient = new Map<string, OrderInfo>();
  ex(): Exchange {
    return {
      getInstrument: async (symbol: string) => (symbol === 'BTCUSD' ? { symbol, contractMultiplier: 0.001, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 100, live: true } : null),
      getMarkPrice: async () => 70_000,
      getAccount: async () => ({ equityUsd: 1000, availableUsd: 800, baseCurrency: 'USD' }),
      getPositions: async () => (this.position ? [{ symbol: 'BTCUSD', size: this.position, avgEntry: 70_000, markPrice: 70_000, unrealizedPnl: 0, liquidationPrice: null, leverage: null }] : []),
      getLeverage: async () => this.leverage,
      setLeverage: async (_c: unknown, _s: string, l: number) => { if (this.leverageFails) throw new ExchangeError('REQUEST', 'Leverage too high for your margin.'); this.leverageSet.push(l); this.leverage = l; return l; },
      placeOrder: async (_c: unknown, o: PlaceOrderRequest) => {
        this.placed.push(o);
        if (this.dropOnPlace && !o.reduceOnly) {
          // The exchange took it, then the connection dropped before we heard back.
          this.byClient.set(o.clientOrderId, info(o, o.qty));
          throw new ExchangeError('UNAVAILABLE', 'socket hang up');
        }
        if (o.reduceOnly && o.type !== 'MARKET' && this.rejectProtective) throw new ExchangeError('REQUEST', 'Trigger price too close.');
        if (this.reject && !o.reduceOnly) throw this.reject;
        if (o.type === 'LIMIT') return info(o, 0, 'OPEN');
        if (o.type !== 'MARKET') return info(o, 0, 'PENDING');
        return info(o, Math.floor(o.qty * this.fill));
      },
      getOrder: async (_c: unknown, ref: { clientOrderId?: string }) => (ref.clientOrderId ? this.byClient.get(ref.clientOrderId) ?? null : null),
    } as unknown as Exchange;
  }
}
let n = 0;
function info(o: PlaceOrderRequest, filled: number, status?: OrderInfo['status']): OrderInfo {
  return { exchangeOrderId: `t${Date.now()}${++n}`, clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side, type: o.type, status: status ?? (filled >= o.qty ? 'FILLED' : filled > 0 ? 'CANCELLED' : 'CANCELLED'), qty: o.qty, filledQty: filled, avgFillPrice: filled ? 70_010 : null, limitPrice: o.limitPrice ?? null, stopPrice: o.stopPrice ?? null, reduceOnly: !!o.reduceOnly, createdAt: new Date() };
}

describe.skipIf(!local)('order ticket', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../ticket.service.js');
  const tag = `tkt${Date.now()}`;
  const fake = new Fake();
  const deps = { adapterFor: () => fake.ex(), key: () => KEY, sleep: async () => undefined };
  let me = '';
  let other = '';
  const conns: Record<string, string> = {};
  const T = (over: Partial<OrderTicketInput> = {}): OrderTicketInput => ({ connectionId: conns.main!, symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 2 }, requestId: randomUUID(), ...over });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../ticket.service.js');
    const { encryptWithKey } = await import('@tradinjournal/secrets');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    other = (await prisma.user.create({ data: { name: 'o', email: `${tag}-o@trading.test` } })).id;
    const mk = async (userId: string, label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey('k', KEY), apiSecretEnc: encryptWithKey('s', KEY), keyLast4: 'abcd', keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conns.main = await mk(me, 'Main');
    conns.ro = await mk(me, 'RO', { canTrade: false });
    conns.theirs = await mk(other, 'Theirs');
  });
  beforeEach(() => Object.assign(fake, { placed: [], leverageSet: [], leverage: 10, position: 0, fill: 1, reject: null, rejectProtective: false, dropOnPlace: false, leverageFails: false }));
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('quotes the contract, balance, position and leverage', async () => {
    fake.position = -3;
    expect(await svc.ticketQuote(me, conns.main!, 'BTCUSD', deps)).toMatchObject({ symbol: 'BTCUSD', markPrice: 70_000, contractMultiplier: 0.001, tickSize: 0.5, currentLeverage: 10, equityUsd: 1000, availableUsd: 800, position: -3, environment: 'TESTNET' });
    await expect(svc.ticketQuote(me, conns.main!, 'NOPEUSD', deps)).rejects.toThrow(/isn't a contract/);
    await expect(svc.ticketQuote(me, conns.theirs!, 'BTCUSD', deps)).rejects.toThrow(/not found/i);
    await expect(svc.ticketQuote(me, conns.ro!, 'BTCUSD', deps)).rejects.toThrow(/read-only/);
  });

  it('previews without sending anything', async () => {
    const p = await svc.previewTicket(me, T({ size: { mode: 'usd', value: 250 }, leverage: 20 }), deps);
    expect(p).toMatchObject({ ok: true, qty: 3, notionalUsd: 210, marginUsd: 10.5, leverage: 20, currentLeverage: 10 });
    expect(fake.placed).toEqual([]);
    expect(fake.leverageSet).toEqual([]);
  });

  it('places a market buy, then a reduce-only take-profit and stop-loss for what filled', async () => {
    const r = await svc.placeTicket(me, T({ takeProfit: 72_000, stopLoss: 69_000.2 }), new Date(), deps);
    expect(r.outcome).toBe('filled');
    expect(r.message).toBe('Bought 2 BTCUSD at 70010.');
    expect(r.order).toMatchObject({ source: 'MANUAL', status: 'FILLED', qty: 2, filledQty: 2, type: 'MARKET' });
    expect(fake.placed.map((o) => [o.type, o.side, o.qty, o.reduceOnly ?? false, o.stopPrice ?? null])).toEqual([
      ['MARKET', 'BUY', 2, false, null],
      ['TAKE_PROFIT_MARKET', 'SELL', 2, true, 72_000],
      ['STOP_MARKET', 'SELL', 2, true, 69_000], // rounded to the $0.5 tick
    ]);
    expect(r.protective.map((p) => [p.kind, p.ok])).toEqual([['TP', true], ['SL', true]]);
    expect(fake.leverageSet).toEqual([]); // leverage untouched when not asked
  });

  it('protects only what filled, and says so when a protective order fails', async () => {
    fake.fill = 0.5;
    fake.rejectProtective = true;
    const r = await svc.placeTicket(me, T({ size: { mode: 'contracts', value: 4 }, stopLoss: 69_000 }), new Date(), deps);
    expect(r.outcome).toBe('partial');
    expect(r.message).toMatch(/Bought 2 BTCUSD at 70010; the rest \(2\) didn't fill/);
    expect(fake.placed[1]).toMatchObject({ type: 'STOP_MARKET', qty: 2 });
    expect(r.protective[0]).toMatchObject({ kind: 'SL', ok: false });
    expect(r.protective[0]!.message).toMatch(/The position is open without it/);
    expect(r.protective[0]!.order).toMatchObject({ status: 'REJECTED', error: 'Trigger price too close.' });
  });

  it('sets leverage first when it changes, and sends nothing if that fails', async () => {
    await svc.placeTicket(me, T({ leverage: 25 }), new Date(), deps);
    expect(fake.leverageSet).toEqual([25]);
    fake.leverageFails = true;
    const r = await svc.placeTicket(me, T({ leverage: 50 }), new Date(), deps);
    expect(r).toMatchObject({ outcome: 'rejected', order: null });
    expect(r.message).toMatch(/Couldn't set 50× leverage, so nothing was sent/);
    expect(fake.placed.length).toBe(1);
  });

  it('leaves a limit order resting and a stop order waiting', async () => {
    const lim = await svc.placeTicket(me, T({ type: 'LIMIT', limitPrice: 65_000, tif: 'GTC', postOnly: true }), new Date(), deps);
    expect(lim).toMatchObject({ outcome: 'resting', protective: [] });
    expect(lim.order).toMatchObject({ status: 'OPEN', type: 'LIMIT' });
    expect(fake.placed[0]).toMatchObject({ type: 'LIMIT', limitPrice: 65_000, postOnly: true, tif: 'GTC' });
    const stop = await svc.placeTicket(me, T({ type: 'STOP_MARKET', stopPrice: 71_000 }), new Date(), deps);
    expect(stop.outcome).toBe('resting');
  });

  it('records an exchange rejection, with a hint when it is the key', async () => {
    fake.reject = new ExchangeError('INSUFFICIENT_MARGIN', 'Insufficient margin.');
    const r = await svc.placeTicket(me, T(), new Date(), deps);
    expect(r).toMatchObject({ outcome: 'rejected' });
    expect(r.order).toMatchObject({ status: 'REJECTED', error: 'Insufficient margin.' });
    fake.reject = new ExchangeError('IP_NOT_WHITELISTED', "This server's IP isn't on the API key's whitelist.");
    expect((await svc.placeTicket(me, T(), new Date(), deps)).message).toMatch(/Check the key on the Exchanges page/);
  });

  it('resolves a dropped connection by looking the order up instead of guessing', async () => {
    fake.dropOnPlace = true;
    const r = await svc.placeTicket(me, T(), new Date(), deps);
    expect(r.outcome).toBe('filled');
    expect(r.order).toMatchObject({ status: 'FILLED', filledQty: 2 });
  });

  it('never sends the same ticket twice', async () => {
    const t = T();
    const first = await svc.placeTicket(me, t, new Date(), deps);
    const again = await svc.placeTicket(me, t, new Date(), deps);
    expect(fake.placed.length).toBe(1);
    expect(again.message).toMatch(/already sent; nothing new was placed/);
    expect(again.order!.id).toBe(first.order!.id);
    // Two at once (a double click): still one order.
    const t2 = T();
    const both = await Promise.allSettled([svc.placeTicket(me, t2, new Date(), deps), svc.placeTicket(me, t2, new Date(), deps)]);
    expect(fake.placed.length).toBe(2);
    // Both answer normally (no 500): one placed it, the other says it was already sent.
    expect(both.map((b) => b.status)).toEqual(['fulfilled', 'fulfilled']);
    const msgs = both.map((b) => (b as PromiseFulfilledResult<{ message: string }>).value.message);
    expect(msgs.filter((m) => /already sent/.test(m)).length).toBe(1);
  });

  it('refuses a ticket that breaks a rule, listing every problem', async () => {
    await expect(svc.placeTicket(me, T({ size: { mode: 'usd', value: 10 }, takeProfit: 60_000 }), new Date(), deps)).rejects.toMatchObject({ statusCode: 422, fields: { ticket: expect.arrayContaining([expect.stringMatching(/take-profit must be above/), expect.stringMatching(/smallest order/)]) } });
    expect(fake.placed).toEqual([]);
    await expect(svc.placeTicket(me, T({ connectionId: conns.theirs! }), new Date(), deps)).rejects.toThrow(/not found/i);
    await expect(svc.placeTicket(me, T({ connectionId: conns.ro! }), new Date(), deps)).rejects.toThrow(/read-only/);
  });
  it('lists live perpetuals for trading accounts only, cached, and keeps the last list if the venue is down', async () => {
    let calls = 0;
    let fail = false;
    const d = { ...deps, adapterFor: () => ({ listInstruments: async () => {
      calls += 1;
      if (fail) throw new Error('down');
      return [
        { symbol: 'BTCUSD', kind: 'PERPETUAL', live: true, baseAsset: 'BTC' },
        { symbol: 'ETHUSD', kind: 'PERPETUAL', live: false, baseAsset: 'ETH' },
        { symbol: 'C-BTC-90000-011126', kind: 'CALL', live: true, baseAsset: 'BTC' },
      ];
    } }) as unknown as Exchange };
    const t0 = 9e12; // far from any other test's clock: the cache is per process
    const r = await svc.tradableInstruments(me, t0, d);
    expect(r.map((x) => x.label)).toContain('Main');
    expect(r.map((x) => x.label)).not.toContain('RO'); // read-only key can't trade
    expect(r.find((x) => x.label === 'Main')!.instruments).toEqual([{ symbol: 'BTCUSD', base: 'BTC' }]);
    const before = calls;
    await svc.tradableInstruments(me, t0 + 60_000, d);
    expect(calls).toBe(before); // cached
    fail = true;
    const stale = await svc.tradableInstruments(me, t0 + 11 * 60_000, d);
    expect(calls).toBeGreaterThan(before);
    expect(stale.find((x) => x.label === 'Main')!.instruments).toEqual([{ symbol: 'BTCUSD', base: 'BTC' }]);
  });
});
