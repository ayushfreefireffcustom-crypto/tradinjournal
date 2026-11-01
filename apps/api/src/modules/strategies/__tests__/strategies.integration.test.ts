// Strategies against the local test DB with fake candles and a fake AI.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StrategyDeps } from '../strategies.service.js';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `strat${Date.now()}`;
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 1);

describe.skipIf(!local)('strategies', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../strategies.service.js');
  let core: typeof import('@tradinjournal/core');
  let me = '';
  const loads: Array<[string, number, number]> = [];
  // A saw-tooth market so EMA crosses happen regularly.
  const deps = (over: Partial<StrategyDeps> = {}): StrategyDeps => ({
    candles: async (s, _tf, f, t, limit) => {
      loads.push([s, f, t]);
      const out = [];
      for (let ts = Math.ceil(f / H) * H; ts <= t && out.length < limit; ts += H) {
        const i = ts / H;
        const c = 100 + 10 * Math.sin(i / 15) + (i % 7) * 0.1;
        out.push({ openTime: ts, open: c, high: c + 0.6, low: c - 0.6, close: c, volume: 10 });
      }
      return out;
    },
    now: () => NOW, ai: () => false, generate: async () => ({}), ...over,
  });
  const params = { from: new Date(NOW - 60 * 24 * H).toISOString(), to: new Date(NOW).toISOString(), capital: 10_000, slippageBps: 5 };

  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../strategies.service.js');
    core = await import('@tradinjournal/core');
    me = (await prisma.user.create({ data: { email: `${tag}@trading.test`, name: 'strat', emailVerified: true } })).id;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('compares specs whatever their key order', () => {
    expect(svc.canonical({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(svc.canonical({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });

  it('the core spec and the wire schema agree', async () => {
    const { strategySpecSchema } = await import('@tradinjournal/contracts');
    expect(strategySpecSchema.safeParse(core.defaultSpec()).success).toBe(true);
    const legacy = core.fromLegacy({ kind: 'macd_cross', direction: 'BOTH', symbol: 'ETHUSDT', timeframe: '4h' });
    expect(strategySpecSchema.safeParse(legacy).success).toBe(true);
    expect(() => svc.parseSpec({ ...core.defaultSpec(), session: { ...core.defaultSpec().session, interval: '2h' } })).toThrow(/session.interval/);
  });

  it('imports Trader Master strategies once, untouched', async () => {
    const legacy = await prisma.traderStrategy.create({ data: { userId: me, name: 'Old EMA', prompt: 'buy ema cross', rules: { kind: 'ema_cross', direction: 'LONG', symbol: 'BTCUSDT', timeframe: '1h', fast: 9, slow: 21, stopAtr: 1.5, targetR: 2 } } });
    const a = await svc.listStrategies(me);
    const b = await svc.listStrategies(me);
    const imported = a.filter((x) => x.source === 'legacy');
    expect(imported).toHaveLength(1);
    expect(b.filter((x) => x.source === 'legacy')).toHaveLength(1);
    expect(imported[0]).toMatchObject({ name: 'Old EMA', symbols: ['BTCUSDT'], interval: '1h', direction: 'long', blockers: 0 });
    expect((await prisma.traderStrategy.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe('draft');
  });

  it('versions rule edits, not renames, and restores', async () => {
    const s = await svc.createStrategy(me, { name: 'Cross' });
    expect(s).toMatchObject({ version: 1, versions: [{ version: 1 }] });
    expect(s.readback[0]).toMatch(/^Trades BTCUSDT perpetuals/);
    const renamed = await svc.updateStrategy(me, s.id, { name: 'Cross v2' });
    expect(renamed.version).toBe(1);
    const spec = { ...s.spec, market: { ...s.spec.market, leverage: 5 } };
    const edited = await svc.updateStrategy(me, s.id, { spec, note: 'More leverage' });
    expect(edited.version).toBe(2);
    expect(edited.versions[0]).toMatchObject({ version: 2, note: 'More leverage' });
    expect((await svc.updateStrategy(me, s.id, { spec })).version).toBe(2); // same rules: no new version
    const restored = await svc.restoreVersion(me, s.id, 1);
    expect(restored).toMatchObject({ version: 3, spec: { market: { leverage: 3 } } });
    expect(restored.versions[0]!.note).toBe('Restored version 1');
    const dup = await svc.duplicateStrategy(me, s.id);
    expect(dup).toMatchObject({ name: 'Cross v2 (copy)', version: 1 });
    await expect(svc.getStrategy('someone-else', s.id)).rejects.toThrow(/not found/i);
  });

  it('runs and stores backtests, reusing identical runs', async () => {
    const s = await svc.createStrategy(me, { name: 'BT' });
    loads.length = 0;
    const r1 = await svc.backtestStrategy(me, s.id, params, deps());
    expect(r1.result.metrics.trades).toBeGreaterThan(3);
    expect(r1.result.range.bars).toBeGreaterThan(1000);
    // Pages of 1000 bars, starting before `from` for indicator warm-up.
    expect(loads.length).toBeGreaterThan(1);
    expect(loads[0]![1]).toBeLessThan(Date.parse(params.from));
    const r2 = await svc.backtestStrategy(me, s.id, params, deps());
    expect(r2.id).toBe(r1.id);
    expect(r2.cached).toBe(true);
    const got = await svc.getStrategy(me, s.id);
    expect(got.backtests).toHaveLength(1);
    const pinned = await svc.updateStrategy(me, s.id, { baselineBacktestId: r1.id });
    expect(pinned.baselineBacktestId).toBe(r1.id);
    await expect(svc.updateStrategy(me, s.id, { baselineBacktestId: 'nope' })).rejects.toThrow(/not found/i);
    const full = await svc.getBacktest(me, s.id, r1.id);
    expect((full.result as { trades: unknown[] }).trades.length).toBe(r1.result.metrics.trades);
  });

  it('draws the strategy on recent closed bars for the Chart layout', async () => {
    const spec = core.defaultSpec('BTCUSDT');
    spec.market.direction = 'both';
    spec.entry.short = 'mirror';
    spec.entry.long = { match: 'all', conditions: [
      { left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 5 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 20 } } },
      { left: { kind: 'indicator', id: 'rsi', output: 'value', params: { length: 14 } }, operator: 'gt', right: { kind: 'value', value: 40 } },
    ] };
    const p = await svc.chartSpec(spec, { bars: 120 }, deps());
    expect(p.symbol).toBe('BTCUSDT');
    expect(p.candles).toHaveLength(120);
    // The last bar shown is the last one that has closed.
    expect(p.candles.at(-1)!.t).toBe(NOW - H);
    expect(p.series.map((x) => x.pane)).toEqual(['price', 'price', 'p1']);
    expect(p.series.every((x) => x.values.length === 120 && x.values.every((v) => v != null))).toBe(true); // warmed up before the window
    expect(p.thresholds).toMatchObject([{ group: 'long', index: 1, pane: 'p1', value: 40 }, { group: 'short', index: 1, value: 60, mirrored: true }]);
    expect(p.signals.long.length).toBeGreaterThan(0);
    expect(p.trades.length).toBeGreaterThan(0);
    expect(p.risk?.stop).not.toBeNull();
    // An unknown symbol falls back to the strategy's first market; no data is refused.
    expect((await svc.chartSpec(spec, { symbol: 'ETHUSDT', bars: 50 }, deps())).symbol).toBe('BTCUSDT');
    await expect(svc.chartSpec(spec, {}, deps({ candles: async () => [] }))).rejects.toThrow(/No market data/);
  });
  it('refuses ranges and specs that can’t run', async () => {
    const bad = core.defaultSpec();
    bad.risk.stopLoss = null;
    await expect(svc.backtestSpec(bad, params, deps())).rejects.toThrow(/Fix this first: .*needs a stop/);
    await expect(svc.backtestSpec(core.defaultSpec(), { ...params, from: params.to }, deps())).rejects.toThrow(/start must be before/);
    const long = { ...params, from: new Date(NOW - 3 * 365 * 24 * H).toISOString() };
    await expect(svc.backtestSpec(core.defaultSpec(), long, deps())).rejects.toThrow(/at most 20,000/);
    await expect(svc.backtestSpec(core.defaultSpec(), params, deps({ candles: async () => [] }))).rejects.toThrow(/No market data/);
  });

  it('generates from a description with AI, retrying once on a bad spec', async () => {
    await expect(svc.generateStrategy(me, { prompt: 'buy dips in an uptrend', symbol: 'ETHUSDT', interval: '4h' }, deps())).rejects.toThrow(/needs AI switched on/);
    const good = core.defaultSpec();
    good.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'rsi', output: 'value' }, operator: 'crosses_above', right: { kind: 'value', value: 30 } }] };
    const replies = [{ name: 'Dip buyer', description: 'x', spec: { ...good, risk: { ...good.risk, stopLoss: null } } }, { name: 'Dip buyer', description: 'RSI dips', spec: good }];
    const asked: string[] = [];
    const s = await svc.generateStrategy(me, { prompt: 'buy dips in an uptrend', symbol: 'ETHUSDT', interval: '4h' }, deps({ ai: () => true, generate: async (m) => { asked.push(m.at(-1)!.content); return replies.shift(); } }));
    expect(s).toMatchObject({ name: 'Dip buyer', source: 'ai', spec: { market: { symbols: [{ symbol: 'ETHUSDT' }] }, session: { interval: '4h' } } });
    expect(asked[1]).toMatch(/rejected: .*needs a stop/);
    await expect(svc.generateStrategy(me, { prompt: 'something vague here', symbol: 'ETHUSDT', interval: '1h' }, deps({ ai: () => true, generate: async () => ({ spec: { nope: 1 } }) }))).rejects.toThrow(/couldn’t turn that into a valid strategy/);
  });
});
