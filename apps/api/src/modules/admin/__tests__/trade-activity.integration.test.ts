// Admin trade counts come from deals (execution), not the legacy trade table.
// Skipped unless TRADING_TEST_DB points at a local database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!local)('admin trade activity (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../trade-activity.js');
  const tag = `tact${Date.now()}`;
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const ids = { active: '', idle: '', none: '', recentOnly: '' };
  const brokers = { active: '', idle: '', recentOnly: '' };

  let ticket = 1n;
  const deal = (brokerAccountId: string, positionId: bigint, entry: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY', daysAgo: number, volume = '1', type: 'BUY' | 'SELL' | 'BALANCE' = 'BUY') => ({
    brokerAccountId,
    dealTicket: ticket++,
    orderTicket: ticket,
    positionId,
    symbol: 'EURUSD',
    type,
    entry,
    volume,
    price: '1.1',
    profit: '0',
    commission: '0',
    swap: '0',
    dealTime: new Date(now - daysAgo * DAY),
  });

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../trade-activity.js');
    for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
      ids[k] = (await prisma.user.create({ data: { name: k, email: `${tag}-${k}@admin.test` } })).id;
    }
    let login = BigInt(now);
    const broker = async (userId: string) =>
      (await prisma.brokerAccount.create({ data: { userId, broker: 'Test', server: 'Test-Live', mt5Login: login++, marginMode: 'HEDGING' } })).id;
    brokers.active = await broker(ids.active);
    brokers.idle = await broker(ids.idle);
    brokers.recentOnly = await broker(ids.recentOnly);

    await prisma.execution.createMany({
      data: [
        // closed 2 days ago
        deal(brokers.active, 1n, 'IN', 3), deal(brokers.active, 1n, 'OUT', 2),
        // closed 20 days ago (30d only)
        deal(brokers.active, 2n, 'IN', 21), deal(brokers.active, 2n, 'OUT_BY', 20),
        // open: 2 lots in, 1 lot partly closed yesterday
        deal(brokers.active, 3n, 'IN', 5, '2'), deal(brokers.active, 3n, 'OUT', 1, '1'),
        // reversal: INOUT closes and reopens, so still open
        deal(brokers.active, 4n, 'IN', 4), deal(brokers.active, 4n, 'INOUT', 3, '2'),
        // close with no opening deal in history: not a trade
        deal(brokers.active, 5n, 'OUT', 2),
        // a deposit is not a trade
        deal(brokers.active, 0n, 'IN', 1, '0', 'BALANCE'),
        // idle user: last deal 40 days ago
        deal(brokers.idle, 9n, 'IN', 41), deal(brokers.idle, 9n, 'OUT', 40),
        // recentOnly: last deal 10 days ago (not active, not inactive)
        deal(brokers.recentOnly, 7n, 'IN', 10),
      ],
    });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('counts trades per broker from deals', async () => {
    const m = await svc.positionCountsByBroker(d7, d30, Object.values(brokers));
    expect(m.get(brokers.active)).toEqual({ total: 4, open: 2, closed7d: 3, closed30d: 4 });
    expect(m.get(brokers.idle)).toEqual({ total: 1, open: 0, closed7d: 0, closed30d: 0 });
    expect(m.get(brokers.recentOnly)).toEqual({ total: 1, open: 1, closed7d: 0, closed30d: 0 });
    expect(svc.sumCounts(m.values())).toEqual({ total: 6, open: 3, closed7d: 3, closed30d: 4 });
  });

  it('returns nothing for an empty broker list', async () => {
    expect((await svc.positionCountsByBroker(d7, d30, [])).size).toBe(0);
  });

  it('active = a deal in 7 days; inactive = a broker but no deal in 30 days', async () => {
    const r = await svc.traderActivity(d7, d30, Object.values(ids));
    // `none` has no broker so it is in neither group.
    expect(r).toEqual({ active: 1, inactive: 1 });
  });

  it('the unscoped queries run', async () => {
    const all = await svc.positionCountsByBroker(d7, d30);
    expect(all.get(brokers.active)?.total).toBe(4);
    const t = await svc.traderActivity(d7, d30);
    expect(t.active).toBeGreaterThanOrEqual(1);
  });
});
