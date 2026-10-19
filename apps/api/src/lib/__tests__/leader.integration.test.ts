// Two "replicas" competing for the scheduler lease on a real Postgres.
//   PARTNERS_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter api test
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const DB = process.env.PARTNERS_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) { process.env.DATABASE_URL = DB; process.env.DIRECT_URL = DB; }

describe.skipIf(!local)('scheduler leader lease (integration)', () => {
  let db: typeof import('@tradinjournal/db').prisma;
  let createElector: typeof import('../leader.js').createElector;
  const clear = () => db.systemSetting.deleteMany({ where: { key: 'scheduler:leader' } });

  beforeAll(async () => {
    ({ prisma: db } = await import('@tradinjournal/db'));
    ({ createElector } = await import('../leader.js'));
    await clear();
  });
  afterAll(async () => { await clear(); await db?.$disconnect(); });

  it('exactly one of two replicas leads, and the leader keeps renewing', async () => {
    const a = createElector('replica-a'), b = createElector('replica-b');
    const [ra, rb] = await Promise.all([a.tick(), b.tick()]);
    expect([ra, rb].filter(Boolean)).toHaveLength(1);
    const leader = ra ? a : b, follower = ra ? b : a;
    expect(await leader.tick()).toBe(true);
    expect(await follower.tick()).toBe(false);
    expect(leader.isLeader()).toBe(true);
  });

  it('a follower takes over once the lease is stale, and the old leader steps down', async () => {
    await clear();
    const a = createElector('replica-a'), b = createElector('replica-b');
    expect(await a.tick()).toBe(true);
    await db.$executeRaw`UPDATE "system_setting" SET "updatedAt" = now() - interval '5 minutes' WHERE "key" = 'scheduler:leader'`;
    expect(await b.tick()).toBe(true);
    expect(await a.tick()).toBe(false);
  });

  it('stop() hands over immediately', async () => {
    await clear();
    const a = createElector('replica-a'), b = createElector('replica-b');
    expect(await a.tick()).toBe(true);
    expect(await b.tick()).toBe(false);
    await a.stop();
    expect(await b.tick()).toBe(true);
  });

  it('20 replicas racing produce one leader', async () => {
    await clear();
    const electors = Array.from({ length: 20 }, (_, i) => createElector(`r${i}`));
    const results = await Promise.all(electors.map(e => e.tick()));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
