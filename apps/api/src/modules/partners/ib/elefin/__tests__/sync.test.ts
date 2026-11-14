// syncElefin with Prisma mocked (in memory) and the fake Elefin server: which rows reach
// applyRows, which logins get re-checked, pause after repeated 401/403, rate limits that
// don't count as failures, the mass-removal guard, and no secret in anything written.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FakeElefin } from './fake-elefin.js';

type Row = Record<string, unknown> & { id: string };
const db = { brokers: [] as Row[], accounts: [] as Row[], events: [] as Row[] };
let seq = 0;
const match = (r: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([k, v]) => {
  if (k === 'removedAt' && v === null) return r.removedAt == null;
  if (v && typeof v === 'object' && 'in' in (v as object)) return ((v as { in: unknown[] }).in).includes(r[k]);
  if (v && typeof v === 'object' && 'not' in (v as object)) return r[k] != null;
  if (v && typeof v === 'object') return true; // relation / date filters: not needed here
  return r[k] === v;
});

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    partnerBroker: {
      findUnique: async ({ where }: { where: { id: string } }) => db.brokers.find(b => b.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.brokers.filter(b => match(b, where)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.brokers.find(b => b.id === where.id)!, data),
    },
    ibAccount: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.accounts.filter(a => match(a, where)),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => { const rows = db.accounts.filter(a => match(a, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.accounts.find(a => a.id === where.id)!, data),
    },
    brokerEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const e = { id: `e${++seq}`, createdAt: new Date(), ...data }; db.events.push(e); return e; },
      deleteMany: async () => ({ count: 0 }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

// The real list/verification code is covered by its own tests (and the DB integration
// test); here we watch what the sync asks of it.
const applyRows = vi.fn(async (b: Row, rows: { accountId: string; email: string | null }[]) => {
  const now = new Date();
  const ids = new Set(rows.map(r => r.accountId));
  for (const a of db.accounts.filter(x => x.partnerBrokerId === b.id && !x.removedAt && !ids.has(x.accountId as string))) a.removedAt = now;
  for (const r of rows) {
    const e = db.accounts.find(x => x.partnerBrokerId === b.id && x.accountId === r.accountId);
    if (e) Object.assign(e, { removedAt: null, email: r.email ?? e.email });
    else db.accounts.push({ id: `a${++seq}`, partnerBrokerId: b.id, accountId: r.accountId, email: r.email, removedAt: null });
  }
  Object.assign(b, { status: 'OK', accountCount: rows.length, lastSyncAt: now, lastError: null });
  return { added: 0, updated: 0, removed: 0, skipped: 0 };
});
const recheckLogin = vi.fn(async (_p: string, login: string) => [`user-of-${login}`]);
const recheckPartner = vi.fn(async () => 7);
const recomputeUser = vi.fn(async (_userId: string) => {});
const recomputePartner = vi.fn(async () => 0);
const logEvent = vi.fn(async () => {});
vi.mock('../../ib.service.js', () => ({ applyRows, recheckLogin, recheckPartner }));
vi.mock('../../access.service.js', () => ({ recomputeUser, recomputePartner }));
vi.mock('../../events.js', () => ({ logEvent }));
vi.mock('../../settings.js', () => ({ getProgramSettings: async () => ({ ibApiHosts: [] }) }));
vi.mock('../../../../../lib/secrets.js', () => ({ decryptSecret: (s: string) => s.replace(/^enc:test:/, ''), encryptSecret: (s: string) => `enc:test:${s}` }));

const fake = new FakeElefin();
let syncElefin: typeof import('../sync.js').syncElefin;
let syncDueElefin: typeof import('../sync.js').syncDueElefin;
let resetBudgets: () => void;
let token = '';
const deps = { sleep: async () => {} };

function connection(over: Record<string, unknown> = {}): Row {
  const b: Row = {
    id: 'pb1', partnerId: 'p1', broker: 'elefin', method: 'API', apiKey: `enc:test:${token}`, status: 'PENDING', lastSyncAt: null, lastError: null, accountCount: 0,
    apiConfig: {
      provider: 'elefin', baseUrl: fake.base, keyHint: '••••abcd', connectedAt: new Date().toISOString(), paths: { clients: '/clients', accounts: '/accounts' },
      abilities: { profile: 'skipped', clients: 'ok', accounts: 'ok' }, fields: { clients: [], accounts: [] }, counts: { clients: null, accounts: null },
      partnerRef: null, lastSuccessAt: null, authFailures: 0, pausedAt: null, manualSyncAt: null, dropGuard: null,
    },
    ...over,
  };
  db.brokers = [b];
  return b;
}
const cfg = () => db.brokers[0]!.apiConfig as Record<string, unknown>;

beforeAll(async () => {
  await fake.start();
  process.env.ELEFIN_PARTNER_API_URL = fake.base;
  ({ syncElefin, syncDueElefin } = await import('../sync.js'));
  resetBudgets = (await import('../client.js')).resetElefinBudgets;
  fake.seed(8);
  token = fake.addKey({ abilities: ['clients', 'accounts'], pii: true });
});
afterAll(() => fake.stop());
beforeEach(() => {
  db.accounts = []; db.events = []; resetBudgets(); vi.clearAllMocks();
  fake.throttleNext = 0;
  fake.keys.get(token.split('.')[0]!)!.expired = false;
  connection();
});

describe('syncElefin', () => {
  it('first sync: every login (with emails joined from clients) goes to applyRows, then a full re-check', async () => {
    const r = await syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, accounts: 8, added: 8, removed: 0, rechecked: 7 });
    const rows = applyRows.mock.calls[0]![1];
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ accountId: '100001', email: 'client0@mail.test' });
    expect(recheckPartner).toHaveBeenCalledWith('p1', 'elefin');
    expect(recomputePartner).toHaveBeenCalledWith('p1');
    expect(cfg()).toMatchObject({ authFailures: 0, counts: { clients: 8, accounts: 8 } });
    expect(cfg().lastSuccessAt).toBeTruthy();
    expect(db.accounts.find(a => a.accountId === '100002')).toMatchObject({ depositTotal: 200, lotsTotal: 1.5, platform: 'MT5' });
  });

  it('later syncs re-check only the logins that changed', async () => {
    await syncElefin('pb1', { deps });
    vi.clearAllMocks();
    const keep = fake.accounts;
    fake.accounts = [...keep.filter(a => a.login !== 100004), { ...keep[0]!, login: 200001, client_id: 'C1001' }];
    const r = await syncElefin('pb1', { deps });
    fake.accounts = keep;
    expect(r).toMatchObject({ ok: true, added: 1, removed: 1 });
    expect(recheckPartner).not.toHaveBeenCalled();
    expect(recheckLogin.mock.calls.map(c => c[1]).sort()).toEqual(['100004', '200001']);
    expect(recomputeUser.mock.calls.map(c => c[0]).sort()).toEqual(['user-of-100004', 'user-of-200001']);
  });

  it('a quiet sync skips applyRows and the audit log', async () => {
    await syncElefin('pb1', { deps });
    vi.clearAllMocks();
    const r = await syncElefin('pb1', { deps });
    expect(r).toMatchObject({ ok: true, added: 0, removed: 0, rechecked: 0 });
    expect(applyRows).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
    expect(db.brokers[0]).toMatchObject({ status: 'OK', accountCount: 8 });
  });

  it('pauses after three 401s in a row, then skips until forced', async () => {
    await syncElefin('pb1', { deps });
    fake.keys.get(token.split('.')[0]!)!.expired = true;
    for (let i = 1; i <= 3; i++) {
      resetBudgets();
      const r = await syncElefin('pb1', { deps });
      expect(r.ok).toBe(false);
      expect(cfg().authFailures).toBe(i);
    }
    expect(cfg().pausedAt).toBeTruthy();
    expect(db.brokers[0]).toMatchObject({ status: 'ERROR' });
    expect(db.brokers[0]!.lastError).toMatch(/paused/);
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ib.elefin_paused' }));
    expect(await syncElefin('pb1', { deps })).toMatchObject({ skipped: 'paused' });
    // Removals never happen on a failed sync: the list is untouched.
    expect(db.accounts.filter(a => !a.removedAt)).toHaveLength(8);
    // An admin can force one; when the key works again it un-pauses.
    fake.keys.get(token.split('.')[0]!)!.expired = false;
    resetBudgets();
    expect(await syncElefin('pb1', { deps, force: true })).toMatchObject({ ok: true });
    expect(cfg()).toMatchObject({ pausedAt: null, authFailures: 0 });
  });

  it('a 429 that outlasts our patience is not an auth failure', async () => {
    fake.throttleNext = 1; fake.retryAfter = 900;
    const r = await syncElefin('pb1', { deps });
    expect(r.error).toMatch(/slow down/);
    expect(cfg().authFailures).toBe(0);
  });

  it('never writes the key into events, errors or config', async () => {
    fake.keys.get(token.split('.')[0]!)!.expired = true;
    await syncElefin('pb1', { deps });
    const secret = token.split('.')[1]!;
    expect(JSON.stringify(db.events)).not.toContain(secret);
    expect(JSON.stringify(db.brokers[0]!.apiConfig)).not.toContain(secret);
    expect(String(db.brokers[0]!.lastError)).not.toContain(secret);
  });

  it('holds a mass removal once', async () => {
    await syncElefin('pb1', { deps });
    const keep = fake.accounts;
    fake.accounts = keep.slice(0, 2);
    const held = await syncElefin('pb1', { deps });
    expect(held.ok).toBe(false);
    expect(cfg().dropGuard).toMatchObject({ count: 2 });
    expect(db.accounts.filter(a => !a.removedAt)).toHaveLength(8);
    const applied = await syncElefin('pb1', { deps });
    fake.accounts = keep;
    expect(applied).toMatchObject({ ok: true, removed: 6 });
    expect(cfg().dropGuard).toBeNull();
  });

  it('not connected / no key → skipped', async () => {
    connection({ apiKey: null });
    expect(await syncElefin('pb1', { deps })).toMatchObject({ skipped: 'not_connected' });
    connection({ apiConfig: { provider: 'other' } });
    expect(await syncElefin('pb1', { deps })).toMatchObject({ skipped: 'not_connected' });
  });

  it('the scheduler picks due, un-paused connections', async () => {
    connection({ lastSyncAt: new Date() });
    expect(await syncDueElefin(Date.now(), deps)).toBe(0);
    expect(await syncDueElefin(Date.now() + 21 * 60_000, deps)).toBe(1);
    connection({ lastSyncAt: null });
    (cfg() as { pausedAt: string | null }).pausedAt = new Date().toISOString();
    expect(await syncDueElefin(Date.now(), deps)).toBe(0);
  });
});
