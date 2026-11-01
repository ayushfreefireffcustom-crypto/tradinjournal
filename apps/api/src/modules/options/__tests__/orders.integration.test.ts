// Option baskets (G11) against the local test DB with a fake exchange and a fake chain.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { OptionsBasketDto } from '@tradinjournal/contracts';
import { ExchangeError, type Exchange, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';
import type { OptionsDeps } from '../options.service.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
const KEY = randomBytes(32);
const NOW = Date.UTC(2026, 10, 2, 6);

// A small chain: two strikes, one expiry; the 80k call has no ask.
const q = (sym: string, bid: number | null, ask: number | null, mark: number) => ({
  symbol: sym, product_id: 1, contract_type: sym.startsWith('C') ? 'call_options' : 'put_options', underlying_asset_symbol: 'BTC', spot_price: '78000', mark_price: String(mark), contract_value: '0.001', tick_size: '0.1',
  quotes: { best_bid: bid == null ? null : String(bid), best_ask: ask == null ? null : String(ask), mark_iv: '0.4' }, greeks: {}, oi_contracts: '10', volume: 0,
});
const tickers = [q('C-BTC-78000-131126', 900, 910, 905.04), q('P-BTC-78000-131126', 850, 860, 855.07), q('C-BTC-80000-131126', 300, null, 320)];
const odeps: OptionsDeps = {
  now: () => NOW, cache: false,
  get: async <T>(_env: string, path: string): Promise<T> => {
    if (path.startsWith('/v2/tickers')) return { success: true, result: tickers } as T;
    if (path.startsWith('/v2/products')) return { success: true, result: [], meta: { after: null } } as T;
    throw new Error(path);
  },
};

class Fake {
  placed: PlaceOrderRequest[] = [];
  rejectSymbol: string | null = null;
  fill = true;
  ex(): Exchange {
    return {
      getAccount: async () => ({ equityUsd: 50, availableUsd: 40, baseCurrency: 'USD' }),
      placeOrder: async (_c: unknown, o: PlaceOrderRequest) => {
        this.placed.push(o);
        if (o.symbol === this.rejectSymbol) throw new ExchangeError('REQUEST', 'Insufficient margin.');
        return info(o, this.fill ? o.qty : 0, this.fill ? 'FILLED' : 'OPEN');
      },
      getOrder: async () => null,
    } as unknown as Exchange;
  }
}
let n = 0;
const info = (o: PlaceOrderRequest, filled: number, status: OrderInfo['status']): OrderInfo => ({ exchangeOrderId: `o${Date.now()}${++n}`, clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side, type: o.type, status, qty: o.qty, filledQty: filled, avgFillPrice: filled ? o.limitPrice ?? 905 : null, limitPrice: o.limitPrice ?? null, stopPrice: null, reduceOnly: false, createdAt: new Date() });

describe.skipIf(!local)('option baskets', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../orders.service.js');
  const tag = `optb${Date.now()}`;
  const fake = new Fake();
  const deps = { adapterFor: () => fake.ex(), key: () => KEY, sleep: async () => undefined };
  let me = '';
  let conn = '';
  let ro = '';
  const straddle = (over: Partial<OptionsBasketDto> = {}): OptionsBasketDto => ({
    connectionId: conn, requestId: randomUUID(), underlying: 'BTC', pricing: 'touch',
    legs: [{ kind: 'call', side: 1, qty: 2, strike: 78_000, expiry: '131126' }, { kind: 'put', side: -1, qty: 1, strike: 78_000, expiry: '131126' }], ...over,
  });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../orders.service.js');
    const { encryptWithKey } = await import('@tradinjournal/secrets');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    const mk = async (label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId: me, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey('k', KEY), apiSecretEnc: encryptWithKey('s', KEY), keyLast4: 'abcd', keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conn = await mk('Main');
    ro = await mk('RO', { canTrade: false });
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });
  beforeEach(() => Object.assign(fake, { placed: [], rejectSymbol: null, fill: true }));

  it('previews prices, cost and warnings for each pricing mode', async () => {
    const p = await svc.previewBasket(me, straddle(), deps, odeps);
    expect(p.env).toBe('testnet');
    expect(p.legs.map((l) => [l.symbol, l.side, l.type, l.limitPrice])).toEqual([['C-BTC-78000-131126', 'BUY', 'LIMIT', 910], ['P-BTC-78000-131126', 'SELL', 'LIMIT', 850]]);
    expect(p.netCost).toBeCloseTo(2 * 0.001 * 910 - 0.001 * 850, 9);
    expect(p.availableUsd).toBe(40);
    expect(p.warnings.join(' ')).toMatch(/one at a time/);
    // At the mark: on the tick, never worse than the mark (buy rounds down, sell rounds up).
    const m = await svc.previewBasket(me, straddle({ pricing: 'mark' }), deps, odeps);
    expect(m.legs.map((l) => l.limitPrice)).toEqual([905, 855.1]);
    const mk = await svc.previewBasket(me, straddle({ pricing: 'market' }), deps, odeps);
    expect(mk.legs.every((l) => l.type === 'MARKET' && l.limitPrice == null)).toBe(true);
    expect(mk.warnings.join(' ')).toMatch(/Market orders/);
    // Costs more than the account has.
    const big = await svc.previewBasket(me, straddle({ legs: [{ kind: 'call', side: 1, qty: 100, strike: 78_000, expiry: '131126' }] }), deps, odeps);
    expect(big.warnings.join(' ')).toMatch(/costs more than the 40.00 USD/);
  });
  it('refuses what it can’t price or place', async () => {
    await expect(svc.previewBasket(me, straddle({ legs: [{ kind: 'call', side: 1, qty: 1, strike: 80_000, expiry: '131126' }] }), deps, odeps)).rejects.toThrow(/has no ask/);
    await expect(svc.previewBasket(me, straddle({ legs: [{ kind: 'call', side: 1, qty: 1, strike: 79_000, expiry: '131126' }] }), deps, odeps)).rejects.toThrow(/isn't listed on testnet/);
    await expect(svc.previewBasket(me, straddle({ connectionId: ro }), deps, odeps)).rejects.toThrow(/read-only/);
  });
  it('places legs in order, records them, and returns the first send on a repeat', async () => {
    const b = straddle();
    const r = await svc.placeBasket(me, b, new Date(NOW), deps, odeps);
    expect(r.legs.map((l) => l.outcome)).toEqual(['filled', 'filled']);
    expect(r.message).toBe('All 2 legs filled.');
    expect(fake.placed.map((o) => [o.symbol, o.side, o.qty, o.type, o.tif])).toEqual([['C-BTC-78000-131126', 'BUY', 2, 'LIMIT', 'GTC'], ['P-BTC-78000-131126', 'SELL', 1, 'LIMIT', 'GTC']]);
    const rows = await prisma.exchangeOrder.findMany({ where: { userId: me }, orderBy: { clientOrderId: 'asc' } });
    expect(rows.map((o) => [o.symbol, o.status, Number(o.filledQty)])).toEqual([['C-BTC-78000-131126', 'FILLED', 2], ['P-BTC-78000-131126', 'FILLED', 1]]);
    const again = await svc.placeBasket(me, b, new Date(NOW), deps, odeps);
    expect(again.message).toMatch(/already sent/);
    expect(fake.placed).toHaveLength(2);
  });
  it('stops at a refused leg and doesn’t send the rest', async () => {
    fake.rejectSymbol = 'C-BTC-78000-131126';
    const r = await svc.placeBasket(me, straddle(), new Date(NOW), deps, odeps);
    expect(r.legs.map((l) => l.outcome)).toEqual(['rejected', 'skipped']);
    expect(r.legs[0]!.message).toMatch(/Insufficient margin/);
    expect(fake.placed).toHaveLength(1);
    fake.rejectSymbol = 'P-BTC-78000-131126';
    fake.fill = false;
    const r2 = await svc.placeBasket(me, straddle(), new Date(NOW), deps, odeps);
    expect(r2.legs.map((l) => l.outcome)).toEqual(['resting', 'rejected']);
    expect(r2.message).toMatch(/1 of 2 legs went out/);
  });
});
