import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { defaultSpec, describeStrategy, fromLegacy, mirrorGroup, runBacktest, SignalEngine, validateStrategy, type StrategySpec } from '../index.js';

const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 5); // a Monday
/** Bars from [open, high, low, close] tuples, or a close with a 0.2 range. */
function bars(rows: Array<number | [number, number, number, number]>, start = T0): Candle[] {
  return rows.map((r, i) => {
    const [o, h, l, c] = Array.isArray(r) ? r : [r, r + 0.2, r - 0.2, r];
    return { openTime: start + i * H, open: o, high: h, low: l, close: c, volume: 100 };
  });
}
const flat = (n: number, p = 100) => Array.from({ length: n }, () => p);
const closeAbove = (v: number) => ({ match: 'all' as const, conditions: [{ left: { kind: 'indicator' as const, id: 'price', output: 'close' }, operator: 'crosses_above' as const, right: { kind: 'value' as const, value: v } }] });
/** A spec that enters long when the close crosses above 100.5, fixed 1000 USDT, 1×, no fees unless asked. */
function spec(over: (s: StrategySpec) => void = () => {}): StrategySpec {
  const s = defaultSpec('AAAUSDT');
  s.market.leverage = 1;
  s.entry.long = closeAbove(100.5);
  s.risk = { takeProfit: { mode: 'pct', value: 4 }, stopLoss: { mode: 'pct', value: 2 }, trailing: null, timeStopBars: null, partials: [], breakEvenAtR: null };
  s.sizing = { mode: 'notional', value: 1000 };
  over(s);
  return s;
}
const run = (s: StrategySpec, c: Candle[], extra: Partial<Parameters<typeof runBacktest>[2]> = {}) => runBacktest(s, { AAAUSDT: c }, { capital: 10_000, slippageBps: 0, fees: { takerBps: 0, makerBps: 0 }, ...extra });

describe('signals', () => {
  it('detects crosses, bars-ago and a shifted right side', () => {
    const c = bars([...flat(20), 101, 102, 103]);
    const e = new SignalEngine(c, '1h');
    const cond = closeAbove(100.5).conditions[0]!;
    expect(e.condition(cond, 19)).toBe(false);
    expect(e.condition(cond, 20)).toBe(true);
    expect(e.condition({ ...cond, barsAgo: 1 }, 21)).toBe(true);
    // Breakout: close above the highest high of the 5 bars before.
    const brk = { left: { kind: 'indicator' as const, id: 'price', output: 'close' }, operator: 'gt' as const, right: { kind: 'indicator' as const, id: 'hh', output: 'value', params: { length: 5 } }, rightBarsAgo: 1 };
    expect(e.condition(brk, 20)).toBe(true);
    expect(e.condition({ ...brk, rightBarsAgo: 0 }, 20)).toBe(false); // includes its own high
  });
  it('reads a higher timeframe only once its bar has closed', () => {
    // 4h close jumps in the 2nd 4h bar (hours 4-7).
    const c = bars([100, 100, 100, 100, 110, 110, 110, 110, 110, 110, 110, 110]);
    const e = new SignalEngine(c, '1h');
    const htf = { left: { kind: 'indicator' as const, id: 'price', output: 'close' }, operator: 'gt' as const, right: { kind: 'value' as const, value: 105 }, timeframe: '4h' as const };
    expect(e.condition(htf, 4)).toBe(false); // hour 4 closed, but the 4h bar it belongs to hasn't
    expect(e.condition(htf, 6)).toBe(false);
    expect(e.condition(htf, 7)).toBe(true); // 4h bar closed at hour 8
  });
  it('mirrors long rules for shorts', () => {
    const g = mirrorGroup({ match: 'all', conditions: [{ left: { kind: 'indicator', id: 'rsi', output: 'value' }, operator: 'crosses_below', right: { kind: 'value', value: 30 } }, { left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'gt', right: { kind: 'indicator', id: 'ema', output: 'value' } }] });
    expect(g.conditions[0]).toMatchObject({ operator: 'crosses_above', right: { value: 70 } });
    expect(g.conditions[1]!.operator).toBe('lt');
  });
});

