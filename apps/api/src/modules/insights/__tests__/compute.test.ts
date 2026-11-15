import { describe, expect, it } from 'vitest';
import {
  applyFilters, behaviour, bestHours, computeDashboard, distribution, findLeaks, grade, heatmap, maeMfe, median,
  rolling, sampleCurve, sessionOf, skipGain, symbols, tradeContext, windowFor, type InsightTrade,
} from '../compute.js';
import { balanceOpsOf, fundedBefore } from '../funding.js';

const H = 3_600_000, D = 86_400_000;
// Mon 2 Nov 2026 00:00 UTC
const MON = Date.UTC(2026, 10, 2);
let seq = 0;
function tr(p: Partial<InsightTrade> & { open: number; net: number }): InsightTrade {
  return { id: `t${++seq}`, symbol: 'XAUUSD', side: 'LONG', close: p.open + 30 * 60_000, volume: 1, r: null, mae: null, mfe: null, tags: [], ...p };
}

describe('sessions (UTC open hour)', () => {
  it('Asia 22–07, London 07–13, NY 13–22', () => {
    expect(sessionOf(MON + 6 * H)).toBe('ASIA');
    expect(sessionOf(MON + 7 * H)).toBe('LONDON');
    expect(sessionOf(MON + 12 * H + 59 * 60_000)).toBe('LONDON');
    expect(sessionOf(MON + 13 * H)).toBe('NY');
    expect(sessionOf(MON + 22 * H)).toBe('ASIA');
  });
});

describe('trade context', () => {
  it('counts same-day consecutive losses before the open and flags revenge and oversize', () => {
    const a = tr({ open: MON + 8 * H, net: -50 });
    const b = tr({ open: MON + 9 * H, net: -40 });
    const c = tr({ open: MON + 9 * H + 40 * 60_000, net: 30, volume: 5 }); // 10 min after b closed
    const d = tr({ open: MON + D + 8 * H, net: 10 }); // next day: streak resets
    const ctx = tradeContext([a, b, c, d, tr({ open: MON + 2 * D, net: 1 })]);
    expect(ctx.get(c.id)).toEqual({ priorLosses: 2, revenge: true, oversized: true });
    expect(ctx.get(b.id)!.priorLosses).toBe(1);
    expect(ctx.get(d.id)!.priorLosses).toBe(0);
    expect(ctx.get(d.id)!.revenge).toBe(false);
  });
  it('median', () => { expect(median([3, 1, 2])).toBe(2); expect(median([4, 1, 2, 3])).toBe(2.5); expect(median([])).toBe(0); });
});

describe('leaks', () => {
  it('ranks real slices by $ lost and removes overlap when adding fixes', () => {
    const T: InsightTrade[] = [];
    for (let i = 0; i < 10; i++) T.push(tr({ open: MON + i * D + 8 * H, net: 100 }));            // London wins
    for (let i = 0; i < 5; i++) T.push(tr({ open: MON + i * D + 16 * H, net: -80, symbol: 'GBPJPY' })); // late GBPJPY losses
    const ctx = tradeContext(T);
    const leaks = findLeaks(T, ctx);
    expect(leaks[0]!.net).toBe(-400);
    expect(leaks.map(l => l.key)).toEqual(expect.arrayContaining(['sym:GBPJPY', 'ses:NY']));
    expect(leaks.find(l => l.key === 'late')!.label).toMatch(/^After (09|1\d):00$/);
    // All three leaks are the same 5 trades: skipping #1 + #2 saves $400, not $800.
    expect(skipGain(T, leaks.slice(0, 2))).toEqual({ gain: 400, trades: 5 });
  });
  it('never reports a winning slice', () => {
    const T = Array.from({ length: 8 }, (_, i) => tr({ open: MON + i * H, net: 10 }));
    expect(findLeaks(T, tradeContext(T))).toEqual([]);
  });
});

