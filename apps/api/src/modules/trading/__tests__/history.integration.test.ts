// Exchange trade history import (D18) and the exchange journal (D17).
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Exchange, type FillEvent, type FillQuery } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}
const KEY = randomBytes(32);
const MIN = 60_000;
const DAY = 24 * 3600_000;

class Venue {
  fills: FillEvent[] = [];
  position = 0;
  queries: FillQuery[] = [];
  slept: number[] = [];
  ex(): Exchange {
    return {
      getFills: async (_c: unknown, q: FillQuery) => { this.queries.push(q); return [...this.fills].filter((f) => !q.since || f.timestamp >= q.since).reverse(); },
      getPositions: async () => (this.position ? [{ symbol: 'BTCUSD', size: this.position, avgEntry: 0, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }] : []),
      getInstrument: async (s: string) => ({ symbol: s, contractMultiplier: 0.001 }),
    } as unknown as Exchange;
  }
}

describe.skipIf(!local)('exchange history and journal', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../history.service.js');
  const tag = `hist${Date.now()}`;
  const v = new Venue();
  const deps = { adapterFor: () => v.ex(), key: () => KEY, sleep: async (ms: number) => void v.slept.push(ms) };
  let me = '';
  let conn = '';
  let broken = '';
  let theirs = '';
  const now = new Date('2026-11-01T12:00:00Z');
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * MIN);
  const fill = (id: string, side: 'BUY' | 'SELL', qty: number, price: number, minsAgo: number): FillEvent => ({ externalId: `${tag}-${id}`, symbol: 'BTCUSD', side, qty, price, reduceOnly: false, timestamp: at(minsAgo), contractMultiplier: 0.001 });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../history.service.js');
    const { encryptWithKey } = await import('@tradinjournal/secrets');
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    const other = (await prisma.user.create({ data: { name: 'o', email: `${tag}-o@trading.test` } })).id;
    const mk = async (userId: string, label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encryptWithKey('k', KEY), apiSecretEnc: encryptWithKey('s', KEY), keyLast4: 'abcd', keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conn = await mk(me, 'Main');
    broken = await mk(me, 'Broken', { status: 'INVALID' });
    theirs = await mk(other, 'Theirs');
  });
  beforeEach(() => { v.queries = []; v.slept = []; });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('first import reaches back the backfill window and anchors a position opened before it', async () => {
    // Before the window the account already held 2 long (unseen). In the window:
    // sell 2 (closes the unseen one), then a full round trip 3 → 0 (+30), then buy 1 still open.
    v.fills = [
      fill('a', 'SELL', 2, 70_000, 300),
      fill('b', 'BUY', 3, 70_000, 200),
      fill('c', 'SELL', 3, 80_000, 100),
      fill('d', 'BUY', 1, 75_000, 50),
    ];
    v.position = 1;
    const r = await svc.importHistory(me, conn, 30, now, deps);
    expect(r).toMatchObject({ imported: 4, seen: 4, message: 'Imported 4 new fills.' });
    expect(new Date(v.queries[0]!.since!).getTime()).toBe(now.getTime() - 30 * DAY);
    const stored = await prisma.exchangeFill.findMany({ where: { connectionId: conn }, orderBy: { exchTs: 'asc' } });
    expect(stored.map((f) => Number(f.positionAfter))).toEqual([0, 3, 0, 1]);
    expect(stored.every((f) => Number(f.contractMultiplier) === 0.001)).toBe(true);
    const j = await svc.exchangeJournal(me, conn);
    // Only the trade that both opened and closed inside what we saw counts.
    expect(j.trades.map((t) => [t.side, t.qty, t.avgEntry, t.avgExit, t.pnlUsd])).toEqual([['LONG', 3, 70_000, 80_000, 30]]);
    expect(j).toMatchObject({ fillCount: 4, startingEquityUsd: null, historySyncedAt: now.toISOString() });
  });

  it('later imports continue from the last one with an overlap, and repeats are harmless', async () => {
    const later = new Date(now.getTime() + 60 * MIN);
    v.fills.push(fill('e', 'SELL', 1, 76_000, -30)); // 30 min after `now`
    v.position = 0;
    const r = await svc.importHistory(me, conn, undefined, later, deps);
    expect(new Date(v.queries[0]!.since!).getTime()).toBe(now.getTime() - 10 * MIN);
    expect(r).toMatchObject({ imported: 1, seen: 1 });
    expect((await svc.importHistory(me, conn, undefined, later, deps)).message).toBe('Up to date: no new fills.');
    expect(await prisma.exchangeFill.count({ where: { connectionId: conn } })).toBe(5);
    const j = await svc.exchangeJournal(me, conn);
    expect(j.trades.map((t) => [t.qty, t.pnlUsd])).toEqual([[3, 30], [1, 1]]);
  });

  it('waits for a very fresh fill to settle before anchoring', async () => {
    const t = new Date(now.getTime() + 120 * MIN);
    v.fills.push({ ...fill('f', 'BUY', 1, 76_000, 0), timestamp: new Date(t.getTime() - 5000) });
    v.position = 1;
    await svc.importHistory(me, conn, undefined, t, deps);
    expect(v.slept).toEqual([25_000]);
  });

  it('attaches journal notes to trades by their stable key', async () => {
    const j = await svc.exchangeJournal(me, conn);
    const key = j.trades[0]!.key;
    expect(key).toMatch(/^ex-[0-9a-f]{40}$/);
    expect(key).toBe(svc.tripKey(conn, 'BTCUSD', new Date(j.trades[0]!.openedAt)));
    await prisma.journalEntry.create({ data: { userId: me, tradeId: key, body: 'Waited for the retest. Good.', emotion: 'calm', tags: ['breakout'] } });
    // Someone else's note on the same key never shows up.
    const otherUser = (await prisma.user.findFirstOrThrow({ where: { email: `${tag}-o@trading.test` } })).id;
    await prisma.journalEntry.create({ data: { userId: otherUser, tradeId: key, body: 'not yours' } });
    const after = await svc.exchangeJournal(me, conn);
    expect(after.trades[0]!.note).toMatchObject({ body: 'Waited for the retest. Good.', emotion: 'calm', tags: ['breakout'] });
    expect(after.trades[1]!.note).toBeNull();
  });

  it('refuses other users and broken keys; the background job skips what is fresh', async () => {
    await expect(svc.exchangeJournal(me, theirs)).rejects.toThrow(/not found/i);
    await expect(svc.importHistory(me, theirs, undefined, now, deps)).rejects.toThrow(/not found/i);
    await expect(svc.importHistory(me, broken, undefined, now, deps)).rejects.toThrow(/stopped working/);
    // conn was synced at now+120min; theirs never. The job takes due ones only (in this test's world).
    // Scoped to this file's accounts: the shared test DB has real testnet connections too.
    const r = await svc.importDue(new Date(now.getTime() + 125 * MIN), { ...deps }, 500, [conn, theirs, broken]);
    const conns = await prisma.exchangeConnection.findMany({ where: { id: { in: [conn, theirs] } }, select: { id: true, historySyncedAt: true } });
    const synced = Object.fromEntries(conns.map((c) => [c.id, c.historySyncedAt?.toISOString() ?? null]));
    expect(synced[conn]).toBe(new Date(now.getTime() + 120 * MIN).toISOString()); // fresh: skipped
    expect(synced[theirs]).toBe(new Date(now.getTime() + 125 * MIN).toISOString()); // never synced: done
    expect(r.done).toBeGreaterThanOrEqual(1);
  });
});