describe('backtest: fills, exits, costs', () => {
  it('enters at the next open and exits at the target, with slippage and fees counted', () => {
    // Signal on bar 20 (close 101); fill at bar 21's open 101; target 4% = 105.04 reached on bar 24.
    const c = bars([...flat(20), 101, [101, 102, 100.8, 101.5], 103, 104, [104, 106, 103.9, 105.5], 105]);
    const r = run(spec(), c, { slippageBps: 10, fees: { takerBps: 5, makerBps: 2 } });
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0]!;
    const fill = 101 * 1.001;
    expect(t.entryPrice).toBeCloseTo(fill, 9);
    expect(t.entryTime).toBe(T0 + 21 * H);
    expect(t.reason).toBe('target');
    expect(t.exitPrice).toBeCloseTo(fill * 1.04, 9);
    const qty = 1000 / fill;
    const fees = 1000 * 5e-4 + qty * fill * 1.04 * 2e-4;
    expect(t.fees).toBeCloseTo(fees, 9);
    expect(t.pnl).toBeCloseTo(qty * fill * 0.04 - fees, 9);
    expect(r.metrics.endEquity).toBeCloseTo(10_000 + t.pnl, 6);
    expect(t.slippage).toBeCloseTo(qty * 0.101, 6);
  });
  it('takes the stop when stop and target are both inside one bar', () => {
    const c = bars([...flat(20), 101, [101, 106, 98, 101]]);
    const t = run(spec(), c).trades[0]!;
    expect(t.reason).toBe('stop');
    expect(t.exitPrice).toBeCloseTo(101 * 0.98);
  });
  it('fills a gap through the stop at the open', () => {
    const c = bars([...flat(20), 101, 101, [95, 96, 94, 95]]);
    const t = run(spec(), c).trades[0]!;
    expect(t.exitPrice).toBe(95);
    expect(t.reason).toBe('stop');
  });
  it('trails the stop and locks in profit', () => {
    const c = bars([...flat(20), 101, 102, 104, 106, 108, [108, 108.2, 104, 104.5]]);
    const r = run(spec((s) => { s.risk.takeProfit = null; s.risk.trailing = { mode: 'pct', value: 2 }; }), c);
    const t = r.trades[0]!;
    expect(t.reason).toBe('trailing');
    expect(t.exitPrice).toBeCloseTo(108.2 * 0.98, 6); // 2% under the highest high so far
    expect(t.pnl).toBeGreaterThan(0);
  });
  it('moves the stop to break-even and takes partials in R', () => {
    // Entry 101, stop 2% = 98.98 (1R = 2.02). Partial 50% at 1R = 103.02, break-even at 1R.
    const c = bars([...flat(20), 101, [101, 103.5, 100.9, 103], [103, 103.2, 100, 100.5]]);
    const r = run(spec((s) => { s.risk.takeProfit = null; s.risk.partials = [{ atR: 1, closePct: 50 }]; s.risk.breakEvenAtR = 1; }), c);
    const t = r.trades[0]!;
    expect(t.partialFills).toBe(1);
    expect(t.reason).toBe('breakeven');
    expect(t.exitPrice).toBeCloseTo(101);
    const qty = 1000 / 101;
    expect(t.pnl).toBeCloseTo((qty / 2) * 2.02, 6); // half closed at +1R, half at entry
    expect(t.rMultiple!).toBeCloseTo(0.5, 6);
  });
  it('closes on a time stop and on an exit signal, at the next open', () => {
    const tStop = run(spec((s) => { s.risk.takeProfit = null; s.risk.timeStopBars = 2; }), bars([...flat(20), 101, 101.2, 101.3, 101.4, 101.6]));
    expect(tStop.trades[0]).toMatchObject({ reason: 'time', exitTime: T0 + 24 * H });
    const sig = run(spec((s) => { s.risk.takeProfit = null; s.exit.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'price', output: 'close' }, operator: 'lt', right: { kind: 'value', value: 100.8 } }] }; }), bars([...flat(20), 101, 102, 100.7, 100.6]));
    expect(sig.trades[0]).toMatchObject({ reason: 'signal', exitTime: T0 + 23 * H, exitPrice: 100.6 });
  });
  it('limit entries fill below the signal close, or expire', () => {
    const filled = run(spec((s) => { s.advanced.entryType = 'limit'; s.advanced.limitOffsetPct = 1; s.advanced.limitExpiryBars = 3; }), bars([...flat(20), 101, [101, 101.5, 99.9, 100.5], 101, 102]));
    expect(filled.trades[0]!.entryPrice).toBeCloseTo(101 * 0.99);
    const expired = run(spec((s) => { s.advanced.entryType = 'limit'; s.advanced.limitOffsetPct = 1; s.advanced.limitExpiryBars = 2; }), bars([...flat(20), 101, 101.5, 102, 103, [103, 103, 99, 100]]));
    expect(expired.trades).toHaveLength(0);
  });
});

