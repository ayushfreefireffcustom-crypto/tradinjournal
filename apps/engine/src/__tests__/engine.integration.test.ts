// The copy engine end to end: real Postgres (local test DB), fake exchange.
// Skipped unless TRADING_TEST_DB points at a local database:
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/engine test
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeError, type ApiCredentials, type Exchange, type FillEvent, type InstrumentInfo, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';
import type { EngineDeps } from '../deps.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const BTC: InstrumentInfo = { symbol: 'BTCUSD', productId: 84, kind: 'PERPETUAL', baseAsset: 'BTC', quoteAsset: 'USD', settleAsset: 'USD', contractMultiplier: 0.001, minQty: 1, qtyStep: 1, tickSize: 0.5, maxLeverage: 200, live: true };

/** In-memory exchange: one account per API key, market orders fill in full at `price`. */
class FakeExchange {
  price = 70_000;
  accounts = new Map<string, { equity: number; positions: Map<string, number>; fail?: 'auth' | 'margin' }>();
  orders: Array<PlaceOrderRequest & { apiKey: string }> = [];
  leverage: Array<[string, number]> = [];
  instrumentFailures = 0;

  account(key: string) {
    let a = this.accounts.get(key);
    if (!a) this.accounts.set(key, (a = { equity: 10_000, positions: new Map() }));
    return a;
  }

  asExchange(): Exchange {
    const self = this;
    return {
      id: 'DELTA_INDIA',
      env: 'testnet',
      async verify() {
        throw new Error('unused');
      },
      async getAccount(c: ApiCredentials) {
        const a = self.account(c.apiKey);
        if (a.fail === 'auth') throw new ExchangeError('AUTH', 'The API key is invalid.', 401);
        return { equityUsd: a.equity, availableUsd: a.equity, baseCurrency: 'USD' };
      },
      async getPositions(c: ApiCredentials) {
        const a = self.account(c.apiKey);
        if (a.fail === 'auth') throw new ExchangeError('AUTH', 'The API key is invalid.', 401);
        return [...a.positions].filter(([, s]) => s !== 0).map(([symbol, size]) => ({ symbol, size, avgEntry: self.price, markPrice: self.price, unrealizedPnl: 0, liquidationPrice: null, leverage: null }));
      },
      async getFills() {
        return [];
      },
      async listInstruments() {
        return [BTC];
      },
      async getInstrument(s: string) {
        return s === 'BTCUSD' ? BTC : null;
      },
      async resolveInstrument() {
        if (self.instrumentFailures > 0) {
          self.instrumentFailures--;
          throw new ExchangeError('UNAVAILABLE', 'down', 503);
        }
        return BTC;
      },
      async getMarkPrice() {
        return self.price;
      },
      async placeOrder(c: ApiCredentials, o: PlaceOrderRequest): Promise<OrderInfo> {
        const a = self.account(c.apiKey);
        if (a.fail === 'auth') throw new ExchangeError('AUTH', 'The API key is invalid.', 401);
        if (a.fail === 'margin') throw new ExchangeError('INSUFFICIENT_MARGIN', 'Not enough margin.', 400, 'insufficient_margin');
        const cur = a.positions.get(o.symbol) ?? 0;
        const signed = o.side === 'BUY' ? o.qty : -o.qty;
        if (o.reduceOnly && (cur === 0 || Math.sign(cur) === Math.sign(signed) || Math.abs(signed) > Math.abs(cur))) throw new ExchangeError('NO_POSITION', 'reduce-only would increase', 400);
        a.positions.set(o.symbol, cur + signed);
        self.orders.push({ ...o, apiKey: c.apiKey });
        return { exchangeOrderId: String(self.orders.length), clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side, type: o.type, status: 'FILLED', qty: o.qty, filledQty: o.qty, avgFillPrice: self.price, limitPrice: null, stopPrice: null, reduceOnly: !!o.reduceOnly, createdAt: new Date() };
      },
      async cancelOrder() {
        throw new Error('unused');
      },
      async getOrder() {
        return null;
      },
      async getOpenOrders() {
        return [];
      },
      async setLeverage(_c: ApiCredentials, symbol: string, lev: number) {
        self.leverage.push([symbol, lev]);
        return lev;
      },
      async closePosition() {
        return null;
      },
      async streamFills() {
        return { close() {} };
      },
    };
  }
}

