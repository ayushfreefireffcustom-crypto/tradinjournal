// Z10: one leader fill fanned out to many followers. Real copy engine and local
// test DB, an in-memory exchange that takes LATENCY_MS per call (about a
// Railway → Delta India round trip).
//   · 100 followers, every order sent within 1 s of the fill (opt in: it's a
//     timing test, so it runs alone): LOAD_TEST=1 TRADING_TEST_DB=… pnpm --filter @tradinjournal/engine test fanout
//   · 30 followers, always on: done in well under the time one-by-one would
//     take, so copying stays concurrent.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiCredentials, Exchange, FillEvent, InstrumentInfo, OrderInfo, PlaceOrderRequest } from '@tradinjournal/exchange';
import type { EngineDeps } from '../deps.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
const LATENCY_MS = 60;
const tag = `fan${Date.now()}`;
const BTC: InstrumentInfo = { symbol: 'BTCUSD', productId: 84, kind: 'PERPETUAL', baseAsset: 'BTC', quoteAsset: 'USD', settleAsset: 'USD', contractMultiplier: 0.001, minQty: 1, qtyStep: 1, tickSize: 0.5, maxLeverage: 200, live: true };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every call takes LATENCY_MS; market orders fill in full. Records when each order arrived. */
class SlowExchange {
  sent: Array<{ apiKey: string; at: number; qty: number }> = [];
  inFlight = 0;
  peak = 0;
  private async call<T>(f: () => T): Promise<T> {
    this.inFlight++;
    this.peak = Math.max(this.peak, this.inFlight);
    try { await wait(LATENCY_MS); return f(); } finally { this.inFlight--; }
  }
  asExchange(): Exchange {
    const self = this;
    return {
      id: 'DELTA_INDIA', env: 'testnet',
      async verify() { throw new Error('unused'); },
      getAccount: () => self.call(() => ({ equityUsd: 10_000, availableUsd: 10_000, baseCurrency: 'USD' })),
      getPositions: () => self.call(() => []),
      async getFills() { return []; },
      async listInstruments() { return [BTC]; },
      async getInstrument() { return BTC; },
      async resolveInstrument() { return BTC; },
      async getMarkPrice() { return 70_000; },
      placeOrder: (c: ApiCredentials, o: PlaceOrderRequest) => self.call((): OrderInfo => {
        self.sent.push({ apiKey: c.apiKey, at: Date.now(), qty: o.qty });
        return { exchangeOrderId: String(self.sent.length), clientOrderId: o.clientOrderId ?? null, symbol: o.symbol, side: o.side, type: o.type, status: 'FILLED', qty: o.qty, filledQty: o.qty, avgFillPrice: 70_000, limitPrice: null, stopPrice: null, reduceOnly: !!o.reduceOnly, createdAt: new Date() };
      }),
      async cancelOrder() { throw new Error('unused'); },
      async getOrder() { return null; },
      async getOpenOrders() { return []; },
      setLeverage: (_c: ApiCredentials, _s: string, lev: number) => self.call(() => lev),
      async closePosition() { return null; },
      async streamFills() { return { close() {} }; },
    } as Exchange;
  }
}

