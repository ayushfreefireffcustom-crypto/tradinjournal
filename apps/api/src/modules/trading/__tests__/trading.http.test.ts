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
    // New routes: sign-in, validation, CSV headers.
    for (const path of ['/api/trading/orders/summary', '/api/trading/orders/export.csv']) expect((await fetch(`${s.base}${path}`)).status, path).toBe(401);
    expect((await fetch(`${s.base}/api/trading/positions/close-many`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: '{"items":[]}' })).status).toBe(401);
    expect((await fetch(`${s.base}/api/trading/orders?from=2026-06-02&to=2026-06-01`, { headers: { cookie } })).status).toBe(422);
    expect((await fetch(`${s.base}/api/trading/orders?from=not-a-date`, { headers: { cookie } })).status).toBe(422);
    expect((await fetch(`${s.base}/api/trading/orders/summary?side=HOLD`, { headers: { cookie } })).status).toBe(422);
    const many = (items: unknown) => fetch(`${s.base}/api/trading/positions/close-many`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(), cookie }, body: JSON.stringify({ items }) });
    expect((await many([])).status).toBe(422);
    expect((await many(Array.from({ length: 51 }, () => ({ connectionId: 'x', symbol: 'BTCUSD' })))).status).toBe(422);
    const okMany = await many([{ connectionId: 'nope', symbol: 'BTCUSD' }]);
    expect(okMany.status).toBe(200);
    expect(((await okMany.json()) as { data: { results: Array<{ ok: boolean }> } }).data.results).toEqual([expect.objectContaining({ ok: false, symbol: 'BTCUSD' })]);
    const csv = await fetch(`${s.base}/api/trading/orders/export.csv?symbol=btcusd`, { headers: { cookie } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toMatch(/^text\/csv/);
    expect(csv.headers.get('content-disposition')).toMatch(/attachment; filename="tradelogs-orders-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(csv.headers.get('x-rows')).toBe('0');
    expect((await csv.text()).trim()).toMatch(/^sent_at_utc,/);
    expect(((await (await fetch(`${s.base}/api/trading/orders/summary`, { headers: { cookie } })).json()) as { data: unknown }).data).toMatchObject({ placed: 0, filledNotionalUsd: 0 });

    // Order ticket routes.
    const ticket = { connectionId: 'nope', symbol: 'btcusd', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 1 }, requestId: 'abcd-1234-efgh' };
    const postT = (path: string, body: unknown, withCookie = true) => fetch(`${s.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(), ...(withCookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    expect((await postT('/api/trading/orders', ticket, false)).status).toBe(401);
    expect((await postT('/api/trading/orders/preview', ticket, false)).status).toBe(401);
    expect((await fetch(`${s.base}/api/trading/quote?connectionId=x&symbol=BTCUSD`)).status).toBe(401);
    for (const bad of [
      { ...ticket, requestId: undefined },
      { ...ticket, requestId: 'short' },
      { ...ticket, requestId: '../../etc/passwd!!' },
      { ...ticket, size: { mode: 'lots', value: 1 } },
      { ...ticket, size: { mode: 'risk', value: 25 } },
      { ...ticket, size: { mode: 'contracts', value: -1 } },
      { ...ticket, type: 'TRAILING' },
      { ...ticket, tif: 'FOK' },
      { ...ticket, leverage: 0 },
      { ...ticket, leverage: 2.5 },
      { ...ticket, side: 'LONG' },
    ]) expect((await postT('/api/trading/orders', bad)).status, JSON.stringify(bad)).toBe(422);
    expect((await fetch(`${s.base}/api/trading/quote?symbol=BTCUSD`, { headers: { cookie } })).status).toBe(422);
    // Valid shape, someone else's / no account: 404 and nothing sent.
    expect((await postT('/api/trading/orders', ticket)).status).toBe(404);
    expect((await postT('/api/trading/orders/preview', ticket)).status).toBe(404);
    expect((await fetch(`${s.base}/api/trading/quote?connectionId=nope&symbol=BTCUSD`, { headers: { cookie } })).status).toBe(404);
    expect((await postT('/api/trading/orders', ticket, true).then(async () => fetch(`${s.base}/api/trading/orders`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie }, body: JSON.stringify(ticket) }))).status).toBe(403);

    const orders = await fetch(`${s.base}/api/trading/orders?status=rejected&source=MANUAL`, { headers: { cookie } });
    expect(((await orders.json()) as { data: unknown }).data).toEqual({ items: [], nextCursor: null });
  });
});
