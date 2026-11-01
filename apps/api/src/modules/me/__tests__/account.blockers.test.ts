// What stops an account being deleted: other people copying it, its own copies, partner referrals.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `acblk${Date.now()}`;

describe.skipIf(!local)('account deletion blockers', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../account.service.js');
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../account.service.js');
    for (const n of ['leader', 'follower', 'partner', 'referred']) ids[n] = (await prisma.user.create({ data: { email: `${tag}-${n}@trading.test`, name: n } })).id;
    const conn = async (u: string, l: string) => (await prisma.exchangeConnection.create({ data: { userId: u, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: l, apiKeyEnc: 'x', apiSecretEnc: 'y', keyLast4: '0000', keyFingerprint: `${tag}-${l}` } })).id;
    const lc = await conn(ids.leader!, 'L');
    const fc = await conn(ids.follower!, 'F');
    const leader = await prisma.copyLeader.create({ data: { userId: ids.leader!, connectionId: lc, displayName: 'Lead', status: 'VERIFIED' } });
    ids.follow = (await prisma.copyFollow.create({ data: { userId: ids.follower!, leaderId: leader.id, connectionId: fc } })).id;
    const p = await prisma.partner.create({ data: { userId: ids.partner!, status: 'ACTIVE' } });
    await prisma.referral.create({ data: { userId: ids.referred!, partnerId: p.id, code: 'TESTCODE', source: 'CODE' } as never });
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('names each reason in plain words', async () => {
    expect(await svc.deletionBlockers(ids.leader!)).toEqual(['1 person is copying your trades. Stop leading first so their copies end cleanly.']);
    expect(await svc.deletionBlockers(ids.follower!)).toEqual(['You\'re copying 1 leader. Stop those copies first and decide what to do with open positions.']);
    expect((await svc.deletionBlockers(ids.partner!))[0]).toMatch(/partner referrals/);
    expect(await svc.deletionBlockers(ids.referred!)).toEqual([]);
    await expect(svc.requestDeletion(ids.leader!, {})).rejects.toThrow(/copying your trades/);
  });
  it('clears once the copy is stopped', async () => {
    await prisma.copyFollow.update({ where: { id: ids.follow! }, data: { status: 'STOPPED' } });
    expect(await svc.deletionBlockers(ids.leader!)).toEqual([]);
    expect(await svc.deletionBlockers(ids.follower!)).toEqual([]);
  });
});
