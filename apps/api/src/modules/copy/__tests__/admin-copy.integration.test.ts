// Admin copy-trading tools against the local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Exchange } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

describe.skipIf(!local)('copy trading admin (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../admin-copy.service.js');
  const tag = `acit${Date.now()}`;
  const ids: Record<string, string> = {};
  const admin = { id: '', email: '' };
  const deps = { adapterFor: () => ({}) as Exchange, key: () => Buffer.alloc(32), sleep: async () => undefined };
  const notes = (userId: string, kind: string) => prisma.notification.count({ where: { userId, kind } });

  async function person(n: string) {
    const u = await prisma.user.create({ data: { name: `${tag} ${n}`, email: `${tag}-${n}@trading.test` } });
    const c = await prisma.exchangeConnection.create({
      data: { userId: u.id, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: `acct ${n}`, apiKeyEnc: 'x', apiSecretEnc: 'x', keyLast4: 'abcd', keyFingerprint: `${tag}-${n}`, canTrade: true, status: 'ACTIVE' },
    });
    ids[n] = u.id;
    ids[`c-${n}`] = c.id;
  }

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../admin-copy.service.js');
    for (const n of ['admin', 'lead', 'f1', 'f2', 'pend']) await person(n);
    Object.assign(admin, { id: ids.admin, email: `${tag}-admin@trading.test` });
    ids.leader = (await prisma.copyLeader.create({ data: { userId: ids.lead!, connectionId: ids['c-lead']!, displayName: `${tag} Lead`, bio: 'b', status: 'PENDING' } })).id;
    ids.pending = (await prisma.copyLeader.create({ data: { userId: ids.pend!, connectionId: ids['c-pend']!, displayName: `${tag} Pend`, bio: 'b', status: 'PENDING' } })).id;
  });

  afterAll(async () => {
    await prisma?.systemSetting.deleteMany({ where: { key: { in: [svc.KILL_SWITCH_KEY, svc.HEARTBEAT_KEY] } } });
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('lists leaders with the pending queue first and filters by status', async () => {
    const all = (await svc.adminListLeaders()).filter((l) => l.displayName.startsWith(tag));
    expect(all.map((l) => l.status)).toEqual(['PENDING', 'PENDING']);
    expect(all[0]).toMatchObject({ user: { email: expect.stringContaining(tag) }, connection: { keyLast4: 'abcd', status: 'ACTIVE' }, followers: 0, roi30dPct: null, tradeCount: 0 });
    expect(JSON.stringify(all)).not.toMatch(/apiKeyEnc|apiSecretEnc/);
    expect((await svc.adminListLeaders('VERIFIED')).some((l) => l.id === ids.leader)).toBe(false);
  });

  it('refuses transitions that make no sense', async () => {
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'pause', undefined)).rejects.toThrow(/Can't pause a leader that is pending/);
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'resume', undefined)).rejects.toThrow(/Can't resume/);
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'delist', undefined)).rejects.toThrow(/Can't remove/);
    await expect(svc.adminLeaderAction(admin, 'nope', 'approve', undefined)).rejects.toThrow(/not found/i);
  });

  it("won't approve a leader whose key is broken", async () => {
    await prisma.exchangeConnection.update({ where: { id: ids['c-lead'] }, data: { status: 'INVALID' } });
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'approve', undefined)).rejects.toThrow(/reconnect/);
    await prisma.exchangeConnection.update({ where: { id: ids['c-lead'] }, data: { status: 'ACTIVE' } });
  });

  it('approves, notifies the leader and audits', async () => {
    expect(await svc.adminLeaderAction(admin, ids.leader!, 'approve', undefined)).toEqual({ id: ids.leader, status: 'VERIFIED' });
    expect(await notes(ids.lead!, 'copy.leader_approved')).toBe(1);
    expect(await prisma.adminAuditLog.count({ where: { targetId: ids.leader, action: 'copy.leader_approve' } })).toBe(1);
    // Approving twice is a conflict, not a second notification.
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'approve', undefined)).rejects.toThrow(/verified/);
    expect(await notes(ids.lead!, 'copy.leader_approved')).toBe(1);
  });

  it('rejects an application by removing it, so they can apply again', async () => {
    expect(await svc.adminLeaderAction(admin, ids.pending!, 'reject', 'Need 30 days of history')).toEqual({ id: ids.pending, status: 'REJECTED' });
    expect(await prisma.copyLeader.findUnique({ where: { id: ids.pending } })).toBeNull();
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: ids.pend, kind: 'copy.leader_rejected' } });
    expect(n.body).toContain('Need 30 days of history');
    await expect(svc.adminLeaderAction(admin, ids.pending!, 'reject', undefined)).rejects.toThrow(/not found/i);
  });

  it('pauses and resumes, telling the leader and live followers only', async () => {
    const mk = (n: string, status: 'ACTIVE' | 'STOPPED') => prisma.copyFollow.create({ data: { userId: ids[n]!, leaderId: ids.leader!, connectionId: ids[`c-${n}`]!, status } });
    ids.follow1 = (await mk('f1', 'ACTIVE')).id;
    ids.follow2 = (await mk('f2', 'STOPPED')).id;
    await svc.adminLeaderAction(admin, ids.leader!, 'pause', 'Reviewing a complaint');
    expect((await prisma.copyLeader.findUniqueOrThrow({ where: { id: ids.leader } })).status).toBe('PAUSED');
    expect(await notes(ids.f1!, 'copy.leader_paused')).toBe(1);
    expect(await notes(ids.f2!, 'copy.leader_paused')).toBe(0);
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: ids.lead, kind: 'copy.leader_paused' } })).body).toContain('Reviewing a complaint');
    // Followers' own follows are untouched by a leader pause.
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: ids.follow1 } })).status).toBe('ACTIVE');
    await svc.adminLeaderAction(admin, ids.leader!, 'resume', undefined);
    expect(await notes(ids.f1!, 'copy.leader_resumed')).toBe(1);
  });

  it('delisting stops every live follow, detaches open copies and tells everyone', async () => {
    await prisma.exchangePosition.create({ data: { connectionId: ids['c-f1']!, followId: ids.follow1, positionKey: ids.follow1!, source: 'COPY', symbol: 'BTCUSD', side: 'LONG', qty: 2, avgEntry: 70_000 } });
    await svc.adminLeaderAction(admin, ids.leader!, 'delist', 'Terms breach', deps);
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: ids.follow1 } })).status).toBe('STOPPED');
    expect(await prisma.exchangePosition.count({ where: { positionKey: ids.follow1, closedAt: null } })).toBe(0);
    expect(await notes(ids.f1!, 'copy.leader_delisted')).toBe(1);
    expect(await notes(ids.lead!, 'copy.leader_delisted')).toBe(1);
    await expect(svc.adminLeaderAction(admin, ids.leader!, 'resume', undefined)).rejects.toThrow(/delisted/);
  });

  it('turns the kill switch on and off with a record of who and why', async () => {
    expect((await svc.getKillSwitch()).enabled).toBe(false);
    const on = await svc.setKillSwitch(admin, true, 'Exchange outage');
    expect(on).toMatchObject({ enabled: true, reason: 'Exchange outage', by: admin.email });
    expect(await svc.getKillSwitch()).toMatchObject({ enabled: true, reason: 'Exchange outage' });
    // The engine reads the same row and key.
    const row = await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'copy.killSwitch' } });
    expect((row.value as { enabled: boolean }).enabled).toBe(true);
    await svc.setKillSwitch(admin, false);
    expect((await svc.getKillSwitch()).enabled).toBe(false);
    expect(await prisma.adminAuditLog.count({ where: { actorId: admin.id, action: { in: ['copy.kill_switch_on', 'copy.kill_switch_off'] } } })).toBe(2);
  });

  it('reports engine health from the heartbeat and the order book', async () => {
    const now = new Date();
    await prisma.systemSetting.upsert({ where: { key: svc.HEARTBEAT_KEY }, update: { value: { at: now.toISOString(), startedAt: now.toISOString(), liveWatchers: 3 } }, create: { key: svc.HEARTBEAT_KEY, value: { at: now.toISOString(), startedAt: now.toISOString(), liveWatchers: 3 } } });
    let h = await svc.engineHealth(now);
    expect(h.engine).toMatchObject({ up: true, liveWatchers: 3 });
    expect(h.leaders.DELISTED).toBeGreaterThanOrEqual(1);
    // Five minutes without a beat is down.
    h = await svc.engineHealth(new Date(now.getTime() + 5 * 60_000));
    expect(h.engine.up).toBe(false);

    // Copies in the last day: latency, slippage and reasons.
    const lf = await prisma.leaderFill.create({ data: { leaderId: ids.leader!, externalId: `${tag}-lf`, symbol: 'BTCUSD', side: 'BUY', qty: 1, price: 70_000, exchTs: new Date(now.getTime() - 3000) } });
    const base = { userId: ids.f1!, connectionId: ids['c-f1']!, source: 'COPY' as const, followId: ids.follow1, symbol: 'BTCUSD', side: 'BUY' as const, type: 'MARKET' as const, qty: 1, leaderFillId: lf.id };
    await prisma.exchangeOrder.createMany({
      data: [
        { ...base, clientOrderId: `${tag}-1`, status: 'FILLED', filledQty: 1, filledAt: new Date(now.getTime() - 1000), slippageBps: 4 },
        { ...base, clientOrderId: `${tag}-2`, status: 'FILLED', filledQty: 1, filledAt: now, slippageBps: -2 },
        { ...base, clientOrderId: `${tag}-3`, status: 'SKIPPED', error: 'size rounds to zero' },
        { ...base, clientOrderId: `${tag}-4`, status: 'SKIPPED', error: 'size rounds to zero' },
        { ...base, clientOrderId: `${tag}-5`, status: 'REJECTED', error: 'Not enough margin.' },
      ],
    });
    h = await svc.engineHealth(now);
    expect(h.last24h.filled).toBeGreaterThanOrEqual(2);
    expect(h.last24h.medianLatencyMs).not.toBeNull();
    expect(h.last24h.meanAbsSlippageBps).not.toBeNull();
    expect(h.last24h.topReasons).toEqual(expect.arrayContaining([{ reason: 'size rounds to zero', count: expect.any(Number) }]));
    expect(h.lastLeaderFillAt).not.toBeNull();
  });

  it("shows a user's connections and follows without secrets, and lets an admin stop a follow", async () => {
    const f = await prisma.copyFollow.update({ where: { id: ids.follow1 }, data: { status: 'ACTIVE', stoppedAt: null } });
    const d = await svc.adminUserCopy(ids.f1!);
    expect(d.connections).toEqual([expect.objectContaining({ label: 'acct f1', status: 'ACTIVE', keyLast4: 'abcd' })]);
    expect(JSON.stringify(d)).not.toMatch(/apiKeyEnc|apiSecretEnc|keyFingerprint/);
    expect(d.follows.map((x) => x.id)).toContain(f.id);
    expect(d.leader).toBeNull();
    expect((await svc.adminUserCopy(ids.lead!)).leader).toMatchObject({ status: 'DELISTED' });

    const r = await svc.adminStopFollow(admin, f.id, 'Chargeback dispute', deps);
    expect(r.follow.status).toBe('STOPPED');
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: ids.f1, kind: 'copy.follow_stopped_by_admin' } })).body).toContain('Chargeback dispute');
    await expect(svc.adminStopFollow(admin, f.id, 'again', deps)).rejects.toThrow(/already stopped/);
    await expect(svc.adminStopFollow(admin, 'nope', 'x', deps)).rejects.toThrow(/not found/i);
  });

  it('only one of two simultaneous decisions wins', async () => {
    const l = await prisma.copyLeader.create({ data: { userId: ids.f2!, connectionId: ids['c-f2']!, displayName: `${tag} Race`, status: 'VERIFIED' } });
    const results = await Promise.allSettled([svc.adminLeaderAction(admin, l.id, 'pause', undefined), svc.adminLeaderAction(admin, l.id, 'delist', undefined, deps)]);
    const final = (await prisma.copyLeader.findUniqueOrThrow({ where: { id: l.id } })).status;
    // Either both ran in order (pause, then delist from paused) or one lost the race; never an impossible state.
    expect(['PAUSED', 'DELISTED']).toContain(final);
    expect(results.some((x) => x.status === 'fulfilled')).toBe(true);
  });
});
