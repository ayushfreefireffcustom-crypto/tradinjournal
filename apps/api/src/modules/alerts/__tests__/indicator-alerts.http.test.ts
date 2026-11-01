// Indicator alerts over HTTP: real app, local test DB, market data mocked.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `indh${Date.now()}`;

describe.skipIf(!local)('indicator alerts over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let cookie = '';
  let me = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = (method: string, path: string, body?: unknown, c = cookie) => fetch(`${base}/api/indicator-alerts${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie: c }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async (r: Response) => ((await r.json()) as { data: any; error?: { message: string } });
  const rule = { symbol: 'BTCUSDT', timeframe: '1h', left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 14 } }, operator: 'lt', right: { kind: 'value', value: 30 } };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    const H = 3_600_000;
    const start = Math.floor(Date.now() / H) * H - 80 * H;
    vi.doMock('../../market/market.service.js', async (orig) => ({
      ...(await orig<object>()),
      loadPublicCandles: async (symbol: string, _tf: string, limit: number) =>
        symbol === 'NOPE' ? [] : Array.from({ length: 81 }, (_, i) => ({ openTime: start + i * H, open: 100 - i * 0.5, high: 101 - i * 0.5, low: 99 - i * 0.5, close: 100 - i * 0.5, volume: 1 })).slice(-limit),
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
    const u = await prisma.user.create({ data: { email, name: 'ind', emailVerified: true } });
    me = u.id;
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Ind-alerts-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Ind-alerts-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    expect((await call('GET', '/', undefined, '')).status).toBe(401);
    expect((await call('GET', '/catalogue', undefined, '')).status).toBe(401);
  });

  it('serves the catalogue without compute functions', async () => {
    const r = await call('GET', '/catalogue');
    expect(r.status).toBe(200);
    const cat = (await json(r)).data as Array<Record<string, unknown>>;
    expect(cat).toHaveLength(36);
    expect(cat.find((x) => x.id === 'rsi')).toMatchObject({ label: 'RSI', outputs: [{ key: 'value', scale: 'percent' }] });
    expect(cat.every((x) => !('compute' in x))).toBe(true);
  });

  it('previews, creates, lists, pauses and deletes', async () => {
    const pv = await call('POST', '/preview', rule);
    expect(pv.status).toBe(200);
    const p = (await json(pv)).data;
    expect(p).toMatchObject({ symbol: 'BTCUSDT', enoughData: true, met: true, left: 0 }); // a steady fall: RSI 0
    expect(p.bars).toBe(80); // the forming bar is left out

    const c = await call('POST', '/', { ...rule, note: 'oversold bounce' });
    expect(c.status).toBe(201);
    const a = (await json(c)).data;
    expect(a).toMatchObject({ status: 'active', cooldownSec: 3600, recurring: true, description: 'RSI(14) is below 30', note: 'oversold bounce' });
    expect((await json(await call('GET', '/'))).data.map((x: { id: string }) => x.id)).toEqual([a.id]);

    expect((await json(await call('PATCH', `/${a.id}`, { status: 'paused' }))).data.status).toBe('paused');
    expect((await call('PATCH', `/${a.id}`, {})).status).toBe(422);
    expect((await call('PATCH', `/${a.id}`, { status: 'triggered' })).status).toBe(422);
    expect((await call('PATCH', '/not-mine', { status: 'paused' })).status).toBe(404);
    expect((await call('DELETE', `/${a.id}`)).status).toBe(200);
    expect((await call('DELETE', `/${a.id}`)).status).toBe(404);
    expect((await json(await call('GET', '/firings'))).data).toEqual([]);
  });

  it('explains why a rule is refused', async () => {
    const bad = async (body: unknown, re: RegExp) => {
      const r = await call('POST', '/', body);
      expect(r.status).toBe(422);
      expect(JSON.stringify(await r.json())).toMatch(re);
    };
    await bad({ ...rule, right: { kind: 'indicator', id: 'ema', output: 'value' } }, /same units/);
    await bad({ ...rule, right: { kind: 'value', value: 130 } }, /0 to 100/);
    await bad({ ...rule, symbol: 'NOPE' }, /No market data for NOPE/);
    await bad({ ...rule, timeframe: '1m' }, /timeframe/);
    await bad({ ...rule, operator: 'between' }, /operator/);
    await bad({ ...rule, left: { kind: 'value', value: 1 } }, /left/);
    await bad({ ...rule, extra: 1 }, /VALIDATION_ERROR/); // unknown keys refused
    await bad({ ...rule, left: { ...rule.left, params: { length: 0 } } }, /between 1 and 500/);
  });

  it('keeps at most 50 rules per person', async () => {
    await prisma.indicatorAlert.createMany({ data: Array.from({ length: 50 }, () => ({ userId: me, symbol: 'BTCUSDT', timeframe: '1h', left: rule.left, operator: 'lt', right: rule.right })) });
    const r = await call('POST', '/', rule);
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).toMatch(/up to 50/);
  });
});
