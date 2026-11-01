// Personal API keys and /api/v1 (D16) over HTTP: real app, local test DB.
// No exchange call happens: the account used has no exchange connections.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `apik${Date.now()}`;

describe.skipIf(!local)('personal API keys and /api/v1', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../api-keys.service.js');
  let cookie = '';
  let me = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const app = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const v1 = (key: string | null, method: string, path: string, body?: unknown) => fetch(`${base}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: 'true' });
    const { createApp } = await import('../../../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../api-keys.service.js');
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const email = `${tag}@trading.test`;
    const u = await prisma.user.create({ data: { email, name: 'keys', emailVerified: true } });
    me = u.id;
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Api-keys-pass-12345') } });
    cookie = (await auth.api.signInEmail({ body: { email, password: 'Api-keys-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('parses only well-formed live keys', async () => {
    expect(await svc.authenticateApiKey(undefined)).toBeNull();
    expect(await svc.authenticateApiKey('Bearer nope')).toBeNull();
    expect(await svc.authenticateApiKey('Basic tl_abcdefghijkl_' + 'x'.repeat(40))).toBeNull();
    expect(await svc.authenticateApiKey('Bearer tl_abcdefghijkl_' + 'x'.repeat(40))).toBeNull(); // unknown prefix
  });

  it('creates, lists and revokes keys from the app, showing each key once', async () => {
    expect((await app('POST', '/api/trading/api-keys', { name: '', scope: 'read' })).status).toBe(422);
    expect((await app('POST', '/api/trading/api-keys', { name: 'x', scope: 'admin' })).status).toBe(422);
    const r = await app('POST', '/api/trading/api-keys', { name: 'Bot', scope: 'read' });
    expect(r.status).toBe(201);
    const k = ((await r.json()) as { data: { key: string; id: string; last4: string; prefix: string } }).data;
    expect(k.key).toMatch(/^tl_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{32,64}$/);
    expect(k.key.endsWith(k.last4)).toBe(true);
    const list = ((await (await app('GET', '/api/trading/api-keys')).json()) as { data: Array<Record<string, unknown>> }).data;
    expect(list.map((x) => x.name)).toEqual(['Bot']);
    expect(JSON.stringify(list)).not.toContain(k.key.split('_')[2]);
    expect(JSON.stringify(await prisma.apiKey.findMany({ where: { userId: me } }))).not.toContain(k.key.split('_')[2]);
    // Signed out: no key management.
    expect((await fetch(`${base}/api/trading/api-keys`)).status).toBe(401);
  });

  it('read keys can read, not trade; trade keys can trade; a session cookie is not a key', async () => {
    const mk = async (scope: 'read' | 'trade') => ((await (await app('POST', '/api/trading/api-keys', { name: scope, scope })).json()) as { data: { key: string; id: string } }).data;
    const read = await mk('read');
    const trade = await mk('trade');
    expect((await v1(null, 'GET', '/accounts')).status).toBe(401);
    expect((await fetch(`${base}/api/v1/accounts`, { headers: { cookie } })).status).toBe(401);
    const acc = await v1(read.key, 'GET', '/accounts');
    expect(acc.status).toBe(200);
    expect(((await acc.json()) as { data: unknown[] }).data).toEqual([]);
    expect((await v1(read.key, 'GET', '/positions')).status).toBe(200);
    expect((await v1(read.key, 'GET', '/orders?status=all')).status).toBe(200);
    const ticket = { connectionId: 'nope', symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 1 }, requestId: 'script-12345678' };
    expect((await v1(read.key, 'POST', '/orders', ticket)).status).toBe(403);
    expect((await v1(read.key, 'POST', '/positions/close', { connectionId: 'nope', symbol: 'BTCUSD' })).status).toBe(403);
    expect((await v1(trade.key, 'POST', '/orders', { ...ticket, requestId: undefined })).status).toBe(422);
    expect((await v1(trade.key, 'POST', '/orders', ticket)).status).toBe(404); // not their account: nothing sent
    // A tampered secret with a real prefix is refused.
    const tampered = trade.key.slice(0, -2) + (trade.key.endsWith('A') ? 'BB' : 'AA');
    expect((await v1(tampered, 'GET', '/accounts')).status).toBe(401);
    // Last used is recorded.
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: read.id } })).lastUsedAt).not.toBeNull();
    // Revoked: refused at once.
    expect((await app('POST', `/api/trading/api-keys/${read.id}/revoke`)).status).toBe(200);
    expect((await v1(read.key, 'GET', '/accounts')).status).toBe(401);
    expect((await app('POST', '/api/trading/api-keys/not-mine/revoke')).status).toBe(404);
  });

  it('allows at most 10 active keys', async () => {
    const active = await prisma.apiKey.count({ where: { userId: me, revokedAt: null } });
    for (let i = active; i < 10; i++) expect((await app('POST', '/api/trading/api-keys', { name: `k${i}`, scope: 'read' })).status).toBe(201);
    const over = await app('POST', '/api/trading/api-keys', { name: 'eleventh', scope: 'read' });
    expect(over.status).toBe(409);
  });
});
