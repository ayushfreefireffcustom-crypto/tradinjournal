// The support "why is this account failing?" report: verdict wording (pure) and
// the full report against a disposable Postgres with the bridge faked.
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) { process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB; }

const diag = vi.hoisted(() => ({ calls: [] as { login: number; password: string; server: string }[], next: null as unknown }));
vi.mock('../../../lib/broker-connector.js', async orig => ({
  ...(await orig<typeof import('../../../lib/broker-connector.js')>()),
  diagnoseLogin: vi.fn(async (creds: { login: number; password: string; server: string }) => { diag.calls.push(creds); return diag.next; }),
}));

const { summarise } = await import('../broker-diagnose.service.js');

describe('diagnose verdicts', () => {
  const account = { status: 'ACTIVE' as const, lastSyncError: null };
  it('blames the account for a rejected login, and says what to ask the user', () => {
    const r = summarise({ account, usable: true, passwordSource: 'stored', bridge: { ok: false, verdict: 'LOGIN_REJECTED', reason: 'LOGIN_DROPPED', explanation: 'drops this login' } });
    expect(r.verdict).toBe('LOGIN_REJECTED/LOGIN_DROPPED');
    expect(r.summary).toMatch(/stored password/);
    expect(r.nextStep).toMatch(/still active at Elefin/);
  });
  it('blames us for terminal trouble', () => {
    const r = summarise({ account, usable: true, passwordSource: 'stored', bridge: { ok: false, verdict: 'TERMINAL_DOWN', reason: 'PROCESS_NOT_RUNNING', explanation: 'not running' } });
    expect(r.summary).toMatch(/Our MT5 terminal is the problem/);
  });
  it('a supplied password that works points at the stored one', () => {
    const r = summarise({ account: { status: 'ERROR', lastSyncError: 'x' }, usable: true, passwordSource: 'provided', bridge: { ok: true, verdict: 'OK', explanation: 'fine' } });
    expect(r.nextStep).toMatch(/stored password is the problem/);
  });
  it('gate and missing password come before any bridge talk', () => {
    expect(summarise({ account, usable: false, passwordSource: 'stored', bridge: null }).verdict).toBe('BLOCKED_BY_ACCESS_GATE');
    expect(summarise({ account, usable: true, passwordSource: 'none', bridge: null }).verdict).toBe('NO_PASSWORD');
    expect(summarise({ account, usable: true, passwordSource: 'undecryptable', bridge: null }).verdict).toBe('PASSWORD_UNREADABLE');
  });
});

describe.skipIf(!local)('diagnose report (integration)', () => {
  let db: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../broker-diagnose.service.js');
  const tag = `diag${Date.now()}`;
  const login = BigInt(Date.now() % 1e9) + 500n;
  let accountId = '';

  beforeAll(async () => {
    ({ prisma: db } = await import('@tradinjournal/db'));
    svc = await import('../broker-diagnose.service.js');
    const { encryptSecret } = await import('../../../lib/secrets.js');
    const u = await db.user.create({ data: { name: 'Diag', email: `${tag}@diag.test` } });
    const a = await db.brokerAccount.create({ data: { userId: u.id, broker: 'Elefin', mt5Login: login, server: 'Elefin-Trade', marginMode: 'HEDGING', password: encryptSecret('inv3stor'), lastSyncError: 'We can’t reach MT5 right now.' } });
    accountId = a.id;
    await db.syncRun.create({ data: { brokerAccountId: a.id, status: 'FAILED', error: 'LOGIN_REJECTED/LOGIN_DROPPED mt5 -10004 (No IPC connection): drops', finishedAt: new Date() } });
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { endsWith: '@diag.test' } } });
    await db?.$disconnect();
  });

  it('finds the account by MT5 login, tests the stored password and reports history', async () => {
    diag.next = { ok: false, verdict: 'LOGIN_REJECTED', reason: 'LOGIN_DROPPED', explanation: 'drops this login', login_attempts: [{ code: -10004, message: 'No IPC connection', meaning: '…' }] };
    const r = await svc.diagnoseBrokerAccount(login.toString());
    expect(diag.calls.at(-1)).toEqual({ login: Number(login), password: 'inv3stor', server: 'Elefin-Trade' });
    expect(r).toMatchObject({ verdict: 'LOGIN_REJECTED/LOGIN_DROPPED', account: { id: accountId, passwordSource: 'stored', usableUnderAccessGate: true, storedDeals: 0 } });
    expect(r.recentSyncs[0]!.error).toMatch(/LOGIN_DROPPED mt5 -10004/);
    expect(JSON.stringify(r)).not.toContain('inv3stor');
  });

  it('tests a supplied password and server without storing them', async () => {
    diag.next = { ok: true, verdict: 'OK', explanation: 'Signed in fine.' };
    const r = await svc.diagnoseBrokerAccount(accountId, { password: 'n3w', server: 'Elefin-Live' });
    expect(diag.calls.at(-1)).toEqual({ login: Number(login), password: 'n3w', server: 'Elefin-Live' });
    expect(r).toMatchObject({ verdict: 'OK', account: { passwordSource: 'provided', testedServer: 'Elefin-Live', server: 'Elefin-Trade' } });
    const { decryptSecret } = await import('../../../lib/secrets.js');
    const stored = await db.brokerAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(decryptSecret(stored.password!)).toBe('inv3stor');
    expect(stored.server).toBe('Elefin-Trade');
  });

  it('a stored password this key can’t decrypt is reported as such, not as missing', async () => {
    const u = await db.user.findFirstOrThrow({ where: { email: `${tag}@diag.test` } });
    const { encryptSecret } = await import('../../../lib/secrets.js');
    const otherKey = Buffer.alloc(32, 7); // encrypted elsewhere (e.g. production's key)
    const a = await db.brokerAccount.create({ data: { userId: u.id, broker: 'Elefin', mt5Login: login + 7n, server: 'Elefin-Trade', marginMode: 'HEDGING', password: encryptSecret('elsewhere', otherKey) } });
    const before = diag.calls.length;
    expect((await svc.diagnoseBrokerAccount(a.id)).verdict).toBe('PASSWORD_UNREADABLE');
    expect(diag.calls.length).toBe(before); // nothing sent to the bridge
  });

  it('unknown and ambiguous references are clear errors', async () => {
    await expect(svc.diagnoseBrokerAccount('999999999999')).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.diagnoseBrokerAccount('not-an-id')).rejects.toMatchObject({ statusCode: 404 });
    const u2 = await db.user.findFirstOrThrow({ where: { email: `${tag}@diag.test` } });
    await db.brokerAccount.create({ data: { userId: u2.id, broker: 'Elefin', mt5Login: login, server: 'Elefin-Live', marginMode: 'HEDGING', password: null } });
    await expect(svc.diagnoseBrokerAccount(login.toString())).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/several servers/) });
    expect((await svc.diagnoseBrokerAccount(login.toString(), { accountServer: 'Elefin-Live' })).verdict).toBe('NO_PASSWORD');
  });
});
