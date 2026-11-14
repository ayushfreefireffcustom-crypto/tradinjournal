// End to end against a disposable Postgres and a local fake of Elefin's published Partner
// API: connect → probe (/me + one /clients row) → encrypted key → first sync (book +
// email lookups) → trader-level and account-level ClientVerification → package access;
// then a suspension and its reversal, other verification sources left alone, a lookup
// when an email is confirmed, "Sync now" spacing, pause after refusals, key replacement,
// the scheduler, the admin view and disconnect. Skipped unless PARTNERS_TEST_DB points at
// a local database:
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FakeElefin, type FakeClient } from './fake-elefin.js';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);

describe.skipIf(!local)('Elefin partner API (integration)', () => {
  const fake = new FakeElefin();
  const tag = `ef${Date.now()}`;
  const deps = { sleep: async () => {} };
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../service.js');
  let sync: typeof import('../sync.js');
  let verify: typeof import('../verify.js');
  let client: typeof import('../client.js');
  let ib: typeof import('../../ib.service.js');
  let partnerId = '', pkgId = '', token = '';
  const u: Record<string, string> = {};
  const acct: Record<string, string> = {};
  let cA: FakeClient, cC: FakeClient, cD: FakeClient;
  const actor = { id: 'test', email: 'test@partners.test' };
  const wait = { deps, waitMs: 60_000 };

  const person = (userId: string) => prisma.clientVerification.findFirst({ where: { userId, brokerAccountId: null, externalAccountId: null } });
  const account = (userId: string) => prisma.clientVerification.findFirst({ where: { userId, brokerAccountId: { not: null } } });
  const entitlement = (userId: string) => prisma.clientEntitlement.findFirst({ where: { userId, packageId: pkgId } });
  const broker = () => prisma.partnerBroker.findUniqueOrThrow({ where: { partnerId_broker: { partnerId, broker: 'elefin' } } });
  const reset = () => { client.resetElefinBudgets(); fake.resetRateWindows(); };

  beforeAll(async () => {
    const base = await fake.start();
    process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB;
    process.env.CREDENTIAL_ENCRYPTION_KEY ??= 'b4dc161ef8aede4aa30829dfe68a7aa4a57b4cc3e892986dd831b9e2e7da74ce';
    process.env.ELEFIN_PARTNER_API_URL = base;
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../service.js');
    sync = await import('../sync.js');
    verify = await import('../verify.js');
    client = await import('../client.js');
    ib = await import('../../ib.service.js');
    fake.seed(5);
    cA = fake.add({ email: `${tag}-a@partners.test`, funding: { currency: 'USD', deposits: 2500, first_deposit_at: '2026-09-02T00:00:00Z', is_funded: true }, trading: { lots: 4.2, last_trade_at: '2026-11-12T08:00:00Z' } });
    cC = fake.add({ email: `${tag}-c@partners.test` });
    cD = fake.add({ email: `${tag}-d@partners.test` });

    const owner = await prisma.user.create({ data: { name: 'Elefin Partner', email: `${tag}-p@partners.test`, emailVerified: true } });
    partnerId = (await prisma.partner.create({ data: { userId: owner.id, status: 'ACTIVE', approvedAt: new Date() } })).id;
    pkgId = (await prisma.partnerPackage.create({ data: { partnerId, name: 'Elefin clients', status: 'LIVE', brokers: ['elefin'], requireActive: false } })).id;
    // a: Elefin client with an account · b: not an Elefin client · c: Elefin client, no account yet
    // d: Elefin client, email not confirmed yet · m: admin-approved · l: on an uploaded list
    const people: [string, bigint | null, boolean][] = [['a', 100003n, true], ['b', 990001n, true], ['c', null, true], ['d', null, false], ['m', 990002n, true], ['l', 990003n, true]];
    for (const [who, login, confirmed] of people) {
      const user = await prisma.user.create({ data: { name: `Client ${who}`, email: `${tag}-${who}@partners.test`, emailVerified: confirmed } });
      u[who] = user.id;
      await prisma.referral.create({ data: { userId: user.id, partnerId, code: 'EFTEST', source: 'CODE', connectedAt: login ? new Date() : null } });
      if (login) acct[who] = (await prisma.brokerAccount.create({ data: { userId: user.id, broker: 'Elefin Markets Ltd', server: 'Elefin-Live', mt5Login: login, marginMode: 'HEDGING' } })).id;
    }
  });

  afterAll(async () => {
    await fake.stop();
    if (!prisma) return;
    await prisma.partnerEvent.deleteMany({ where: { partnerId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  it('refuses a key that can’t read clients, and saves nothing', async () => {
    const r = await svc.connect(partnerId, { key: fake.addKey({ abilities: [] }) }, actor, wait);
    expect(r.probe).toMatchObject({ ok: false, outcome: 'missing_permission' });
    expect(r.connection.state).toBe('NOT_CONNECTED');
    expect(await prisma.partnerBroker.count({ where: { partnerId } })).toBe(0);
  });

  it('refuses an API address that isn’t Elefin’s', async () => {
    await expect(svc.connect(partnerId, { key: 'fxcrm_pk_x.yyyyyyyyyyyy', baseUrl: 'https://evil.example.com/api' }, actor, wait)).rejects.toMatchObject({ code: 'ELEFIN_HOST' });
  });

  it('connects, stores the key encrypted, reads the book and verifies traders by email', async () => {
    svc.resetElefinTestLimits(); reset();
    token = fake.addKey({ name: 'TRADElogs', expiresAt: '2027-12-31T00:00:00Z' });
    const r = await svc.connect(partnerId, { key: token }, actor, wait);
    expect(r.probe).toMatchObject({ ok: true, clients: 8, key: { partnerId: 1, partnerName: 'Test Partner' } });
    expect(r.sync).toMatchObject({ ok: true, full: true, clients: 8, lookups: 5, verified: 2 });
    expect(r.connection).toMatchObject({
      state: 'OK', keyHint: `••••${token.slice(-4)}`, key: { canReadClients: true, expiresAt: '2027-12-31T00:00:00.000Z' },
      roster: { total: 8, funded: 4 },
      verification: { referred: 6, verified: 2, notFound: 3, held: 0, waiting: 1, verifiedFunded: 1 },
    });
    expect(JSON.stringify(r)).not.toContain(token.split('.')[1]);
    expect(JSON.stringify(r)).not.toContain(cA.name);

    const b = await broker();
    expect(b).toMatchObject({ method: 'API', ibId: '1' });
    expect(b.apiKey).toMatch(/^enc:v1:/);
    expect(b.apiKey).not.toContain(token.split('.')[1]);
    expect(JSON.stringify(b.apiConfig)).not.toMatch(/@partners\.test|Client \d/);
    expect(await prisma.ibAccount.count({ where: { partnerBrokerId: b.id } })).toBe(0); // the API writes no list

    expect(await person(u.a!)).toMatchObject({ status: 'VERIFIED', method: 'elefin_api', broker: 'elefin', ibAccountId: `elefin-client:${cA.client_id}` });
    expect(await account(u.a!)).toMatchObject({ status: 'VERIFIED', method: 'elefin_email', broker: 'elefin' });
    expect(await entitlement(u.a!)).toMatchObject({ status: 'ACTIVE' });
    expect(await person(u.c!)).toMatchObject({ status: 'VERIFIED' });
    expect(await entitlement(u.c!)).toMatchObject({ status: 'ACTIVE' }); // no account needed
    expect(await person(u.b!)).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-none' });
    expect(await account(u.b!)).toMatchObject({ status: 'NOT_FOUND' });
    expect(await entitlement(u.b!)).toBeNull();
    expect(await person(u.d!)).toBeNull(); // email not confirmed: not asked
  });

  it('other verification sources survive “not an Elefin client”', async () => {
    const b = await broker();
    // m: an admin approves the account; l: the login is on a list the partner uploaded.
    const vm = await account(u.m!);
    await ib.reviewVerification(vm!.id, 'approve', undefined, actor);
    await prisma.ibAccount.create({ data: { partnerBrokerId: b.id, partnerId, broker: 'elefin', accountId: '990003' } });
    await ib.recheckPartner(partnerId);
    reset();
    await sync.syncElefin(b.id, { deps, full: true });
    expect(await person(u.m!)).toMatchObject({ status: 'NOT_FOUND' });
    expect(await account(u.m!)).toMatchObject({ status: 'VERIFIED', method: 'manual' });
    expect(await person(u.l!)).toMatchObject({ status: 'NOT_FOUND' });
    expect(await account(u.l!)).toMatchObject({ status: 'VERIFIED', method: 'account' });
  });

  it('a suspension at Elefin holds perks (grace) and lifts when the account is active again', async () => {
    const id = (await broker()).id;
    fake.touch(cA, c => { c.status = 'suspended'; });
    reset();
    expect(await sync.syncElefin(id, { deps })).toMatchObject({ ok: true, unverified: 1, lookups: 0 });
    expect(await person(u.a!)).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-suspended' });
    expect(await account(u.a!)).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-suspended' });
    expect(await entitlement(u.a!)).toMatchObject({ status: 'GRACE' });
    expect((await svc.connectionStatus(partnerId)).verification).toMatchObject({ verified: 1, held: 1 });
    fake.touch(cA, c => { c.status = 'active'; });
    reset();
    expect(await sync.syncElefin(id, { deps })).toMatchObject({ verified: 1 });
    expect(await account(u.a!)).toMatchObject({ status: 'VERIFIED', method: 'elefin_email' });
    expect(await entitlement(u.a!)).toMatchObject({ status: 'ACTIVE' });
  });

  it('looks a trader up as soon as their email is confirmed', async () => {
    await prisma.user.update({ where: { id: u.d! }, data: { emailVerified: true } });
    reset(); verify.resetLookupCooldowns();
    expect(await verify.lookupTrader(u.d!, deps)).toBe('verified');
    expect(await person(u.d!)).toMatchObject({ status: 'VERIFIED', ibAccountId: `elefin-client:${cD.client_id}` });
    expect(await entitlement(u.d!)).toMatchObject({ status: 'ACTIVE' });
    void cC;
  });

  it('spaces out "Sync now"', async () => {
    reset();
    await svc.syncNow(partnerId, actor, wait);
    await expect(svc.syncNow(partnerId, actor, wait)).rejects.toMatchObject({ statusCode: 429, code: 'ELEFIN_SYNC_SOON' });
  });

  it('pauses after three refusals, keeps traders verified, and resumes with a new key', async () => {
    const id = (await broker()).id;
    fake.keyOf(token).active = false;
    for (let i = 0; i < 3; i++) { reset(); await sync.syncElefin(id, { deps }); }
    const st = await svc.connectionStatus(partnerId);
    expect(st.state).toBe('PAUSED');
    expect(st.lastError).toMatch(/Add your key again/);
    expect(st.roster?.total).toBe(8); // last good numbers stay
    expect(await sync.syncElefin(id, { deps })).toMatchObject({ skipped: 'paused' });
    expect(await sync.syncDueElefin(Date.now() + 3_600_000, deps)).toBe(0);
    expect(await person(u.c!)).toMatchObject({ status: 'VERIFIED' });
    expect(await prisma.partnerEvent.count({ where: { partnerId, kind: 'ib.elefin_paused' } })).toBe(1);
    await expect(svc.syncNow(partnerId, actor, wait)).rejects.toMatchObject({ statusCode: 409 });

    svc.resetElefinTestLimits(); reset();
    token = fake.addKey({ name: 'TRADElogs 2' });
    const r = await svc.connect(partnerId, { key: token }, actor, wait);
    expect(r.connection).toMatchObject({ state: 'OK', pausedAt: null, key: { keyName: 'TRADElogs 2' } });
    expect(await prisma.partnerEvent.count({ where: { partnerId, kind: 'ib.elefin_key_replaced' } })).toBe(1);
  });

  it('the scheduler syncs only connections that are due', async () => {
    reset();
    expect(await sync.syncDueElefin(Date.now(), deps)).toBe(0);
    expect(await sync.syncDueElefin(Date.now() + 21 * 60_000, deps)).toBe(1);
  });

  it('tests the saved key without changing anything', async () => {
    svc.resetElefinTestLimits(); reset();
    expect(await svc.testConnection(partnerId, {}, deps)).toMatchObject({ ok: true, clients: 8 });
  });

  it('shows up for admins', async () => {
    const rows = await svc.adminConnections();
    expect(rows.find(r => r.partnerId === partnerId)).toMatchObject({ state: 'OK', elefinPartner: 'Test Partner', clients: 8, funded: 4, referred: 6, verified: 3 });
  });

  it('disconnect wipes the key and the cached book; verified traders keep their status', async () => {
    const st = await svc.disconnect(partnerId, actor);
    expect(st).toMatchObject({ state: 'NOT_CONNECTED', roster: null });
    const b = await broker();
    expect(b.apiKey).toBeNull();
    expect(b.apiConfig).toBeNull();
    expect(b.method).toBe('LIST');
    expect(await person(u.c!)).toMatchObject({ status: 'VERIFIED' });
  });
});
