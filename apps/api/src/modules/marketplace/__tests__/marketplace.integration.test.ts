// Marketplace (H1–H3) against the local test DB with fake candles.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StrategySpec } from '@tradinjournal/core';
import type { StrategyDeps } from '../../strategies/strategies.service.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `mkt${Date.now()}`;
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 1);

describe.skipIf(!local)('marketplace', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../marketplace.service.js');
  let strat: typeof import('../../strategies/strategies.service.js');
  let deploys: typeof import('../../strategies/deployments.service.js');
  let core: typeof import('@tradinjournal/core');
  const u: Record<string, string> = {};
  const deps: StrategyDeps = {
    candles: async (_s, _tf, f, t, limit) => {
      const out = [];
      for (let ts = Math.ceil(f / H) * H; ts <= t && out.length < limit; ts += H) { const i = ts / H; const c = 100 + 10 * Math.sin(i / 15) + (i % 7) * 0.1; out.push({ openTime: ts, open: c, high: c + 0.6, low: c - 0.6, close: c, volume: 10 }); }
      return out;
    },
    now: () => NOW, ai: () => false, generate: async () => ({}),
  };
  let spec: StrategySpec;
  let strategyId = '';
  let templateId = '';
  let subId = '';

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../marketplace.service.js');
    strat = await import('../../strategies/strategies.service.js');
    deploys = await import('../../strategies/deployments.service.js');
    core = await import('@tradinjournal/core');
    for (const n of ['creator', 'sub', 'other']) u[n] = (await prisma.user.create({ data: { email: `${tag}-${n}@trading.test`, name: n } })).id;
    spec = core.defaultSpec('BTCUSDT');
    spec.entry.long = { match: 'all', conditions: [
      { left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 9 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 21 } } },
      { left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 14 } }, operator: 'gt', right: { kind: 'value', value: 50 } },
    ] };
    spec.risk.stopLoss = { mode: 'pct', value: 2 };
    spec.risk.takeProfit = { mode: 'rr', value: 2 };
    strategyId = (await strat.createStrategy(u.creator!, { name: 'EMA cross', spec })).id;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('offers tunable settings and checks the creator’s ranges', () => {
    const c = svc.paramCandidates(spec);
    expect(c.map((x) => x.id)).toEqual(expect.arrayContaining(['risk.stopLoss.value', 'risk.takeProfit.value', 'sizing.value', 'market.leverage', 'entry.long.conditions.0.left.params.length', 'entry.long.conditions.0.right.params.length', 'entry.long.conditions.1.right.value', 'entry.long.conditions.1.left.params.length']));
    expect(c.find((x) => x.id === 'entry.long.conditions.1.right.value')).toMatchObject({ label: 'Entry: RSI(14) level', value: 50, min: 0, max: 100, step: 1 });
    expect(() => svc.checkParams(spec, [{ id: 'risk.stopLoss.value', min: 3, max: 5, step: 0.1 }])).toThrow(/must include today’s value \(2\)/);
    expect(() => svc.checkParams(spec, [{ id: 'nope.path', min: 0, max: 1, step: 1 }])).toThrow(/isn’t a setting/);
    expect(() => svc.checkParams(spec, [{ id: 'market.leverage', min: 1, max: 500, step: 1 }])).toThrow(/can’t go above 100×/);
    const p = svc.checkParams(spec, [{ id: 'risk.stopLoss.value', label: 'Stop', min: 1, max: 4, step: 0.5 }, { id: 'entry.long.conditions.1.right.value', min: 40, max: 70, step: 1 }]);
    expect(p.map((x) => x.key)).toEqual(['p1', 'p2']);
    const tuned = svc.applyParams(spec, p, { p1: 2.74, p2: 55 });
    expect(tuned.risk.stopLoss).toEqual({ mode: 'pct', value: 2.5 }); // on the step
    expect((tuned.entry.long!.conditions[1]!.right as { value: number }).value).toBe(55);
    expect(spec.risk.stopLoss!.value).toBe(2); // the original is untouched
    expect(() => svc.applyParams(spec, p, { p1: 9 })).toThrow(/between 1 and 4/);
    expect(() => svc.applyParams(spec, p, { 'risk.stopLoss.value': 1 })).toThrow(/isn’t a setting/); // paths aren't accepted, only keys
  });

  it('runs the creator programme: apply, review, publish with a verified backtest', async () => {
    await expect(svc.createTemplate(u.creator!, { strategyId, name: 'EMA', summary: 'A trend follower', description: 'x'.repeat(40), category: 'trend', risk: 'medium', params: [], exchanges: [] }, deps)).rejects.toThrow(/Apply to the creator programme/);
    const c = await svc.applyCreator(u.creator!, { displayName: 'Trend Tina', bio: 'I trade trends on BTC with tight risk.' });
    expect(c.status).toBe('pending');
    await expect(svc.createTemplate(u.creator!, { strategyId, name: 'EMA', summary: 'A trend follower', description: 'x'.repeat(40), category: 'trend', risk: 'medium', params: [], exchanges: [] }, deps)).rejects.toThrow(/still in review/);
    await svc.reviewCreator(c.id, 'approve');
    // A track record must be the creator's own run of this strategy.
    const otherStrat = await strat.createStrategy(u.creator!, { name: 'Other', spec });
    const otherRun = await deploys.createDeployment(u.creator!, otherStrat.id, { mode: 'paper', capital: 1000 });
    await expect(svc.createTemplate(u.creator!, { strategyId, name: 'EMA', summary: 'A trend follower', description: 'x'.repeat(40), category: 'trend', risk: 'medium', params: [], exchanges: [], trackDeploymentId: otherRun.id }, deps)).rejects.toThrow(/own runs of this strategy/);
    await expect(svc.createTemplate(u.creator!, { strategyId, name: 'EMA', summary: 'A trend follower', description: 'x'.repeat(40), category: 'trend', risk: 'medium', params: [], exchanges: ['bybit'] }, deps)).rejects.toThrow(/built for Delta Exchange India/);
    const run = await deploys.createDeployment(u.creator!, strategyId, { mode: 'paper', capital: 1000 });
    await prisma.deploymentTrade.create({ data: { deploymentId: run.id, symbol: 'BTCUSDT', side: 'long', qty: 1, entryPrice: 100, entryTime: new Date(NOW - 5 * H), exitPrice: 105, exitTime: new Date(NOW - 2 * H), pnl: 50, pnlPct: 5, fees: 0, rMultiple: 1, reason: 'target' } });
    const t = await svc.createTemplate(u.creator!, {
      strategyId, name: 'EMA trend', summary: 'Rides BTC trends after a confirmed cross', description: 'Buys when the fast EMA crosses the slow one with momentum behind it; sits out chop.',
      category: 'trend', risk: 'medium', exchanges: ['delta_india'], trackDeploymentId: run.id,
      params: [{ id: 'risk.stopLoss.value', label: 'Stop (%)', min: 1, max: 4, step: 0.5 }, { id: 'entry.long.conditions.1.right.value', min: 40, max: 70, step: 1 }],
    }, deps);
    templateId = t.id;
    expect(t.status).toBe('pending');
    expect(t.performance!.backtest!.days).toBe(180);
    expect(typeof t.performance!.backtest!.metrics.totalReturnPct).toBe('number');
    expect(t.performance!.backtest!.equity.length).toBeGreaterThan(10);
    expect(await svc.browse({})).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: t.id })]));
    await svc.reviewTemplate(t.id, 'publish');
    const list = await svc.browse({ category: 'trend', sort: 'return' });
    const card = list.find((x) => x.id === t.id)!;
    expect(card).toMatchObject({ creator: 'Trend Tina', subscribers: 0, symbols: ['BTCUSDT'], interval: '1h', facts: { hasStop: true, hasTarget: true, direction: 'long' } });
    expect(card.track).toMatchObject({ mode: 'paper', trades: 1, pnl: 50, returnPct: 5, winRatePct: 100 });
    expect((await svc.browse({ category: 'range' })).some((x) => x.id === t.id)).toBe(false);
    expect((await svc.browse({ q: 'confirmed cross' })).some((x) => x.id === t.id)).toBe(true);
  });

  it('shows a template without its rules', async () => {
    const d = await svc.templateDetail(u.sub!, templateId);
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/"spec"|crosses_above|"ema"|"rsi"|conditions|\.value|params\.length/);
    expect(d.params.map((x) => x.label)).toEqual(['Stop (%)', 'Entry: RSI(14) level']);
    expect(d.isCreator).toBe(false);
    expect((await svc.templateDetail(u.creator!, templateId)).isCreator).toBe(true);
  });

  it('subscribes with tuned settings into a private copy that runs as a deployment', async () => {
    await expect(svc.subscribe(u.creator!, templateId, { mode: 'paper' })).rejects.toThrow(/your own strategy/);
    await expect(svc.subscribe(u.sub!, templateId, { mode: 'paper', params: { p1: 7 } })).rejects.toThrow(/between 1 and 4/);
    const r = await svc.subscribe(u.sub!, templateId, { mode: 'paper', capital: 2000, params: { p1: 3 } });
    subId = r.id;
    await expect(svc.subscribe(u.sub!, templateId, { mode: 'paper' })).rejects.toThrow(/already running this one/);
    const sub = await prisma.templateSubscription.findUniqueOrThrow({ where: { id: r.id } });
    const copy = await prisma.strategy.findUniqueOrThrow({ where: { id: sub.strategyId } });
    expect(copy).toMatchObject({ userId: u.sub, source: 'template', templateId });
    expect((copy.spec as unknown as StrategySpec).risk.stopLoss).toEqual({ mode: 'pct', value: 3 });
    // The rules stay private everywhere the subscriber could look.
    await expect(strat.getStrategy(u.sub!, copy.id)).rejects.toThrow(/rules are private/);
    expect((await strat.listStrategies(u.sub!)).some((x) => x.id === copy.id)).toBe(false);
    await expect(deploys.createDeployment(u.sub!, copy.id, { mode: 'paper' })).rejects.toThrow(/from Subscriptions/);
    await prisma.deploymentEvent.create({ data: { deploymentId: r.deploymentId, at: new Date(), kind: 'no_signal', message: 'No entry: 1 of 2 conditions met.', data: { conditions: [{ text: 'RSI(14) is above 50', met: false }] } } });
    const dep = await deploys.getDeployment(u.sub!, r.deploymentId);
    expect(dep.private).toBe(true);
    expect(dep.spec).toBeNull();
    // The feed keeps what happened ("1 of 2 conditions met") but not the rule or its values.
    expect(dep.events.every((e) => e.data === null)).toBe(true);
    expect(JSON.stringify(dep.events)).not.toMatch(/RSI|is above 50/);
    expect((await svc.templateDetail(u.sub!, templateId)).subscription).toMatchObject({ id: r.id, status: 'active' });
    expect((await svc.browse({})).find((x) => x.id === templateId)!.subscribers).toBe(1);
    // Paper only for this one? No: Delta is allowed, but a Bybit account isn't.
    const conn = await prisma.exchangeConnection.create({ data: { userId: u.other!, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'x', apiKeyEnc: 'a', apiSecretEnc: 'b', keyLast4: '0000', keyFingerprint: `${tag}-fp` } });
    await prisma.templateSubscription.deleteMany({ where: { userId: u.other! } });
    await expect(svc.subscribe(u.other!, templateId, { mode: 'live' })).rejects.toThrow(/Pick the exchange account/);
    await expect(svc.subscribe(u.other!, templateId, { mode: 'live', connectionId: 'nope' })).rejects.toThrow(/not found/);
    void conn;
  });

  it('pauses, resizes, resumes and cancels a subscription', async () => {
    let s = await svc.manageSubscription(u.sub!, subId, 'pause');
    expect(s.status).toBe('paused');
    expect(s.deployment!.status).toBe('paused');
    s = await svc.resizeSubscription(u.sub!, subId, 0.5);
    expect(s.deployment!.multiplier).toBe(0.5);
    s = await svc.manageSubscription(u.sub!, subId, 'resume');
    expect(s.status).toBe('active');
    expect(s.params).toEqual([{ key: 'p1', label: 'Stop (%)', value: 3 }]);
    s = await svc.manageSubscription(u.sub!, subId, 'cancel');
    expect(s.status).toBe('cancelled');
    expect(s.deployment!.status).toBe('stopping');
    await expect(svc.manageSubscription(u.sub!, subId, 'pause')).rejects.toThrow(/cancelled/);
    // Cancelled frees the slot: subscribing again works.
    const again = await svc.subscribe(u.sub!, templateId, { mode: 'paper' });
    expect(again.id).not.toBe(subId);
    await svc.manageSubscription(u.sub!, again.id, 'cancel_settle');
    expect((await deploys.getDeployment(u.sub!, again.deploymentId)).status).toBe('stopped');
  });

  it('unlists, suspends and survives the creator leaving', async () => {
    await expect(svc.setListed(u.creator!, templateId, true)).rejects.toThrow(/Only an unlisted/);
    await svc.setListed(u.creator!, templateId, false);
    expect((await svc.browse({})).some((x) => x.id === templateId)).toBe(false);
    await expect(svc.templateDetail(u.sub!, templateId)).rejects.toThrow(/not found/);
    await svc.setListed(u.creator!, templateId, true);
    const c = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: u.creator! } });
    await svc.reviewCreator(c.id, 'suspend', 'test');
    expect((await prisma.strategyTemplate.findUniqueOrThrow({ where: { id: templateId } })).status).toBe('unlisted');
    await expect(svc.applyCreator(u.creator!, { displayName: 'x', bio: 'y'.repeat(30) })).rejects.toThrow(/suspended/);
    // The creator's account goes: subscribers keep their runs and history.
    await prisma.user.delete({ where: { id: u.creator! } });
    const subs = await svc.mySubscriptions(u.sub!);
    expect(subs.length).toBe(2);
    expect(subs.every((x) => x.template === null && x.deployment != null)).toBe(true);
  });
});
