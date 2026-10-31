// HTTP checks for /api/leaders and /api/follows with real signed-in users:
// absent while trading is off, sign-in required, input validation, and no
// cross-user access. Uses the real app against the local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const PASSWORD = 'Copy-http-pass-12345';

async function serve(tradingEnabled: boolean) {
  vi.resetModules();
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.TRADING_ENABLED = tradingEnabled ? 'true' : 'false';
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

describe.skipIf(!local)('/api/leaders and /api/follows over HTTP', () => {
  const tag = `chttp${Date.now()}`;
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  let riskVersion = '';
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const cookies: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const call = async (who: string | null, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: origin(), ...(who ? { cookie: cookies[who]! } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { code: string; message: string } } | null;
    return { status: res.status, json };
  };

  beforeAll(async () => {
    const s = await serve(true);
    base = s.base;
    close = s.close;
    ({ prisma } = await import('@tradinjournal/db'));
    ({ COPY_RISK_VERSION: riskVersion } = await import('@tradinjournal/contracts'));
    const { hashPassword } = await import('better-auth/crypto');
    const { auth } = await import('../../../lib/auth.js');
    const hash = await hashPassword(PASSWORD);
    for (const n of ['lead', 'fol', 'eve']) {
      const email = `${tag}-${n}@trading.test`;
      const u = await prisma.user.create({ data: { email, name: `HTTP ${n}`, emailVerified: true } });
      await prisma.account.create({ data: { userId: u.id, accountId: u.id, providerId: 'credential', password: hash } });
      const r = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
      cookies[n] = r.headers.get('set-cookie')!.split(';')[0]!;
      ids[n] = u.id;
      const c = await prisma.exchangeConnection.create({
        data: { userId: u.id, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: `acct-${n}`, apiKeyEnc: 'enc:v1:x', apiSecretEnc: 'enc:v1:x', keyLast4: 'abcd', keyFingerprint: `${tag}-${n}`, canTrade: true, status: 'ACTIVE' },
      });
      ids[`conn-${n}`] = c.id;
    }
    const l = await prisma.copyLeader.create({ data: { userId: ids.lead!, connectionId: ids['conn-lead']!, displayName: `${tag} Lead`, bio: 'HTTP test leader.', status: 'VERIFIED' } });
    ids.leader = l.id;
  });

  afterAll(async () => {
    await close();
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('requires sign-in on every route', async () => {
    const routes: Array<[string, string]> = [
      ['GET', '/api/leaders'],
      ['GET', '/api/leaders/me'],
      ['POST', '/api/leaders/apply'],
      ['PATCH', '/api/leaders/me'],
      ['GET', '/api/leaders/x'],
      ['GET', '/api/leaders/x/trades'],
      ['GET', '/api/leaders/x/equity'],
      ['GET', '/api/follows'],
      ['POST', '/api/follows'],
      ['GET', '/api/follows/x'],
      ['GET', '/api/follows/x/orders'],
      ['PATCH', '/api/follows/x'],
      ['POST', '/api/follows/x/stop'],
    ];
    for (const [m, p] of routes) expect((await call(null, m, p, m === 'GET' ? undefined : {})).status, `${m} ${p}`).toBe(401);
  });

  it('rejects bad input with 422 before touching anything', async () => {
    expect((await call('fol', 'GET', '/api/leaders?sort=bogus')).status).toBe(422);
    expect((await call('fol', 'GET', '/api/leaders?range=5y')).status).toBe(422);
    expect((await call('fol', 'GET', `/api/leaders/${ids.leader}/trades?limit=1000`)).status).toBe(422);
    const follow = { leaderId: ids.leader, connectionId: ids['conn-fol'], riskAccepted: true, riskVersion };
    const bad = [
      { ...follow, riskAccepted: false },
      { ...follow, riskVersion: 'old' },
      { ...follow, sizingMode: 'MULTIPLIER', sizingValue: 500 },
      { ...follow, sizingMode: 'YOLO' },
      { ...follow, dailyLossLimitUsd: -1 },
      { ...follow, leaderId: '' },
    ];
    for (const b of bad) {
      const r = await call('fol', 'POST', '/api/follows', b);
      expect(r.status, JSON.stringify(b)).toBe(422);
      expect(r.json?.error?.code).toBe('VALIDATION_ERROR');
    }
    expect((await call('fol', 'POST', '/api/leaders/apply', { connectionId: ids['conn-fol'], displayName: 'x', bio: 'short' })).status).toBe(422);
    expect(await prisma.copyFollow.count({ where: { userId: ids.fol } })).toBe(0);
  });

  it('runs a follow end to end and keeps it private', async () => {
    const list = await call('fol', 'GET', `/api/leaders?q=${encodeURIComponent(tag)}`);
    expect(list.status).toBe(200);
    expect((list.json!.data as Array<{ id: string }>).map((l) => l.id)).toEqual([ids.leader]);
    expect((await call('fol', 'GET', `/api/leaders/${ids.leader}?range=7d`)).status).toBe(200);
    expect((await call('fol', 'GET', `/api/leaders/${ids.leader}/equity?range=all`)).status).toBe(200);

    const created = await call('fol', 'POST', '/api/follows', { leaderId: ids.leader, connectionId: ids['conn-fol'], sizingMode: 'MULTIPLIER', sizingValue: 2, riskAccepted: true, riskVersion });
    expect(created.status).toBe(201);
    const id = (created.json!.data as { id: string }).id;
    expect((await call('fol', 'POST', '/api/follows', { leaderId: ids.leader, connectionId: ids['conn-fol'], riskAccepted: true, riskVersion })).status).toBe(409);

    // Another user: the follow does not exist for them, whatever the method.
    expect((await call('eve', 'GET', `/api/follows/${id}`)).status).toBe(404);
    expect((await call('eve', 'GET', `/api/follows/${id}/orders`)).status).toBe(404);
    expect((await call('eve', 'PATCH', `/api/follows/${id}`, { action: 'pause' })).status).toBe(404);
    expect((await call('eve', 'POST', `/api/follows/${id}/stop`, { closePositions: true })).status).toBe(404);
    expect((await call('eve', 'GET', '/api/follows')).json!.data).toEqual([]);
    // Eve can't copy onto someone else's exchange account either.
    expect((await call('eve', 'POST', '/api/follows', { leaderId: ids.leader, connectionId: ids['conn-fol'], riskAccepted: true, riskVersion })).status).toBe(404);

    const paused = await call('fol', 'PATCH', `/api/follows/${id}`, { action: 'pause' });
    expect(paused.json!.data).toMatchObject({ status: 'PAUSED' });
    expect((await call('fol', 'GET', `/api/follows/${id}`)).json!.data).toMatchObject({ id, positions: [], trackingErrorBps: null });
    expect((await call('fol', 'GET', `/api/follows/${id}/orders`)).json!.data).toEqual({ items: [], nextCursor: null });
    const stopped = await call('fol', 'POST', `/api/follows/${id}/stop`, {});
    expect(stopped.status).toBe(200);
    expect(stopped.json!.data).toMatchObject({ follow: { status: 'STOPPED' }, closes: [] });
    expect((await call('fol', 'PATCH', `/api/follows/${id}`, { action: 'resume' })).status).toBe(409);
    expect((await call('fol', 'GET', '/api/follows?all=1')).json!.data).toEqual([expect.objectContaining({ id, status: 'STOPPED' })]);
  });

  it("refuses to let a leader copy themselves, and hides pending leaders", async () => {
    expect((await call('lead', 'POST', '/api/follows', { leaderId: ids.leader, connectionId: ids['conn-lead'], riskAccepted: true, riskVersion })).status).toBe(409);
    const applied = await call('eve', 'POST', '/api/leaders/apply', { connectionId: ids['conn-eve'], displayName: `${tag} Eve`, bio: 'Swing trades on majors, weekly holds.' });
    expect(applied.status).toBe(201);
    const pendingId = (applied.json!.data as { id: string }).id;
    expect((await call('eve', 'GET', '/api/leaders/me')).json!.data).toMatchObject({ status: 'PENDING' });
    expect((await call('fol', 'GET', `/api/leaders/${pendingId}`)).status).toBe(404);
    expect((await call('fol', 'GET', `/api/leaders/${pendingId}/trades`)).status).toBe(404);
    expect((await call('eve', 'GET', `/api/leaders/${pendingId}`)).status).toBe(200);
    expect((await call('fol', 'GET', '/api/leaders/me')).json!.data).toBeNull();
    expect((await call('fol', 'PATCH', '/api/leaders/me', { listed: false })).status).toBe(404);
  });

  it('streams a ping when the user\'s copies change, and only theirs', async () => {
    expect((await fetch(`${base}/api/follows/stream`, { headers: { origin: origin() } })).status).toBe(401);
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/follows/stream`, { headers: { origin: origin(), cookie: cookies.fol! }, signal: ctrl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    let text = '';
    // One read stays pending across waits; a timed-out wait must not drop it.
    let pending: ReturnType<typeof reader.read> | null = null;
    const readFor = async (ms: number) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        pending ??= reader.read();
        const r = await Promise.race([pending, new Promise<null>((ok) => setTimeout(() => ok(null), end - Date.now()))]);
        if (!r) break;
        pending = null;
        if (r.done) break;
        text += new TextDecoder().decode(r.value);
      }
    };
    // Let one tick pass: the check overlaps by 0.5 s, so changes from just
    // before the stream opened may still ping once (a harmless refetch).
    await readFor(2600);
    expect(text).toContain('retry: 5000');
    text = '';
    const base2 = { connectionId: ids['conn-eve']!, source: 'COPY' as const, symbol: 'BTCUSD', side: 'BUY' as const, type: 'MARKET' as const, qty: 1, status: 'SKIPPED' as const };
    // Someone else's activity: no ping for this user.
    await prisma.exchangeOrder.create({ data: { ...base2, userId: ids.eve!, clientOrderId: `${tag}-other` } });
    await readFor(4500);
    expect(text).not.toContain('"changed"');
    // Their own activity: a ping within a couple of ticks.
    await prisma.exchangeOrder.create({ data: { ...base2, userId: ids.fol!, connectionId: ids['conn-fol']!, clientOrderId: `${tag}-mine` } });
    await readFor(5000);
    expect(text).toContain('"type":"changed"');
    ctrl.abort();
  }, 25_000);

  it('is absent while trading is off', async () => {
    const off = await serve(false);
    try {
      for (const p of ['/api/leaders', '/api/follows']) expect((await fetch(`${off.base}${p}`)).status).toBe(404);
    } finally {
      await off.close();
    }
  });
});
