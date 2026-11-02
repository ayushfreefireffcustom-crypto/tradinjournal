// Named watchlists over HTTP (QW.12): real app, local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanWatchlistSymbols as cleanSymbols } from '@tradinjournal/contracts';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `wlh${Date.now()}`;
const PASS = 'Watchlist-pass-12345';

describe('cleanSymbols', () => {
  it('trims, drops blanks and repeats, keeps order and case', () => {
    expect(cleanSymbols([' BTCUSDT', 'EURUSD.m', '', 'BTCUSDT ', 'eurusd.m'])).toEqual(['BTCUSDT', 'EURUSD.m', 'eurusd.m']);
  });
});

describe.skipIf(!local)('watchlists over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  const ids: Record<'me' | 'other' | 'legacy', string> = { me: '', other: '', legacy: '' };
  const cookies: Record<'me' | 'other' | 'legacy', string> = { me: '', other: '', legacy: '' };
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const call = (who: keyof typeof cookies, method: string, path: string, body?: unknown) => fetch(`${base}/api/market${path}`, {
    method, headers: { 'content-type': 'application/json', origin: origin(), cookie: cookies[who] }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = async (r: Response) => (await r.json()) as { data: any; error?: { message: string } };
  const lists = async (who: keyof typeof cookies) => (await json(await call(who, 'GET', '/watchlists'))).data.lists as { id: string; name: string; symbols: string[] }[];

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
    for (const who of ['me', 'other', 'legacy'] as const) {
      const email = `${tag}-${who}@trading.test`;
      const u = await prisma.user.create({ data: { email, name: who, emailVerified: true } });
      ids[who] = u.id;
      await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: await hashPassword(PASS) } });
      cookies[who] = (await auth.api.signInEmail({ body: { email, password: PASS }, returnHeaders: true })).headers.get('set-cookie')!.split(';')[0]!;
    }
    await prisma.watchlist.create({ data: { userId: ids.legacy, symbols: ['ETHUSDT', 'XAUUSD', 'ETHUSDT'] } });
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.watchlist.deleteMany({ where: { userId: { in: Object.values(ids).filter(Boolean) } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    const r = await fetch(`${base}/api/market/watchlists`, { headers: { origin: origin() } });
    expect(r.status).toBe(401);
  });

  it('starts every user with one list', async () => {
    const a = await lists('me');
    expect(a).toEqual([{ id: expect.any(String), name: 'Watchlist', symbols: [] }]);
    expect(await lists('me')).toEqual(a); // a second read doesn't add another
  });

  it('copies the old single watchlist into the first list and leaves the old row alone', async () => {
    const [first, ...rest] = await lists('legacy');
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ name: 'Watchlist', symbols: ['ETHUSDT', 'XAUUSD'] });
    expect((await prisma.watchlist.findUnique({ where: { userId: ids.legacy } }))?.symbols).toEqual(['ETHUSDT', 'XAUUSD', 'ETHUSDT']);
  });

  it('a burst of first reads still makes exactly one list', async () => {
    await Promise.all(Array.from({ length: 6 }, () => call('other', 'GET', '/watchlists')));
    expect(await prisma.watchlistList.count({ where: { userId: ids.other } })).toBe(1);
  });

  it('creates, renames and replaces symbols', async () => {
    const r = await call('me', 'POST', '/watchlists', { name: '  Crypto ', symbols: ['BTCUSDT', 'BTCUSDT', 'SOLUSDT'] });
    expect(r.status).toBe(201);
    const made = (await json(r)).data;
    expect(made).toMatchObject({ name: 'Crypto', symbols: ['BTCUSDT', 'SOLUSDT'] });
    const ren = await json(await call('me', 'PATCH', `/watchlists/${made.id}`, { name: 'Coins', symbols: ['ETHUSDT'] }));
    expect(ren.data).toMatchObject({ id: made.id, name: 'Coins', symbols: ['ETHUSDT'] });
    expect((await lists('me')).map((l) => l.name)).toEqual(['Watchlist', 'Coins']);
  });

  it('refuses a name already used, ignoring case', async () => {
    const r = await call('me', 'POST', '/watchlists', { name: 'coins' });
    expect(r.status).toBe(409);
    expect((await json(r)).error?.message).toContain('Coins');
    const first = (await lists('me'))[0]!;
    expect((await call('me', 'PATCH', `/watchlists/${first.id}`, { name: 'COINS' })).status).toBe(409);
    expect((await call('me', 'PATCH', `/watchlists/${first.id}`, { name: 'watchlist' })).status).toBe(200); // its own name, new case
  });

  it('rejects bad input', async () => {
    expect((await call('me', 'POST', '/watchlists', { name: '' })).status).toBe(422);
    expect((await call('me', 'POST', '/watchlists', { name: 'x'.repeat(33) })).status).toBe(422);
    expect((await call('me', 'POST', '/watchlists', { name: 'Big', symbols: Array.from({ length: 101 }, (_, i) => `S${i}`) })).status).toBe(422);
    const first = (await lists('me'))[0]!;
    expect((await call('me', 'PATCH', `/watchlists/${first.id}`, {})).status).toBe(422);
  });

  it('stops at 8 lists, even when the requests race', async () => {
    const have = (await lists('me')).length;
    const tries = await Promise.all(Array.from({ length: 10 }, (_, i) => call('me', 'POST', '/watchlists', { name: `Race ${i}` })));
    expect(tries.filter((r) => r.status === 201)).toHaveLength(8 - have);
    expect(tries.filter((r) => r.status === 409)).toHaveLength(10 - (8 - have));
    expect(await prisma.watchlistList.count({ where: { userId: ids.me } })).toBe(8);
    const r = await call('me', 'POST', '/watchlists', { name: 'Ninth' });
    expect(r.status).toBe(409);
    expect((await json(r)).error?.message).toMatch(/up to 8/);
  });

  it('keeps at least one list, even when deletes race', async () => {
    const all = await lists('me');
    const dels = await Promise.all(all.map((l) => call('me', 'DELETE', `/watchlists/${l.id}`)));
    expect(dels.filter((r) => r.status === 200)).toHaveLength(all.length - 1);
    const left = await lists('me');
    expect(left).toHaveLength(1);
    const r = await call('me', 'DELETE', `/watchlists/${left[0]!.id}`);
    expect(r.status).toBe(409);
    expect((await json(r)).error?.message).toMatch(/at least one/);
  });

  it('treats another user’s list like one that doesn’t exist', async () => {
    const theirs = (await lists('other'))[0]!;
    await call('other', 'PATCH', `/watchlists/${theirs.id}`, { symbols: ['BTCUSDT'] });
    expect((await call('me', 'PATCH', `/watchlists/${theirs.id}`, { name: 'Mine now' })).status).toBe(404);
    expect((await call('me', 'DELETE', `/watchlists/${theirs.id}`)).status).toBe(404);
    expect((await call('me', 'PATCH', '/watchlists/cmnotarealid0000000000000', { name: 'x' })).status).toBe(404);
    expect(await lists('other')).toEqual([{ id: theirs.id, name: 'Watchlist', symbols: ['BTCUSDT'] }]);
    expect((await lists('me')).some((l) => l.id === theirs.id)).toBe(false);
  });

  it('the old single-list routes read and write the first list', async () => {
    const put = await json(await call('me', 'PUT', '/watchlist', { symbols: ['EURUSD', 'EURUSD', 'GBPUSD'] }));
    expect(put.data).toEqual({ symbols: ['EURUSD', 'GBPUSD'] });
    expect((await json(await call('me', 'GET', '/watchlist'))).data).toEqual({ symbols: ['EURUSD', 'GBPUSD'] });
    expect((await lists('me'))[0]!.symbols).toEqual(['EURUSD', 'GBPUSD']);
  });
});
