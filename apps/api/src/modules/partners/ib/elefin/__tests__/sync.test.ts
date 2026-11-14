// syncElefin and the email-lookup verification with Prisma in memory and the fake Elefin
// server: full and incremental (updated_from) reads of the book, the aggregate snapshot,
// lookups for referred traders (affiliated / not / suspended), statuses following the
// book, spacing and caps, 429 retry, pause after repeated 401s, and no secret or PII in
// anything written or logged.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FakeElefin } from './fake-elefin.js';

type Row = Record<string, unknown> & { id: string };
const db = { brokers: [] as Row[], events: [] as Row[], verifs: [] as Row[], refs: [] as Row[], users: [] as Row[] };
let seq = 0;

function match(r: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Record<string, unknown>[]).some(w => match(r, w));
    if (v === null) return r[k] == null;
    if (v instanceof Date) return (r[k] as Date)?.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(r[k]);
      if ('startsWith' in o) return typeof r[k] === 'string' && (r[k] as string).startsWith(o.startsWith as string);
      if ('not' in o) return o.not === null ? r[k] != null : r[k] !== o.not;
      return true; // relation / date filters: not needed here
    }
    return r[k] === v;
  });
}

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    partnerBroker: {
      findUnique: async ({ where }: { where: { id?: string; partnerId_broker?: { partnerId: string } } }) => {
        const b = db.brokers.find(x => (where.id ? x.id === where.id : x.partnerId === where.partnerId_broker?.partnerId));
        return b ? { ...b, partner: { id: b.partnerId, user: { name: 'Riya Sharma' } } } : null;
      },
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.brokers.filter(b => match(b, where)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.brokers.find(b => b.id === where.id)!, data),
    },
    $executeRaw: async (_s: TemplateStringsArray, json: string, id: string) => {
      const b = db.brokers.find(x => x.id === id)!;
      b.apiConfig = { ...(b.apiConfig as object), ...JSON.parse(json) };
      return 1;
    },
    brokerEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const e = { id: `e${++seq}`, createdAt: new Date(), ...data }; db.events.push(e); return e; },
      deleteMany: async () => ({ count: 0 }),
    },
    clientVerification: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.verifs.filter(v => match(v, where)),
      create: async ({ data }: { data: Record<string, unknown> }) => { const v = { id: `v${++seq}`, createdAt: new Date(), ...data }; db.verifs.push(v); return v; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.verifs.find(v => v.id === where.id)!, data),
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => { const n = db.verifs.length; db.verifs = db.verifs.filter(v => !match(v, where)); return { count: n - db.verifs.length }; },
    },
    referral: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.refs.filter(r => match(r, where)).map(r => ({ ...r, user: db.users.find(u => u.id === r.userId) })),
    },
    user: { findMany: async ({ where }: { where: Record<string, unknown> }) => db.users.filter(u => match(u, where)) },
  },
}));

const verifyUser = vi.fn(async (_userId: string) => 1);
const recomputeUser = vi.fn(async (_userId: string) => {});
const logEvent = vi.fn(async (_e: Record<string, unknown>) => {});
vi.mock('../../ib.service.js', () => ({ verifyUser }));
vi.mock('../../access.service.js', () => ({ recomputeUser }));
vi.mock('../../events.js', () => ({ logEvent }));
vi.mock('../../settings.js', () => ({ getProgramSettings: async () => ({ ibApiHosts: [] }) }));
vi.mock('../../../../../lib/secrets.js', () => ({ decryptSecret: (s: string) => s.replace(/^enc:test:/, ''), encryptSecret: (s: string) => `enc:test:${s}` }));

const fake = new FakeElefin();
let sync: typeof import('../sync.js');
let limits: typeof import('../config.js').ELEFIN_LIMITS;
let resetBudgets: () => void;
let token = '';
const slept: number[] = [];
const deps = { sleep: async (ms: number) => { slept.push(ms); } };
const DAY = 86_400_000;

