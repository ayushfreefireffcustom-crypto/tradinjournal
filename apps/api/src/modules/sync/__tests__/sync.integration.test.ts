// Real sync engine + read path against a disposable Postgres; only the MT5 bridge
// is faked. Skipped unless PARTNERS_TEST_DB points at a local database:
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Deal } from '@tradinjournal/types';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) { process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB; }

// The fake bridge: a mutable deal list, a call log, and an optional failure.
const bridge = vi.hoisted(() => ({
  deals: [] as Deal[],
  calls: [] as { login: number; password: string; from: string }[],
  fail: null as Error | null,
}));
vi.mock('../../../lib/broker-connector.js', async orig => {
  const real = await orig<typeof import('../../../lib/broker-connector.js')>();
  return {
    ...real,
    getDeals: vi.fn(async (creds: { login: number; password: string }, range: { from?: Date } = {}) => {
      const from = range.from ?? real.HISTORY_START;
      bridge.calls.push({ login: creds.login, password: creds.password, from: from.toISOString() });
      if (bridge.fail) throw bridge.fail;
      return bridge.deals.filter(d => new Date(d.dealTime) >= from);
    }),
  };
});

const DAY = 86_400_000;
const t0 = Date.parse('2026-10-01T09:00:00Z');
let ticket = 1000;
const deal = (o: Partial<Deal> & { at: number }): Deal => ({
  dealTicket: String(++ticket), orderTicket: String(ticket), positionId: '1', symbol: 'EURUSD', type: 'BUY', entry: 'IN',
  volume: '0.10', price: '1.10000', profit: '0', commission: '-0.35', swap: '0', fee: '0', dealTime: new Date(o.at).toISOString(), comment: '', ...o,
});

