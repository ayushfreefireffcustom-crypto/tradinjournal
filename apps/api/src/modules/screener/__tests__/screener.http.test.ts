// Screener over HTTP: real app, local test DB, market data mocked.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `scrh${Date.now()}`;

describe.skipIf(!local)('screener over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let cookie = '';
  let me = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = (method: string, path: string, body?: unknown, c = cookie) => fetch(`${base}/api/screener${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie: c }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = async (r: Response) => ((await r.json()) as { data: any }).data;
  const rsi = { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 14 } };
  const oversold = { timeframe: '1h', universe: 50, groups: [[{ type: 'indicator', left: rsi, operator: 'lt', right: { kind: 'value', value: 30 } }]] };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    const H = 3_600_000;
    const start = Math.floor(Date.now() / H) * H - 59 * H;
    vi.doMock('../universe.js', async (orig) => ({
      ...(await orig<object>()),
      loadUniverse: async () => [
        { symbol: `${tag.toUpperCase()}DNUSDT`, base: 'DN', price: 41, change24h: -8, volume24h: 2e6, high24h: 0, low24h: 0 },
        { symbol: `${tag.toUpperCase()}UPUSDT`, base: 'UP', price: 159, change24h: 6, volume24h: 1e6, high24h: 0, low24h: 0 },
      ],
      loadFunding: async () => ({ source: null, rates: new Map() }),
    }));
    vi.doMock('../../market/market.service.js', async (orig) => ({
      ...(await orig<object>()),
      loadPublicCandles: async (symbol: string, _tf: string, limit: number) => Array.from({ length: 60 }, (_, i) => {
        const c = symbol.includes('DN') ? 100 - i : 100 + i;
        return { openTime: start + i * H, open: c, high: c + 1, low: c - 1, close: c, volume: 1 };
      }).slice(-limit),
    }));
    const { createApp } = await import('../../../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const email = `${tag}@trading.test`;
    const u = await prisma.user.create({ data: { email, name: 'scr', emailVerified: true } });
    me = u.id;
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Screener-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Screener-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    expect((await call('POST', '/run', oversold, '')).status).toBe(401);
    expect((await call('GET', '/screens', undefined, '')).status).toBe(401);
  });

  it('runs a screen', async () => {
    const r = await call('POST', '/run', oversold);
    expect(r.status).toBe(200);
    const d = await data(r);
    expect(d).toMatchObject({ universe: 2, scanned: 2, matched: 1, fundingSource: null, columns: [{ label: 'RSI(14)' }] });
    expect(d.rows[0]).toMatchObject({ base: 'DN', funding: null, values: [0] });
  });

  it('validates the definition', async () => {
    const bad = async (body: unknown, re: RegExp) => { const r = await call('POST', '/run', body); expect(r.status).toBe(422); expect(JSON.stringify(await r.json())).toMatch(re); };
    await bad({ ...oversold, timeframe: '1m' }, /timeframe/);
    await bad({ ...oversold, universe: 70 }, /universe/);
    await bad({ ...oversold, groups: [[{ type: 'field', field: 'marketCap', operator: 'gt', value: 1 }]] }, /groups/);
    await bad({ ...oversold, groups: Array.from({ length: 6 }, () => []) }, /groups/);
    await bad({ ...oversold, groups: [[{ type: 'indicator', left: rsi, operator: 'gt', right: { kind: 'value', value: 101 } }]] }, /0 to 100/);
  });

  it('saves, renames, lists and deletes screens, at most 20', async () => {
    const r = await call('POST', '/screens', { name: 'Oversold 1h', definition: oversold });
    expect(r.status).toBe(201);
    const s = await data(r);
    expect(s).toMatchObject({ name: 'Oversold 1h', definition: oversold });
    expect((await data(await call('PATCH', `/screens/${s.id}`, { name: 'Oversold' }))).name).toBe('Oversold');
    expect((await call('PATCH', `/screens/${s.id}`, {})).status).toBe(422);
    expect((await call('PATCH', '/screens/not-mine', { name: 'x' })).status).toBe(404);
    expect((await data(await call('GET', '/screens'))).map((x: { name: string }) => x.name)).toEqual(['Oversold']);
    expect((await call('POST', '/screens', { name: '', definition: oversold })).status).toBe(422);
    expect((await call('DELETE', `/screens/${s.id}`)).status).toBe(200);
    expect((await call('DELETE', `/screens/${s.id}`)).status).toBe(404);
    await prisma.savedScreen.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ userId: me, name: `s${i}`, definition: oversold })) });
    const over = await call('POST', '/screens', { name: 'one more', definition: oversold });
    expect(over.status).toBe(409);
  });
});
