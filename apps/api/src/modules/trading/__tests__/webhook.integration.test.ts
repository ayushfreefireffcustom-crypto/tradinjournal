// TradingView webhooks (D14, D15) against the local test DB with a fake exchange.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Exchange, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
// Only this address counts as TradingView here.
process.env.TRADINGVIEW_IP_ALLOWLIST = '52.89.214.238';
const TV = '52.89.214.238';
const KEY = randomBytes(32);

class Fake {
  placed: PlaceOrderRequest[] = [];
  position = 0;
  n = 0;
  ex(): Exchange {
    const fill = (o: PlaceOrderRequest): OrderInfo => ({ exchangeOrderId: `w${Date.now()}${++this.n}`, clientOrderId: o.clientOrderId, symbol: o.symbol, side: o.side, type: o.type, status: o.type === 'MARKET' ? 'FILLED' : o.type === 'LIMIT' ? 'OPEN' : 'PENDING', qty: o.qty, filledQty: o.type === 'MARKET' ? o.qty : 0, avgFillPrice: o.type === 'MARKET' ? 70_000 : null, limitPrice: o.limitPrice ?? null, stopPrice: o.stopPrice ?? null, reduceOnly: !!o.reduceOnly, createdAt: new Date() });
    return {
      getInstrument: async (symbol: string) => (symbol === 'BTCUSD' ? { symbol, contractMultiplier: 0.001, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 100, live: true } : null),
      getMarkPrice: async () => 70_000,
      getAccount: async () => ({ equityUsd: 1000, availableUsd: 800, baseCurrency: 'USD' }),
      getPositions: async () => (this.position ? [{ symbol: 'BTCUSD', size: this.position, avgEntry: 70_000, markPrice: 70_000, unrealizedPnl: 0, liquidationPrice: null, leverage: null }] : []),
      getLeverage: async () => 10,
      setLeverage: async (_c: unknown, _s: string, l: number) => l,
      placeOrder: async (_c: unknown, o: PlaceOrderRequest) => { this.placed.push(o); return fill(o); },
      getOrder: async () => null,
      getOpenOrders: async () => [],
      cancelOrder: async () => ({ status: 'CANCELLED', filledQty: 0 }),
    } as unknown as Exchange;
  }
}