function connection(over: Record<string, unknown> = {}, cfg: Record<string, unknown> = {}): Row {
  const b: Row = {
    id: 'pb1', partnerId: 'p1', broker: 'elefin', method: 'API', apiKey: `enc:test:${token}`, status: 'PENDING', lastSyncAt: null, lastError: null, accountCount: 0,
    apiConfig: { provider: 'elefin', v: 2, baseUrl: fake.base, keyHint: '••••abcd', connectedAt: new Date().toISOString(), authFailures: 0, ...cfg },
    ...over,
  };
  db.brokers = [b];
  return b;
}
const cfg = () => db.brokers[0]!.apiConfig as Record<string, any>;
const person = (userId: string) => db.verifs.find(v => v.userId === userId && v.brokerAccountId == null);
const lookups = () => fake.log.filter(l => l.path === '/clients/lookup');

function trader(id: string, email: string, opts: { verified?: boolean; daysAgo?: number } = {}): void {
  db.users.push({ id, email, emailVerified: opts.verified ?? true });
  db.refs.push({ id: `r-${id}`, userId: id, partnerId: 'p1', attributedAt: new Date(Date.now() - (opts.daysAgo ?? 1) * DAY) });
}

beforeAll(async () => {
  await fake.start();
  process.env.ELEFIN_PARTNER_API_URL = fake.base;
  sync = await import('../sync.js');
  limits = (await import('../config.js')).ELEFIN_LIMITS;
  resetBudgets = (await import('../client.js')).resetElefinBudgets;
  fake.seed(250);
  token = fake.addKey({ name: 'TRADElogs' });
});
afterAll(() => fake.stop());
beforeEach(() => {
  db.events = []; db.verifs = []; db.refs = []; db.users = [];
  resetBudgets(); fake.resetRateWindows(); vi.clearAllMocks(); slept.length = 0; fake.log.length = 0;
  fake.throttleNext = 0; fake.failNext = 0;
  fake.keyOf(token).active = true;
  connection();
});

