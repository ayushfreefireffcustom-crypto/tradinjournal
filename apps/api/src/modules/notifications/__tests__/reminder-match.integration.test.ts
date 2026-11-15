// The traded-currency lookup against a real Postgres. Skipped unless TRADING_TEST_DB is local.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

describe.skipIf(!local)('currenciesByUser (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../reminder-match.js');
  const tag = `rmatch${Date.now()}`;
  let trader = '';
  let idle = '';

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../reminder-match.js');
    trader = (await prisma.user.create({ data: { name: 'T', email: `${tag}-t@rm.test` } })).id;
    idle = (await prisma.user.create({ data: { name: 'I', email: `${tag}-i@rm.test` } })).id;
    const b = await prisma.brokerAccount.create({ data: { userId: trader, broker: 'Test', server: 'Test-Live', mt5Login: BigInt(Date.now()), marginMode: 'HEDGING' } });
    const deal = (n: number, symbol: string, daysAgo: number, type: 'BUY' | 'BALANCE' = 'BUY') => ({
      brokerAccountId: b.id, dealTicket: BigInt(n), orderTicket: BigInt(n), positionId: BigInt(n), symbol, type, entry: 'IN' as const,
      volume: '1', price: '1', profit: '0', commission: '0', swap: '0', dealTime: new Date(Date.now() - daysAgo * 86_400_000),
    });
    await prisma.execution.createMany({ data: [deal(1, 'GBPJPY.m', 5), deal(2, 'GER40', 30), deal(3, 'AUDCAD', 200), deal(4, 'NZDCHF', 1, 'BALANCE')] });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('collects currencies from the last 90 days of trades, plus USD', async () => {
    const m = await svc.currenciesByUser([trader, idle]);
    expect([...m.get(trader)!].sort()).toEqual(['EUR', 'GBP', 'JPY', 'USD']);
    expect([...m.get(idle)!]).toEqual(['USD']);
  });
});