describe.skipIf(!local)('TradingView webhooks', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../webhook.service.js');
  const tag = `tvw${Date.now()}`;
  const fake = new Fake();
  const deps = { adapterFor: () => fake.ex(), key: () => KEY, sleep: async () => undefined };
  let me = '';
  let other = '';
  const conns: Record<string, string> = {};
  let token = '';
  let secret = '';
  const alert = (over: Record<string, unknown> = {}) => ({ secret, action: 'buy', symbol: 'BTCUSD', qty: 1, ...over });
  const send = (body: unknown, ip: string | null = TV) => svc.handleAlert(token, body, ip, new Date(), deps);
  const events = async () => (await svc.webhookEvents(me)).items;

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../webhook.service.js');
    const { encryptWithKey } = await import('@tradinjournal/secrets');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    other = (await prisma.user.create({ data: { name: 'o', email: `${tag}-o@trading.test` } })).id;
    const mk = async (userId: string, label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey('k', KEY), apiSecretEnc: encryptWithKey('s', KEY), keyLast4: 'abcd', keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conns.main = await mk(me, 'Main');
    conns.ro = await mk(me, 'RO', { canTrade: false });
    conns.live = await mk(me, 'Live', { environment: 'LIVE' });
    conns.theirs = await mk(other, 'Theirs');
  });
  beforeEach(() => Object.assign(fake, { placed: [], position: 0 }));
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('sets up a webhook only on your own trading account, and asks before real money', async () => {
    await expect(svc.setupWebhook(me, { connectionId: conns.ro! })).rejects.toThrow(/read-only/);
    await expect(svc.setupWebhook(me, { connectionId: conns.theirs! })).rejects.toThrow(/not found/i);
    await expect(svc.setupWebhook(me, { connectionId: conns.live! })).rejects.toThrow(/real-money account/);
    expect(await svc.getWebhook(me)).toBeNull();
    const w = await svc.setupWebhook(me, { connectionId: conns.main! });
    expect(w.secret).toMatch(/^tvs_[A-Za-z0-9_-]{30,}$/);
    expect(w.url).toMatch(/\/api\/hooks\/tv\/[A-Za-z0-9_-]{20,}$/);
    expect(w).toMatchObject({ enabled: true, secretLast4: w.secret.slice(-4), connection: { id: conns.main, environment: 'TESTNET' } });
    token = w.url.split('/').pop()!;
    secret = w.secret;
    // The secret isn't stored or shown again.
    const again = await svc.getWebhook(me);
    expect(again).not.toHaveProperty('secret');
    expect(JSON.stringify(await prisma.tradingWebhook.findUnique({ where: { userId: me } }))).not.toContain(secret);
  });

  it('places an order from an alert, once per alert id, and logs it', async () => {
    const r = await send(alert({ id: 'a-1' }));
    expect(r).toMatchObject({ httpStatus: 200, body: { ok: true, status: 'ordered', message: 'Bought 1 BTCUSD at 70000.' } });
    expect(fake.placed).toEqual([expect.objectContaining({ symbol: 'BTCUSD', side: 'BUY', qty: 1, type: 'MARKET' })]);
    const dup = await send(alert({ id: 'a-1' }));
    expect(dup.body).toMatchObject({ ok: true, status: 'duplicate' });
    expect(fake.placed.length).toBe(1);
    const [last, first] = await events();
    expect(first).toMatchObject({ status: 'ordered', alertId: 'a-1', ip: TV });
    expect(first!.orderId).toBeTruthy();
    expect(last).toMatchObject({ status: 'duplicate' });
    // The logged message never keeps the secret.
    expect(JSON.stringify(first!.payload)).not.toContain(secret);
    expect(first!.payload).toMatchObject({ action: 'buy', symbol: 'BTCUSD', id: 'a-1' });
  });

  it('reads plain-text JSON and TradingView-style symbols and string numbers', async () => {
    const r = await send(JSON.stringify(alert({ symbol: 'DELTAIN:BTCUSD.P', qty: '2', action: 'sell', id: 'a-2' })));
    expect(r.body.status).toBe('ordered');
    expect(fake.placed[0]).toMatchObject({ symbol: 'BTCUSD', side: 'SELL', qty: 2 });
  });

  it('rejects and logs: wrong IP, bad JSON, wrong secret, bad message, broken rules', async () => {
    expect((await send(alert(), '1.2.3.4')).httpStatus).toBe(403);
    expect((await send(alert(), null)).httpStatus).toBe(403);
    expect((await send('{not json')).httpStatus).toBe(400);
    expect((await send([1, 2])).httpStatus).toBe(400);
    const wrong = await send(alert({ secret: 'tvs_wrong' }));
    expect(wrong).toMatchObject({ httpStatus: 401, body: { status: 'rejected' } });
    expect((await send(alert({ secret: undefined }))).httpStatus).toBe(401);
    const two = await send(alert({ size_usd: 100 }));
    expect(two.httpStatus).toBe(422);
    expect(two.body.message).toMatch(/exactly one of qty, size_usd or risk_pct/);
    expect((await send(alert({ action: 'hold' }))).httpStatus).toBe(422);
    expect((await send(alert({ type: 'limit' }))).body.message).toMatch(/limit order needs a price/);
    // Passes the format but breaks a ticket rule: refused with the reason, nothing sent.
    const small = await send(alert({ qty: undefined, size_usd: 10 }));
    expect(small).toMatchObject({ httpStatus: 422, body: { status: 'rejected' } });
    expect(small.body.message).toMatch(/smallest order/);
    expect(fake.placed).toEqual([]);
    const log = await events();
    expect(log.slice(0, 10).every((e) => e.status === 'rejected')).toBe(true);
    expect(log.find((e) => /from 1\.2\.3\.4, which isn't one of TradingView's alert servers/.test(e.reason ?? ''))?.ip).toBe('1.2.3.4');
    expect(log.some((e) => /from an unknown address/.test(e.reason ?? '') && e.ip === null)).toBe(true);
    // Wrong-secret attempts are logged without whatever secret they carried.
    expect(JSON.stringify(log)).not.toContain('tvs_wrong');
  });

  it('closes a position from an alert', async () => {
    fake.position = 3;
    const r = await send(alert({ action: 'close', qty: undefined, id: 'c-1' }));
    expect(r.body).toMatchObject({ ok: true, status: 'ordered' });
    expect(fake.placed).toEqual([expect.objectContaining({ side: 'SELL', qty: 3, reduceOnly: true })]);
    fake.position = 0;
    expect((await send(alert({ action: 'close', qty: undefined }))).body).toMatchObject({ ok: false, status: 'rejected' });
  });

  it('does nothing while switched off, and a new secret replaces the old at the same URL', async () => {
    await svc.updateWebhook(me, { enabled: false });
    expect((await send(alert({ id: 'off-1' }))).httpStatus).toBe(409);
    await svc.updateWebhook(me, { enabled: true });
    const old = secret;
    const w = await svc.setupWebhook(me, { connectionId: conns.main! });
    expect(w.url.endsWith(token)).toBe(true);
    expect(w.secret).not.toBe(old);
    expect((await send(alert({ secret: old, id: 'r-1' }))).httpStatus).toBe(401);
    secret = w.secret;
    expect((await send(alert({ id: 'r-2' }))).body.status).toBe('ordered');
  });

  it('answers 404 for unknown tokens without logging, and drops floods', async () => {
    const before = (await events()).length;
    expect((await svc.handleAlert('nope-nope-nope', alert(), TV, new Date(), deps)).httpStatus).toBe(404);
    expect((await events()).length).toBe(before);
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await send('x')).httpStatus;
    expect(last).toBe(429);
  });

  it("keeps each user's log to themselves, and deleting the webhook stops it", async () => {
    expect((await svc.webhookEvents(other)).items).toEqual([]);
    await svc.deleteWebhook(me);
    expect(await svc.getWebhook(me)).toBeNull();
    expect((await svc.handleAlert(token, alert(), TV, new Date(), deps)).httpStatus).toBe(404);
  });
});