describe.skipIf(!local)('copy fan-out under load', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let copy: typeof import('../copy.js');
  let guards: typeof import('../guards.js');
  const scope: string[] = [];
  let n = 0;

  /** A leader with `count` followers, each on its own account and key. */
  async function setup(count: number) {
    const k = `${tag}-${++n}`;
    const user = async (name: string) => { const u = await prisma.user.create({ data: { name, email: `${k}-${name}@engine.test` } }); scope.push(u.id); return u; };
    const conn = (userId: string, key: string) => prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: key, apiKeyEnc: `${k}-${key}`, apiSecretEnc: 's', keyLast4: '0000', keyFingerprint: `${k}-${key}`, canTrade: true } });
    const lu = await user('leader');
    const l = await prisma.copyLeader.create({ data: { userId: lu.id, connectionId: (await conn(lu.id, 'LEAD')).id, displayName: `Load ${k}`, status: 'VERIFIED' } });
    const past = new Date(Date.now() - 3600_000);
    for (let i = 0; i < count; i += 20) {
      await Promise.all(Array.from({ length: Math.min(20, count - i) }, async (_x, j) => {
        const u = await user(`f${i + j}`);
        const c = await conn(u.id, `F${i + j}`);
        // Half proportional (reads the follower's equity first), half fixed multiplier with leverage set.
        await prisma.copyFollow.create({ data: { userId: u.id, leaderId: l.id, connectionId: c.id, startedAt: past, ...((i + j) % 2 ? { sizingMode: 'MULTIPLIER', sizingValue: 1, leverage: 5 } : { sizingMode: 'PROPORTIONAL', sizingValue: 1 }) } });
      }));
    }
    return { leader: await prisma.copyLeader.findUniqueOrThrow({ where: { id: l.id }, include: { connection: true } }), key: k };
  }

  /** One fill, timed from ingest to the last order reaching the exchange. */
  async function run(count: number) {
    const { leader, key } = await setup(count);
    const fx = new SlowExchange();
    // A fixed clock keeps the 2 s kill-switch cache valid for the whole run, so a
    // test elsewhere flipping the shared switch can't change this one midway.
    const at = new Date();
    guards.resetKillSwitchCache();
    const deps: EngineDeps = { exchangeFor: () => fx.asExchange(), credsFor: (c) => ({ apiKey: c.apiKeyEnc, apiSecret: c.apiSecretEnc }), now: () => at, sleep: async () => undefined, scopeUserIds: scope };
    const fill: FillEvent = { externalId: `${key}-fill`, symbol: 'BTCUSD', side: 'BUY', qty: 10, price: 70_000, reduceOnly: false, timestamp: at, baseAsset: 'BTC', quoteAsset: 'USD', contractMultiplier: 0.001 };
    const t0 = Date.now();
    await copy.ingestLeaderFill(leader, fill, deps);
    const done = Date.now() - t0;
    const lat = fx.sent.map((s) => s.at - t0).sort((a, b) => a - b);
    const orders = await prisma.exchangeOrder.findMany({ where: { leaderFill: { leaderId: leader.id, externalId: fill.externalId } }, select: { status: true, qty: true, followId: true } });
    return { done, lat, fx, orders, p50: lat[Math.floor(lat.length / 2)] ?? NaN, max: lat.at(-1) ?? NaN };
  }

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    copy = await import('../copy.js');
    guards = await import('../guards.js');
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { id: { in: scope } } });
    await prisma?.$disconnect();
  });

  it('copies 30 followers far faster than one by one would', async () => {
    const r = await run(30);
    expect(r.orders).toHaveLength(30);
    expect(r.orders.every((o) => o.status === 'FILLED' && Number(o.qty) > 0)).toBe(true);
    expect(r.fx.peak).toBeGreaterThan(10); // calls really overlap
    // One by one: at least 30 followers × 2 calls × 60 ms = 3.6 s before any database time.
    expect(r.done).toBeLessThan(1500);
  }, 60_000);

  it.skipIf(!process.env.LOAD_TEST)('sends all 100 copies within a second of the leader fill', async () => {
    const r = await run(100);
    console.log(`[load] 100 followers · ${LATENCY_MS} ms per exchange call · p50 ${r.p50} ms · last order ${r.max} ms · done ${r.done} ms · peak ${r.fx.peak} calls in flight`);
    expect(r.orders).toHaveLength(100);
    expect(new Set(r.orders.map((o) => o.followId)).size).toBe(100);
    expect(r.orders.every((o) => o.status === 'FILLED')).toBe(true);
    expect(r.fx.sent).toHaveLength(100);
    expect(r.max).toBeLessThan(1000);
  }, 120_000);
});
