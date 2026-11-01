// Patterns over HTTP: real app and auth, market data mocked, AI off.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `path${Date.now()}`;

describe.skipIf(!local)('patterns over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let cookie = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const get = (q: string, c = cookie) => fetch(`${base}/api/patterns${q}`, { headers: { cookie: c } });
  const explain = (b: unknown) => fetch(`${base}/api/patterns/explain`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(), cookie }, body: JSON.stringify(b) });

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    vi.doMock('../../../lib/ai/provider.js', async (orig) => ({ ...(await orig<object>()), isAiEnabled: () => false }));
    vi.doMock('../../market/market.service.js', async (orig) => ({
      ...(await orig<object>()),
      loadPublicCandles: async (symbol: string, tf: string, limit: number) => {
        if (symbol === 'NODATAUSDT') return [];
        const ms = tf === '1d' ? 86_400_000 : tf === '4h' ? 14_400_000 : 3_600_000;
        const pts: Array<[number, number]> = [[0, 70], [25, 100], [37, 88], [49, 100.3], [64, 85]];
        const closes: number[] = [];
        for (let k = 1; k < pts.length; k++) { const [i0, p0] = pts[k - 1]!; const [i1, p1] = pts[k]!; for (let i = i0; i < i1; i++) closes.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0)); }
        closes.push(85);
        const first = Math.floor(Date.now() / ms) * ms - closes.length * ms;
        return closes.map((c, i) => ({ openTime: first + i * ms, open: c, high: c + 0.3, low: c - 0.3, close: c, volume: 1 })).slice(-limit);
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
    const u = await prisma.user.create({ data: { email, name: 'pat', emailVerified: true } });
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Patterns-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Patterns-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    expect((await get('?symbol=BTCUSDT&tf=1h', '')).status).toBe(401);
  });

  it('lists patterns, validates input and explains one', async () => {
    const r = await get(`?symbol=${tag.toUpperCase()}USDT&tf=1h`);
    expect(r.status).toBe(200);
    const d = ((await r.json()) as { data: { patterns: Array<{ id: string; kind: string }> } }).data;
    const top = d.patterns.find((p) => p.kind === 'double_top')!;
    expect(top).toBeTruthy();
    expect((await get('?symbol=BTCUSDT&tf=2h')).status).toBe(422);
    expect((await get('?symbol=NODATAUSDT&tf=1h')).status).toBe(422);
    const e = await explain({ symbol: `${tag.toUpperCase()}USDT`, tf: '1h', id: top.id });
    expect(e.status).toBe(200);
    expect(((await e.json()) as { data: { source: string; whatItIs: string } }).data).toMatchObject({ source: 'rules' });
    expect((await explain({ symbol: `${tag.toUpperCase()}USDT`, tf: '1h', id: 'gone:1' })).status).toBe(404);
    expect((await explain({ symbol: 'X' })).status).toBe(422);
  });
});