describe('heatmap', () => {
  it('session × weekday with best and worst cells', () => {
    const T = [
      tr({ open: MON + 8 * H, net: 300 }), tr({ open: MON + 9 * H, net: 100 }),                // Mon London +400
      tr({ open: MON + 3 * D + 15 * H, net: -200 }), tr({ open: MON + 3 * D + 16 * H, net: -50 }), // Thu NY −250
      tr({ open: MON + 5 * D + 10 * H, net: 5 }),                                             // Saturday shows up
    ];
    const h = heatmap(T);
    expect(h.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(h.best).toEqual({ session: 'LONDON', day: 1 });
    expect(h.worst).toEqual({ session: 'NY', day: 4 });
    expect(h.cells.find(c => c.session === 'NY' && c.day === 4)).toMatchObject({ n: 2, wins: 0, net: -250 });
  });
});

describe('R and $ switching', () => {
  it('uses $ when most trades lack R and R when most have it', () => {
    const noR = Array.from({ length: 30 }, (_, i) => tr({ open: MON + i * H, net: i % 3 ? 50 : -60 }));
    expect(distribution(noR)!.unit).toBe('$');
    expect(rolling(noR)!.unit).toBe('$');
    const withR = noR.map(t => ({ ...t, r: t.net / 50 }));
    const d = distribution(withR)!;
    expect(d.unit).toBe('R');
    expect(d.bins.reduce((a, b) => a + b.n, 0)).toBe(30);
  });
  it('$ tail = losses past 1.5× the average loss, excess = what a cap would have kept', () => {
    const T = [...Array.from({ length: 6 }, (_, i) => tr({ open: MON + i * H, net: 100 })), tr({ open: MON + 7 * H, net: -50 }), tr({ open: MON + 8 * H, net: -50 }), tr({ open: MON + 9 * H, net: -200 }), tr({ open: MON + 10 * H, net: -300 })];
    const d = distribution(T)!;
    // avg loss 150 → threshold −225 → only −300 qualifies, so no tail (needs ≥ 2)
    expect(d.tail).toBeNull();
    expect(d.mean).toBe(0); // (600 − 600) / 10
  });
  it('R tail: saved by keeping the −1R stop', () => {
    const T = [...Array.from({ length: 10 }, (_, i) => tr({ open: MON + i * H, net: 100, r: 1 })), tr({ open: MON + 11 * H, net: -400, r: -2 }), tr({ open: MON + 12 * H, net: -300, r: -1.5 })];
    expect(distribution(T)!.tail).toEqual({ threshold: -1.25, trades: 2, net: -700, excess: 200 + 100 });
  });
});

describe('MAE / MFE', () => {
  it('is null without metric data', () => {
    expect(maeMfe(Array.from({ length: 20 }, (_, i) => tr({ open: MON + i * H, net: 1 })))).toBeNull();
  });
  it('counts losers that were green by at least their loss first', () => {
    const T = Array.from({ length: 12 }, (_, i) => tr({ open: MON + i * H, net: i < 3 ? -50 : 40, mae: 30, mfe: i < 2 ? 60 : 45 }));
    expect(maeMfe(T)!.gaveBack).toEqual({ trades: 2, net: -100 });
    expect(maeMfe(T)!.points.filter(p => p.gave)).toHaveLength(2);
  });
});

describe('behaviour score and grades', () => {
  it('needs 20 trades', () => {
    const T = Array.from({ length: 19 }, (_, i) => tr({ open: MON + i * D + 8 * H, net: 10 }));
    expect(behaviour(T, tradeContext(T))).toBeNull();
  });
  it('is the mean of discipline, risk and timing pass rates', () => {
    // 20 clean London trades a day apart, then 2 losses and a revenge trade on one day.
    const T = Array.from({ length: 20 }, (_, i) => tr({ open: MON + i * D + 8 * H, net: 20 }));
    const day = MON + 30 * D;
    T.push(tr({ open: day + 15 * H, net: -30 }), tr({ open: day + 16 * H, net: -30 }), tr({ open: day + 16 * H + 35 * 60_000, net: -30, volume: 3 }));
    const ctx = tradeContext(T);
    const b = behaviour(T, ctx)!;
    // discipline: 2 fail (2nd loss is within 15 min? no: 30 min gap; 3rd: after 2 losses + revenge) → 3rd fails, 2nd passes
    const d = b.parts.find(p => p.key === 'discipline')!;
    expect(d.score).toBe(Math.round((100 * 22) / 23));
    const r = b.parts.find(p => p.key === 'risk')!;
    expect(r.score).toBe(Math.round((100 * 22) / 23));
    // 15:00 and 16:00 UTC hours have < 3 trades each, so timing passes everywhere
    expect(b.parts.find(p => p.key === 'timing')!.score).toBe(100);
    expect(b.score).toBe(Math.round((d.score + r.score + 100) / 3));
    const last = T.at(-1)!;
    const g = grade(last, ctx.get(last.id), { hourNet: new Map() });
    expect(g.grade).toBe('D');
    expect(g.reasons).toEqual(['After 2 losses', 'Within 15 min of a loss', 'Oversized']);
  });
});

describe('plan + symbols', () => {
  it('derives rules only from real slices', () => {
    const T: InsightTrade[] = [];
    for (let i = 0; i < 20; i++) T.push(tr({ open: MON + i * D + 8 * H, net: 100 }));
    for (let i = 0; i < 6; i++) T.push(tr({ open: MON + i * D + 18 * H, net: -60, symbol: 'GBPJPY' }));
    const w = bestHours(T)!;
    expect(w.from).toBeLessThanOrEqual(8);
    expect(w.to).toBeGreaterThan(8);
    expect(w.to).toBeLessThanOrEqual(18);
    expect(w.inside.net).toBe(2000);
    const rows = symbols(T);
    // The only symbol that made money gets no "share of profit" tag (it would be 100%+).
    expect(rows[0]).toMatchObject({ symbol: 'XAUUSD', net: 2000, tag: null });
    expect(rows[1]).toMatchObject({ symbol: 'GBPJPY', net: -360, profitFactor: 0, tag: { kind: 'pause' }, avgUnit: '$', avg: -60 });
  });
  it('tags the lead symbol with its share of the profit made, never over 100%', () => {
    const T: InsightTrade[] = [];
    for (let i = 0; i < 4; i++) T.push(tr({ open: MON + i * D, net: 300 }));
    T.push(tr({ open: MON + 5 * D, net: 400, symbol: 'EURUSD' }));
    for (let i = 0; i < 3; i++) T.push(tr({ open: MON + (6 + i) * D, net: -500, symbol: 'GBPJPY' }));
    const rows = symbols(T);
    expect(rows[0]).toMatchObject({ symbol: 'XAUUSD', tag: { kind: 'share', pct: 0.75 } });
  });
});

describe('computeDashboard', () => {
  const T: InsightTrade[] = [];
  for (let i = 0; i < 40; i++) T.push(tr({ open: MON - 60 * D + i * D + (i % 2 ? 8 : 15) * H, net: i % 3 ? 120 : -90, symbol: i % 4 ? 'XAUUSD' : 'EURUSD', side: i % 2 ? 'LONG' : 'SHORT', tags: i % 5 ? [] : ['a+'] }));
  const now = MON + 10 * D;

  it('empty account: every block empty, counts zero', () => {
    const o = computeDashboard([], { now, window: windowFor('90D', undefined, undefined, now), filters: {}, startingBalance: 0 });
    expect(o.counts).toMatchObject({ trades: 0, allClosed: 0 });
    expect(o.kpis).toBeNull();
    expect(o.equity).toBeNull();
    expect(o.symbols).toEqual([]);
  });

  it('KPIs agree with the trades', () => {
    const o = computeDashboard(T, { now, window: windowFor('ALL', undefined, undefined, now), filters: {}, startingBalance: 10_000 });
    const net = T.reduce((a, t) => a + t.net, 0);
    expect(o.kpis!.netPnl).toBe(net);
    expect(o.kpis!.balance).toBe(10_000 + net);
    expect(o.kpis!.winRate).toBeCloseTo(T.filter(t => t.net > 0).length / 40, 4);
    expect(o.equity!.trades.at(-1)!.v).toBe(10_000 + net);
    expect(o.behaviour).not.toBeNull();
    expect(o.recent).toHaveLength(6);
    expect(o.recent[0]!.grade).toMatch(/^[ABCDF]$/);
    expect(o.maeMfe).toBeNull();
    expect(o.distribution!.unit).toBe('$');
  });

  it('range and filters drive every block; the start balance carries earlier P&L', () => {
    const now2 = MON - 10 * D;
    const w = windowFor('30D', undefined, undefined, now2);
    const o = computeDashboard(T, { now: now2, window: w, filters: { side: 'LONG' }, startingBalance: 10_000 });
    const inW = T.filter(t => t.close >= w.from!);
    const longs = inW.filter(t => t.side === 'LONG');
    expect(o.counts.inWindow).toBe(inW.length);
    expect(o.counts.trades).toBe(longs.length);
    expect(o.kpis!.netPnl).toBe(longs.reduce((a, t) => a + t.net, 0));
    expect(o.kpis!.startBalance).toBe(10_000 + T.filter(t => t.close < w.from!).reduce((a, t) => a + t.net, 0));
    expect(o.symbols.reduce((a, s) => a + s.trades, 0)).toBe(longs.length);
    expect(o.behaviour).toBeNull(); // < 20 trades
    // Grades use the whole closed history as the baseline (like the trade log
    // and trade review), so a small filtered view still gets graded.
    expect(T.length >= 20).toBe(true);
    expect(o.recent.every(r => r.grade !== null)).toBe(true);
  });

  it('recent grades match the whole-history baseline, whatever the filter', () => {
    const full = computeDashboard(T, { now: MON, window: windowFor('ALL', undefined, undefined, MON), filters: {}, startingBalance: 10_000 });
    const narrow = computeDashboard(T, { now: MON, window: windowFor('7D', undefined, undefined, MON), filters: {}, startingBalance: 10_000 });
    const byId = new Map(full.recent.map(r => [r.id, r.grade]));
    for (const r of narrow.recent) if (byId.has(r.id)) expect(r.grade).toBe(byId.get(r.id));
  });

  it('tag and session filters', () => {
    expect(applyFilters(T, { tag: 'a+' })).toHaveLength(8);
    expect(applyFilters(T, { session: 'LONDON' }).every(t => sessionOf(t.open) === 'LONDON')).toBe(true);
  });

  it('custom window overrides the preset', () => {
    expect(windowFor('90D', 5, 9, now)).toEqual({ from: 5, to: 9 });
    expect(windowFor('ALL', undefined, undefined, now)).toEqual({ from: null, to: null });
  });
});

describe('equity curve with deposits and withdrawals', () => {
  // Deposit $1,000, win $5,556 over 12 trades, withdraw $6,500 in two goes
  // (one mid-way, one after the last trade): the balance ends at $56.
  const deposit = { t: MON - 30 * D, amount: 1000 };
  const T = Array.from({ length: 12 }, (_, i) => tr({ open: MON - 20 * D + i * D + 9 * H, net: i === 5 ? -142 : 518 }));
  const net = T.reduce((a, t) => a + t.net, 0);
  const midOut = { t: T[7]!.close + H, amount: -3000 };
  const endOut = { t: T.at(-1)!.close + D, amount: -3500 };
  const ops = [deposit, midOut, endOut];
  const now = MON + 10 * D;

  it('never goes below zero: flows land on their dates and the curve ends on the real balance', () => {
    expect(net).toBe(5556);
    const o = computeDashboard(T, { now, window: windowFor('ALL', undefined, undefined, now), filters: {}, startingBalance: 1000 + net - 6500 - net, balanceOps: ops });
    const eq = o.equity!;
    expect(eq.basis).toBe('balance');
    expect(eq.start).toBe(1000);
    expect(Math.min(eq.start, ...eq.trades.map(p => p.v))).toBeGreaterThanOrEqual(0);
    // The withdrawal after trade #8 shows on trade #9's point; the last one gets its own point.
    expect(eq.trades[8]!.flow).toBe(-3000);
    expect(eq.trades.at(-1)).toMatchObject({ v: 56, pnl: 0, flow: -3500 });
    expect(o.kpis!.balance).toBe(56);
    expect(o.kpis!.peakBalance).toBe(1000 + T.slice(0, 8).reduce((a, t) => a + t.net, 0));
    // Taking money out is not a drawdown: only the one losing trade dips.
    expect(eq.drawdown!.amount).toBe(142);
    expect(eq.days.reduce((a, p) => a + (p.flow ?? 0), 0)).toBe(-6500);
  });

  it('the old single "starting balance" (net of all flows, here −$5,500) would start negative: falls back to P&L from 0', () => {
    const o = computeDashboard(T, { now, window: windowFor('ALL', undefined, undefined, now), filters: {}, startingBalance: 56 - net });
    const eq = o.equity!;
    expect(eq.basis).toBe('pnl');
    expect(eq.start).toBe(0);
    expect(eq.trades.at(-1)!.v).toBe(net);
    expect(eq.trades.every(p => p.flow == null)).toBe(true);
    expect(eq.drawdown!.pct).toBeNull();
    expect(o.kpis!.returnPct).toBeNull();
  });

  it('no deposits known at all: cumulative P&L from 0', () => {
    const o = computeDashboard(T, { now, window: windowFor('ALL', undefined, undefined, now), filters: {}, startingBalance: 0, balanceOps: [] });
    expect(o.equity!.basis).toBe('pnl');
    expect(o.equity!.trades.at(-1)!.v).toBe(net);
  });

  it('a range starts on the balance at its start, including earlier flows', () => {
    const from = T[6]!.close - 1;
    const o = computeDashboard(T, { now, window: { from, to: null }, filters: {}, startingBalance: 0, balanceOps: ops });
    const before = T.filter(t => t.close < from).reduce((a, t) => a + t.net, 0);
    expect(o.equity!.basis).toBe('balance');
    expect(o.equity!.start).toBe(1000 + before);
    expect(o.equity!.trades.at(-1)!.v).toBe(56);
  });

  it('sampling a long curve keeps every cash flow', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, v: i, pnl: 1, ...(i % 7 === 3 ? { flow: 2 } : {}) }));
    const s = sampleCurve(pts, 2000);
    expect(s).toHaveLength(2000);
    expect(s.reduce((a, p) => a + (p.flow ?? 0), 0)).toBe(pts.reduce((a, p) => a + (p.flow ?? 0), 0));
  });
});

