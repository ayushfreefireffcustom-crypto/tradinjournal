// Account (H4–H8, H10) over HTTP: real app and auth, local test DB, emails captured.
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `acct${Date.now()}`;
const PASS = 'Account-pass-12345';

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from an otpauth:// URI. */
function totp(uri: string, at = Date.now()): string {
  const secret = new URL(uri).searchParams.get('secret')!;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

describe.skipIf(!local)('account over HTTP', () => {
  let base = '';
  let close: () => Promise<unknown> = async () => undefined;
  let prisma: typeof import('@tradinjournal/db').prisma;
  const mails: Array<{ to: string; subject: string; devNote?: string }> = [];
  const origin = () => process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
  const jar = (r: Response, prev = '') => {
    const m = new Map(prev ? prev.split('; ').map((c) => [c.split('=')[0]!, c] as const) : []);
    for (const c of r.headers.getSetCookie()) { const kv = c.split(';')[0]!; const [k, v] = [kv.split('=')[0]!, kv.slice(kv.indexOf('=') + 1)]; if (v) m.set(k, kv); else m.delete(k); }
    return [...m.values()].join('; ');
  };
  const call = (method: string, path: string, body?: unknown, cookie = '', ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36') =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', origin: origin(), cookie, 'user-agent': ua }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T;
  const signIn = async (email: string, password = PASS, ua?: string) => { const r = await call('POST', '/api/auth/sign-in/email', { email, password }, '', ua); return { r, cookie: jar(r), body: await json<{ twoFactorRedirect?: boolean }>(r) }; };
  let me = { id: '', email: `${tag}-me@trading.test` };
  let other = { id: '', email: `${tag}-other@trading.test` };
  let cookie = '';

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    vi.doMock('../../../lib/email/client.js', () => ({ sendEmail: async (m: { to: string; subject: string; devNote?: string }) => { mails.push(m); } }));
    const { createApp } = await import('../../../app.js');
    const server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => { server.closeAllConnections(); server.close(r); });
    ({ prisma } = await import('@tradinjournal/db'));
    const { hashPassword } = await import('better-auth/crypto');
    for (const u of [me, other]) {
      const row = await prisma.user.create({ data: { email: u.email, name: 'Acct Tester', emailVerified: true } });
      await prisma.account.create({ data: { userId: row.id, accountId: row.id, providerId: 'credential', password: await hashPassword(PASS) } });
      u.id = row.id;
    }
    me = { ...me }; other = { ...other };
    cookie = (await signIn(me.email)).cookie;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.verification.deleteMany({ where: { identifier: { contains: tag } } });
    await close();
    await prisma?.$disconnect();
  });

  it('needs a session', async () => {
    for (const p of ['/api/me/profile', '/api/me/activity', '/api/me/export', '/api/me/tour', '/api/feedback/mine']) expect((await call('GET', p)).status).toBe(401);
  });

  it('reads and edits the profile, with timezone kept on the notification preferences', async () => {
    const p = await json<{ data: { name: string; phone: string | null; timezone: string; hasPassword: boolean; signInMethods: string[]; twoFactorEnabled: boolean } }>(await call('GET', '/api/me/profile', undefined, cookie));
    expect(p.data).toMatchObject({ name: 'Acct Tester', phone: null, timezone: 'UTC', hasPassword: true, signInMethods: ['password'], twoFactorEnabled: false });
    const u = await call('PATCH', '/api/me/profile', { name: 'Asha K', phone: '+919876543210', timezone: 'Asia/Kolkata' }, cookie);
    expect(u.status).toBe(200);
    expect((await json<{ data: { name: string; phone: string; timezone: string } }>(u)).data).toMatchObject({ name: 'Asha K', phone: '+919876543210', timezone: 'Asia/Kolkata' });
    expect((await prisma.notificationPreference.findUnique({ where: { userId: me.id } }))!.timezone).toBe('Asia/Kolkata');
    expect((await call('PATCH', '/api/me/profile', { phone: '98765' }, cookie)).status).toBe(422);
    expect((await call('PATCH', '/api/me/profile', { timezone: 'Mars/Olympus' }, cookie)).status).toBe(422);
    expect((await call('PATCH', '/api/me/profile', { email: 'x@y.z' }, cookie)).status).toBe(422); // email isn't editable here
    expect((await json<{ data: { phone: string | null } }>(await call('PATCH', '/api/me/profile', { phone: null }, cookie))).data.phone).toBeNull();
  });

  it('keeps tour progress', async () => {
    expect((await json<{ data: unknown }>(await call('GET', '/api/me/tour', undefined, cookie))).data).toEqual({ seen: [], dismissed: false });
    await call('PATCH', '/api/me/tour', { seen: ['dashboard', 'builder'] }, cookie);
    const t = await json<{ data: unknown }>(await call('PATCH', '/api/me/tour', { seen: ['builder', 'leaders'], dismissed: true }, cookie));
    expect(t.data).toEqual({ seen: ['dashboard', 'builder', 'leaders'], dismissed: true });
    expect((await call('PATCH', '/api/me/tour', { seen: ['Bad Step!'] }, cookie)).status).toBe(422);
    expect((await json<{ data: unknown }>(await call('PATCH', '/api/me/tour', { reset: true }, cookie))).data).toEqual({ seen: [], dismissed: false });
  });

  it('turns on two-factor, challenges password sign-ins, accepts backup codes once, and turns off', async () => {
    // Enabling needs the password, and only counts once a code from the app checks out.
    expect((await call('POST', '/api/auth/two-factor/enable', { password: 'wrong-password' }, cookie)).status).toBe(400);
    const en = await json<{ totpURI: string; backupCodes: string[] }>(await call('POST', '/api/auth/two-factor/enable', { password: PASS }, cookie));
    expect(en.totpURI).toMatch(/^otpauth:\/\/totp\/TRADElogs:/);
    expect(en.backupCodes).toHaveLength(10);
    expect((await prisma.user.findUnique({ where: { id: me.id } }))!.twoFactorEnabled).toBe(false);
    expect((await call('POST', '/api/auth/two-factor/verify-totp', { code: '000000' }, cookie)).ok).toBe(false);
    const v = await call('POST', '/api/auth/two-factor/verify-totp', { code: totp(en.totpURI) }, cookie);
    expect(v.status).toBe(200);
    cookie = jar(v, cookie);
    expect((await prisma.user.findUnique({ where: { id: me.id } }))!.twoFactorEnabled).toBe(true);
    // The secret and codes aren't stored in the clear next to the user.
    const tf = await prisma.twoFactor.findFirst({ where: { userId: me.id } });
    expect(tf!.backupCodes).not.toContain(en.backupCodes[0]);

    // A password alone no longer signs in.
    const before = await prisma.activityEvent.count({ where: { userId: me.id, kind: 'sign_in' } });
    const s1 = await signIn(me.email);
    expect(s1.body.twoFactorRedirect).toBe(true);
    expect(s1.cookie).not.toMatch(/session_token=[^;]+/);
    expect((await call('GET', '/api/me/profile', undefined, s1.cookie)).status).toBe(401);
    const bad = await call('POST', '/api/auth/two-factor/verify-totp', { code: '123456' }, s1.cookie);
    expect(bad.ok).toBe(false);
    const ok2 = await call('POST', '/api/auth/two-factor/verify-totp', { code: totp(en.totpURI) }, s1.cookie);
    expect(ok2.status).toBe(200);
    const c2 = jar(ok2, s1.cookie);
    expect((await call('GET', '/api/me/profile', undefined, c2)).status).toBe(200);
    const signIns = await prisma.activityEvent.findMany({ where: { userId: me.id, kind: 'sign_in' }, orderBy: { at: 'desc' } });
    expect(signIns.length).toBe(before + 1); // the throwaway password session isn't logged
    expect(signIns[0]!.summary).toBe('Signed in with a two-factor code');

    // A backup code works once.
    const s2 = await signIn(me.email);
    const b1 = await call('POST', '/api/auth/two-factor/verify-backup-code', { code: en.backupCodes[0] }, s2.cookie);
    expect(b1.status).toBe(200);
    const s3 = await signIn(me.email);
    expect((await call('POST', '/api/auth/two-factor/verify-backup-code', { code: en.backupCodes[0] }, s3.cookie)).ok).toBe(false);

    // New backup codes, then off again (password needed).
    const g = await call('POST', '/api/auth/two-factor/generate-backup-codes', { password: PASS }, c2);
    expect((await json<{ backupCodes: string[] }>(g)).backupCodes).toHaveLength(10);
    const off = await call('POST', '/api/auth/two-factor/disable', { password: PASS }, c2);
    expect(off.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: me.id } }))!.twoFactorEnabled).toBe(false);
    cookie = jar(off, c2);
    const log = (await prisma.activityEvent.findMany({ where: { userId: me.id }, orderBy: { at: 'asc' }, select: { kind: true, summary: true } })).map((e) => e.summary);
    // Exactly the sign-ins that happened: no extra ones for the sessions re-issued on enable/disable.
    expect(log).toEqual([
      'Signed in with a password', 'Changed name, phone, timezone', 'Changed phone',
      'Turned on two-factor sign-in', 'Signed in with a two-factor code', 'Signed in with a backup code',
      'Made new backup codes (the old ones stopped working)', 'Turned off two-factor sign-in',
    ]);

    // A refused password change isn't logged; a real one is, without a fake sign-in for the new session.
    expect((await call('POST', '/api/auth/change-password', { currentPassword: 'not-it-at-all', newPassword: 'Account-pass-67890' }, cookie)).ok).toBe(false);
    const cp = await call('POST', '/api/auth/change-password', { currentPassword: PASS, newPassword: PASS, revokeOtherSessions: true }, cookie);
    expect(cp.status).toBe(200);
    cookie = jar(cp, cookie);
    const tail = (await prisma.activityEvent.findMany({ where: { userId: me.id }, orderBy: { at: 'desc' }, take: 2, select: { summary: true } })).map((e) => e.summary);
    expect(tail).toEqual(['Changed the password', 'Turned off two-factor sign-in']);
  });

  it('lists devices and signs out the others', async () => {
    const phone = await signIn(me.email, PASS, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    const lr = await call('GET', '/api/auth/list-sessions', undefined, cookie);
    expect(lr.status).toBe(200);
    const list = await json<Array<{ token: string; userAgent: string }>>(lr);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((s) => /iPhone/.test(s.userAgent))).toBe(true);
    expect((await call('POST', '/api/auth/revoke-other-sessions', {}, cookie)).status).toBe(200);
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(1);
    // The phone's session row is gone (its cookie cache can outlive it by up to 5 minutes).
    expect(await prisma.session.count({ where: { token: { in: list.map((s) => s.token) }, userId: me.id } })).toBe(1);
    void phone;
    const act = await json<{ data: { items: Array<{ kind: string; summary: string; device: string | null }> } }>(await call('GET', '/api/me/activity?group=security', undefined, cookie));
    expect(act.data.items[0]).toMatchObject({ kind: 'sessions_revoked', summary: 'Signed out every other device', device: 'Chrome on macOS' });
  });

  it('merges orders into the activity feed, filters by group and pages', async () => {
    const conn = await prisma.exchangeConnection.create({ data: { userId: me.id, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'Acct conn', apiKeyEnc: 'x', apiSecretEnc: 'y', keyLast4: 'abcd', keyFingerprint: `${tag}-fp`, canTrade: true } });
    await prisma.exchangeOrder.create({ data: { userId: me.id, connectionId: conn.id, source: 'MANUAL', clientOrderId: `${tag}-o1`, symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', qty: 2, status: 'FILLED' } });
    const all = await json<{ data: { items: Array<{ kind: string; summary: string; group: string }>; nextBefore: string | null } }>(await call('GET', '/api/me/activity', undefined, cookie));
    expect(all.data.items[0]).toMatchObject({ kind: 'order', group: 'orders', summary: 'Buy 2 BTCUSD · market · filled · by you on Acct conn' });
    const orders = await json<{ data: { items: Array<{ kind: string }> } }>(await call('GET', '/api/me/activity?group=orders', undefined, cookie));
    expect(orders.data.items.every((i) => i.kind === 'order')).toBe(true);
    const sec = await json<{ data: { items: Array<{ group: string }> } }>(await call('GET', '/api/me/activity?group=security', undefined, cookie));
    expect(sec.data.items.every((i) => i.group === 'security')).toBe(true);
    const p1 = await json<{ data: { items: Array<{ id: string; at: string }>; nextBefore: string } }>(await call('GET', '/api/me/activity?limit=3', undefined, cookie));
    expect(p1.data.items).toHaveLength(3);
    const p2 = await json<{ data: { items: Array<{ id: string; at: string }> } }>(await call('GET', `/api/me/activity?limit=3&before=${encodeURIComponent(p1.data.nextBefore)}`, undefined, cookie));
    expect(p2.data.items.some((i) => p1.data.items.some((j) => j.id === i.id))).toBe(false);
    expect(p2.data.items.every((i) => i.at < p1.data.items.at(-1)!.at)).toBe(true);
    // Someone else's activity never shows.
    expect((await prisma.activityEvent.count({ where: { userId: other.id } }))).toBe(0);
  });

  it('exports everything except secrets', async () => {
    await prisma.brokerAccount.create({ data: { userId: me.id, broker: 'Test', mt5Login: BigInt(900_000_000_000 + Number(String(Date.now()).slice(-6))), server: `${tag}-srv`, password: 'enc-broker-pass', marginMode: 'HEDGING' } });
    await prisma.apiKey.create({ data: { userId: me.id, name: 'k', prefix: `${tag}p`, secretHash: 'HASH-SHOULD-NOT-LEAK', last4: '9999', scope: 'read' } });
    await prisma.journalEntry.create({ data: { userId: me.id, body: 'my note' } });
    const r = await call('GET', '/api/me/export', undefined, cookie);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="tradelogs-export-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await r.text();
    const d = JSON.parse(text) as Record<string, unknown> & { profile: { email: string }; brokerAccounts: Array<{ mt5Login: string }>; exchangeConnections: Array<Record<string, unknown>>; apiKeys: Array<Record<string, unknown>> };
    expect(d.profile.email).toBe(me.email);
    expect(typeof d.brokerAccounts[0]!.mt5Login).toBe('string');
    for (const secret of ['enc-broker-pass', 'HASH-SHOULD-NOT-LEAK', '"apiKeyEnc"', '"apiSecretEnc"', '"secretHash"', '"token"', '"backupCodes"']) expect(text).not.toContain(secret);
    expect(d.exchangeConnections[0]).toMatchObject({ label: 'Acct conn', keyLast4: 'abcd' });
    expect((await prisma.activityEvent.findFirst({ where: { userId: me.id }, orderBy: { at: 'desc' } }))!.kind).toBe('data_exported');
  });

  it('takes feedback and keeps the admin view to admins', async () => {
    expect((await call('POST', '/api/feedback', { kind: 'bug', message: 'hi' }, cookie)).status).toBe(422);
    const f = await call('POST', '/api/feedback', { kind: 'bug', message: 'The calendar shows the wrong day near midnight.', page: '/calendar' }, cookie);
    expect(f.status).toBe(201);
    const mine = await json<{ data: Array<{ kind: string; status: string }> }>(await call('GET', '/api/feedback/mine', undefined, cookie));
    expect(mine.data[0]).toMatchObject({ kind: 'bug', status: 'new' });
    expect((await call('GET', '/api/admin/feedback', undefined, cookie)).status).toBe(403);
    expect((await call('PATCH', `/api/admin/feedback/${(await prisma.feedback.findFirst({ where: { userId: me.id } }))!.id}`, { status: 'done' }, cookie)).status).toBe(403);
  });

  it('refuses to delete while live strategies run, then deletes with the emailed code', async () => {
    // Something for every kind of table, so the delete has to reach them all.
    const strat = await prisma.strategy.create({ data: { userId: me.id, name: 'S', spec: {} } });
    const dep = await prisma.strategyDeployment.create({ data: { userId: me.id, strategyId: strat.id, version: 1, name: 'S', mode: 'live', status: 'running', spec: {}, capital: 100 } });
    await prisma.watchlist.create({ data: { userId: me.id, symbols: ['BTCUSDT'] } });
    await prisma.priceAlert.create({ data: { userId: me.id, symbol: 'BTCUSDT', direction: 'above', threshold: 1 } });
    await prisma.notification.create({ data: { userId: me.id, kind: 'news_alert', title: 't', body: 'b' } });
    await prisma.watchlist.create({ data: { userId: other.id, symbols: ['ETHUSDT'] } });
    // Every fixture row really exists, so the zero counts below mean something.
    for (const n of [await prisma.watchlist.count({ where: { userId: me.id } }), await prisma.priceAlert.count({ where: { userId: me.id } }), await prisma.notification.count({ where: { userId: me.id } }), await prisma.journalEntry.count({ where: { userId: me.id } }), await prisma.brokerAccount.count({ where: { userId: me.id } }), await prisma.exchangeOrder.count({ where: { userId: me.id } }), await prisma.activityEvent.count({ where: { userId: me.id } }), await prisma.feedback.count({ where: { userId: me.id } })]) expect(n).toBeGreaterThan(0);
    await prisma.notificationPreference.upsert({ where: { userId: other.id }, create: { userId: other.id }, update: {} });

    const blocked = await json<{ data: { blockers: string[] } }>(await call('GET', '/api/me/delete', undefined, cookie));
    expect(blocked.data.blockers[0]).toMatch(/1 live strategy is running/);
    expect((await call('POST', '/api/me/delete/request', {}, cookie)).status).toBe(409);
    await prisma.strategyDeployment.update({ where: { id: dep.id }, data: { status: 'stopped' } });

    const ask = await call('POST', '/api/me/delete/request', {}, cookie);
    expect(ask.status).toBe(200);
    expect((await json<{ data: { sentTo: string } }>(ask)).data.sentTo).toMatch(/^a•••@trading\.test$/);
    const otp = /: (\d{6})$/.exec(mails.filter((m) => m.to === me.email).at(-1)!.devNote!)![1]!;
    const wrong = otp === '000000' ? '000001' : '000000';
    expect((await call('POST', '/api/me/delete/confirm', { otp, confirm: 'delete' }, cookie)).status).toBe(422); // must type DELETE
    const w = await call('POST', '/api/me/delete/confirm', { otp: wrong, confirm: 'DELETE' }, cookie);
    expect(w.status).toBe(422);
    expect((await json<{ error: { message: string } }>(w)).error.message).toBe('That code isn’t right.');
    expect(await prisma.user.count({ where: { id: me.id } })).toBe(1);

    const done = await call('POST', '/api/me/delete/confirm', { otp, confirm: 'DELETE' }, cookie);
    expect(done.status).toBe(200);
    expect(done.headers.getSetCookie().join(';')).toMatch(/session_token=;/);
    expect(await prisma.user.count({ where: { id: me.id } })).toBe(0);
    for (const [name, n] of Object.entries({
      session: await prisma.session.count({ where: { userId: me.id } }),
      activity: await prisma.activityEvent.count({ where: { userId: me.id } }),
      feedback: await prisma.feedback.count({ where: { userId: me.id } }),
      twoFactor: await prisma.twoFactor.count({ where: { userId: me.id } }),
      prefs: await prisma.notificationPreference.count({ where: { userId: me.id } }),
      watch: await prisma.watchlist.count({ where: { userId: me.id } }),
      journal: await prisma.journalEntry.count({ where: { userId: me.id } }),
      alerts: await prisma.priceAlert.count({ where: { userId: me.id } }),
      notifications: await prisma.notification.count({ where: { userId: me.id } }),
      conns: await prisma.exchangeConnection.count({ where: { userId: me.id } }),
      orders: await prisma.exchangeOrder.count({ where: { userId: me.id } }),
      brokers: await prisma.brokerAccount.count({ where: { userId: me.id } }),
      deployments: await prisma.strategyDeployment.count({ where: { userId: me.id } }),
      verification: await prisma.verification.count({ where: { identifier: `delete-account:${me.id}` } }),
    })) expect([name, n]).toEqual([name, 0]);
    // The other account is untouched.
    expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);
    expect(await prisma.notificationPreference.count({ where: { userId: other.id } })).toBe(1);
    expect(await prisma.watchlist.count({ where: { userId: other.id } })).toBe(1);
    expect(mails.at(-1)).toMatchObject({ to: me.email, subject: 'Your TRADElogs account was deleted' });
    // The old cookie is dead (its session row went with the user).
    expect((await call('GET', '/api/me/profile', undefined, cookie)).status).not.toBe(200);
  });
});
