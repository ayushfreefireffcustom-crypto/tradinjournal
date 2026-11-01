// Z3: every action that can change trading leaves an audit record: who, when,
// from where (IP, device), through what (the app or an API key) and with what
// outcome. Over the real app on the local test DB, with a fake exchange behind
// adapterFor and a throwaway encryption key, so nothing real is reached.
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { COPY_RISK_VERSION } from '@tradinjournal/contracts';
import type { ApiCredentials, Exchange, InstrumentInfo, OrderInfo, PlaceOrderRequest } from '@tradinjournal/exchange';
import type { RouteInfo } from './routes.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `audit${Date.now()}`;
const PASS = 'Trade-audit-12345';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const IP = '203.0.113.7';

/** The record each trading write leaves (an activity kind, or the admin audit log). */
const TRAIL: Record<string, string> = {
  'POST /api/trading/orders': 'order_placed',
  'POST /api/v1/orders': 'order_placed',
  'POST /api/options/orders': 'order_placed',
  'POST /api/trading/orders/cancel': 'order_cancelled',
  'POST /api/v1/orders/cancel': 'order_cancelled',
  'POST /api/trading/positions/close': 'position_closed',
  'POST /api/trading/positions/close-many': 'position_closed',
  'POST /api/v1/positions/close': 'position_closed',
  'POST /api/trading/protection': 'protection_changed',
  'POST /api/trading/webhook': 'webhook_changed',
  'PATCH /api/trading/webhook': 'webhook_changed',
  'DELETE /api/trading/webhook': 'webhook_changed',
  'POST /api/trading/api-keys': 'api_key_created',
  'POST /api/trading/api-keys/:id/revoke': 'api_key_revoked',
  'POST /api/exchanges': 'exchange_connected',
  'DELETE /api/exchanges/:id': 'exchange_removed',
  'POST /api/follows': 'follow_started',
  'PATCH /api/follows/:id': 'follow_changed',
  'POST /api/follows/:id/stop': 'follow_stopped',
  'POST /api/leaders/apply': 'leader_changed',
  'PATCH /api/leaders/me': 'leader_changed',
  'POST /api/strategies/:id/deployments': 'deployment_started',
  'POST /api/deployments/:id/size': 'deployment_changed',
  'POST /api/deployments/:id/:action': 'deployment_changed', // stop, settle and emergency close are deployment_stopped
  'POST /api/marketplace/:id/subscribe': 'deployment_started',
  'POST /api/marketplace/subscriptions/:id/size': 'subscription_changed',
  'POST /api/marketplace/subscriptions/:id/:action(pause|resume|cancel|cancel_settle)': 'subscription_changed',
  'POST /api/admin/copy/leaders/:id/action': 'admin_audit_log',
  'POST /api/admin/copy/kill-switch': 'admin_audit_log',
  'POST /api/admin/copy/follows/:id/stop': 'admin_audit_log',
};
/** Writes in those areas that don't change trading, or are logged elsewhere. */
const NO_TRAIL: Record<string, string> = {
  'POST /api/trading/orders/preview': 'Prices a ticket; nothing is sent.',
  'POST /api/options/orders/preview': 'Prices a basket; nothing is sent.',
  'POST /api/trading/history/import': 'Copies the exchange’s own fill history into the journal; nothing changes on the exchange.',
  'POST /api/exchanges/:id/test': 'Re-checks the key; only its status changes.',
  'PATCH /api/exchanges/:id': 'Renames the account’s label.',
  'POST /api/hooks/tv/:token': 'Every alert is kept in trading_webhook_event with its IP and outcome (D15).',
};
const AREAS = ['/api/trading', '/api/exchanges', '/api/follows', '/api/leaders', '/api/options/orders', '/api/deployments', '/api/v1', '/api/marketplace/:id/subscribe', '/api/marketplace/subscriptions', '/api/strategies/:id/deployments', '/api/admin/copy', '/api/hooks'];