describe('funding helpers', () => {
  it('reads BALANCE deals as dated flows and sums those before a moment', () => {
    const ops = balanceOpsOf([
      { type: 'BALANCE', profit: '-200', dealTime: '2026-11-03T00:00:00Z' },
      { type: 'BUY', profit: '50', dealTime: '2026-11-02T00:00:00Z' },
      { type: 'BALANCE', profit: '1000', dealTime: '2026-11-01T00:00:00Z' },
      { type: 'BALANCE', profit: '0', dealTime: '2026-11-04T00:00:00Z' },
    ]);
    expect(ops).toEqual([{ t: Date.parse('2026-11-01T00:00:00Z'), amount: 1000 }, { t: Date.parse('2026-11-03T00:00:00Z'), amount: -200 }]);
    expect(fundedBefore(ops, Date.parse('2026-11-02T00:00:00Z'))).toBe(1000);
    expect(fundedBefore(ops, Date.parse('2026-11-05T00:00:00Z'))).toBe(800);
  });
});

describe('AI line wording', () => {
  it('one loser that was green first reads in the singular', () => {
    const t = tr({ open: MON + 9 * H, net: -67, mae: -80, mfe: 90 });
    const others = Array.from({ length: 10 }, (_, i) => tr({ open: MON + (i + 1) * D + 9 * H, net: 40, mae: -10, mfe: 60 }));
    const o = computeDashboard([t, ...others], { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 1000 });
    expect(o.ai.maeMfe!.text).toBe('1 loser was green first:');
    const two = computeDashboard([t, tr({ ...t, id: 'x2', open: t.open + H }), ...others], { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 1000 });
    expect(two.ai.maeMfe!.text).toBe('2 losers were green first:');
  });
});