describe('backtest: sizing, leverage, limits, sessions', () => {
  it('risk sizing loses about the risk at the stop', () => {
    const c = bars([...flat(20), 101, [101, 101, 98, 98.5]]);
    const r = run(spec((s) => { s.sizing = { mode: 'risk_pct', value: 1 }; s.market.leverage = 10; }), c);
    expect(r.trades[0]!.pnl).toBeCloseTo(-100, 6); // 1% of 10,000
  });
  it('caps size at the margin available', () => {
    const c = bars([...flat(20), 101, 102]);
    const r = run(spec((s) => { s.sizing = { mode: 'notional', value: 50_000 }; s.market.leverage = 2; }), c);
    expect(r.trades[0]!.notional).toBeCloseTo(20_000, 6);
  });
  it('liquidates before a stop that sits beyond the liquidation price', () => {
    const c = bars([...flat(20), 101, [101, 101, 85, 86]]);
    const r = run(spec((s) => { s.risk.stopLoss = { mode: 'pct', value: 20 }; s.market.leverage = 10; s.sizing = { mode: 'equity_pct', value: 10 }; }), c);
    expect(r.trades[0]!.reason).toBe('liquidation');
    expect(r.notes.join(' ')).toMatch(/liquidated/);
  });
  it('only enters inside the session windows', () => {
    // Signal bars at 20:00 and 21:00 UTC (index 20+); window 09:00–17:00 → no trade.
    const c = bars([...flat(20), 101, 102, 103]);
    const r = run(spec((s) => { s.session.mode = 'windows'; s.session.windows = [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }]; }), c);
    expect(r.trades).toHaveLength(0);
    const open = run(spec((s) => { s.session.mode = 'windows'; s.session.windows = [{ days: [1], start: '20:00', end: '23:00' }]; }), c);
    expect(open.trades).toHaveLength(1);
  });
  it('kill switch after a losing streak; daily loss pause', () => {
    // Repeated pump-and-dump: every trade stops out.
    const cycle = [101, [101, 101, 97, 97.5] as [number, number, number, number], 100, 100];
    const rows: Array<number | [number, number, number, number]> = [...flat(20)];
    for (let k = 0; k < 6; k++) rows.push(...cycle);
    const killed = run(spec((s) => { s.limits.maxConsecutiveLosses = 3; }), bars(rows));
    expect(killed.trades).toHaveLength(3);
    expect(killed.notes.join(' ')).toMatch(/Kill switch: 3 losses/);
    const paused = run(spec((s) => { s.limits.dailyLossPct = 0.3; }), bars(rows));
    expect(paused.trades.length).toBeLessThan(6);
    expect(paused.notes.join(' ')).toMatch(/Daily loss limit/);
  });
  it('trades several markets from one account, deterministically', () => {
    const s = spec((x) => { x.market.symbols = [{ symbol: 'AAAUSDT' }, { symbol: 'BBBUSDT' }]; });
    const data = { AAAUSDT: bars([...flat(20), 101, 102, 106.5]), BBBUSDT: bars([...flat(20), 101, [101, 101, 98, 98.5]]) };
    const a = runBacktest(s, data, { capital: 10_000, slippageBps: 5 });
    const b = runBacktest(s, data, { capital: 10_000, slippageBps: 5 });
    expect(a).toEqual(b);
    expect(a.perSymbol.map((p) => [p.symbol, p.trades])).toEqual([['AAAUSDT', 1], ['BBBUSDT', 1]]);
    expect(a.metrics.winRatePct).toBe(50);
    expect(a.metrics.profitFactor!).toBeGreaterThan(1);
  });
  it('reports drawdown, exposure and costs', () => {
    const r = run(spec(), bars([...flat(20), 101, [101, 101, 98, 98.5], 98.5]), { slippageBps: 10, fees: { takerBps: 5, makerBps: 2 } });
    expect(r.metrics.maxDrawdownPct).toBeLessThan(0);
    expect(r.metrics.fees).toBeGreaterThan(0);
    expect(r.metrics.avgSlippageBps!).toBeGreaterThan(0);
    expect(r.metrics.exposurePct).toBeGreaterThan(0);
  });
  it('a time trigger enters at that time', () => {
    const s = spec((x) => { x.entry.long = null; x.entry.atTimes = ['10:00']; x.risk.takeProfit = null; x.risk.timeStopBars = 1; });
    const r = run(s, bars(flat(30)));
    expect(r.trades.map((t) => new Date(t.entryTime).toISOString().slice(11, 16))).toEqual(['10:00']);
  });
});

