// Plans and limits (H15): everyone Free while plans are off; assignments and limits once on.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `plans${Date.now()}`;

describe.skipIf(!local)('plans', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  const ids: Record<string, string> = {};
  const load = async (envs: Record<string, string | undefined>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(envs)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    return import('../plans.js');
  };
  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    for (const n of ['a', 'b']) ids[n] = (await prisma.user.create({ data: { email: `${tag}-${n}@trading.test`, name: n } })).id;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
    delete process.env.PLANS_ENABLED; delete process.env.PLAN_ASSIGNMENTS;
  });

  it('puts everyone on Free with every feature while plans are off', async () => {
    const p = await load({ PLANS_ENABLED: undefined, PLAN_ASSIGNMENTS: `pro:${tag}-a@trading.test` });
    expect(await p.planOf(ids.a!)).toBe('free');
    for (const f of p.FEATURES) expect(await p.hasFeature(ids.a!, f)).toBe(true);
    // Free keeps the limits the app always had.
    expect(p.PLANS.free.limits).toMatchObject({ brokerAccounts: 2, strategies: 100, runningDeployments: 10, indicatorAlerts: 50, savedScreens: 20, apiKeys: 10 });
    const s = await p.planSummary(ids.a!);
    expect(s).toMatchObject({ plan: 'free', label: 'Free', plansEnabled: false });
    expect(s.limits.find((l) => l.key === 'strategies')).toEqual({ key: 'strategies', label: 'Strategies', limit: 100, used: 0 });
  });
  it('reads plan assignments once plans are on, case-insensitively', async () => {
    const p = await load({ PLANS_ENABLED: 'true', PLAN_ASSIGNMENTS: `pro:${tag.toUpperCase()}-A@TRADING.TEST,nobody@x.y;bogus:${tag}-b@trading.test` });
    expect(await p.planOf(ids.a!)).toBe('pro');
    expect(await p.planOf(ids.b!)).toBe('free'); // unknown plan names are ignored
    expect(await p.limitOf(ids.a!, 'strategies')).toBe(500);
  });
  it('refuses a create at the limit with a 409 that says what to do', async () => {
    const p = await load({ PLANS_ENABLED: undefined, PLAN_ASSIGNMENTS: undefined });
    await expect(p.assertWithinLimit(ids.a!, 'savedScreens', 19, 'Delete one.')).resolves.toBeUndefined();
    const err = await p.assertWithinLimit(ids.a!, 'savedScreens', 20, 'Delete one to save another.').catch((e: unknown) => e as InstanceType<typeof p.PlanLimitError>);
    expect(err).toBeInstanceOf(p.PlanLimitError);
    expect(err).toMatchObject({ statusCode: 409, code: 'PLAN_LIMIT', message: 'You can have up to 20 saved screens. Delete one to save another.' });
  });
  it('counts usage per limit for one user only', async () => {
    const p = await load({ PLANS_ENABLED: undefined });
    await prisma.savedScreen.create({ data: { userId: ids.a!, name: 's', definition: {} } });
    await prisma.savedScreen.create({ data: { userId: ids.b!, name: 's', definition: {} } });
    await prisma.strategy.create({ data: { userId: ids.a!, name: 'x', spec: {}, status: 'archived' } });
    expect(await p.usageOf(ids.a!, 'savedScreens')).toBe(1);
    expect(await p.usageOf(ids.a!, 'strategies')).toBe(0); // archived ones don't count
  });
});
