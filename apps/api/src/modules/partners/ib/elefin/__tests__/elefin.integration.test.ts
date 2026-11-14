// End to end against a disposable Postgres and a local fake of Elefin's Partner API:
// connect → probe → encrypted key → first sync → IbAccount list → ClientVerification →
// package access, then removals, the drop guard, auth-failure pause, key replacement,
// spacing of "Sync now", disconnect and the admin view. Skipped unless PARTNERS_TEST_DB
// points at a local database:
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_partner pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FakeElefin } from './fake-elefin.js';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);

describe.skipIf(!local)('Elefin partner API (integration)', () => {
  const fake = new FakeElefin();
  const tag = `ef${Date.now()}`;
  const sleep = async () => {};
  const deps = { sleep };
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../service.js');
  let sync: typeof import('../sync.js');
  let client: typeof import('../client.js');
  let partnerId = '', userA = '', userB = '', pkgId = '', token = '';
  const actor = { id: 'test', email: 'test@partners.test' };
  const wait = { deps, waitMs: 60_000 };

  const verification = (userId: string) => prisma.clientVerification.findFirst({ where: { userId } });
  const entitlement = (userId: string) => prisma.clientEntitlement.findFirst({ where: { userId, packageId: pkgId } });
  const broker = () => prisma.partnerBroker.findUniqueOrThrow({ where: { partnerId_broker: { partnerId, broker: 'elefin' } } });

  beforeAll(async () => {
    const base = await fake.start();
    process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB;
    process.env.CREDENTIAL_ENCRYPTION_KEY ??= 'b4dc161ef8aede4aa30829dfe68a7aa4a57b4cc3e892986dd831b9e2e7da74ce';
    process.env.ELEFIN_PARTNER_API_URL = base;
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../service.js');
    sync = await import('../sync.js');
    client = await import('../client.js');
    fake.seed(5); // logins 100001…100005

    const owner = await prisma.user.create({ data: { name: 'Elefin Partner', email: `${tag}-p@partners.test` } });
    partnerId = (await prisma.partner.create({ data: { userId: owner.id, status: 'ACTIVE', approvedAt: new Date() } })).id;
    pkgId = (await prisma.partnerPackage.create({ data: { partnerId, name: 'Elefin clients', status: 'LIVE', brokers: ['elefin'], requireActive: false } })).id;
    for (const [who, login] of [['a', 100003n], ['b', 990001n]] as const) {
      const u = await prisma.user.create({ data: { name: `Client ${who}`, email: `${tag}-${who}@partners.test` } });
      await prisma.referral.create({ data: { userId: u.id, partnerId, code: 'EFTEST', source: 'CODE', connectedAt: new Date() } });
      await prisma.brokerAccount.create({ data: { userId: u.id, broker: 'Elefin Markets Ltd', server: 'Elefin-Live', mt5Login: login, marginMode: 'HEDGING' } });
      if (who === 'a') userA = u.id; else userB = u.id;
    }
  });

  afterAll(async () => {
    await fake.stop();
    if (!prisma) return;
    await prisma.partnerEvent.deleteMany({ where: { partnerId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it('refuses a key that can’t read accounts, and saves nothing', async () => {
    const r = await svc.connect(partnerId, { key: fake.addKey({ abilities: ['clients'], pii: true }) }, actor, wait);
    expect(r.probe).toMatchObject({ ok: false, outcome: 'missing_permission' });
    expect(r.connection.state).toBe('NOT_CONNECTED');
    expect(await prisma.partnerBroker.count({ where: { partnerId } })).toBe(0);
  });

  it('refuses an API address that isn’t Elefin', async () => {
    await expect(svc.connect(partnerId, { key: 'elk_x.yyyyyyyyyyyy', baseUrl: 'https://evil.example.com/api' }, actor, wait)).rejects.toMatchObject({ code: 'ELEFIN_HOST' });
  });

  it('connects, stores the key encrypted, syncs and verifies the client', async () => {
    svc.resetElefinTestLimits();
    token = fake.addKey({ abilities: ['profile', 'clients', 'accounts'], pii: true, partnerId: 4471 });
    const r = await svc.connect(partnerId, { key: token }, actor, wait);
    expect(r.probe).toMatchObject({ ok: true, counts: { clients: 5, accounts: 5 } });
    expect(r.sync).toMatchObject({ ok: true, accounts: 5, added: 5 });
    expect(r.connection).toMatchObject({ state: 'OK', keyHint: `••••${token.slice(-4)}`, counts: { accounts: 5, verified: 1, clientAccounts: 2 } });
    expect(JSON.stringify(r)).not.toContain(token.split('.')[1]);

    const b = await broker();
    expect(b.method).toBe('API');
    expect(b.ibId).toBe('4471');
    expect(b.apiKey).toMatch(/^enc:v1:/);
    expect(b.apiKey).not.toContain(token.split('.')[1]);
    const rows = await prisma.ibAccount.findMany({ where: { partnerBrokerId: b.id }, orderBy: { accountId: 'asc' } });
    expect(rows.map(x => x.accountId)).toEqual(['100001', '100002', '100003', '100004', '100005']);
    expect(rows[2]).toMatchObject({ email: 'client2@mail.test', depositTotal: 300, lotsTotal: 3, platform: 'MT5' });

    expect(await verification(userA)).toMatchObject({ status: 'VERIFIED', broker: 'elefin', method: 'account' });
    expect(await verification(userB)).toMatchObject({ status: 'NOT_FOUND' });
    // Access follows through the existing package rules.
    expect(await entitlement(userA)).toMatchObject({ status: 'ACTIVE' });
    expect(await entitlement(userB)).toBeNull();
    expect(await prisma.brokerEvent.count({ where: { partnerBrokerId: b.id, kind: 'elefin_sync', status: 'ok' } })).toBe(1);
  });

  it('a quiet sync changes nothing and writes no audit line', async () => {
    const before = await prisma.partnerEvent.count({ where: { partnerId } });
    const r = await sync.syncElefin((await broker()).id, { deps });
    expect(r).toMatchObject({ ok: true, added: 0, removed: 0, rechecked: 0 });
    expect(await prisma.partnerEvent.count({ where: { partnerId } })).toBe(before);
  });

  it('a new account verifies its client; a removed one loses it (grace)', async () => {
    fake.accounts.push({ login: 990001, client_id: 'C1000', platform: 'MT5', total_deposits: 50, volume_lots: 0, last_trade_at: null, currency: 'USD' });
    fake.accounts = fake.accounts.filter(a => a.login !== 100003);
    const r = await sync.syncElefin((await broker()).id, { deps });
    expect(r).toMatchObject({ ok: true, added: 1, removed: 1, accounts: 5 });
    expect(r.rechecked).toBe(2);
    expect(await verification(userB)).toMatchObject({ status: 'VERIFIED' });
    expect(await entitlement(userB)).toMatchObject({ status: 'ACTIVE' });
    expect(await verification(userA)).toMatchObject({ status: 'NOT_FOUND' });
    expect(await entitlement(userA)).toMatchObject({ status: 'GRACE' });
    const gone = await prisma.ibAccount.findFirst({ where: { partnerId, accountId: '100003' } });
    expect(gone?.removedAt).not.toBeNull();
  });

  it('holds a sudden mass removal until a second sync agrees', async () => {
    const keep = fake.accounts;
    fake.accounts = keep.slice(0, 1);
    const id = (await broker()).id;
    const first = await sync.syncElefin(id, { deps });
    expect(first.ok).toBe(false);
    expect(first.error).toMatch(/kept your list/);
    expect(await prisma.ibAccount.count({ where: { partnerBrokerId: id, removedAt: null } })).toBe(5);
    expect((await svc.connectionStatus(partnerId)).state).toBe('ERROR');
    // Elefin recovers: nothing was lost.
    fake.accounts = keep;
    expect(await sync.syncElefin(id, { deps })).toMatchObject({ ok: true, removed: 0 });
    // A real drop applies on the second sync in a row.
    fake.accounts = keep.slice(0, 1);
    await sync.syncElefin(id, { deps });
    const second = await sync.syncElefin(id, { deps });
    expect(second).toMatchObject({ ok: true, removed: 4 });
    fake.accounts = keep;
    await sync.syncElefin(id, { deps });
    expect(await verification(userB)).toMatchObject({ status: 'VERIFIED' });
  });

  it('spaces out "Sync now"', async () => {
    await svc.syncNow(partnerId, actor, wait);
    await expect(svc.syncNow(partnerId, actor, wait)).rejects.toMatchObject({ statusCode: 429, code: 'ELEFIN_SYNC_SOON' });
  });

  it('pauses after three refusals, keeps clients verified, and resumes with a new key', async () => {
    const id = (await broker()).id;
    const k = fake.keys.get(token.split('.')[0]!)!;
    k.expired = true;
    for (let i = 0; i < 3; i++) { client.resetElefinBudgets(); await sync.syncElefin(id, { deps }); }
    const st = await svc.connectionStatus(partnerId);
    expect(st.state).toBe('PAUSED');
    expect(st.lastError).toMatch(/Add your key again/);
    expect(await sync.syncElefin(id, { deps })).toMatchObject({ skipped: 'paused' });
    expect(await sync.syncDueElefin(Date.now() + 3_600_000, deps)).toBe(0);
    expect(await verification(userB)).toMatchObject({ status: 'VERIFIED' });
    expect(await prisma.partnerEvent.count({ where: { partnerId, kind: 'ib.elefin_paused' } })).toBe(1);
    await expect(svc.syncNow(partnerId, actor, wait)).rejects.toMatchObject({ statusCode: 409 });

    svc.resetElefinTestLimits();
    const fresh = fake.addKey({ abilities: ['clients', 'accounts'], pii: true });
    const r = await svc.connect(partnerId, { key: fresh }, actor, wait);
    expect(r.connection.state).toBe('OK');
    expect(r.connection.pausedAt).toBeNull();
    expect(await prisma.partnerEvent.count({ where: { partnerId, kind: 'ib.elefin_key_replaced' } })).toBe(1);
  });

  it('the scheduler syncs only connections that are due', async () => {
    expect(await sync.syncDueElefin(Date.now(), deps)).toBe(0);
    expect(await sync.syncDueElefin(Date.now() + 21 * 60_000, deps)).toBe(1);
  });

  it('tests the saved key without changing anything', async () => {
    svc.resetElefinTestLimits();
    const r = await svc.testConnection(partnerId, {}, deps);
    expect(r).toMatchObject({ ok: true, counts: { accounts: 5 } });
  });

  it('shows up for admins', async () => {
    const rows = await svc.adminConnections();
    expect(rows.find(r => r.partnerId === partnerId)).toMatchObject({ state: 'OK', accounts: 5, verified: 1 });
  });

  it('disconnect wipes the key and keeps the last list', async () => {
    const st = await svc.disconnect(partnerId, actor);
    expect(st.state).toBe('NOT_CONNECTED');
    const b = await broker();
    expect(b.apiKey).toBeNull();
    expect(b.apiConfig).toBeNull();
    expect(b.method).toBe('LIST');
    expect(await prisma.ibAccount.count({ where: { partnerBrokerId: b.id, removedAt: null } })).toBe(5);
    expect(await verification(userB)).toMatchObject({ status: 'VERIFIED' });
  });
});