describe('syncElefin: the book', () => {
  it('first sync reads the whole book 200 a page and keeps aggregates, not names', async () => {
    const r = await sync.syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, full: true, clients: 250, changed: 250, lookups: 0 });
    expect(fake.log.map(l => `${l.path}${l.query}`)).toEqual(['/me', '/clients?per_page=200&page=1', '/clients?per_page=200&page=2']);
    const book = fake.clients.filter(c => c.partnerId === 1);
    const s = cfg().snapshot;
    expect(s).toMatchObject({ total: 250, funded: 125, active: 250, neverTraded: 125, quietDays: 30 });
    const cents = book.reduce((n, c) => n + Math.round(c.funding.deposits * 100), 0);
    expect(s.depositsUsd).toBe(cents / 100);
    expect(s.lots).toBe(book.reduce((n, c) => n + Math.round(c.trading.lots * 100), 0) / 100);
    expect(cfg().key).toMatchObject({ partnerId: 1, partnerName: 'Test Partner', canReadClients: true });
    expect(Object.keys(cfg().roster.clients)).toHaveLength(250);
    expect(cfg().roster.fullAt).toBeTruthy();
    expect(db.brokers[0]).toMatchObject({ status: 'OK', accountCount: 250, lastError: null });
    const written = JSON.stringify([db.brokers, db.events]);
    for (const c of book.slice(0, 20)) { expect(written).not.toContain(c.name); expect(written).not.toContain(c.email); }
  });

  it('later syncs ask only for changes since the last run, overlapped by a minute', async () => {
    await sync.syncElefin('pb1', { deps });
    const started = Date.parse(cfg().roster.syncStartedAt);
    const c = fake.clients[3]!;
    fake.touch(c, x => { x.funding.deposits += 500; x.funding.is_funded = true; });
    fake.log.length = 0;
    const r = await sync.syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, full: false, changed: 1, clients: 250 });
    const q = new URLSearchParams(fake.log.find(l => l.path === '/clients')!.query);
    expect(Date.parse(q.get('updated_from')!)).toBe(started - 60_000);
    expect(cfg().roster.clients[String(c.client_id)][0]).toBe(c.funding.deposits);
    expect(cfg().snapshot.funded).toBe(126);
  });

  it('re-reads everything once a day', async () => {
    await sync.syncElefin('pb1', { deps });
    cfg().roster.fullAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
    fake.log.length = 0;
    const r = await sync.syncElefin('pb1', { deps });
    expect(r.full).toBe(true);
    expect(fake.log.find(l => l.path === '/clients')!.query).not.toContain('updated_from');
  });

  it('a book too big to keep per client stores aggregates only', async () => {
    const max = limits.rosterMax;
    limits.rosterMax = 100;
    try {
      await sync.syncElefin('pb1', { deps });
      expect(cfg().roster.clients).toBeNull();
      expect(cfg().snapshot.total).toBe(250);
      fake.log.length = 0;
      expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ ok: true, clients: 250 });
      expect(fake.log.map(l => l.path)).toEqual(['/me']); // next full read tomorrow
    } finally { limits.rosterMax = max; }
  });

  it('waits out a 429 inside the run', async () => {
    fake.throttleNext = 1; fake.retryAfter = 2;
    expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ ok: true });
    expect(slept).toContain(2000);
  });

  it('a 429 that outlasts our patience is not an auth failure', async () => {
    fake.throttleNext = 1; fake.retryAfter = 900;
    const r = await sync.syncElefin('pb1', { deps });
    expect(r.error).toMatch(/slow down/);
    expect(cfg().authFailures).toBe(0);
  });

  it('pauses after three 401s in a row, then skips until forced', async () => {
    await sync.syncElefin('pb1', { deps });
    fake.keyOf(token).active = false;
    for (let i = 1; i <= 3; i++) {
      resetBudgets();
      const r = await sync.syncElefin('pb1', { deps });
      expect(r.ok).toBe(false);
      expect(cfg().authFailures).toBe(i);
    }
    expect(cfg().pausedAt).toBeTruthy();
    expect(db.brokers[0]).toMatchObject({ status: 'ERROR' });
    expect(db.brokers[0]!.lastError).toMatch(/paused/);
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ib.elefin_paused' }));
    expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ skipped: 'paused' });
    expect(await sync.syncDueElefin(Date.now() + DAY, deps)).toBe(0);
    // The last good numbers stay.
    expect(cfg().snapshot.total).toBe(250);
    fake.keyOf(token).active = true;
    resetBudgets();
    expect(await sync.syncElefin('pb1', { deps, force: true })).toMatchObject({ ok: true });
    expect(cfg()).toMatchObject({ pausedAt: null, authFailures: 0 });
  });

  it('a key that lost clients.read counts as refused', async () => {
    const k = fake.keyOf(token);
    k.abilities = [];
    try {
      const r = await sync.syncElefin('pb1', { deps });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/clients\.read/);
      expect(cfg().authFailures).toBe(1);
    } finally { k.abilities = ['clients.read']; }
  });

  it('not connected / no key → skipped', async () => {
    connection({ apiKey: null });
    expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ skipped: 'not_connected' });
    connection({ apiConfig: { provider: 'other' } });
    expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ skipped: 'not_connected' });
  });

  it('the scheduler picks due, un-paused connections', async () => {
    connection({ lastSyncAt: new Date() });
    expect(await sync.syncDueElefin(Date.now(), deps)).toBe(0);
    expect(await sync.syncDueElefin(Date.now() + 21 * 60_000, deps)).toBe(1);
    connection({ lastSyncAt: null }, { pausedAt: new Date().toISOString() });
    expect(await sync.syncDueElefin(Date.now(), deps)).toBe(0);
  });
});