const BTC: InstrumentInfo = { symbol: 'BTCUSD', productId: 84, kind: 'PERPETUAL', baseAsset: 'BTC', quoteAsset: 'USD', settleAsset: 'USD', contractMultiplier: 0.001, minQty: 1, qtyStep: 1, tickSize: 0.5, maxLeverage: 200, live: true };

/** In-memory exchange: market orders fill at `price`, everything else rests until cancelled. */
class FakeExchange {
  price = 70_000;
  positions = new Map<string, number>();
  orders: OrderInfo[] = [];
  key = (c: ApiCredentials, s: string) => `${c.apiKey}:${s}`;
  asExchange(): Exchange {
    const self = this;
    const order = (o: PlaceOrderRequest, status: OrderInfo['status'], filled: number): OrderInfo => ({ exchangeOrderId: `x${self.orders.length + 1}`, clientOrderId: o.clientOrderId ?? null, symbol: o.symbol, side: o.side, type: o.type, status, qty: o.qty, filledQty: filled, avgFillPrice: filled ? self.price : null, limitPrice: o.limitPrice ?? null, stopPrice: o.stopPrice ?? null, reduceOnly: !!o.reduceOnly, createdAt: new Date() });
    return {
      id: 'DELTA_INDIA', env: 'testnet',
      async verify() { return { ok: true, canTrade: true, equityUsd: 10_000, availableUsd: 10_000, baseCurrency: 'USD', accountRef: `${tag}-acct-${Math.random()}` }; },
      async getAccount() { return { equityUsd: 10_000, availableUsd: 10_000, baseCurrency: 'USD' }; },
      async getPositions(c) { return [...self.positions].filter(([k, s]) => k.startsWith(`${c.apiKey}:`) && s !== 0).map(([k, size]) => ({ symbol: k.split(':')[1]!, size, avgEntry: self.price, markPrice: self.price, unrealizedPnl: 0, liquidationPrice: null, leverage: 10 })); },
      async getFills() { return []; },
      async listInstruments() { return [BTC]; },
      async getInstrument(s) { return s === 'BTCUSD' ? BTC : null; },
      async resolveInstrument() { return BTC; },
      async getMarkPrice() { return self.price; },
      async placeOrder(c, o) {
        let r: OrderInfo;
        if (o.type === 'MARKET') {
          const k = self.key(c, o.symbol);
          self.positions.set(k, (self.positions.get(k) ?? 0) + (o.side === 'BUY' ? o.qty : -o.qty));
          r = order(o, 'FILLED', o.qty);
        } else r = order(o, 'OPEN', 0);
        self.orders.push(r);
        return r;
      },
      async cancelOrder(_c, ref) { const o = self.orders.find((x) => x.exchangeOrderId === ref.exchangeOrderId); if (o) o.status = 'CANCELLED'; return o ?? { ...self.orders[0]!, exchangeOrderId: ref.exchangeOrderId, status: 'CANCELLED' }; },
      async getOrder(_c, ref) { return self.orders.find((x) => x.exchangeOrderId === ref.exchangeOrderId || x.clientOrderId === ref.clientOrderId) ?? null; },
      async getOpenOrders(_c, s) { return self.orders.filter((x) => x.status === 'OPEN' && (!s || x.symbol === s)); },
      async setLeverage(_c, _s, lev) { return lev; },
      async getLeverage() { return 10; },
      async closePosition() { return null; },
      async streamFills() { return { close() {} }; },
    } as Exchange;
  }
}

