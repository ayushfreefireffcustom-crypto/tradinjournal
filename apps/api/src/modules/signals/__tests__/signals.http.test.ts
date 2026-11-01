// Signals over HTTP: real app and auth, market data mocked.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `sigh${Date.now()}`;

describe.skipIf(!local)('signals over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let cookie = '';
  const get = (path: string, c = cookie) => fetch(`${base}/api/signals${path}`, { headers: { cookie: c } });

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    const H = 3_600_000;
    vi.doMock('../../screener/universe.js', async (orig) => ({
      ...(await orig<object>()),
      loadUniverse: async (n: number) => Array.from({ length: n }, (_, i) => ({ symbol: `${tag.toUpperCase()}${i}USDT`, base: `${tag.toUpperCase()}${i}`, price: 1, change24h: 0, volume24h: 1e6 - i, high24h: 0, low24h: 0 })),
    }));
    vi.doMock('../../market/market.service.js', async (orig) => ({
      ...(await orig<object>()),
      loadPublicCandles: async (symbol: string, tf: string, limit: number) => {
        if (symbol === 'NODATAUSDT') return [];
        const ms = tf === '1d' ? 24 * H : tf === '4h' ? 4 * H : H;
        const first = Math.floor(Date.now() / ms) * ms - 259 * ms;
        return Array.from({ length: 260 }, (_, i) => ({ openTime: first + i * ms, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 })).slice(-limit);
      },
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
    const u = await prisma.user.create({ data: { email, name: 'sig', emailVerified: true } });
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Signals-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Signals-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    expect((await get('?universe=25', '')).status).toBe(401);
    expect((await get('/BTCUSDT', '')).status).toBe(401);
  });

  it('lists ratings and validates the universe', async () => {
    const r = await get('?universe=25');
    expect(r.status).toBe(200);
    const d = ((await r.json()) as { data: { rows: Array<{ ratings: Record<string, { label: string }> }> } }).data;
    expect(d.rows).toHaveLength(25);
    expect(d.rows[0]!.ratings['4h']!.label).toMatch(/buy/);
    expect((await get('?universe=30')).status).toBe(422);
  });

  it('explains one symbol', async () => {
    const r = await get('/ethusdt');
    expect(r.status).toBe(200);
    const d = ((await r.json()) as { data: { symbol: string; timeframes: Array<{ ma: { components: unknown[] } }> } }).data;
    expect(d.symbol).toBe('ETHUSDT');
    expect(d.timeframes[0]!.ma.components).toHaveLength(16);
    expect((await get('/NODATAUSDT')).status).toBe(422);
  });
});
