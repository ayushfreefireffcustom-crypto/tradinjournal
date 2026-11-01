// Leaders and follows against a disposable Postgres with a fake exchange.
// Skipped unless TRADING_TEST_DB points at a local database:
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COPY_RISK_VERSION } from '@tradinjournal/contracts';
import { ExchangeError, type Exchange, type OrderInfo, type PlaceOrderRequest } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const KEY = Buffer.from('cd'.repeat(32), 'hex');
const DAY = 24 * 3600_000;

describe.skipIf(!local)('copy trading leaders and follows (integration)', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let leaders: typeof import('../leaders.service.js');
  let follows: typeof import('../follows.service.js');
  let encryptWithKey: typeof import('@tradinjournal/secrets').encryptWithKey;
  const tag = `cit${Date.now()}`;
  const users: Record<string, { id: string; email: string }> = {};
  const conns: Record<string, string> = {};
  let leaderId = '';
  let pendingLeaderId = '';

  // Fake exchange: real positions per account, orders fill at `price`.
  let orderSeq = 0;
  const ex = { positions: new Map<string, number>(), price: 70_000, fail: null as null | 'place' | 'read' | 'nofill', placed: [] as PlaceOrderRequest[] };
  const fake = {
    getPositions: async () => {
      if (ex.fail === 'read') throw new ExchangeError('UNAVAILABLE', 'Exchange is down.');
      return [...ex.positions].map(([symbol, size]) => ({ symbol, size }));
    },
    placeOrder: async (_c: unknown, o: PlaceOrderRequest): Promise<OrderInfo> => {
      if (ex.fail === 'place') throw new ExchangeError('INSUFFICIENT_MARGIN', 'Not enough margin.');
      ex.placed.push(o);
      const filled = ex.fail === 'nofill' ? 0 : o.qty;
      ex.positions.set(o.symbol, (ex.positions.get(o.symbol) ?? 0) + (o.side === 'BUY' ? filled : -filled));
      return { exchangeOrderId: `x${++orderSeq}`, clientOrderId: o.clientOrderId ?? null, symbol: o.symbol, side: o.side, type: 'MARKET', status: filled ? 'FILLED' : 'CANCELLED', qty: o.qty, filledQty: filled, avgFillPrice: filled ? ex.price : null, limitPrice: null, stopPrice: null, reduceOnly: !!o.reduceOnly, createdAt: new Date() };
    },
    getOrder: async () => null,
    getInstrument: async () => ({ contractMultiplier: 0.001 }),
  } as unknown as Exchange;
  const deps = { adapterFor: () => fake, key: () => KEY, sleep: async () => undefined };
  const followInput = (over: Record<string, unknown> = {}) => ({ leaderId, connectionId: conns.f1!, sizingMode: 'PROPORTIONAL' as const, sizingValue: 1, copyOpenTrades: false, riskAccepted: true as const, riskVersion: COPY_RISK_VERSION as typeof COPY_RISK_VERSION, ...over });

  async function conn(userId: string, name: string, over: Record<string, unknown> = {}) {
    const c = await prisma.exchangeConnection.create({
      data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: name, apiKeyEnc: encryptWithKey(`k-${name}`, KEY), apiSecretEnc: encryptWithKey(`s-${name}`, KEY), keyLast4: name.slice(-4), keyFingerprint: `${tag}-${name}`, canTrade: true, status: 'ACTIVE', ...over },
    });
    return c.id;
  }

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    ({ encryptWithKey } = await import('@tradinjournal/secrets'));
    leaders = await import('../leaders.service.js');
    follows = await import('../follows.service.js');
    for (const n of ['lead', 'pend', 'fol', 'other']) {
      const u = await prisma.user.create({ data: { name: `IT ${n}`, email: `${tag}-${n}@trading.test` } });
      users[n] = { id: u.id, email: u.email };
    }
    conns.lead = await conn(users.lead!.id, 'LEAD');
    conns.pend = await conn(users.pend!.id, 'PEND');
    conns.f1 = await conn(users.fol!.id, 'FOL1');
    conns.f2 = await conn(users.fol!.id, 'FOL2');
    conns.live = await conn(users.fol!.id, 'LIVE', { environment: 'LIVE' });
    conns.bad = await conn(users.fol!.id, 'BAD1', { status: 'INVALID' });
    conns.other = await conn(users.other!.id, 'OTH1');

    const now = Date.now();
    const l = await prisma.copyLeader.create({ data: { userId: users.lead!.id, connectionId: conns.lead, displayName: `${tag} Alpha`, bio: 'Trend following on BTC.', status: 'VERIFIED', createdAt: new Date(now - 40 * DAY) } });
    leaderId = l.id;
    // 40 days of equity: 1000 → 1200 with a dip to 900 (25 % drawdown from 1200 peak? no: peak 1100 → 900 = 18.2 %).
    const curve = [1000, 1100, 900, 1000, 1200];
    await prisma.leaderEquityPoint.createMany({ data: curve.map((v, i) => ({ leaderId, equityUsd: v, ts: new Date(now - (40 - i * 10) * DAY + 1000) })) });
    await prisma.leaderStat.createMany({
      data: [
        { leaderId, window: '7d', roiPct: 2, maxDrawdownPct: 1 },
        { leaderId, window: '30d', roiPct: 9.09, maxDrawdownPct: 18.18, winRatePct: 60, tradeCount: 12 },
        { leaderId, window: 'all', roiPct: 20, maxDrawdownPct: 18.18, winRatePct: 60, tradeCount: 12, top3ProfitSharePct: 72.5, closedTradeCount: 9 },
      ],
    });
    // Entries of 2, 4, 4 contracts → median 4; leader long 4 BTCUSD now; flat on ETHUSD.
    const fill = (i: number, symbol: string, side: 'BUY' | 'SELL', qty: number, positionAfter: number, reduceOnly = false) =>
      ({ leaderId, externalId: `${tag}-${i}`, symbol, side, qty, price: 70_000, positionAfter, reduceOnly, exchTs: new Date(now - (10 - i) * 3600_000) });
    await prisma.leaderFill.createMany({
      data: [fill(1, 'BTCUSD', 'BUY', 2, 2), fill(2, 'BTCUSD', 'SELL', 2, 0, true), fill(3, 'BTCUSD', 'BUY', 4, 4), fill(4, 'ETHUSD', 'BUY', 4, 4), fill(5, 'ETHUSD', 'SELL', 4, 0, true)],
    });
    const p = await prisma.copyLeader.create({ data: { userId: users.pend!.id, connectionId: conns.pend, displayName: `${tag} Pending`, bio: 'Not yet approved.', status: 'PENDING' } });
    pendingLeaderId = p.id;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  // ── Leaders ──

  it('lists only verified, listed leaders with real stats and a grade', async () => {
    const list = await leaders.listLeaders(users.fol!.id, { sort: 'roi', range: '30d', q: tag });
    expect(list.map((l) => l.id)).toEqual([leaderId]);
    const [a] = list;
    expect(a).toMatchObject({ followers: 0, following: false, isMine: false, riskGrade: 'B', exchange: 'DELTA_INDIA', environment: 'TESTNET', equityUsd: 1200 });
    expect(a!.stats).toMatchObject({ range: '30d', roiPct: 9.09, maxDrawdownPct: 18.18, winRatePct: 60, tradeCount: 12 });
    // Not computed for 30d: unknown, not 0.
    expect(a!.stats).toMatchObject({ top3ProfitSharePct: null, closedTradeCount: null });
    // 30 d window holds the last 4 points: 1100 → 1200.
    expect(a!.stats.pnlUsd).toBe(100);
    expect(a!.sparkline).toEqual([1100, 900, 1000, 1200]);
    // 1200 / median entry 4 contracts = 300.
    expect(a!.recommendedMarginUsd).toBe(300);
    expect(a!.daysActive).toBe(40);
  });

  it('searches by name and never shows another user a pending leader', async () => {
    expect(await leaders.listLeaders(users.fol!.id, { sort: 'roi', range: '30d', q: 'no-such-leader-name' })).toEqual([]);
    expect((await leaders.listLeaders(users.fol!.id, { sort: 'roi', range: 'all', q: `${tag} Pending` })).length).toBe(0);
    await expect(leaders.getLeader(users.fol!.id, pendingLeaderId)).rejects.toThrow(/not found/i);
    await expect(leaders.leaderTrades(users.fol!.id, pendingLeaderId, { limit: 10 })).rejects.toThrow(/not found/i);
    await expect(leaders.leaderEquity(users.fol!.id, pendingLeaderId, '30d')).rejects.toThrow(/not found/i);
    // The owner can see their own pending profile.
    expect((await leaders.getLeader(users.pend!.id, pendingLeaderId)).isMine).toBe(true);
  });

  it('shows unknown stats as null, not 0, when the range has under two equity samples', async () => {
    // Only one point (now) falls inside 7 days.
    const d = await leaders.getLeader(users.fol!.id, leaderId, '7d');
    expect(d.stats).toMatchObject({ roiPct: null, maxDrawdownPct: null, pnlUsd: null });
  });

  it('shows a leader page with stats per range and open positions from fills', async () => {
    const d = await leaders.getLeader(users.fol!.id, leaderId, '7d');
    expect(d.statsByRange['30d'].roiPct).toBe(9.09);
    expect(d.statsByRange.all.pnlUsd).toBe(200);
    expect(d.statsByRange.all).toMatchObject({ top3ProfitSharePct: 72.5, closedTradeCount: 9 });
    expect(d.openPositions).toEqual([expect.objectContaining({ symbol: 'BTCUSD', side: 'LONG', size: 4 })]);
    expect(d.lastTradeAt).not.toBeNull();
  });

  it("prefers the exchange's live positions, and falls back to recorded fills", async () => {
    const live = { adapterFor: () => ({ getPositions: async () => [{ symbol: 'BTCUSD', size: 4 }, { symbol: 'ETHUSD', size: -3 }, { symbol: 'SOLUSD', size: 0 }] }) as unknown as Exchange, key: () => KEY };
    const d = await leaders.getLeader(users.fol!.id, leaderId, '30d', new Date(), live);
    expect(d.openPositions).toEqual([
      expect.objectContaining({ symbol: 'BTCUSD', side: 'LONG', size: 4, since: expect.any(String) }),
      // Opened before we watched: no start time to show.
      { symbol: 'ETHUSD', side: 'SHORT', size: 3, since: null },
    ]);
    // Cached for 30 s: a failing exchange right after still shows the cached read.
    const down = { adapterFor: () => ({ getPositions: async () => { throw new ExchangeError('UNAVAILABLE', 'down'); } }) as unknown as Exchange, key: () => KEY };
    expect((await leaders.getLeader(users.fol!.id, leaderId, '30d', new Date(), down)).openPositions).toHaveLength(2);
    // After the cache expires, a failure falls back to fills.
    const later = new Date(Date.now() + 60_000);
    expect((await leaders.getLeader(users.fol!.id, leaderId, '30d', later, down)).openPositions).toEqual([expect.objectContaining({ symbol: 'BTCUSD', size: 4 })]);
  });

  it('pages leader trades newest first without repeats', async () => {
    const p1 = await leaders.leaderTrades(users.fol!.id, leaderId, { limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0]!.symbol).toBe('ETHUSD');
    const p2 = await leaders.leaderTrades(users.fol!.id, leaderId, { limit: 2, cursor: p1.nextCursor! });
    const p3 = await leaders.leaderTrades(users.fol!.id, leaderId, { limit: 2, cursor: p2.nextCursor! });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((t) => t.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });

  it("rebuilds the leader's closed round trips for the analytics, cached briefly", async () => {
    let calls = 0;
    const inst = (mults: Record<string, number>) => ({ adapterFor: () => ({ getInstrument: async (sym: string) => (calls++, mults[sym] != null ? { contractMultiplier: mults[sym] } : null) }) as unknown as Exchange, key: () => KEY });
    const t0 = new Date(Date.now() + 10 * 60_000);
    const r = await leaders.leaderRoundTrips(users.fol!.id, leaderId, t0, inst({ BTCUSD: 0.001, ETHUSD: 0.01 }));
    // BTC long 2 closed, ETH long 4 closed; the open BTC long 4 isn't a trade yet.
    expect(r.trades.map((t) => [t.symbol, t.side, t.qty, t.pnlUsd])).toEqual([['BTCUSD', 'LONG', 2, 0], ['ETHUSD', 'LONG', 4, 0]]);
    expect(r.trades[0]).toMatchObject({ avgEntry: 70_000, avgExit: 70_000 });
    expect(new Date(r.trades[0]!.closedAt).getTime()).toBeGreaterThan(new Date(r.trades[0]!.openedAt).getTime());
    expect(r.startingEquityUsd).toBe(1000);
    // Within a minute the cache answers, even with different instrument data.
    const n = calls;
    expect(await leaders.leaderRoundTrips(users.fol!.id, leaderId, new Date(t0.getTime() + 30_000), inst({}))).toEqual(r);
    expect(calls).toBe(n);
    // After it, a symbol the venue no longer lists is left out rather than guessed.
    const later = await leaders.leaderRoundTrips(users.fol!.id, leaderId, new Date(t0.getTime() + 120_000), inst({ BTCUSD: 0.001 }));
    expect(later.trades.map((t) => t.symbol)).toEqual(['BTCUSD']);
    await expect(leaders.leaderRoundTrips(users.fol!.id, pendingLeaderId)).rejects.toThrow(/not found/i);
  });

  it('returns the equity curve for a range', async () => {
    const pts = await leaders.leaderEquity(users.fol!.id, leaderId, 'all');
    expect(pts.map((p) => p.equityUsd)).toEqual([1000, 1100, 900, 1000, 1200]);
  });

  it('applies as a leader with guards', async () => {
    // Already a leader.
    await expect(leaders.applyAsLeader(users.lead!, { connectionId: conns.lead!, displayName: 'Again', bio: 'x'.repeat(30) })).rejects.toThrow(/already have a leader profile/);
    // Someone else's account looks missing.
    await expect(leaders.applyAsLeader(users.other!, { connectionId: conns.f1!, displayName: 'Thief', bio: 'x'.repeat(30) })).rejects.toThrow(/not found/i);
    // A broken key.
    await expect(leaders.applyAsLeader(users.fol!, { connectionId: conns.bad!, displayName: 'Broken', bio: 'x'.repeat(30) })).rejects.toThrow(/Reconnect/);
    const mine = await leaders.applyAsLeader(users.other!, { connectionId: conns.other!, displayName: `${tag} Omega`, bio: 'Scalping ETH on the 5 minute chart.' });
    expect(mine).toMatchObject({ status: 'PENDING', followers: 0, connectionLabel: 'OTH1' });
    expect(await leaders.getMyLeader(users.other!.id)).toMatchObject({ id: mine.id });
    const edited = await leaders.updateMyLeader(users.other!.id, { listed: false, displayName: `${tag} Omega 2` });
    expect(edited).toMatchObject({ listed: false, displayName: `${tag} Omega 2` });
    expect(await leaders.getMyLeader(users.fol!.id)).toBeNull();
    await expect(leaders.updateMyLeader(users.fol!.id, { listed: false })).rejects.toThrow(/no leader profile/);
  });

  // ── Follows: guards ──

  it('refuses follows that break the rules', async () => {
    const f = users.fol!.id;
    await expect(follows.createFollow(f, followInput({ leaderId: 'nope' }))).rejects.toThrow(/Leader not found/);
    // A pending profile is invisible to others, so it answers like a missing one.
    await expect(follows.createFollow(f, followInput({ leaderId: pendingLeaderId }))).rejects.toThrow(/Leader not found/);
    await expect(follows.createFollow(users.lead!.id, followInput({ connectionId: conns.lead }))).rejects.toThrow(/can't copy your own/);
    await expect(follows.createFollow(f, followInput({ connectionId: conns.other }))).rejects.toThrow(/Exchange account not found/);
    await expect(follows.createFollow(f, followInput({ connectionId: conns.live }))).rejects.toThrow(/Delta Exchange India \(testnet\)/);
    await expect(follows.createFollow(f, followInput({ connectionId: conns.bad }))).rejects.toThrow(/Reconnect/);
    expect(await prisma.copyFollow.count({ where: { userId: f } })).toBe(0);
  });

  it("refuses to copy onto a leader's own account", async () => {
    // users.other became a (pending) leader on OTH1 above; verify them and have them follow Alpha with it.
    await prisma.copyLeader.updateMany({ where: { userId: users.other!.id }, data: { status: 'VERIFIED' } });
    await expect(follows.createFollow(users.other!.id, followInput({ connectionId: conns.other }))).rejects.toThrow(/leader account can't copy/);
  });

  it('enforces the follower limit', async () => {
    await prisma.copyLeader.update({ where: { id: leaderId }, data: { maxFollowers: 0 } });
    await expect(follows.createFollow(users.fol!.id, followInput())).rejects.toThrow(/follower limit/);
    await prisma.copyLeader.update({ where: { id: leaderId }, data: { maxFollowers: null } });
  });

  // ── Follows: lifecycle ──

  let followId = '';
  it('starts a follow, storing the risk acceptance', async () => {
    const t0 = new Date();
    const dto = await follows.createFollow(users.fol!.id, followInput({ dailyLossLimitUsd: 50, maxProfitUsd: 200, leverage: 5 }), t0);
    followId = dto.id;
    expect(dto).toMatchObject({ status: 'ACTIVE', sizingMode: 'PROPORTIONAL', sizingValue: 1, dailyLossLimitUsd: 50, maxProfitUsd: 200, leverage: 5, realizedPnlUsd: 0, openPositions: 0 });
    const row = await prisma.copyFollow.findUniqueOrThrow({ where: { id: followId } });
    expect(row.riskVersion).toBe(COPY_RISK_VERSION);
    expect(row.riskAcceptedAt?.getTime()).toBe(t0.getTime());
    expect(row.startedAt.getTime()).toBe(t0.getTime());
    // It now shows on the leaderboard as followed, with one follower.
    const [card] = await leaders.listLeaders(users.fol!.id, { sort: 'roi', range: '30d', q: `${tag} Alpha` });
    expect(card).toMatchObject({ following: true, followers: 1 });
  });

  it('refuses a second follow of the same leader, or a second leader on the same account', async () => {
    await expect(follows.createFollow(users.fol!.id, followInput({ connectionId: conns.f2 }))).rejects.toThrow(/already copy this leader/);
    const omega = await prisma.copyLeader.findFirstOrThrow({ where: { userId: users.other!.id } });
    await prisma.copyLeader.update({ where: { id: omega.id }, data: { listed: true } });
    await expect(follows.createFollow(users.fol!.id, followInput({ leaderId: omega.id }))).rejects.toThrow(/already copying .*Alpha/);
    // A different account is fine.
    const second = await follows.createFollow(users.fol!.id, followInput({ leaderId: omega.id, connectionId: conns.f2 }));
    expect(second.status).toBe('ACTIVE');
    await follows.stopFollow(users.fol!.id, second.id, false, deps);
  });

  it("never lets another user read or change someone's follow", async () => {
    const o = users.other!.id;
    await expect(follows.getFollow(o, followId)).rejects.toThrow(/Follow not found/);
    await expect(follows.followOrders(o, followId, { limit: 10 })).rejects.toThrow(/Follow not found/);
    await expect(follows.updateFollow(o, followId, { action: 'pause' })).rejects.toThrow(/Follow not found/);
    await expect(follows.stopFollow(o, followId, true, deps)).rejects.toThrow(/Follow not found/);
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: followId } })).status).toBe('ACTIVE');
    expect((await follows.listFollows(o)).map((f) => f.id)).not.toContain(followId);
  });

  it('pauses, resumes, and edits settings', async () => {
    const f = users.fol!.id;
    await prisma.copyFollow.update({ where: { id: followId }, data: { residuals: { BTCUSD: 0.4 } } });
    expect(await follows.updateFollow(f, followId, { action: 'pause' })).toMatchObject({ status: 'PAUSED', pauseReason: 'Paused by you' });
    // Pausing twice is harmless.
    expect((await follows.updateFollow(f, followId, { action: 'pause' })).status).toBe('PAUSED');
    expect(await follows.updateFollow(f, followId, { action: 'resume' })).toMatchObject({ status: 'ACTIVE', pauseReason: null });
    const edited = await follows.updateFollow(f, followId, { sizingMode: 'MULTIPLIER', sizingValue: 2, dailyLossLimitUsd: null, copyReverse: true });
    expect(edited).toMatchObject({ sizingMode: 'MULTIPLIER', sizingValue: 2, dailyLossLimitUsd: null, maxProfitUsd: 200, copyReverse: true });
    // A sizing change drops carried residuals.
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: followId } })).residuals).toEqual({});
  });

  it("won't resume while the account or the leader is broken", async () => {
    const f = users.fol!.id;
    await follows.updateFollow(f, followId, { action: 'pause' });
    await prisma.exchangeConnection.update({ where: { id: conns.f1 }, data: { status: 'INVALID' } });
    await expect(follows.updateFollow(f, followId, { action: 'resume' })).rejects.toThrow(/Reconnect/);
    await prisma.exchangeConnection.update({ where: { id: conns.f1 }, data: { status: 'ACTIVE' } });
    await prisma.copyLeader.update({ where: { id: leaderId }, data: { status: 'PAUSED' } });
    await expect(follows.updateFollow(f, followId, { action: 'resume' })).rejects.toThrow(/leader isn't trading/);
    // A follower can still see a paused leader they copy.
    expect((await leaders.getLeader(f, leaderId)).following).toBe(true);
    await prisma.copyLeader.update({ where: { id: leaderId }, data: { status: 'VERIFIED' } });
    await follows.updateFollow(f, followId, { action: 'resume' });
  });

  it('reports P&L, tracking error and latency from copied orders', async () => {
    const lf = await prisma.leaderFill.findFirstOrThrow({ where: { externalId: `${tag}-3` } });
    const base = { userId: users.fol!.id, connectionId: conns.f1!, source: 'COPY' as const, followId, symbol: 'BTCUSD', type: 'MARKET' as const };
    const filledAt = new Date();
    await prisma.exchangeOrder.createMany({
      data: [
        { ...base, clientOrderId: `${tag}-o1`, side: 'BUY', qty: 2, filledQty: 2, status: 'FILLED', leaderFillId: lf.id, leaderPrice: 70_000, avgFillPrice: 70_035, slippageBps: 5, filledAt },
        { ...base, clientOrderId: `${tag}-o2`, side: 'SELL', qty: 1, filledQty: 1, status: 'FILLED', leaderFillId: lf.id, leaderPrice: 71_000, avgFillPrice: 71_014.2, slippageBps: -3, realizedPnl: 12.5, filledAt: new Date(filledAt.getTime() + 1000), reduceOnly: true },
        { ...base, clientOrderId: `${tag}-o3`, side: 'BUY', qty: 0, status: 'SKIPPED', leaderFillId: lf.id, error: 'size rounds to zero' },
        { ...base, clientOrderId: `${tag}-o4`, side: 'BUY', qty: 1, status: 'REJECTED', leaderFillId: lf.id, error: 'Not enough margin.' },
      ],
    });
    await prisma.exchangePosition.create({ data: { connectionId: conns.f1!, followId, positionKey: followId, source: 'COPY', symbol: 'BTCUSD', side: 'LONG', qty: 1, avgEntry: 70_035, markPrice: 71_000, unrealizedPnl: 0.97 } });
    ex.positions.set('BTCUSD', 1);
    const d = await follows.getFollow(users.fol!.id, followId);
    expect(d).toMatchObject({ realizedPnlUsd: 12.5, unrealizedPnlUsd: 0.97, openPositions: 1, copiedOrders: 2, skippedOrders: 1, failedOrders: 1, trackingErrorBps: 4 });
    expect(d.medianLatencyMs).toBeGreaterThan(3600_000);
    expect(d.positions).toEqual([expect.objectContaining({ symbol: 'BTCUSD', side: 'LONG', qty: 1, drift: false })]);
    const page = await follows.followOrders(users.fol!.id, followId, { limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items.find((o) => o.status === 'FILLED')).toMatchObject({ leaderPrice: expect.any(Number), fillPrice: expect.any(Number) });
    // Leader portal sees its followers' totals.
    expect(await leaders.getMyLeader(users.lead!.id)).toMatchObject({ followers: 1, openCopiedPositions: 1, followersPnlUsd: 13.47 });
  });

  it('stops and closes only what the follow copied, capped by the exchange', async () => {
    // The follower also holds a manual position on top: exchange shows 3, we copied 1.
    ex.positions.set('BTCUSD', 3);
    ex.price = 72_000;
    ex.placed = [];
    const r = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(r.follow.status).toBe('STOPPED');
    expect(ex.placed).toEqual([expect.objectContaining({ symbol: 'BTCUSD', side: 'SELL', qty: 1, reduceOnly: true, type: 'MARKET' })]);
    expect(ex.positions.get('BTCUSD')).toBe(2);
    expect(r.closes).toEqual([expect.objectContaining({ symbol: 'BTCUSD', ok: true, qty: 1 })]);
    // (72000 − 70035) × 1 × 0.001 = 1.965 → 1.97
    expect(r.follow.realizedPnlUsd).toBeCloseTo(12.5 + 1.97, 2);
    expect(r.follow.openPositions).toBe(0);
    // Stopping twice places nothing.
    ex.placed = [];
    const again = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(ex.placed).toHaveLength(0);
    expect(again.closes).toEqual([]);
    await expect(follows.updateFollow(users.fol!.id, followId, { action: 'resume' })).rejects.toThrow(/stopped/);
  });

  it('re-following starts from zero: new start time, no old totals or positions', async () => {
    const t1 = new Date(Date.now() + 1000);
    const dto = await follows.createFollow(users.fol!.id, followInput({ sizingMode: 'FIXED_NOTIONAL', sizingValue: 100 }), t1);
    expect(dto.id).toBe(followId);
    expect(dto).toMatchObject({ status: 'ACTIVE', sizingMode: 'FIXED_NOTIONAL', sizingValue: 100, realizedPnlUsd: 0, unrealizedPnlUsd: 0, openPositions: 0, copiedOrders: 0, dailyLossLimitUsd: null, maxProfitUsd: null, copyReverse: false, leverage: null, pauseReason: null, stoppedAt: null });
    expect(new Date(dto.startedAt).getTime()).toBe(t1.getTime());
  });

  it('leaves positions open, and says so, when stopping without closing', async () => {
    await prisma.exchangePosition.create({ data: { connectionId: conns.f1!, followId, positionKey: followId, source: 'COPY', symbol: 'ETHUSD', side: 'SHORT', qty: 2, avgEntry: 3000 } });
    ex.placed = [];
    const r = await follows.stopFollow(users.fol!.id, followId, false, deps);
    expect(ex.placed).toHaveLength(0);
    expect(r.closes).toEqual([{ symbol: 'ETHUSD', ok: false, qty: 2, message: 'Left open on your exchange account.' }]);
    // Detached: a later re-follow won't inherit it.
    expect(await prisma.exchangePosition.count({ where: { positionKey: followId, closedAt: null } })).toBe(0);
  });

  it('reports exchange failures per position and still stops', async () => {
    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 2000));
    const mk = (symbol: string) => prisma.exchangePosition.create({ data: { connectionId: conns.f1!, followId, positionKey: followId, source: 'COPY', symbol, side: 'LONG', qty: 1, avgEntry: 100 } });
    await mk('SOLUSD');
    ex.positions.set('SOLUSD', 1);
    ex.fail = 'place';
    const r = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(r.follow.status).toBe('STOPPED');
    expect(r.closes).toEqual([{ symbol: 'SOLUSD', ok: false, qty: 0, message: 'Not enough margin.' }]);
    expect(await prisma.exchangeOrder.findFirst({ where: { followId, symbol: 'SOLUSD' } })).toMatchObject({ status: 'REJECTED', errorCode: 'INSUFFICIENT_MARGIN' });

    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 3000));
    await mk('XRPUSD');
    ex.positions.set('XRPUSD', 1);
    ex.fail = 'read';
    const r2 = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(r2.closes).toEqual([{ symbol: 'XRPUSD', ok: false, qty: 0, message: 'Exchange is down.' }]);

    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 4000));
    await mk('ADAUSD');
    ex.positions.set('ADAUSD', 1);
    ex.fail = 'nofill';
    const r3 = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(r3.closes[0]).toMatchObject({ symbol: 'ADAUSD', ok: false, message: expect.stringMatching(/did not fill/) });
    ex.fail = null;

    // Already flat on the exchange: nothing is sent.
    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 5000));
    await mk('DOTUSD');
    ex.positions.set('DOTUSD', 0);
    ex.placed = [];
    const r4 = await follows.stopFollow(users.fol!.id, followId, true, deps);
    expect(ex.placed).toHaveLength(0);
    expect(r4.closes[0]).toMatchObject({ symbol: 'DOTUSD', ok: true, qty: 0, message: 'Already closed on the exchange.' });
  });

  it('finds which users had copy activity since a time', async () => {
    const { changedUsers } = await import('../copy-stream.js');
    const t0 = new Date();
    await new Promise((r) => setTimeout(r, 20));
    expect(await changedUsers([users.fol!.id, users.other!.id], t0)).toEqual(new Set());
    await prisma.exchangePosition.updateMany({ where: { connectionId: conns.f1 }, data: { markPrice: 1 } });
    expect(await changedUsers([users.fol!.id, users.other!.id], t0)).toEqual(new Set([users.fol!.id]));
    await prisma.exchangeOrder.create({ data: { userId: users.other!.id, connectionId: conns.other!, source: 'COPY', symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', qty: 1, status: 'SKIPPED', clientOrderId: `${tag}-stream-other` } });
    expect(await changedUsers([users.fol!.id, users.other!.id], t0)).toEqual(new Set([users.fol!.id, users.other!.id]));
    expect(await changedUsers([], t0)).toEqual(new Set());
  });

  it('waits for a copy that is mid-flight when stopped, and closes it too', async () => {
    // Regression: stopping a second after a copy filled closed nothing, and the
    // engine then wrote the position onto the stopped follow, stranding it.
    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 6000));
    const order = await prisma.exchangeOrder.create({ data: { userId: users.fol!.id, connectionId: conns.f1!, source: 'COPY', followId, clientOrderId: `${tag}-inflight`, symbol: 'LTCUSD', side: 'BUY', type: 'MARKET', qty: 2, status: 'PENDING' } });
    ex.placed = [];
    ex.fail = null;
    // The "engine" finishes 600 ms after the stop starts: position first, then the order.
    const engine = (async () => {
      await new Promise((r) => setTimeout(r, 600));
      ex.positions.set('LTCUSD', 2);
      await prisma.exchangePosition.create({ data: { connectionId: conns.f1!, followId, positionKey: followId, source: 'COPY', symbol: 'LTCUSD', side: 'LONG', qty: 2, avgEntry: 80 } });
      await prisma.exchangeOrder.update({ where: { id: order.id }, data: { status: 'FILLED', filledQty: 2, filledAt: new Date() } });
    })();
    const realSleep = { ...deps, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
    const r = await follows.stopFollow(users.fol!.id, followId, true, realSleep);
    await engine;
    expect(r.closes).toEqual([expect.objectContaining({ symbol: 'LTCUSD', ok: true, qty: 2 })]);
    expect(ex.placed).toEqual([expect.objectContaining({ symbol: 'LTCUSD', side: 'SELL', qty: 2, reduceOnly: true })]);
    expect(await prisma.exchangePosition.count({ where: { positionKey: followId, closedAt: null } })).toBe(0);
  });

  it('records a request to copy open trades only when asked', async () => {
    await follows.createFollow(users.fol!.id, followInput({ copyOpenTrades: true }), new Date(Date.now() + 6500));
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: followId } })).copyOpenRequestedAt).not.toBeNull();
    await follows.stopFollow(users.fol!.id, followId, false, deps);
    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 6600));
    expect((await prisma.copyFollow.findUniqueOrThrow({ where: { id: followId } })).copyOpenRequestedAt).toBeNull();
    await follows.stopFollow(users.fol!.id, followId, false, deps);
  });

  it('never lets a re-follow inherit a position left on the old run', async () => {
    // e.g. written by an engine copy that finished after the stop.
    await prisma.exchangePosition.create({ data: { connectionId: conns.f1!, followId, positionKey: followId, source: 'COPY', symbol: 'BNBUSD', side: 'LONG', qty: 1, avgEntry: 600 } });
    const dto = await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 7000));
    expect(dto.openPositions).toBe(0);
    expect(await prisma.exchangePosition.count({ where: { positionKey: followId, closedAt: null } })).toBe(0);
    await follows.stopFollow(users.fol!.id, followId, false, deps);
  });

  it("lists only the current run's orders unless asked for earlier ones", async () => {
    const before = (await follows.followOrders(users.fol!.id, followId, { limit: 100, all: '1' })).items.length;
    expect(before).toBeGreaterThan(0);
    await follows.createFollow(users.fol!.id, followInput(), new Date(Date.now() + 8000));
    expect((await follows.followOrders(users.fol!.id, followId, { limit: 100 })).items).toEqual([]);
    expect((await follows.followOrders(users.fol!.id, followId, { limit: 100, all: '1' })).items.length).toBe(before);
    await follows.stopFollow(users.fol!.id, followId, false, deps);
  });

  it('lists live follows by default and stopped ones on request', async () => {
    expect((await follows.listFollows(users.fol!.id)).map((f) => f.id)).not.toContain(followId);
    expect((await follows.listFollows(users.fol!.id, { includeStopped: true })).map((f) => f.id)).toContain(followId);
  });
});
