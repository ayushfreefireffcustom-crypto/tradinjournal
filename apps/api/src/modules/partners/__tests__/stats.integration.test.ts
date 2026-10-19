// Runs the real stats refresher against a disposable Postgres with a fake MT5
// fetcher. Skipped unless PARTNERS_TEST_DB points at a local database:
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) { process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB; }

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

describe.skipIf(!local)('refreshReferralStats (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let refresh: typeof import('../stats.service.js').refreshReferralStats;
  const tag = `it${Date.now()}`;
  let referralId = '';
  let goodAccount = '', badAccount = '';

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    ({ refreshReferralStats: refresh } = await import('../stats.service.js'));
    const owner = await prisma.user.create({ data: { name: 'IT Partner', email: `${tag}-p@partners.test` } });
    const client = await prisma.user.create({ data: { name: 'IT Client', email: `${tag}-c@partners.test` } });
    const partner = await prisma.partner.create({ data: { userId: owner.id, status: 'ACTIVE', approvedAt: new Date() } });
    const r = await prisma.referral.create({ data: { userId: client.id, partnerId: partner.id, code: `${tag}`.toUpperCase().slice(0, 20), source: 'CODE' } });
    referralId = r.id;
    const mk = (n: number) => prisma.brokerAccount.create({ data: { userId: client.id, broker: 'IT', mt5Login: BigInt(Date.now() % 1e9) + BigInt(n), server: `IT-${tag}`, marginMode: 'HEDGING', password: 'x' } });
    goodAccount = (await mk(1)).id;
    badAccount = (await mk(2)).id;
    // Leave other rows (e.g. from the Postman run) out of these batches.
    await prisma.referral.updateMany({ where: { id: { not: referralId } }, data: { statsCheckedAt: new Date(Date.now() + 365 * DAY) } });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  const get = () => prisma.referral.findUniqueOrThrow({ where: { id: referralId } });

  it('stamps connectedAt from the broker account and turns ACTIVE on enough closed trades', async () => {
    const now = new Date();
    const fetch = async (_u: string, acc: string) => acc === goodAccount ? [
      { status: 'CLOSED', openTime: iso(now.getTime() - 2 * DAY), closeTime: iso(now.getTime() - DAY), volume: 0.5 },
      { status: 'CLOSED', openTime: iso(now.getTime() - 3 * DAY), closeTime: iso(now.getTime() - 3 * DAY), volume: 1 },
      { status: 'CLOSED', openTime: iso(now.getTime() - 20 * DAY), closeTime: iso(now.getTime() - 20 * DAY), volume: 2 },
    ] : [];
    const out = await refresh({ fetch, now });
    expect(out).toMatchObject({ processed: 1, failed: 0, skipped: false });
    const r = await get();
    expect(r.connectedAt).not.toBeNull();
    expect(r).toMatchObject({ isActive: true, tradeCount7d: 2, trades30d: 3, lots30d: 3.5, statsError: null });
    expect(r.firstActiveAt?.getTime()).toBe(now.getTime());
  });

  it('is not due again until the snapshot goes stale', async () => {
    const out = await refresh({ fetch: async () => { throw new Error('should not be called'); }, now: new Date(Date.now() + 60_000) });
    expect(out.processed + out.failed).toBe(0);
  });

  it('drops to INACTIVE, keeps firstActiveAt and stamps inactiveAt', async () => {
    const before = await get();
    const later = new Date(Date.now() + 10 * DAY);
    await refresh({ fetch: async () => [], now: later });
    const r = await get();
    expect(r).toMatchObject({ isActive: false, tradeCount7d: 0, trades30d: 0 });
    expect(r.firstActiveAt).toEqual(before.firstActiveAt);
    expect(r.inactiveAt?.getTime()).toBe(later.getTime());
  });

  it('keeps going when one of two accounts fails, and records the error', async () => {
    const later = new Date(Date.now() + 20 * DAY);
    await refresh({
      fetch: async (_u, acc) => {
        if (acc === badAccount) throw new Error('Invalid account');
        return [0, 1, 2].map(i => ({ status: 'CLOSED', openTime: iso(later.getTime() - DAY), closeTime: iso(later.getTime() - DAY + i), volume: 0.1 }));
      },
      now: later,
    });
    const r = await get();
    expect(r).toMatchObject({ isActive: true, tradeCount7d: 3, statsError: 'Invalid account', inactiveAt: null });
  });

  it('leaves the numbers untouched when every account fails', async () => {
    const before = await get();
    const later = new Date(Date.now() + 30 * DAY);
    const out = await refresh({ fetch: async () => { throw new Error('bridge down'); }, now: later });
    expect(out.failed).toBe(1);
    const r = await get();
    expect(r).toMatchObject({ isActive: before.isActive, tradeCount7d: before.tradeCount7d, trades30d: before.trades30d, statsError: 'bridge down' });
    expect(r.statsCheckedAt?.getTime()).toBe(later.getTime());
  });

  it('never runs two refreshes at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const later = new Date(Date.now() + 40 * DAY);
    const first = refresh({ fetch: async () => { await gate; return []; }, now: later });
    await new Promise(r => setTimeout(r, 50));
    const second = await refresh({ fetch: async () => [], now: later });
    expect(second.skipped).toBe(true);
    release();
    expect((await first).skipped).toBe(false);
  });
});
