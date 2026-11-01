// Strategies over HTTP: real app and auth, local test DB, no market calls.
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `sth${Date.now()}`;

describe.skipIf(!local)('strategies over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let core: typeof import('@tradinjournal/core');
  let cookie = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = (method: string, path: string, body?: unknown, c = cookie) => fetch(`${base}/api/strategies${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie: c }, body: body === undefined ? undefined : JSON.stringify(body) });

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    const { createApp } = await import('../../../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    core = await import('@tradinjournal/core');
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const email = `${tag}@trading.test`;
    const u = await prisma.user.create({ data: { email, name: 'sth', emailVerified: true } });
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Strategies-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Strategies-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    expect((await call('GET', '', undefined, '')).status).toBe(401);
  });

  it('creates, lists, inspects and validates', async () => {
    const c = await call('POST', '', { name: 'Mine' });
    expect(c.status).toBe(201);
    const s = ((await c.json()) as { data: { id: string; validation: { blockers: unknown[] }; readback: string[] } }).data;
    expect(s.validation.blockers).toEqual([]);
    expect(s.readback.length).toBeGreaterThan(2);
    expect(((await (await call('GET', '')).json()) as { data: Array<{ id: string }> }).data.map((x) => x.id)).toContain(s.id);
    const spec = core.defaultSpec();
    spec.market.leverage = 50;
    spec.risk.stopLoss = { mode: 'pct', value: 3 };
    const ins = ((await (await call('POST', '/inspect', spec)).json()) as { data: { validation: { blockers: Array<{ code: string }> } } }).data;
    expect(ins.validation.blockers.map((b) => b.code)).toContain('over_leverage');
    expect((await call('POST', '/inspect', { ...spec, version: 1 })).status).toBe(422);
    expect((await call('POST', '/chart', { spec, bars: 5 })).status).toBe(422);
    expect((await call('POST', '', { name: '' })).status).toBe(422);
    expect((await call('PATCH', `/${s.id}`, {})).status).toBe(422);
    expect((await call('GET', '/nope')).status).toBe(404);
    expect((await call('POST', `/${s.id}/backtests`, { from: 'x', to: 'y', capital: 1, slippageBps: 0 })).status).toBe(422);
  });
});
