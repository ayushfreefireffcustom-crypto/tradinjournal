// The calendar merge repair against a real Postgres, on seeded rows shaped like
// the ones the old loose aliases wrote. Skipped unless TRADING_TEST_DB is local.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSurpriseGrid } from '@tradinjournal/core';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const PRIORITY = ['tradingview', 'forexfactory'];
// A far-future month no other test touches; the repair runs on this window only.
const WINDOW = { from: new Date('2091-03-01T00:00:00Z'), to: new Date('2091-04-01T00:00:00Z') };

describe.skipIf(!local)('calendar merge repair (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let repair: typeof import('../calendar.repair.js');
  let macro: typeof import('../../macro/macro-overview.service.js');
  const tag = `calrep${Date.now()}`;
  const ids: Record<string, string> = {};
  let alice = '';
  let bob = '';

  const tv = (country: string, currency: string, title: string, at: string, v: { actual?: string; forecast?: string; impact?: string } = {}) =>
    ({ source: 'tradingview', country, currency, title, impact: v.impact ?? 'HIGH', eventTimeUtc: at, ...(v.actual ? { actual: v.actual } : {}), ...(v.forecast ? { forecast: v.forecast } : {}) });
  const ff = (country: string, currency: string, title: string, at: string, v: { actual?: string; forecast?: string } = {}) =>
    ({ ...tv(country, currency, title, at, v), source: 'forexfactory' });

  async function seed(name: string, row: { dedupKey: string; title: string; country: string; currency: string; impact?: 'HIGH' | 'MEDIUM' | 'LOW'; at: string; actual?: string; forecast?: string; actualAt?: Date; raw: unknown[] }) {
    const e = await prisma.economicEvent.create({
      data: {
        dedupKey: row.dedupKey, title: row.title, country: row.country, currency: row.currency, impact: row.impact ?? 'HIGH',
        eventTime: new Date(row.at), actual: row.actual ?? null, forecast: row.forecast ?? null, actualAt: row.actualAt ?? null,
        sources: { winners: { title: 'tradingview' }, raw: row.raw } as object,
      },
    });
    ids[name] = e.id;
  }

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    repair = await import('../calendar.repair.js');
    macro = await import('../../macro/macro-overview.service.js');
    await prisma.economicEvent.deleteMany({ where: { eventTime: { gte: WINDOW.from, lt: WINDOW.to } } });
    alice = (await prisma.user.create({ data: { name: 'A', email: `${tag}-a@cal.test` } })).id;
    bob = (await prisma.user.create({ data: { name: 'B', email: `${tag}-b@cal.test` } })).id;

    const jobs = '2091-03-02T13:30:00.000Z';
    // Headline + U6 folded into one row showing U6's title, U6's actual and the headline forecast.
    await seed('jobs', {
      dedupKey: 'USD|2091-03-02T13|unemployment rate', title: 'U-6 Unemployment Rate', country: 'US', currency: 'USD', impact: 'LOW',
      at: jobs, actual: '7.9%', forecast: '4.2%', actualAt: new Date('2091-03-02T13:30:05Z'),
      raw: [tv('US', 'USD', 'U-6 Unemployment Rate', jobs, { actual: '7.9%', impact: 'LOW' }), tv('US', 'USD', 'Unemployment Rate', jobs, { actual: '4.3%', forecast: '4.2%' })],
    });
    // Total + private payrolls.
    await seed('nfp', {
      dedupKey: 'USD|2091-03-02T13|nfp', title: 'Non Farm Payrolls', country: 'US', currency: 'USD', at: jobs, actual: '119', forecast: '50',
      raw: [tv('US', 'USD', 'Non Farm Payrolls', jobs, { actual: '119', forecast: '50' }), tv('US', 'USD', 'Nonfarm Payrolls Private', jobs, { actual: '97', forecast: '40', impact: 'LOW' })],
    });
    // Italy's unemployment folded into the euro area's (same currency, same hour).
    const eu = '2091-03-02T10:00:00.000Z';
    await seed('euro', {
      dedupKey: 'EUR|2091-03-02T10|unemployment rate', title: 'Unemployment Rate', country: 'EU', currency: 'EUR', at: eu, actual: '6.3', forecast: '6.3',
      raw: [tv('EU', 'EUR', 'Unemployment Rate', eu, { actual: '6.3', forecast: '6.3' }), tv('IT', 'EUR', 'Unemployment Rate', eu, { actual: '6.0', forecast: '6.1' })],
    });
    // The same claims release twice: Forex Factory's name and TradingView's.
    const claims = '2091-03-05T13:30:00.000Z';
    await seed('claimsTv', {
      dedupKey: 'USD|2091-03-05T13|initial jobless claims', title: 'Initial Jobless Claims', country: 'US', currency: 'USD', at: claims, actual: '210', forecast: '215',
      raw: [tv('US', 'USD', 'Initial Jobless Claims', claims, { actual: '210', forecast: '215' })],
    });
    await seed('claimsFf', {
      dedupKey: 'USD|2091-03-05T13|unemployment claims', title: 'Unemployment Claims', country: 'US', currency: 'USD', at: claims, forecast: '216K',
      raw: [ff('US', 'USD', 'Unemployment Claims', claims, { forecast: '216K' })],
    });
    // Only the key's spelling changes.
    await seed('retail', {
      dedupKey: 'USD|2091-03-05T13|retail sales m/m', title: 'Retail Sales m/m', country: 'US', currency: 'USD', at: claims, forecast: '0.4%',
      raw: [ff('US', 'USD', 'Retail Sales m/m', claims, { forecast: '0.4%' })],
    });
    // Already right.
    const ism = '2091-03-05T15:00:00.000Z';
    await seed('ism', {
      dedupKey: 'USD|2091-03-05T15|ism manufacturing pmi', title: 'ISM Manufacturing PMI', country: 'US', currency: 'USD', at: ism, actual: '49', forecast: '48.5',
      raw: [tv('US', 'USD', 'ISM Manufacturing PMI', ism, { actual: '49', forecast: '48.5' })],
    });

    // User references: watches, inbox items and reminder-ledger rows.
    await prisma.eventWatch.createMany({
      data: [
        { userId: alice, eventId: ids.jobs! },
        { userId: alice, eventId: ids.claimsTv! },
        { userId: alice, eventId: ids.claimsFf! }, // duplicate of the one above once merged
        { userId: bob, eventId: ids.claimsFf! }, // must move to the survivor
      ],
    });
    await prisma.notification.createMany({
      data: [
        { userId: alice, kind: 'event_reminder', title: `${tag} jobs`, eventId: ids.jobs! },
        { userId: bob, kind: 'event_reminder', title: `${tag} claims`, eventId: ids.claimsFf! },
      ],
    });
    await prisma.notificationDelivery.createMany({
      data: [
        { userId: bob, dedupKey: `reminder:${ids.claimsFf}:${bob}`, channel: 'in_app' },
        { userId: alice, dedupKey: `reminder:${ids.claimsFf}:${alice}`, channel: 'in_app' },
        { userId: alice, dedupKey: `reminder:${ids.claimsTv}:${alice}`, channel: 'in_app' }, // already reminded via the survivor
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.notificationDelivery.deleteMany({ where: { userId: { in: [alice, bob] } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma.notification.deleteMany({ where: { title: { startsWith: tag } } });
    await prisma.economicEvent.deleteMany({ where: { eventTime: { gte: WINDOW.from, lt: WINDOW.to } } });
    await prisma.$disconnect();
  });

  it('dry run plans the split, merge and re-keys without writing', async () => {
    const before = await prisma.economicEvent.count({ where: { eventTime: { gte: WINDOW.from, lt: WINDOW.to } } });
    const plan = await repair.loadCalendarRepair(prisma, PRIORITY, WINDOW);
    expect(plan.scanned).toBe(7);
    expect(plan.splitRows).toBe(3); // jobs, nfp, euro
    expect(plan.creates.map(c => c.data.title).sort()).toEqual(['Nonfarm Payrolls Private', 'Unemployment Rate', 'Unemployment Rate']);
    expect(plan.deletes).toEqual([{ id: ids.claimsFf, intoId: ids.claimsTv }]);
    expect(plan.unchanged).toBe(1); // ISM; the TV claims row gains the Forex Factory provenance
    expect(plan.examples.some(e => e.startsWith('split USD/US') && e.includes('U-6 Unemployment Rate'))).toBe(true);
    expect(await prisma.economicEvent.count({ where: { eventTime: { gte: WINDOW.from, lt: WINDOW.to } } })).toBe(before);
  });

  it('applies: every release gets its own row, ids and user references are kept', async () => {
    const plan = await repair.loadCalendarRepair(prisma, PRIORITY, WINDOW);
    const r = await repair.applyCalendarRepair(prisma, plan);
    expect(r).toMatchObject({ created: 3, deleted: 1, watchesMoved: 1, notificationsMoved: 1, ledgerMoved: 1 });

    const rows = await prisma.economicEvent.findMany({ where: { eventTime: { gte: WINDOW.from, lt: WINDOW.to } }, orderBy: { dedupKey: 'asc' } });
    const byKey = Object.fromEntries(rows.map(e => [e.dedupKey, e]));
    expect(Object.keys(byKey)).toEqual([
      'EUR-IT|2091-03-02T10|unemployment rate',
      'EUR|2091-03-02T10|unemployment rate',
      'USD|2091-03-02T13|non farm payrolls',
      'USD|2091-03-02T13|non farm payrolls private',
      'USD|2091-03-02T13|u6 unemployment rate',
      'USD|2091-03-02T13|unemployment rate',
      'USD|2091-03-05T13|initial jobless claims',
      'USD|2091-03-05T13|retail sales mom',
      'USD|2091-03-05T15|ism manufacturing pmi',
    ]);

    // The U6 row keeps its id (the title users saw); the headline is a new HIGH row with its own numbers.
    const u6 = byKey['USD|2091-03-02T13|u6 unemployment rate']!;
    const headline = byKey['USD|2091-03-02T13|unemployment rate']!;
    expect(u6).toMatchObject({ id: ids.jobs, title: 'U-6 Unemployment Rate', actual: '7.9%', forecast: null, impact: 'LOW' });
    expect(headline).toMatchObject({ title: 'Unemployment Rate', actual: '4.3%', forecast: '4.2%', impact: 'HIGH' });
    expect(headline.id).not.toBe(ids.jobs);
    expect(headline.actualAt?.toISOString()).toBe('2091-03-02T13:30:05.000Z'); // not "now": no fresh "released" flash
    expect((headline.sources as { raw: unknown[] }).raw).toHaveLength(1);

    expect(byKey['USD|2091-03-02T13|non farm payrolls']).toMatchObject({ id: ids.nfp, actual: '119', forecast: '50' });
    expect(byKey['EUR|2091-03-02T10|unemployment rate']).toMatchObject({ id: ids.euro, country: 'EU', actual: '6.3' });
    expect(byKey['EUR-IT|2091-03-02T10|unemployment rate']).toMatchObject({ country: 'IT', actual: '6.0', forecast: '6.1' });
    expect(byKey['USD|2091-03-05T13|retail sales mom']!.id).toBe(ids.retail);
    expect(byKey['USD|2091-03-05T15|ism manufacturing pmi']!.id).toBe(ids.ism);

    // Claims: one row (the TV one), carrying both providers.
    const claims = byKey['USD|2091-03-05T13|initial jobless claims']!;
    expect(claims.id).toBe(ids.claimsTv);
    expect((claims.sources as { raw: Array<{ source: string }> }).raw.map(x => x.source).sort()).toEqual(['forexfactory', 'tradingview']);

    // References follow the survivor; nothing points at a deleted row.
    const watches = await prisma.eventWatch.findMany({ where: { userId: { in: [alice, bob] } }, select: { userId: true, eventId: true } });
    expect(watches.map(w => `${w.userId === alice ? 'alice' : 'bob'}:${w.eventId}`).sort()).toEqual(
      [`alice:${ids.claimsTv}`, `alice:${ids.jobs}`, `bob:${ids.claimsTv}`].sort(),
    );
    const notes = await prisma.notification.findMany({ where: { title: { startsWith: tag } }, select: { title: true, eventId: true } });
    expect(Object.fromEntries(notes.map(n => [n.title, n.eventId]))).toEqual({ [`${tag} jobs`]: ids.jobs, [`${tag} claims`]: ids.claimsTv });
    const ledger = await prisma.notificationDelivery.findMany({ where: { userId: { in: [alice, bob] } }, select: { dedupKey: true } });
    expect(ledger.map(l => l.dedupKey).sort()).toEqual(
      [`reminder:${ids.claimsTv}:${bob}`, `reminder:${ids.claimsTv}:${alice}`, `reminder:${ids.claimsFf}:${alice}`].sort(),
    );
  });

  it('is idempotent: a repaired window plans nothing', async () => {
    const plan = await repair.loadCalendarRepair(prisma, PRIORITY, WINDOW);
    expect(plan).toMatchObject({ scanned: 9, unchanged: 9, splitRows: 0, updates: [], creates: [], deletes: [] });
  });

  it('the macro surprise map reads the headline unemployment release from its own row', async () => {
    const rows = await prisma.economicEvent.findMany({
      where: { currency: 'USD', eventTime: { gte: WINDOW.from, lt: WINDOW.to }, actual: { not: null }, forecast: { not: null } },
      select: { title: true, eventTime: true, actual: true, forecast: true, sources: true },
      orderBy: { eventTime: 'asc' },
    });
    const grid = buildSurpriseGrid(macro.surpriseReleases(rows), '2091-03');
    const cell = grid.series.find(s => s.key === 'unemployment')!.cells.at(-1)!;
    expect(cell).toMatchObject({ actual: '4.3%', forecast: '4.2%', level: -1 });
  });
});