describe.skipIf(!local)('trade sync (integration)', () => {
  let db: typeof import('@tradinjournal/db').prisma;
  let sync: typeof import('../sync.service.js');
  let data: typeof import('../account-data.js');
  let queue: typeof import('../sync.queue.js');
  let trades: typeof import('../../trades/trades.service.js');
  let errors: typeof import('../../../http/errors.js');
  let secrets: typeof import('../../../lib/secrets.js');
  const tag = `sync${Date.now()}`;
  let userId = '', accountId = '';

  beforeAll(async () => {
    ({ prisma: db } = await import('@tradinjournal/db'));
    sync = await import('../sync.service.js');
    data = await import('../account-data.js');
    queue = await import('../sync.queue.js');
    trades = await import('../../trades/trades.service.js');
    errors = await import('../../../http/errors.js');
    secrets = await import('../../../lib/secrets.js');
    const u = await db.user.create({ data: { name: 'Sync Test', email: `${tag}@sync.test` } });
    userId = u.id;
    const a = await db.brokerAccount.create({
      data: { userId, broker: 'Test', mt5Login: BigInt(Date.now() % 1e9), server: `Sync-${tag}`, marginMode: 'HEDGING', password: secrets.encryptSecret('inv3stor') },
    });
    accountId = a.id;
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { email: { endsWith: '@sync.test' } } });
    await db?.$disconnect();
  });
  beforeEach(() => { bridge.calls.length = 0; bridge.fail = null; data.clearAccountDataCache(); });

  const account = () => db.brokerAccount.findUniqueOrThrow({ where: { id: accountId } });

  it('first load waits for a full backfill, decrypting the stored password', async () => {
    bridge.deals = [
      deal({ at: t0 - DAY, positionId: '0', type: 'BALANCE', volume: '0', price: '0', profit: '5000', commission: '0' }),
      deal({ at: t0, positionId: '11' }),
      deal({ at: t0 + 3_600_000, positionId: '11', type: 'SELL', entry: 'OUT', price: '1.10200', profit: '20' }),
    ];
    const got = await trades.fetchStats(userId, accountId);
    expect(bridge.calls).toEqual([expect.objectContaining({ password: 'inv3stor', from: '2020-01-01T00:00:00.000Z' })]);
    expect(got.totalTrades).toBe(1);
    expect(got.startingBalance).toBe(5000);
    const a = await account();
    expect(a).toMatchObject({ dataVersion: 1, lastSyncError: null, syncLockedUntil: null, syncRetryAt: null, status: 'ACTIVE' });
    expect(a.lastDealAt?.getTime()).toBe(t0 + 3_600_000);
    expect(await db.execution.count({ where: { brokerAccountId: accountId } })).toBe(3);
    expect(await db.syncRun.findFirst({ where: { brokerAccountId: accountId }, orderBy: { startedAt: 'desc' } })).toMatchObject({ status: 'DONE', dealsPulled: 3, tradesBuilt: 3 });
  });

  it('returns exactly what live reconstruction would', async () => {
    const stored = await trades.fetchTrades(userId, accountId);
    const live = trades.reconstructTrades(bridge.deals);
    const strip = (t: typeof live) => t.map(({ deals: _d, ...r }) => r);
    expect(strip(stored)).toEqual(strip(live));
  });

  it('later reads come from the database, not the bridge', async () => {
    await trades.fetchTrades(userId, accountId);
    await trades.fetchStats(userId, accountId);
    await trades.fetchDeals(userId, accountId);
    expect(bridge.calls).toHaveLength(0);
  });

  it('syncs incrementally from newest deal − overlap and only bumps the version for new deals', async () => {
    const before = await account();
    bridge.deals.push(deal({ at: t0 + 2 * DAY, positionId: '12', type: 'SELL' }));
    const r = await sync.syncAccount(accountId);
    expect(r).toMatchObject({ status: 'synced', added: 1, full: false });
    expect(bridge.calls[0]!.from).toBe(new Date(before.lastDealAt!.getTime() - 7 * DAY).toISOString());
    expect((await account()).dataVersion).toBe(2);
    const again = await sync.syncAccount(accountId);
    expect(again).toMatchObject({ status: 'synced', added: 0 });
    expect((await account()).dataVersion).toBe(2);
    expect(await db.execution.count({ where: { brokerAccountId: accountId } })).toBe(4);
  });

  it('serves the new deal once synced (cache keyed by data version)', async () => {
    const t = await trades.fetchTrades(userId, accountId);
    expect(t.map(x => x.positionId).sort()).toEqual(['11', '12']);
  });

  it('a stale read answers immediately and refreshes in the background', async () => {
    await db.brokerAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date(Date.now() - 60 * 60_000) } });
    const t = await trades.fetchTrades(userId, accountId);
    expect(t).toHaveLength(2); // answered from stored data
    await vi.waitFor(() => expect(bridge.calls).toHaveLength(1));
    await vi.waitFor(async () => expect((await account()).lastSyncAt!.getTime()).toBeGreaterThan(Date.now() - 60_000));
  });

  it('readonly reads never trigger a sync', async () => {
    await db.brokerAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date(Date.now() - 60 * 60_000) } });
    await trades.fetchTrades(userId, accountId, 'readonly');
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.calls).toHaveLength(0);
  });

  it('only one sync per account at a time (lease)', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const slow = sync.syncAccount(accountId, { fetch: async () => { await gate; return []; } });
    await new Promise(r => setTimeout(r, 30));
    expect(await sync.syncAccount(accountId)).toEqual({ status: 'locked' });
    release();
    expect(await slow).toMatchObject({ status: 'synced' });
  });

  it('a rejected password marks the account, keeps the data and backs off a day', async () => {
    bridge.fail = new errors.BrokerAuthError();
    const r = await sync.syncAccount(accountId);
    expect(r.status).toBe('failed');
    const a = await account();
    expect(a.status).toBe('ERROR');
    expect(a.lastSyncError).toBeTruthy();
    expect(a.syncRetryAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(await db.execution.count({ where: { brokerAccountId: accountId } })).toBe(4);
    expect(await sync.dueAccounts(500)).not.toContain(accountId);
    // reads still work from stored data and don't hammer the bridge during back-off
    bridge.calls.length = 0;
    await db.brokerAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date(0) } });
    expect(await trades.fetchTrades(userId, accountId)).toHaveLength(2);
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.calls).toHaveLength(0);
  });

  it('a transient failure backs off 15 minutes', async () => {
    bridge.fail = new errors.BrokerConnectionError('bridge down');
    await db.brokerAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE', syncRetryAt: null } });
    await sync.syncAccount(accountId);
    const a = await account();
    expect(a.status).toBe('ACTIVE');
    expect(a.syncRetryAt!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(a.syncRetryAt!.getTime() - Date.now()).toBeLessThan(16 * 60_000);
  });

  it('a never-synced account in back-off fails fast with the stored error', async () => {
    const b = await db.brokerAccount.create({
      data: { userId, broker: 'Test', mt5Login: BigInt(Date.now() % 1e9) + 7n, server: `Sync2-${tag}`, marginMode: 'NETTING', password: 'x',
        status: 'ERROR', lastSyncError: 'Invalid password', syncRetryAt: new Date(Date.now() + DAY) },
    });
    await expect(trades.fetchTrades(userId, b.id)).rejects.toBeInstanceOf(errors.BrokerAuthError);
    expect(bridge.calls).toHaveLength(0);
  });

  it('due accounts: never-synced first, recent ones skipped', async () => {
    const fresh = await db.brokerAccount.create({ data: { userId, broker: 'T', mt5Login: BigInt(Date.now() % 1e9) + 11n, server: `Due-${tag}`, marginMode: 'NETTING', password: 'x' } });
    const recent = await db.brokerAccount.create({ data: { userId, broker: 'T', mt5Login: BigInt(Date.now() % 1e9) + 13n, server: `Due2-${tag}`, marginMode: 'NETTING', password: 'x', lastSyncAt: new Date() } });
    const due = await sync.dueAccounts(500);
    expect(due).toContain(fresh.id);
    expect(due).not.toContain(recent.id);
    expect(due.indexOf(fresh.id)).toBeLessThan(due.length);
  });

  it('a different user cannot read the account', async () => {
    await expect(trades.fetchTrades('someone-else', accountId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('the shared queue reports idle when done', () => {
    expect(queue.syncQueue().stats()).toEqual({ waiting: 0, active: 0 });
  });
});
