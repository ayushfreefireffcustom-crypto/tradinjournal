// /api/admin/copy over HTTP: absent when trading is off, 401 signed out,
// 403 for non-admins, and working for admins. Real app, local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `achttp${Date.now()}`;
const ADMIN = `${tag}-admin@trading.test`;

async function serve(tradingEnabled: boolean) {
  vi.resetModules();
  Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: tradingEnabled ? 'true' : 'false', ADMIN_EMAILS: ADMIN });
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => server.close(r)) };
}

describe.skipIf(!local)('/api/admin/copy over HTTP', () => {
  let s: Awaited<ReturnType<typeof serve>>;
  let prisma: typeof import('@tradinjournal/db').prisma;
  const cookies: Record<string, string> = {};
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = async (who: string | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${s.base}${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), ...(who ? { cookie: cookies[who]! } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as { data?: unknown; error?: { code: string } } | null };
  };

  beforeAll(async () => {
    s = await serve(true);
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const hash = await hashPassword('Admin-copy-pass-12345');
    for (const [n, email] of [['admin', ADMIN], ['user', `${tag}-user@trading.test`]]) {
      const u = await prisma.user.create({ data: { email: email!, name: n!, emailVerified: true } });
      await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: hash } });
      const r = await auth.api.signInEmail({ body: { email: email!, password: 'Admin-copy-pass-12345' }, returnHeaders: true });
      cookies[n!] = r.headers.get('set-cookie')!.split(';')[0]!;
    }
  });

  afterAll(async () => {
    await s?.close();
    await prisma?.systemSetting.deleteMany({ where: { key: 'copy.killSwitch' } });
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  const routes: Array<[string, string, unknown?]> = [
    ['GET', '/api/admin/copy/leaders'],
    ['POST', '/api/admin/copy/leaders/x/action', { action: 'approve' }],
    ['GET', '/api/admin/copy/kill-switch'],
    ['POST', '/api/admin/copy/kill-switch', { enabled: false }],
    ['GET', '/api/admin/copy/health'],
    ['GET', '/api/admin/copy/users/x'],
    ['POST', '/api/admin/copy/follows/x/stop', { reason: 'test' }],
  ];

  it('needs sign-in, then admin', async () => {
    for (const [m, p, b] of routes) {
      expect((await call(null, m, p, b)).status, `${m} ${p} signed out`).toBe(401);
      expect((await call('user', m, p, b)).status, `${m} ${p} as user`).toBe(403);
    }
    // Nothing changed for the non-admin's attempts.
    expect(await prisma.systemSetting.findUnique({ where: { key: 'copy.killSwitch' } })).toBeNull();
  });

  it('works for an admin, with validation', async () => {
    expect((await call('admin', 'GET', '/api/admin/copy/leaders')).status).toBe(200);
    expect((await call('admin', 'GET', '/api/admin/copy/leaders?status=BOGUS')).status).toBe(422);
    expect((await call('admin', 'GET', '/api/admin/copy/health')).json?.data).toMatchObject({ engine: expect.any(Object), last24h: expect.any(Object) });
    expect((await call('admin', 'POST', '/api/admin/copy/leaders/x/action', { action: 'explode' })).status).toBe(422);
    expect((await call('admin', 'POST', '/api/admin/copy/leaders/nope/action', { action: 'approve' })).status).toBe(404);
    // Turning the switch on needs a reason.
    expect((await call('admin', 'POST', '/api/admin/copy/kill-switch', { enabled: true })).status).toBe(422);
    const on = await call('admin', 'POST', '/api/admin/copy/kill-switch', { enabled: true, reason: 'drill' });
    expect(on.json?.data).toMatchObject({ enabled: true, reason: 'drill', by: ADMIN });
    expect((await call('admin', 'POST', '/api/admin/copy/kill-switch', { enabled: false })).json?.data).toMatchObject({ enabled: false });
    expect((await call('admin', 'POST', '/api/admin/copy/follows/nope/stop', { reason: 'x' })).status).toBe(422);
    expect((await call('admin', 'POST', '/api/admin/copy/follows/nope/stop', { reason: 'testing' })).status).toBe(404);
    // The rest of the admin API is still reachable alongside the copy router.
    expect((await call('admin', 'GET', '/api/admin/overview')).status).toBe(200);
  });

  it('is absent while trading is off', async () => {
    const off = await serve(false);
    try {
      expect((await fetch(`${off.base}/api/admin/copy/health`, { headers: { cookie: cookies.admin!, origin: origin() } })).status).toBe(404);
    } finally {
      await off.close();
    }
  });
});
