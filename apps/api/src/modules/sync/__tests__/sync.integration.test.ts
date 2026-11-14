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
  clock: null as { serverTime: number | null; utcNow: number } | null,
}));
vi.mock('../../../lib/broker-connector.js', async orig => {
  const real = await orig<typeof import('../../../lib/broker-connector.js')>();
  const getDealsWithClock = vi.fn(async (creds: { login: number; password: string }, range: { from?: Date } = {}) => {
    const from = range.from ?? real.HISTORY_START;
    bridge.calls.push({ login: creds.login, password: creds.password, from: from.toISOString() });
    if (bridge.fail) throw bridge.fail;
    return { deals: bridge.deals.filter(d => new Date(d.dealTime) >= from), clock: bridge.clock };
  });
  return { ...real, getDealsWithClock, getDeals: async (c: { login: number; password: string }, r?: { from?: Date }) => (await getDealsWithClock(c, r)).deals };
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
  beforeEach(() => { bridge.calls.length = 0; bridge.fail = null; bridge.clock = null; data.clearAccountDataCache(); });

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

  it('a dropped login on a working terminal only locks the account once it repeats', async () => {
    const dropped = () => new errors.BrokerAuthError(undefined, {
      code: 'LOGIN_REJECTED', reason: 'LOGIN_DROPPED', message: 'terminal works but drops this login',
      mt5: { code: -10004, message: 'No IPC connection' },
    });
    await db.brokerAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE', syncRetryAt: null } });
    // A clean sync first, so the next failure is the first in a row.
    expect(await sync.syncAccount(accountId)).toMatchObject({ status: 'synced' });
    bridge.fail = dropped();
    await sync.syncAccount(accountId);
    let a = await account();
    expect(a.status).toBe('ACTIVE'); // one drop: could be a hiccup
    expect(a.syncRetryAt!.getTime() - Date.now()).toBeLessThan(16 * 60_000);
    const run = await db.syncRun.findFirst({ where: { brokerAccountId: accountId }, orderBy: { startedAt: 'desc' } });
    expect(run!.error).toBe('LOGIN_REJECTED/LOGIN_DROPPED mt5 -10004 (No IPC connection): terminal works but drops this login');
    expect(a.lastSyncError).toMatch(/password may have changed/); // the user still gets the actionable message
    bridge.fail = dropped();
    await sync.syncAccount(accountId);
    a = await account();
    expect(a.status).toBe('ERROR'); // twice in a row: it's the account
    expect(a.syncRetryAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    await db.brokerAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE', syncRetryAt: null } });
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

  describe('server clock → UTC', () => {
    // A GMT+2/+3 "New York close" server: wall-clock deal times as the bridge sends them.
    const wall = (local: string) => Date.parse(`${local}Z`);
    const nowUtc = Date.parse('2026-11-14T12:00:00Z') / 1000;
    // A live clock read `atMin` minutes after nowUtc.
    const liveClock = (offsetH: number, atMin = 0) => ({ serverTime: nowUtc + atMin * 60 + offsetH * 3600 - 1, utcNow: nowUtc + atMin * 60 });
    let tzAccount = '';
    const acct = () => db.brokerAccount.findUniqueOrThrow({ where: { id: tzAccount } });
    const times = async () => (await db.execution.findMany({ where: { brokerAccountId: tzAccount }, orderBy: { dealTicket: 'asc' }, select: { dealTime: true, serverOffsetMin: true } }))
      .map(r => [r.dealTime.toISOString(), r.serverOffsetMin]);

    beforeAll(async () => {
      const a = await db.brokerAccount.create({
        data: { userId, broker: 'Elefin', mt5Login: BigInt(Date.now() % 1e9) + 21n, server: `Tz-${tag}`, marginMode: 'HEDGING', password: secrets.encryptSecret('inv3stor') },
      });
      tzAccount = a.id;
    });

    it('with conversion off, stores raw times but learns the clock model', async () => {
      bridge.deals = [
        deal({ at: wall('2026-07-15T12:00:00'), positionId: '31' }),
        deal({ at: wall('2026-07-15T13:00:00'), positionId: '31', type: 'SELL', entry: 'OUT', profit: '5' }),
      ];
      bridge.clock = liveClock(2);
      expect(await sync.syncAccount(tzAccount, { toUtc: false })).toMatchObject({ status: 'synced', added: 2, normalized: 0 });
      expect(await times()).toEqual([['2026-07-15T12:00:00.000Z', null], ['2026-07-15T13:00:00.000Z', null]]);
      expect(await acct()).toMatchObject({ serverTimeZone: null, serverOffsetMin: 120 }); // one reading: not trusted yet
      bridge.clock = liveClock(2, 6);
      await sync.syncAccount(tzAccount, { toUtc: false });
      expect(await acct()).toMatchObject({ serverTimeZone: 'America/New_York', serverTimeShiftMin: 420, serverOffsetMin: 120 });
      expect((await acct()).serverOffsetAt!.getTime()).toBe(nowUtc * 1000); // when the run of readings began
    });

    it('with conversion on, stores new deals as UTC and converts the stored ones (DST per date)', async () => {
      const before = await acct();
      bridge.deals.push(deal({ at: wall('2026-11-10T10:00:00'), positionId: '32' }));
      const r = await sync.syncAccount(tzAccount, { toUtc: true });
      expect(r).toMatchObject({ status: 'synced', added: 1, normalized: 2 });
      expect(await times()).toEqual([
        ['2026-07-15T09:00:00.000Z', 180], // summer: GMT+3
        ['2026-07-15T10:00:00.000Z', 180],
        ['2026-11-10T08:00:00.000Z', 120], // winter: GMT+2
      ]);
      const a = await acct();
      expect(a.lastDealAt!.toISOString()).toBe('2026-11-10T08:00:00.000Z');
      expect(a.dataVersion).toBe(before.dataVersion + 1);
      // The incremental window was widened for the wall-clock read.
      expect(Date.parse(bridge.calls[0]!.from)).toBe(before.lastDealAt!.getTime() - 7 * DAY - 14 * 3_600_000);
    });

    it('is idempotent: re-syncing converts nothing and never double-shifts', async () => {
      const before = await acct();
      expect(await sync.syncAccount(tzAccount, { toUtc: true })).toMatchObject({ added: 0, normalized: 0 });
      expect((await times()).map(t => t[0])).toEqual(['2026-07-15T09:00:00.000Z', '2026-07-15T10:00:00.000Z', '2026-11-10T08:00:00.000Z']);
      expect((await acct()).dataVersion).toBe(before.dataVersion);
    });

    it('trades and hour-of-day read the converted times', async () => {
      const t = await trades.fetchTrades(userId, tzAccount);
      expect(t.find(x => x.positionId === '31')).toMatchObject({ openTime: '2026-07-15T09:00:00.000Z', closeTime: '2026-07-15T10:00:00.000Z' });
    });

    it('a weekend sync (no live clock) keeps the model and still converts', async () => {
      bridge.clock = { serverTime: null, utcNow: nowUtc };
      bridge.deals.push(deal({ at: wall('2026-11-13T23:00:00'), positionId: '33' }));
      expect(await sync.syncAccount(tzAccount, { toUtc: true })).toMatchObject({ added: 1 });
      expect((await times()).at(-1)).toEqual(['2026-11-13T21:00:00.000Z', 120]);
      expect(await acct()).toMatchObject({ serverTimeZone: 'America/New_York', serverOffsetMin: 120 });
    });

    it('a model correction (seen twice) re-converts every row from its recovered wall clock', async () => {
      // The server turns out to be a fixed GMT+3: the November observations say +3.
      bridge.clock = liveClock(3, 30);
      expect(await sync.syncAccount(tzAccount, { toUtc: true })).toMatchObject({ normalized: 0 }); // first sighting: wait
      expect((await acct()).serverTimeZone).toBe('America/New_York');
      bridge.clock = liveClock(3, 32);
      expect(await sync.syncAccount(tzAccount, { toUtc: true })).toMatchObject({ normalized: 0 }); // too soon to confirm
      bridge.clock = liveClock(3, 36);
      const r = await sync.syncAccount(tzAccount, { toUtc: true });
      expect(r).toMatchObject({ normalized: 2 }); // the two winter rows move; summer ones were already +3
      expect(await acct()).toMatchObject({ serverTimeZone: 'UTC', serverTimeShiftMin: 180 });
      expect(await times()).toEqual([
        ['2026-07-15T09:00:00.000Z', 180],
        ['2026-07-15T10:00:00.000Z', 180],
        ['2026-11-10T07:00:00.000Z', 180],
        ['2026-11-13T20:00:00.000Z', 180],
      ]);
    });
  });

  it('the shared queue reports idle when done', () => {
    expect(queue.syncQueue().stats()).toEqual({ waiting: 0, active: 0 });
  });
});