describe('validation, read-back and legacy', () => {
  it('blocks what can’t run and warns about what is risky', () => {
    const ok = validateStrategy(spec());
    expect(ok.blockers).toEqual([]);
    const bad = validateStrategy(spec((s) => { s.market.symbols = []; s.risk.stopLoss = null; s.sizing = { mode: 'risk_pct', value: 1 }; s.risk.takeProfit = { mode: 'rr', value: 2 }; s.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'rsi', output: 'value' }, operator: 'gt', right: { kind: 'indicator', id: 'ema', output: 'value' }, timeframe: '15m' }] }; }));
    expect(bad.blockers.map((b) => b.code).sort()).toEqual(['condition', 'lower_tf', 'no_symbols', 'risk_needs_stop', 'rr_needs_stop'].sort());
    expect(bad.live.map((b) => b.code)).toEqual(['live_stop']);
    const lev = validateStrategy(spec((s) => { s.market.leverage = 25; s.risk.stopLoss = { mode: 'pct', value: 5 }; }));
    expect(lev.blockers.map((b) => b.code)).toContain('over_leverage');
    expect(lev.warnings.map((w) => w.code)).toContain('high_leverage');
    expect(validateStrategy(spec((s) => { s.risk.takeProfit = null; })).warnings.map((w) => w.code)).toContain('stop_only');
  });
  it('reads back in plain English', () => {
    const lines = describeStrategy(spec((s) => { s.market.direction = 'both'; s.entry.short = 'mirror'; s.limits.dailyLossPct = 3; }));
    expect(lines[0]).toBe('Trades AAAUSDT perpetuals on Delta Exchange India, long and short, at 1× isolated margin, on 1h bars.');
    expect(lines[1]).toBe('Buys when close crosses above 100.5, at the next bar’s open.');
    expect(lines[2]).toMatch(/^Sells short when close crosses below 100.5 \(the long rules mirrored\)/);
    expect(lines.join(' ')).toMatch(/a stop 2% away and a target 4% away/);
    expect(lines.join(' ')).toMatch(/pauses for the day after losing 3%/);
    const ema = describeStrategy(defaultSpec());
    expect(ema.join(' ')).toContain('Buys when EMA(20) crosses above EMA(50)');
  });
  it('converts Trader Master strategies', () => {
    const s = fromLegacy({ kind: 'breakout', direction: 'BOTH', symbol: 'ETHUSDT', timeframe: '4h', lookback: 10, stopAtr: 1.5, targetR: 3, horizonBars: 20 });
    expect(s).toMatchObject({ market: { direction: 'both', symbols: [{ symbol: 'ETHUSDT' }] }, session: { interval: '4h' }, entry: { short: 'mirror' }, risk: { stopLoss: { mode: 'atr', value: 1.5 }, takeProfit: { mode: 'rr', value: 3 }, timeStopBars: 20 } });
    expect(validateStrategy(s).blockers).toEqual([]);
    for (const kind of ['ema_cross', 'rsi_threshold', 'price_vs_ema', 'macd_cross'] as const) expect(validateStrategy(fromLegacy({ kind, direction: 'LONG' })).blockers).toEqual([]);
    // A breakout actually fires on a new high.
    const c = bars([...flat(30), 101, 102]);
    const r = runBacktest(fromLegacy({ kind: 'breakout', direction: 'LONG', symbol: 'AAAUSDT', timeframe: '1h', lookback: 10 }), { AAAUSDT: c }, { capital: 10_000, slippageBps: 0 });
    expect(r.trades.length).toBe(1);
  });
});