describe.skipIf(!local)('copy engine (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let copy: typeof import('../copy.js');
  let guards: typeof import('../guards.js');
  let reconcile: typeof import('../reconcile.js');
  const tag = `eit${Date.now()}`;
  const fx = new FakeExchange();
  let now = new Date();
  const deps: EngineDeps = { exchangeFor: () => fx.asExchange(), credsFor: (c) => ({ apiKey: c.apiKeyEnc, apiSecret: c.apiSecretEnc }), now: () => now, sleep: async () => undefined };
  let leader: Awaited<ReturnType<typeof loadLeader>>;
  let followA = '';
  let followB = '';
  let followerUserA = '';
  let n = 0;

  const loadLeader = (id: string) => prisma.copyLeader.findUniqueOrThrow({ where: { id }, include: { connection: true } });
  const fill = (over: Partial<FillEvent> = {}): FillEvent => ({ externalId: `${tag}-f${++n}`, symbol: 'BTCUSD', side: 'BUY', qty: 10, price: 70_000, reduceOnly: false, timestamp: now, baseAsset: 'BTC', quoteAsset: 'USD', contractMultiplier: 0.001, ...over });
  const ordersFor = (followId: string, leaderFillExt: string) => prisma.exchangeOrder.findMany({ where: { followId, leaderFill: { externalId: leaderFillExt } }, orderBy: { clientOrderId: 'asc' } });
  const position = (followId: string) => prisma.exchangePosition.findFirst({ where: { followId } });

  async function conn(userId: string, key: string) {
    return prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: key, apiKeyEnc: `${tag}-${key}`, apiSecretEnc: 's', keyLast4: key.slice(-4), keyFingerprint: `${tag}-${key}`, canTrade: true } });
  }

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    copy = await import('../copy.js');
    guards = await import('../guards.js');
    reconcile = await import('../reconcile.js');
    const mk = (s: string) => prisma.user.create({ data: { name: s, email: `${tag}-${s}@engine.test` } });
    const [lu, ua, ub] = await Promise.all([mk('leader'), mk('a'), mk('b')]);
    followerUserA = ua.id;
    const lc = await conn(lu.id, 'LEAD');
    const ca = await conn(ua.id, 'FOLA');
    const cb = await conn(ub.id, 'FOLB');
    const l = await prisma.copyLeader.create({ data: { userId: lu.id, connectionId: lc.id, displayName: 'Engine IT', status: 'VERIFIED' } });
    const past = new Date(Date.now() - 3600_000);
    // A: proportional at the same equity (10k vs 10k) → same size. B: half size, 5x leverage.
    followA = (await prisma.copyFollow.create({ data: { userId: ua.id, leaderId: l.id, connectionId: ca.id, sizingMode: 'PROPORTIONAL', sizingValue: 1, startedAt: past, dailyLossLimitUsd: 50 } })).id;
    followB = (await prisma.copyFollow.create({ data: { userId: ub.id, leaderId: l.id, connectionId: cb.id, sizingMode: 'MULTIPLIER', sizingValue: 0.5, leverage: 5, startedAt: past } })).id;
    leader = await loadLeader(l.id);
  });

  beforeEach(async () => {
    now = new Date();
    fx.price = 70_000;
    guards.resetKillSwitchCache();
    await prisma.systemSetting.deleteMany({ where: { key: guards.KILL_SWITCH_KEY } });
  });

  afterAll(async () => {
    await prisma?.systemSetting.deleteMany({ where: { key: guards.KILL_SWITCH_KEY } });
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('copies a leader entry to every follower at their size', async () => {
    const f = fill({ qty: 10, positionAfter: 10 });
    await copy.ingestLeaderFill(leader, f, deps);
    const [a] = await ordersFor(followA, f.externalId);
    const [b] = await ordersFor(followB, f.externalId);
    expect(a).toMatchObject({ status: 'FILLED', side: 'BUY', reduceOnly: false });
    expect(Number(a!.qty)).toBe(10);
    expect(Number(b!.qty)).toBe(5);
    expect(await position(followA)).toMatchObject({ side: 'LONG' });
    expect(Number((await position(followB))!.qty)).toBe(5);
    expect(fx.leverage).toContainEqual(['BTCUSD', 5]);
  });

  it('ignores the same fill delivered twice', async () => {
    const f = fill({ qty: 2, positionAfter: 12 });
    await Promise.all([copy.ingestLeaderFill(leader, f, deps), copy.ingestLeaderFill(leader, f, deps)]);
    expect(await ordersFor(followA, f.externalId)).toHaveLength(1);
    expect(await prisma.leaderFill.count({ where: { externalId: f.externalId } })).toBe(1);
  });

  it('closes the same share on a partial close and books P&L', async () => {
    fx.price = 71_000;
    // Leader 12 → 6: half. A holds 12 → closes 6; B holds 6 → closes 3.
    const f = fill({ side: 'SELL', qty: 6, positionAfter: 6, price: 71_000 });
    await copy.ingestLeaderFill(leader, f, deps);
    const [a] = await ordersFor(followA, f.externalId);
    const [b] = await ordersFor(followB, f.externalId);
    expect(a).toMatchObject({ side: 'SELL', reduceOnly: true, status: 'FILLED' });
    expect(Number(a!.qty)).toBe(6);
    expect(Number(b!.qty)).toBe(3);
    // A bought 12 at 70k, sold 6 at 71k: 6 × 0.001 × 1000 = $6.
    expect(Number(a!.realizedPnl)).toBeCloseTo(6);
  });

  it('records a skip, not an order, while the kill switch is on', async () => {
    await prisma.systemSetting.create({ data: { key: guards.KILL_SWITCH_KEY, value: { enabled: true } } });
    const before = fx.orders.length;
    const f = fill({ qty: 1, positionAfter: 7 });
    await copy.ingestLeaderFill(leader, f, deps);
    expect(fx.orders.length).toBe(before);
    const [a] = await ordersFor(followA, f.externalId);
    expect(a).toMatchObject({ status: 'SKIPPED' });
    expect(a!.error).toMatch(/kill switch/);
  });

  it('never copies fills from before a follow started', async () => {
    const f = fill({ qty: 1, positionAfter: 7, timestamp: new Date(Date.now() - 2 * 3600_000) });
    await copy.ingestLeaderFill(leader, f, deps);
    expect(await ordersFor(followA, f.externalId)).toHaveLength(0);
  });

  it('caps a close at what the exchange really holds and flags drift', async () => {
    // The follower closed most of A's position by hand on the exchange.
    const a = fx.account(`${tag}-FOLA`);
    a.positions.set('BTCUSD', 1);
    const f = fill({ side: 'SELL', qty: 6, positionAfter: 0 });
    await copy.ingestLeaderFill(leader, f, deps);
    const [o] = await ordersFor(followA, f.externalId);
    expect(Number(o!.qty)).toBe(1);
    expect(a.positions.get('BTCUSD')).toBe(0);
    const pos = await prisma.exchangePosition.findFirst({ where: { followId: followA } });
    expect(pos!.driftDetectedAt).not.toBeNull();
  });

  it('pauses a follow at its daily loss limit and tells the user', async () => {
    // A: open 10 at 70k, then close at 64k → −$60 realized against a $50 limit.
    fx.price = 70_000;
    await copy.ingestLeaderFill(leader, fill({ qty: 10, positionAfter: 10 }), deps);
    fx.price = 64_000;
    await copy.ingestLeaderFill(leader, fill({ side: 'SELL', qty: 10, positionAfter: 0, price: 64_000 }), deps);
    const next = fill({ qty: 10, positionAfter: 10 });
    await copy.ingestLeaderFill(leader, next, deps);
    const [o] = await ordersFor(followA, next.externalId);
    expect(o).toMatchObject({ status: 'SKIPPED' });
    expect(await prisma.copyFollow.findUnique({ where: { id: followA } })).toMatchObject({ status: 'PAUSED' });
    expect(await prisma.notification.count({ where: { userId: followerUserA, kind: 'copy.loss_limit' } })).toBe(1);
  });

  it('still copies exits, but not entries, while a follow is paused', async () => {
    // A is paused (loss limit) and flat. Reopen A by hand to 4 contracts on our books and the exchange.
    const a = fx.account(`${tag}-FOLA`);
    a.positions.set('BTCUSD', 4);
    const pos = await prisma.exchangePosition.findFirstOrThrow({ where: { followId: followA } });
    await prisma.exchangePosition.update({ where: { id: pos.id }, data: { side: 'LONG', qty: 4, avgEntry: 70_000, closedAt: null } });
    const entry = fill({ qty: 2, positionAfter: 12 });
    await copy.ingestLeaderFill(leader, entry, deps);
    expect((await ordersFor(followA, entry.externalId))[0]).toMatchObject({ status: 'SKIPPED' });
    const exit = fill({ side: 'SELL', qty: 12, positionAfter: 0 });
    await copy.ingestLeaderFill(leader, exit, deps);
    const [o] = await ordersFor(followA, exit.externalId);
    expect(o).toMatchObject({ status: 'FILLED', reduceOnly: true });
    expect(Number(o!.qty)).toBe(4);
    expect(a.positions.get('BTCUSD')).toBe(0);
  });

  it('still copies the exit that arrives after an active follow breached its loss limit', async () => {
    // Regression: the limit check used to skip the whole fill, stranding the position.
    await prisma.copyFollow.update({ where: { id: followA }, data: { status: 'ACTIVE', pauseReason: null } });
    const a = fx.account(`${tag}-FOLA`);
    a.positions.set('BTCUSD', 3);
    const pos = await prisma.exchangePosition.findFirstOrThrow({ where: { followId: followA } });
    await prisma.exchangePosition.update({ where: { id: pos.id }, data: { side: 'LONG', qty: 3, avgEntry: 70_000, closedAt: null } });
    const exit = fill({ side: 'SELL', qty: 12, positionAfter: 0 });
    await copy.ingestLeaderFill(leader, exit, deps);
    const [o] = await ordersFor(followA, exit.externalId);
    expect(o).toMatchObject({ status: 'FILLED', reduceOnly: true });
    expect(a.positions.get('BTCUSD')).toBe(0);
    expect(await prisma.copyFollow.findUnique({ where: { id: followA } })).toMatchObject({ status: 'PAUSED', pauseReason: expect.stringMatching(/Daily loss limit/) });
  });

  it('pauses a follow once its profit target is reached', async () => {
    await prisma.copyFollow.update({ where: { id: followA }, data: { status: 'ACTIVE', pauseReason: null, dailyLossLimitUsd: null, maxProfitUsd: 25 } });
    const anyOrder = await prisma.exchangeOrder.findFirstOrThrow({ where: { followId: followA, status: 'FILLED' } });
    await prisma.exchangeOrder.updateMany({ where: { followId: followA }, data: { realizedPnl: 0 } });
    await prisma.exchangeOrder.update({ where: { id: anyOrder.id }, data: { realizedPnl: 40 } });
    const f = fill({ qty: 2, positionAfter: 2 });
    await copy.ingestLeaderFill(leader, f, deps);
    expect((await ordersFor(followA, f.externalId))[0]).toMatchObject({ status: 'SKIPPED', error: expect.stringMatching(/profit target/) });
    expect(await prisma.copyFollow.findUnique({ where: { id: followA } })).toMatchObject({ status: 'PAUSED', pauseReason: 'Profit target of $25 reached' });
    expect(await prisma.notification.count({ where: { userId: followerUserA, kind: 'copy.profit_target' } })).toBe(1);
    await prisma.copyFollow.update({ where: { id: followA }, data: { maxProfitUsd: null, dailyLossLimitUsd: 50 } });
  });

  it('marks the account invalid and pauses copying when the exchange rejects the key', async () => {
    const b = fx.account(`${tag}-FOLB`);
    b.fail = 'auth';
    // B already holds a position, so the engine reads it first and hits the bad key.
    const f = fill({ qty: 2, positionAfter: 12 });
    await copy.ingestLeaderFill(leader, f, deps);
    const fb = await prisma.copyFollow.findUnique({ where: { id: followB }, include: { connection: true } });
    expect(fb).toMatchObject({ status: 'PAUSED' });
    expect(fb!.connection.status).toBe('INVALID');
    expect(await prisma.notification.count({ where: { userId: fb!.userId, kind: 'exchange.invalid' } })).toBe(1);
    b.fail = undefined;
  });

  it('treats an unreadable stored key like a rejected one', async () => {
    const { SecretKeyError } = await import('@tradinjournal/secrets');
    const ub = await prisma.user.create({ data: { name: 'c', email: `${tag}-c@engine.test` } });
    const cc = await conn(ub.id, 'FOLC');
    const fc = await prisma.copyFollow.create({ data: { userId: ub.id, leaderId: leader.id, connectionId: cc.id, sizingMode: 'MULTIPLIER', sizingValue: 1, startedAt: new Date(Date.now() - 60_000) } });
    const broken: EngineDeps = { ...deps, credsFor: (c) => { if (c.apiKeyEnc.endsWith('FOLC')) throw new SecretKeyError('Malformed encrypted credential'); return deps.credsFor(c); } };
    const f = fill({ qty: 1, positionAfter: 13 });
    await copy.ingestLeaderFill(leader, f, broken);
    expect((await ordersFor(fc.id, f.externalId))[0]).toMatchObject({ status: 'SKIPPED' });
    expect(await prisma.exchangeConnection.findUnique({ where: { id: cc.id } })).toMatchObject({ status: 'INVALID' });
    await prisma.copyFollow.update({ where: { id: fc.id }, data: { status: 'STOPPED' } });
  });

  it('records a rejection and notifies on insufficient margin', async () => {
    await prisma.copyFollow.update({ where: { id: followA }, data: { status: 'ACTIVE', pauseReason: null } });
    await prisma.exchangeOrder.updateMany({ where: { followId: followA }, data: { realizedPnl: 0 } });
    const a = fx.account(`${tag}-FOLA`);
    a.fail = 'margin';
    const f = fill({ qty: 3, positionAfter: 13 });
    await copy.ingestLeaderFill(leader, f, deps);
    const [o] = await ordersFor(followA, f.externalId);
    expect(o).toMatchObject({ status: 'REJECTED', errorCode: 'INSUFFICIENT_MARGIN' });
    expect(await prisma.notification.count({ where: { userId: followerUserA, kind: 'copy.rejected' } })).toBe(1);
    a.fail = undefined;
  });

  it('retries a fill whose fan-out failed on a temporary error', async () => {
    fx.instrumentFailures = 1;
    const f = fill({ qty: 1, positionAfter: 14 });
    await copy.ingestLeaderFill(leader, f, deps);
    expect(await ordersFor(followA, f.externalId)).toHaveLength(0);
    await reconcile.reconcile(deps);
    const [o] = await ordersFor(followA, f.externalId);
    expect(o).toMatchObject({ status: 'FILLED' });
  });

  it('marks open positions and writes leader equity and stats', async () => {
    fx.price = 72_000;
    await reconcile.reconcile(deps);
    const pos = await prisma.exchangePosition.findFirst({ where: { followId: followA, closedAt: null } });
    expect(Number(pos!.markPrice)).toBe(72_000);
    expect(await prisma.leaderEquityPoint.count({ where: { leaderId: leader.id } })).toBe(1);
    // A second pass within 5 minutes doesn't add another point.
    await reconcile.reconcile(deps);
    expect(await prisma.leaderEquityPoint.count({ where: { leaderId: leader.id } })).toBe(1);
    const stat = await prisma.leaderStat.findUnique({ where: { leaderId_window: { leaderId: leader.id, window: 'all' } } });
    expect(stat).toMatchObject({ followerCount: 1 });
    expect(stat!.tradeCount).toBeGreaterThan(5);
  });
});