describe('syncElefin: verifying referred traders by email', () => {
  it('affiliated → VERIFIED, not affiliated → NOT_FOUND, unconfirmed email → not asked', async () => {
    const mine = fake.clients[0]!;
    trader('uA', mine.email);
    trader('uB', 'stranger@mail.test');
    trader('uC', fake.clients[1]!.email, { verified: false });
    const r = await sync.syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, lookups: 2, verified: 1 });
    expect(person('uA')).toMatchObject({ status: 'VERIFIED', method: 'elefin_api', signal: 'elefin-active', ibAccountId: `elefin-client:${mine.client_id}`, broker: 'elefin', partnerId: 'p1', brokerEmail: mine.email });
    expect(person('uB')).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-none', ibAccountId: null });
    expect(person('uC')).toBeUndefined();
    // Their accounts and access are re-checked through the existing rules.
    expect(verifyUser.mock.calls.map(c => c[0]).sort()).toEqual(['uA', 'uB']);
    expect(recomputeUser.mock.calls.map(c => c[0]).sort()).toEqual(['uA', 'uB']);
    // Lookups are spaced 1.1 s apart.
    expect(slept).toEqual([1100]);
  });

  it('a suspended client is known but held (no perks), with the reason in words', async () => {
    const c = fake.add({ status: 'suspended', funding: { currency: 'USD', deposits: 50, first_deposit_at: '2026-09-02T00:00:00Z', is_funded: true } });
    trader('uS', c.email);
    await sync.syncElefin('pb1', { deps });
    expect(person('uS')).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-suspended', ibAccountId: `elefin-client:${c.client_id}` });
    expect(String(person('uS')!.reason)).toMatch(/suspended/);
    fake.clients = fake.clients.filter(x => x !== c);
  });

  it('a matched trader follows the book: suspended and back, without another lookup', async () => {
    const c = fake.clients[2]!;
    trader('uA', c.email);
    await sync.syncElefin('pb1', { deps });
    expect(person('uA')).toMatchObject({ status: 'VERIFIED' });
    fake.touch(c, x => { x.status = 'suspended'; });
    fake.log.length = 0; vi.clearAllMocks();
    const r = await sync.syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, unverified: 1, lookups: 0 });
    expect(lookups()).toHaveLength(0);
    expect(person('uA')).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-suspended' });
    expect(recomputeUser).toHaveBeenCalledWith('uA');
    fake.touch(c, x => { x.status = 'active'; });
    expect(await sync.syncElefin('pb1', { deps })).toMatchObject({ verified: 1 });
    expect(person('uA')).toMatchObject({ status: 'VERIFIED', signal: 'elefin-active' });
  });

  it('a client gone from a full read is looked up again (and loses it if Elefin agrees)', async () => {
    const c = fake.add({});
    trader('uG', c.email);
    await sync.syncElefin('pb1', { deps });
    expect(person('uG')).toMatchObject({ status: 'VERIFIED' });
    c.partnerId = 9; // moved to another partner's book
    cfg().roster.fullAt = new Date(Date.now() - 2 * DAY).toISOString();
    fake.log.length = 0;
    const r = await sync.syncElefin('pb1', { deps });
    expect(r).toMatchObject({ full: true, lookups: 1, unverified: 1 });
    expect(person('uG')).toMatchObject({ status: 'NOT_FOUND', signal: 'elefin-none' });
    fake.clients = fake.clients.filter(x => x !== c);
  });

  it('never touches an admin decision', async () => {
    trader('uM', 'stranger@mail.test');
    db.verifs.push({ id: 'vm', userId: 'uM', partnerId: 'p1', broker: 'elefin', brokerAccountId: null, externalAccountId: null, status: 'VERIFIED', method: 'manual', checkedAt: null, brokerEmail: null });
    const r = await sync.syncElefin('pb1', { deps });
    expect(r.lookups).toBe(0);
    expect(person('uM')).toMatchObject({ status: 'VERIFIED', method: 'manual' });
  });

  it('asks again later: not found after 12 h for new traders, weekly after; verified weekly; at once on a new email', async () => {
    trader('uN', 'later@mail.test');
    trader('uO', 'old@mail.test', { daysAgo: 60 });
    trader('uV', fake.clients[4]!.email);
    await sync.syncElefin('pb1', { deps });
    expect(lookups()).toHaveLength(3);
    const age = (u: string, ms: number) => { person(u)!.checkedAt = new Date(Date.now() - ms); };
    age('uN', 13 * 3_600_000); age('uO', 13 * 3_600_000); age('uV', 13 * 3_600_000);
    fake.log.length = 0;
    await sync.syncElefin('pb1', { deps });
    expect(lookups()).toHaveLength(1); // only the new trader
    age('uO', 8 * DAY); age('uV', 8 * DAY);
    db.users.find(u => u.id === 'uN')!.email = 'renamed@mail.test';
    fake.log.length = 0;
    await sync.syncElefin('pb1', { deps });
    expect(lookups()).toHaveLength(3);
    expect(person('uN')).toMatchObject({ brokerEmail: 'renamed@mail.test' });
  });

  it('caps lookups per run and stops early when Elefin says slow down', async () => {
    for (let i = 0; i < 6; i++) trader(`u${i}`, `nobody${i}@mail.test`);
    const r = await sync.syncElefin('pb1', { deps, lookups: 4 });
    expect(r.lookups).toBe(4);
    expect(slept.filter(s => s === 1100)).toHaveLength(3);
    // The rest go next run; a 429 that outlasts our patience ends the lookups, not the sync.
    fake.log.length = 0;
    const realThrottle = fake.retryAfter;
    fake.retryAfter = 900;
    let n = 0;
    const orig = fake.log.push.bind(fake.log);
    fake.log.push = (...l) => { if (l[0]!.path === '/clients/lookup' && n++ === 0) fake.throttleNext = 1; return orig(...l); };
    const r2 = await sync.syncElefin('pb1', { deps });
    fake.log.push = orig; fake.retryAfter = realThrottle; fake.throttleNext = 0;
    expect(r2.ok).toBe(true);
    expect(r2.lookups).toBe(2);
    expect((db.events.at(-1)!.payload as Record<string, unknown>).rateLimited).toBe(true);
  });

  it('nothing written or logged carries the key, an email or a client name', async () => {
    const { logger } = await import('@tradinjournal/logger');
    const logs: unknown[] = [];
    const spies = (['info', 'warn', 'error'] as const).map(l => vi.spyOn(logger, l).mockImplementation(((...a: unknown[]) => { logs.push(a); }) as never));
    const c = fake.clients[6]!;
    trader('uP', c.email);
    trader('uQ', 'private.person@mail.test');
    await sync.syncElefin('pb1', { deps });
    fake.keyOf(token).active = false;
    resetBudgets();
    await sync.syncElefin('pb1', { deps });
    const secret = token.split('.')[1]!;
    // (apiKey holds the key encrypted; the in-memory stand-in for encryption is a prefix.)
    const brokers = db.brokers.map(({ apiKey: _k, ...rest }) => rest);
    const all = JSON.stringify([brokers, db.events, logEvent.mock.calls, logs]);
    expect(all).not.toContain(secret);
    expect(all).not.toContain(c.name);
    expect(all).not.toContain(c.email);
    expect(all).not.toContain('private.person');
    spies.forEach(s => s.mockRestore());
  });
});