describe.skipIf(!local)('audit trail for trading actions', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let routes: RouteInfo[] = [];
  const fx = new FakeExchange();
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const me = { id: '', email: `${tag}-me@trading.test`, cookie: '' };
  const lead = { id: '', email: `${tag}-lead@trading.test` };
  let conn = '', spare = '', leaderId = '', apiKey = '', basketOrderId = '';
  const call = async (method: string, path: string, body?: unknown, opts: { bearer?: string; cookie?: string } = {}) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: origin(), 'user-agent': UA, 'x-forwarded-for': `198.51.100.9, ${IP}`, ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : { cookie: opts.cookie ?? me.cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, body: (text ? JSON.parse(text) : null) as { data: Record<string, unknown> & { order?: { id: string } }; error?: { message: string } } };
  };
  const ok = async (method: string, path: string, body?: unknown, opts?: { bearer?: string }) => {
    const r = await call(method, path, body, opts);
    expect(r.status, `${method} ${path}: ${JSON.stringify(r.body).slice(0, 300)}`).toBeLessThan(300);
    return r.body.data;
  };
  /** The newest event, which must be of this kind and carry where it came from. */
  const lastEvent = async (kind: string, via: 'app' | 'api_key' = 'app') => {
    const e = await prisma.activityEvent.findFirst({ where: { userId: me.id }, orderBy: { at: 'desc' } });
    expect(e?.kind).toBe(kind);
    expect(e).toMatchObject({ ip: IP, userAgent: UA });
    if (['order_placed', 'order_cancelled', 'position_closed', 'protection_changed', 'webhook_changed', 'follow_changed', 'leader_changed', 'deployment_changed', 'subscription_changed'].includes(kind)) expect((e!.data as { via: string }).via).toBe(via);
    return e!;
  };
  const tick = () => new Promise((r) => setTimeout(r, 5)); // keep event times apart

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, {
      DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: 'true', PLATFORM_ACCESS_ENABLED: 'false', PLANS_ENABLED: 'false',
      // A key for this run only: the fixtures are encrypted with it, nothing real is.
      CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    });
    vi.doMock('../lib/email/client.js', () => ({ sendEmail: async () => undefined }));
    vi.doMock('../lib/rate-limit.js', async (orig) => ({ ...(await orig<typeof import('../lib/rate-limit.js')>()), perUserRateLimit: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
    vi.doMock('@tradinjournal/exchange', async (orig) => ({ ...(await orig<typeof import('@tradinjournal/exchange')>()), adapterFor: () => fx.asExchange() }));
    // The options basket's own flow is covered in orders.integration; here only its record.
    vi.doMock('../modules/options/orders.service.js', async (orig) => ({
      ...(await orig<typeof import('../modules/options/orders.service.js')>()),
      placeBasket: async () => ({ message: 'All legs sent.', legs: [{ symbol: 'C-BTC-100000-311226', outcome: 'filled', message: 'Filled', order: { id: basketOrderId } }] }),
    }));
    const { createApp } = await import('../app.js');
    const { listRoutes } = await import('./routes.js');
    const app = createApp();
    routes = listRoutes(app);
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { encryptWithKey, parseEncryptionKey } = await import('@tradinjournal/secrets');
    const key = parseEncryptionKey(process.env.CREDENTIAL_ENCRYPTION_KEY)!;
    for (const u of [me, lead]) {
      const row = await prisma.user.create({ data: { email: u.email, name: 'Audit', emailVerified: true } });
      await prisma.account.create({ data: { userId: row.id, accountId: row.id, providerId: 'credential', password: await hashPassword(PASS) } });
      u.id = row.id;
    }
    const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: me.email, password: PASS }) });
    me.cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]!).join('; ');
    const mk = async (userId: string, label: string) => (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey(`${tag}-${label}`, key), apiSecretEnc: encryptWithKey('s', key), keyLast4: '0000', keyFingerprint: `${tag}-${label}`, canTrade: true } })).id;
    conn = await mk(me.id, 'Main');
    spare = await mk(me.id, 'Spare');
    leaderId = (await prisma.copyLeader.create({ data: { userId: lead.id, connectionId: await mk(lead.id, 'Lead'), displayName: `${tag} Leader`, status: 'VERIFIED', listed: true } })).id;
    basketOrderId = (await prisma.exchangeOrder.create({ data: { userId: me.id, connectionId: conn, source: 'MANUAL', clientOrderId: `opt:${tag}:1`, symbol: 'C-BTC-100000-311226', side: 'BUY', type: 'LIMIT', qty: 1, status: 'FILLED' } })).id;
  }, 120_000);

  afterAll(async () => {
    if (prisma) {
      await prisma.strategy.deleteMany({ where: { userId: { in: [me.id, lead.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [me.id, lead.id].filter(Boolean) } } });
    }
    await close();
    await prisma?.$disconnect();
  });

  it('knows the record every trading write leaves', () => {
    const writes = routes.filter((r) => r.method !== 'GET' && AREAS.some((a) => r.template === a || r.template.startsWith(`${a}/`))).map((r) => `${r.method} ${r.template}`);
    expect(writes.length).toBeGreaterThan(30);
    expect(writes.filter((k) => !TRAIL[k] && !NO_TRAIL[k])).toEqual([]);
    const real = new Set(routes.map((r) => `${r.method} ${r.template}`));
    expect([...Object.keys(TRAIL), ...Object.keys(NO_TRAIL)].filter((k) => !real.has(k))).toEqual([]);
  });

  it('records desk orders, cancels, closes and take-profit / stop-loss, with where they came from', async () => {
    const t = { connectionId: conn, symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 3 } };
    const placed = await ok('POST', '/api/trading/orders', { ...t, requestId: `${tag}-1` });
    expect(placed.outcome).toBe('filled');
    const e1 = await lastEvent('order_placed');
    expect(e1.summary).toBe('Buy BTCUSD market, 3 contracts: filled');
    expect((e1.data as { orderIds: string[] }).orderIds).toEqual([placed.order!.id]);
    await tick();

    await ok('POST', '/api/trading/protection', { connectionId: conn, symbol: 'BTCUSD', stopLoss: 65_000, takeProfit: 80_000 });
    expect((await lastEvent('protection_changed')).summary).toMatch(/^Changed take-profit \/ stop-loss on BTCUSD: /);
    await tick();

    const resting = await ok('POST', '/api/trading/orders', { ...t, type: 'LIMIT', limitPrice: 60_000, size: { mode: 'contracts', value: 1 }, requestId: `${tag}-2` });
    await tick();
    const xid = (await prisma.exchangeOrder.findUnique({ where: { id: resting.order!.id } }))!.exchangeOrderId!;
    await ok('POST', '/api/trading/orders/cancel', { connectionId: conn, symbol: 'BTCUSD', exchangeOrderId: xid });
    expect((await lastEvent('order_cancelled')).data).toMatchObject({ exchangeOrderId: xid, via: 'app' });
    await tick();

    const closed = await ok('POST', '/api/trading/positions/close', { connectionId: conn, symbol: 'BTCUSD' });
    expect((await lastEvent('position_closed')).data).toMatchObject({ orderIds: [closed.order!.id] });
    await tick();

    await ok('POST', '/api/trading/positions/close-many', { items: [{ connectionId: conn, symbol: 'BTCUSD' }] });
    expect((await lastEvent('position_closed')).summary).toBe('Closed 1 position (0 sent, 1 not)'); // already flat
  });

  it('marks orders sent with an API key as such', async () => {
    const k = await ok('POST', '/api/trading/api-keys', { name: 'Bot', scope: 'trade' });
    await lastEvent('api_key_created');
    apiKey = k.key as string;
    await tick();
    const placed = await ok('POST', '/api/v1/orders', { connectionId: conn, symbol: 'BTCUSD', side: 'SELL', type: 'MARKET', size: { mode: 'contracts', value: 2 }, requestId: `${tag}-3` }, { bearer: apiKey });
    const e = await lastEvent('order_placed', 'api_key');
    expect(e.summary).toBe('Sell BTCUSD market, 2 contracts: filled (API key)');
    expect((e.data as { apiKeyId: string }).apiKeyId).toBe(k.id);
    expect((e.data as { orderIds: string[] }).orderIds).toEqual([placed.order!.id]);
    await tick();
    await ok('POST', '/api/v1/positions/close', { connectionId: conn, symbol: 'BTCUSD' }, { bearer: apiKey });
    await lastEvent('position_closed', 'api_key');
    await tick();
    await ok('POST', '/api/v1/orders/cancel', { connectionId: conn, symbol: 'BTCUSD', exchangeOrderId: 'x1' }, { bearer: apiKey });
    await lastEvent('order_cancelled', 'api_key');
    await tick();
    await ok('POST', `/api/trading/api-keys/${k.id as string}/revoke`);
    await lastEvent('api_key_revoked');
  });

  it('records option orders and webhook changes', async () => {
    await ok('POST', '/api/options/orders', { connectionId: conn, requestId: `${tag}-opt`, underlying: 'BTC', legs: [{ kind: 'call', side: 1, qty: 1, strike: 100000, expiry: '311226' }] });
    expect((await lastEvent('order_placed')).data).toMatchObject({ orderIds: [basketOrderId], underlying: 'BTC' });
    await tick();
    await ok('POST', '/api/trading/webhook', { connectionId: conn });
    expect((await lastEvent('webhook_changed')).summary).toMatch(/^Set up the TradingView webhook on Main with a new secret \(…\w{4}\)$/);
    await tick();
    await ok('PATCH', '/api/trading/webhook', { enabled: false });
    expect((await lastEvent('webhook_changed')).summary).toBe('Changed the TradingView webhook: turned it off');
    await tick();
    await ok('DELETE', '/api/trading/webhook');
    expect((await lastEvent('webhook_changed')).summary).toBe('Removed the TradingView webhook');
  });

  it('records copy trading and leader changes', async () => {
    const f = await ok('POST', '/api/follows', { leaderId, connectionId: conn, sizingMode: 'PROPORTIONAL', sizingValue: 1, riskAccepted: true, riskVersion: COPY_RISK_VERSION });
    await lastEvent('follow_started');
    await tick();
    await ok('PATCH', `/api/follows/${f.id as string}`, { action: 'pause' });
    expect((await lastEvent('follow_changed')).summary).toBe(`Copy of ${tag} Leader: paused`);
    await tick();
    await ok('PATCH', `/api/follows/${f.id as string}`, { leverage: 5, maxPositionUsd: 500 });
    expect((await lastEvent('follow_changed')).summary).toBe(`Copy of ${tag} Leader: changed leverage, maxPositionUsd`);
    await tick();
    await ok('POST', `/api/follows/${f.id as string}/stop`, { closePositions: false });
    await lastEvent('follow_stopped');
    await tick();
    await ok('POST', '/api/leaders/apply', { connectionId: spare, displayName: 'Audit Lead', bio: 'Trend following on BTC, small size.' });
    expect((await lastEvent('leader_changed')).summary).toBe('Applied to lead copy trading as Audit Lead');
    await tick();
    await ok('PATCH', '/api/leaders/me', { listed: false });
    expect((await lastEvent('leader_changed')).summary).toBe('Changed the leader profile: hidden from the leaderboard');
  });

  it('records strategy runs and marketplace subscriptions', async () => {
    const core = await import('@tradinjournal/core');
    const spec = core.defaultSpec('BTCUSDT');
    const s = await prisma.strategy.create({ data: { userId: me.id, name: 'Audit strat', spec: spec as object } });
    const d = await ok('POST', `/api/strategies/${s.id}/deployments`, { mode: 'paper', capital: 1000 });
    await lastEvent('deployment_started');
    await tick();
    await ok('POST', `/api/deployments/${d.id as string}/size`, { multiplier: 2 });
    expect((await lastEvent('deployment_changed')).summary).toBe('Set “Audit strat” to 2× size');
    await tick();
    await ok('POST', `/api/deployments/${d.id as string}/pause`);
    expect((await lastEvent('deployment_changed')).summary).toBe('Paused “Audit strat”');
    await tick();
    await ok('POST', `/api/deployments/${d.id as string}/resume`);
    expect((await lastEvent('deployment_changed')).summary).toBe('Resumed “Audit strat”');
    await tick();

    // A published template from the other user, subscribed on paper.
    await prisma.creatorProfile.create({ data: { userId: lead.id, displayName: 'Audit creator', bio: 'b', status: 'approved' } });
    const ls = await prisma.strategy.create({ data: { userId: lead.id, name: 'Lead strat', spec: spec as object } });
    const t = await prisma.strategyTemplate.create({ data: { creatorId: lead.id, strategyId: ls.id, version: 1, spec: spec as object, name: 'Audit template', summary: 'A test template summary.', description: 'A test template description that is long enough.', category: 'trend', risk: 'low', exchanges: ['delta_india'], symbols: ['BTCUSDT'], interval: spec.session.interval, status: 'published', publishedAt: new Date() } });
    const sub = await ok('POST', `/api/marketplace/${t.id}/subscribe`, { mode: 'paper', capital: 1000 });
    await lastEvent('deployment_started');
    await tick();
    await ok('POST', `/api/marketplace/subscriptions/${sub.id as string}/size`, { multiplier: 1.5 });
    expect((await lastEvent('subscription_changed')).summary).toBe('Set the “Audit template” subscription to 1.5× size');
    await tick();
    await ok('POST', `/api/marketplace/subscriptions/${sub.id as string}/pause`);
    expect((await lastEvent('subscription_changed')).summary).toBe('Paused the “Audit template” subscription');
  });

  it('records nothing when the action didn’t happen', async () => {
    const before = await prisma.activityEvent.count({ where: { userId: me.id } });
    expect((await call('POST', '/api/trading/positions/close', { connectionId: 'nope', symbol: 'BTCUSD' })).status).toBe(404);
    expect((await call('POST', '/api/trading/positions/close', { connectionId: conn, symbol: 'BTCUSD' })).status).toBe(409); // flat
    expect((await call('PATCH', '/api/trading/webhook', { enabled: true })).status).toBe(404); // removed above
    expect(await prisma.activityEvent.count({ where: { userId: me.id } })).toBe(before);
  });

  it('shows where each order came from on the order’s own row, without a second row', async () => {
    const feed = await ok('GET', '/api/me/activity?limit=100');
    const items = feed.items as unknown as Array<{ id: string; kind: string; summary: string; ip: string | null; device: string | null; group: string }>;
    expect(items.some((i) => i.kind === 'order_placed' || i.kind === 'position_closed')).toBe(false);
    const rows = items.filter((i) => i.kind === 'order');
    const sent = rows.filter((i) => i.ip === IP);
    expect(sent.length).toBeGreaterThanOrEqual(5); // 2 desk orders, 2 closes, the API order and its close, the basket
    expect(sent.every((i) => i.device === 'Chrome on macOS')).toBe(true);
    expect(rows.find((i) => i.summary.startsWith('Sell 2 BTCUSD'))!.summary).toContain('by you (API key) on Main');
    expect(rows.find((i) => i.id === basketOrderId)).toMatchObject({ ip: IP });
    const trading = (await ok('GET', '/api/me/activity?group=trading&limit=100')).items as unknown as Array<{ kind: string }>;
    for (const k of ['order_cancelled', 'protection_changed', 'webhook_changed', 'follow_changed', 'leader_changed', 'deployment_changed', 'subscription_changed', 'follow_started', 'deployment_started']) expect(trading.map((i) => i.kind), k).toContain(k);
  });
});
