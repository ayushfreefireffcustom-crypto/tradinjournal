// /api/notifications/inbox over HTTP: sign-in, validation, and the per-group
// preference PATCH. Real app, local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `inhttp${Date.now()}`;

describe.skipIf(!local)('/api/notifications/inbox over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let cookie = '';
  let userId = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = async (signedIn: boolean, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), ...(signedIn ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as { data?: any; error?: { code: string } } | null };
  };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    const { createApp } = await import('../../../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const email = `${tag}@trading.test`;
    const u = await prisma.user.create({ data: { email, name: 'inbox', emailVerified: true } });
    userId = u.id;
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Inbox-http-pass-12345') } });
    const r = await auth.api.signInEmail({ body: { email, password: 'Inbox-http-pass-12345' }, returnHeaders: true });
    cookie = r.headers.get('set-cookie')!.split(';')[0]!;
    await prisma.notification.createMany({ data: [{ userId, kind: 'copy.loss_limit', title: 'a' }, { userId, kind: 'price_alert', title: 'b' }] });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs sign-in', async () => {
    expect((await call(false, 'GET', '/api/notifications/inbox')).status).toBe(401);
    expect((await call(false, 'POST', '/api/notifications/inbox', { action: 'read' })).status).toBe(401);
  });

  it('rejects bad input with 422', async () => {
    expect((await call(true, 'GET', '/api/notifications/inbox?group=nope')).status).toBe(422);
    expect((await call(true, 'GET', '/api/notifications/inbox?status=deleted')).status).toBe(422);
    expect((await call(true, 'GET', '/api/notifications/inbox?limit=500')).status).toBe(422);
    expect((await call(true, 'POST', '/api/notifications/inbox', { action: 'delete' })).status).toBe(422);
    expect((await call(true, 'POST', '/api/notifications/inbox', { action: 'read', ids: 'x' })).status).toBe(422);
    expect((await call(true, 'PATCH', '/api/notifications/preferences', { groups: { nope: { email: false } } })).status).toBe(422);
    expect((await call(true, 'PATCH', '/api/notifications/preferences', { groups: { news: { sms: true } } })).status).toBe(422);
  });

  it('lists, filters and acts', async () => {
    const all = await call(true, 'GET', '/api/notifications/inbox');
    expect(all.status).toBe(200);
    expect(all.json!.data.total).toMatchObject({ risk: 1, news: 1, trades: 0 });
    const risk = await call(true, 'GET', '/api/notifications/inbox?group=risk&status=unread');
    expect(risk.json!.data.items.map((i: { title: string }) => i.title)).toEqual(['a']);
    const act = await call(true, 'POST', '/api/notifications/inbox', { action: 'archive', group: 'news' });
    expect(act.json!.data.updated).toBe(1);
    expect((await call(true, 'GET', '/api/notifications/inbox?status=archived')).json!.data.items.map((i: { title: string }) => i.title)).toEqual(['b']);
  });

  it('saves per-group preferences and returns them', async () => {
    const r = await call(true, 'PATCH', '/api/notifications/preferences', { groups: { news: { push: false } } });
    expect(r.status).toBe(200);
    expect(r.json!.data.groups).toEqual({ news: { push: false } });
    expect((await call(true, 'GET', '/api/notifications/preferences')).json!.data.groups).toEqual({ news: { push: false } });
  });
});