describe('lookupTrader (signup, email confirmed, retry)', () => {
  it('asks once the email is confirmed, then waits 10 minutes before asking again', async () => {
    const verify = await import('../verify.js');
    verify.resetLookupCooldowns();
    const c = fake.clients[8]!;
    trader('uT', c.email, { verified: false });
    // lookupTrader reads the referral with findUnique: give the mock one.
    const { prisma } = await import('@tradinjournal/db') as unknown as { prisma: Record<string, Record<string, unknown>> };
    prisma.referral!.findUnique = async ({ where }: { where: { userId: string } }) => {
      const r = db.refs.find(x => x.userId === where.userId);
      return r ? { ...r, user: db.users.find(u => u.id === r.userId), partner: { id: 'p1', status: 'ACTIVE', user: { name: 'Riya Sharma' } } } : null;
    };
    await sync.syncElefin('pb1', { deps }); // sets up the book
    expect(await verify.lookupTrader('uT', deps)).toBe('skipped');
    db.users.find(u => u.id === 'uT')!.emailVerified = true;
    expect(await verify.lookupTrader('uT', deps)).toBe('verified');
    expect(person('uT')).toMatchObject({ status: 'VERIFIED' });
    expect(await verify.lookupTrader('uT', deps)).toBe('skipped');
  });
});
