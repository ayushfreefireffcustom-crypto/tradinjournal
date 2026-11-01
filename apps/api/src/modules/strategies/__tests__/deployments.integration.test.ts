// Deployments against the local test DB: paper replays with fake candles, and
// the live runner against a fake exchange.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StrategyDeps } from '../strategies.service.js';
import type { LiveDeps } from '../deployments.service.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `dep${Date.now()}`;
const H = 3_600_000;
const START = Date.UTC(2026, 8, 1);

describe.skipIf(!local)('strategy deployments', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../deployments.service.js');
  let strat: typeof import('../strategies.service.js');
  let core: typeof import('@tradinjournal/core');
  let me = '';
  let now = START;
  const price = (ts: number) => 100 + 8 * Math.sin(ts / H / 12);
  const deps: StrategyDeps = {
    candles: async (_s, _tf, f, t, limit) => {
      const out = [];
      for (let ts = Math.ceil(f / H) * H; ts <= t && out.length < limit; ts += H) { const c = price(ts); out.push({ openTime: ts, open: price(ts - H), high: Math.max(c, price(ts - H)) + 0.3, low: Math.min(c, price(ts - H)) - 0.3, close: c, volume: 10 }); }
      return out;
    },
    now: () => now, ai: () => false, generate: async () => ({}),
  };
  const advance = (hours: number) => { now += hours * H; };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB, TRADING_ENABLED: 'true' });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../deployments.service.js');
    strat = await import('../strategies.service.js');
    core = await import('@tradinjournal/core');
    me = (await prisma.user.create({ data: { email: `${tag}@trading.test`, name: 'dep', emailVerified: true } })).id;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  async function paperDeployment() {
    const spec = core.defaultSpec('AAAUSDT');
    spec.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 5 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 15 } } }] };
    spec.risk = { stopLoss: { mode: 'pct', value: 3 }, takeProfit: { mode: 'pct', value: 4 }, trailing: null, timeStopBars: 30, partials: [], breakEvenAtR: null };
    spec.sizing = { mode: 'notional', value: 1000 };
    const s = await strat.createStrategy(me, { name: `paper ${Math.random()}`, spec });
    vi.useFakeTimers({ now: START, toFake: ['Date'] });
    const d = await svc.createDeployment(me, s.id, { mode: 'paper', capital: 10_000 });
    vi.useRealTimers();
    return { s, d };
  }

  it('paper: acts once per closed bar and matches a backtest of the same period', async () => {
    now = START;
    const { s, d } = await paperDeployment();
    expect(d).toMatchObject({ mode: 'paper', status: 'running', capital: 10_000 });
    expect(d.events.map((e) => e.kind)).toEqual(['started']);
    expect((await prisma.strategy.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('paper');
    advance(24 * 10);
    const row = () => prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d.id } });
    expect(await svc.tickPaper(await row(), deps)).toBe(true);
    expect(await svc.tickPaper(await row(), deps)).toBe(false); // same bar: nothing to do
    const got = await svc.getDeployment(me, d.id);
    expect(got.trades.length).toBeGreaterThan(2);
    expect(got.events.some((e) => e.kind === 'no_signal' && Array.isArray((e.data as { conditions?: unknown[] })?.conditions))).toBe(true);
    expect(got.events.some((e) => e.kind === 'filled')).toBe(true);
    // Same as a backtest over the same window.
    const ms = H;
    const bt = core.runBacktest(got.spec as never, { AAAUSDT: (await deps.candles('AAAUSDT', '1h', START - 60 * ms, now, 100_000)).filter((c) => c.openTime + ms <= now) }, { capital: 10_000, slippageBps: 5, from: Date.parse(got.startedAt), to: now, keepOpen: true });
    expect(got.trades.length).toBe(bt.trades.length);
    expect(got.closedPnl).toBeCloseTo(bt.trades.reduce((a, t) => a + t.pnl, 0), 6);
    expect(got.open.length).toBe(bt.open!.length);
  });

  it('paper: pause blocks entries, size changes apply from then on, stop then settle', async () => {
    now = START;
    const { d } = await paperDeployment();
    const row = () => prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d.id } });
    advance(24 * 3);
    await svc.tickPaper(await row(), deps);
    const before = (await svc.getDeployment(me, d.id)).trades.length;
    vi.useFakeTimers({ now, toFake: ['Date'] });
    await svc.controlDeployment(me, d.id, 'pause', {}, deps);
    vi.useRealTimers();
    advance(24 * 5);
    await svc.tickPaper(await row(), deps, true);
    const paused = await svc.getDeployment(me, d.id);
    expect(paused.status).toBe('paused');
    // Only trades that were already open could close while paused.
    const pausedAt = paused.pauses[0]!.from;
    expect(Number.isFinite(pausedAt)).toBe(true);
    expect(paused.trades.filter((t) => Date.parse(t.entryTime) > pausedAt).length).toBe(0);
    expect(paused.events.some((e) => e.kind === 'blocked' && e.message === 'Paused.')).toBe(true);
    vi.useFakeTimers({ now, toFake: ['Date'] });
    await svc.controlDeployment(me, d.id, 'resume', {}, deps);
    await svc.setMultiplier(me, d.id, 0.5);
    vi.useRealTimers();
    advance(24 * 6);
    await svc.tickPaper(await row(), deps, true);
    const resumed = await svc.getDeployment(me, d.id);
    const after = resumed.trades.filter((t) => Date.parse(t.entryTime) >= resumed.sizeSchedule.at(-1)!.from);
    expect(after.length).toBeGreaterThan(0);
    for (const t of after) expect(t.qty * t.entryPrice).toBeCloseTo(500, 0);
    expect(before).toBeGreaterThanOrEqual(0);
    // Stop: no new trades; settle closes what's open.
    vi.useFakeTimers({ now, toFake: ['Date'] });
    await svc.controlDeployment(me, d.id, 'stop', {}, deps);
    expect((await svc.getDeployment(me, d.id)).status).toBe('stopping');
    const settled = await svc.controlDeployment(me, d.id, 'settle', {}, deps);
    vi.useRealTimers();
    expect(settled.status).toBe('stopped');
    expect(settled.open).toEqual([]);
    await expect(svc.controlDeployment(me, d.id, 'pause', {}, deps)).rejects.toThrow(/Only a running/);
    expect((await svc.controlDeployment(me, d.id, 'archive', {}, deps)).status).toBe('archived');
  });

  it('refuses deployments that can’t run', async () => {
    const spec = core.defaultSpec('AAAUSDT');
    spec.risk.stopLoss = null;
    spec.sizing = { mode: 'notional', value: 100 };
    spec.risk.takeProfit = { mode: 'pct', value: 2 };
    const s = await strat.createStrategy(me, { name: 'no stop', spec });
    await expect(svc.createDeployment(me, s.id, { mode: 'live', connectionId: 'x' })).rejects.toThrow(/needs a stop loss/);
    await expect(svc.createDeployment(me, s.id, { mode: 'paper', capital: 5 })).rejects.toThrow(/between 100/);
    const partial = core.defaultSpec('AAAUSDT');
    partial.risk.partials = [{ atR: 1, closePct: 50 }];
    const s2 = await strat.createStrategy(me, { name: 'partials', spec: partial });
    await expect(svc.createDeployment(me, s2.id, { mode: 'live', connectionId: 'x' })).rejects.toThrow(/Partial exits run on paper only/);
  });

  it('live: enters with stop and target, trails, records exchange exits and leaves foreign positions alone', async () => {
    now = START + 50 * H;
    const conn = await prisma.exchangeConnection.create({ data: { userId: me, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'Test', apiKeyEnc: 'x', apiSecretEnc: 'y', keyLast4: 'abcd', keyFingerprint: `${tag}-fp`, canTrade: true } });
    const ex = { position: 0, mark: 100, placed: [] as Array<Record<string, unknown>>, protects: [] as number[], closes: 0, fail: false };
    const live: LiveDeps = {
      quote: async () => { if (ex.fail) throw new Error('exchange timeout'); return { symbol: 'AAAUSD', live: true, markPrice: ex.mark, contractMultiplier: 0.1, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 50, currentLeverage: 5, equityUsd: 10_000, availableUsd: 10_000, position: ex.position, environment: 'TESTNET' }; },
      place: async (_u, t) => { ex.placed.push(t as never); ex.position = (t.side === 'BUY' ? 1 : -1) * (t.size as { value: number }).value; return { outcome: 'filled', message: 'Filled', order: { avgFillPrice: ex.mark, filledQty: (t.size as { value: number }).value } as never, protective: [{ kind: 'SL', ok: true, message: 'ok', order: null }, { kind: 'TP', ok: true, message: 'ok', order: null }] }; },
      close: async () => { ex.closes += 1; ex.position = 0; return { avgFillPrice: ex.mark, message: 'Closed' }; },
      protect: async (_u, _c, _s, sl) => { ex.protects.push(sl); return { ok: true, message: 'Stop updated' }; },
      instruments: async () => [{ connectionId: conn.id, label: 'Test', environment: 'TESTNET' as const, instruments: [{ symbol: 'AAAUSD', base: 'AAA' }] }],
    };
    // Candles follow the fake exchange's mark, so the trailing stop has something to follow.
    const markDeps: StrategyDeps = { ...deps, candles: async (_s, _tf, f, t, limit) => { const out = []; for (let ts = Math.ceil(f / H) * H; ts <= t && out.length < limit; ts += H) out.push({ openTime: ts, open: ex.mark, high: ex.mark + 0.5, low: ex.mark - 0.5, close: ex.mark, volume: 1 }); return out; } };
    // Enters on the first bar (close above 0), trailing 2 %.
    const spec = core.defaultSpec('AAAUSDT');
    spec.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'gt', right: { kind: 'value', value: 0 } }] };
    spec.risk = { stopLoss: { mode: 'pct', value: 2 }, takeProfit: { mode: 'pct', value: 50 }, trailing: { mode: 'pct', value: 2 }, timeStopBars: null, partials: [], breakEvenAtR: null };
    spec.sizing = { mode: 'notional', value: 500 };
    const s = await strat.createStrategy(me, { name: 'live one', spec });
    const d = await svc.createDeployment(me, s.id, { mode: 'live', connectionId: conn.id }, live);
    expect(d).toMatchObject({ mode: 'live', capital: 10_000 });
    const row = () => prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d.id } });
    advance(1);
    vi.useFakeTimers({ now, toFake: ['Date'] });
    expect(await svc.tickLive(await row(), markDeps, live)).toBe(true);
    expect(ex.placed).toHaveLength(1);
    // 500 USDT at 100 = 5 coins = 50 contracts of 0.1; stop 2 % under, rounded to the 0.5 tick.
    expect(ex.placed[0]).toMatchObject({ symbol: 'AAAUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 50 }, stopLoss: 98, takeProfit: 150 });
    const rid = ex.placed[0]!.requestId as string;
    expect(rid).toMatch(/^sd-/);
    expect(await svc.tickLive(await row(), markDeps, live)).toBe(false); // same bar
    // Price climbs: the trailing stop follows.
    ex.mark = 110;
    advance(6);
    await svc.tickLive(await row(), markDeps, live);
    expect(ex.protects.length).toBeGreaterThan(0);
    // The exchange stop fires: position gone, trade recorded.
    ex.position = 0;
    advance(1);
    await svc.tickLive(await row(), markDeps, live);
    const got = await svc.getDeployment(me, d.id);
    expect(got.trades[0]).toMatchObject({ symbol: 'AAAUSDT', side: 'long', reason: 'stop/target on exchange', qty: 5 });
    expect(got.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['filled', 'stop_moved', 'closed']));
    // Re-enters on the next signal with a new request id.
    expect(ex.placed).toHaveLength(2);
    expect(ex.placed[1]!.requestId).not.toBe(rid);
    // Someone opens a position by hand: hands off.
    await svc.controlDeployment(me, d.id, 'settle', {}, markDeps, live);
    expect(ex.position).toBe(0);
    const d2 = await svc.createDeployment(me, s.id, { mode: 'live', connectionId: conn.id }, live);
    ex.position = 7;
    advance(1);
    await svc.tickLive(await prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d2.id } }), markDeps, live);
    expect((await svc.getDeployment(me, d2.id)).events.find((e) => e.kind === 'blocked')!.message).toMatch(/already has a position .* didn’t open/);
    expect(ex.placed).toHaveLength(2);
    // An exchange outage marks it errored instead of retrying blindly.
    ex.fail = true;
    advance(1);
    await svc.tickLive(await prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d2.id } }), markDeps, live);
    const err = await svc.getDeployment(me, d2.id);
    expect(err).toMatchObject({ status: 'errored', error: 'exchange timeout' });
    ex.fail = false;
    expect((await svc.controlDeployment(me, d2.id, 'resume', {}, deps, live)).status).toBe('running');
    vi.useRealTimers();
  });

  it('live: a refused order is reported, not retried as filled', async () => {
    now = START + 80 * H;
    const conn = await prisma.exchangeConnection.findFirstOrThrow({ where: { userId: me } });
    const live: LiveDeps = {
      quote: async () => ({ symbol: 'AAAUSD', live: true, markPrice: 100, contractMultiplier: 0.1, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 50, currentLeverage: 5, equityUsd: 10_000, availableUsd: 10_000, position: 0, environment: 'TESTNET' }),
      place: async () => ({ outcome: 'rejected', message: 'Insufficient margin', order: null, protective: [] }),
      close: async () => ({ avgFillPrice: 100, message: 'ok' }),
      protect: async () => ({ ok: true, message: 'ok' }),
      instruments: async () => [{ connectionId: conn.id, label: 'Test', environment: 'TESTNET' as const, instruments: [{ symbol: 'AAAUSD', base: 'AAA' }] }],
    };
    const spec = core.defaultSpec('AAAUSDT');
    spec.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'gt', right: { kind: 'value', value: 0 } }] };
    spec.risk.stopLoss = { mode: 'pct', value: 2 };
    spec.sizing = { mode: 'notional', value: 500 };
    const s = await strat.createStrategy(me, { name: 'refused', spec });
    vi.useFakeTimers({ now, toFake: ['Date'] });
    const d = await svc.createDeployment(me, s.id, { mode: 'live', connectionId: conn.id }, live);
    vi.useRealTimers();
    advance(1);
    await svc.tickLive(await prisma.strategyDeployment.findUniqueOrThrow({ where: { id: d.id } }), deps, live);
    const got = await svc.getDeployment(me, d.id);
    expect(got.events.find((e) => e.kind === 'error')).toMatchObject({ message: 'Order refused: Insufficient margin' });
    expect(got.open).toEqual([]);
  });
});
