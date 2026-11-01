// /api/trading over HTTP: absent while trading is off, sign-in required, input
// validated, cross-site writes refused. Real app, local test DB; no exchange calls.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `dkhttp${Date.now()}`;

async function serve(on: boolean) {
  vi.resetModules();
  Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: on ? 'true' : 'false' });
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

describe.skipIf(!local)('/api/trading over HTTP', () => {
  let close: (() => Promise<unknown>) | null = null;
  let prisma: typeof import('@tradinjournal/db').prisma | null = null;
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  afterEach(async () => { await close?.(); close = null; });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('does not exist while trading is off', async () => {
    const s = await serve(false);
    close = s.close;
    expect((await fetch(`${s.base}/api/trading/overview`)).status).toBe(404);
  });

  it('needs sign-in, validates input and refuses cross-site closes', async () => {
    const s = await serve(true);
    close = s.close;
    const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${s.base}/api/trading/positions/close`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(), ...headers }, body: JSON.stringify(body) });
    expect((await fetch(`${s.base}/api/trading/overview`)).status).toBe(401);
    expect((await fetch(`${s.base}/api/trading/orders`)).status).toBe(401);
    expect((await post({ connectionId: 'x', symbol: 'BTCUSD' })).status).toBe(401);

    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const email = `${tag}@trading.test`;
    const u = await prisma.user.create({ data: { email, name: 'desk', emailVerified: true } });
    await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword('Desk-http-pass-12345') } });
    const cookie = (await auth.api.signInEmail({ body: { email, password: 'Desk-http-pass-12345' }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;

    expect((await post({ connectionId: 'x', symbol: 'BTCUSD', qty: -1 }, { cookie })).status).toBe(422);
    expect((await post({ connectionId: 'x' }, { cookie })).status).toBe(422);
    expect((await post({ connectionId: 'x', symbol: 'BTCUSD', confirmCopied: 'yes' }, { cookie })).status).toBe(422);
    expect((await fetch(`${s.base}/api/trading/orders?status=weird`, { headers: { cookie } })).status).toBe(422);
    expect((await post({ connectionId: 'x', symbol: 'BTCUSD' }, { cookie, origin: 'https://evil.example' })).status).toBe(403);
    // Someone else's (or no) account: not found, and nothing is sent.
    expect((await post({ connectionId: 'nope', symbol: 'BTCUSD' }, { cookie })).status).toBe(404);
    // No exchange accounts: an empty desk, not an error.
    const ov = await fetch(`${s.base}/api/trading/overview`, { headers: { cookie } });
    expect(ov.status).toBe(200);
    expect(((await ov.json()) as { data: unknown }).data).toEqual({ positions: [], pending: [], closed: [], counts: { open: 0, pending: 0, closed: 0, rejected: 0 }, errors: [] });
    const orders = await fetch(`${s.base}/api/trading/orders?status=rejected&source=MANUAL`, { headers: { cookie } });
    expect(((await orders.json()) as { data: unknown }).data).toEqual({ items: [], nextCursor: null });
  });
});
