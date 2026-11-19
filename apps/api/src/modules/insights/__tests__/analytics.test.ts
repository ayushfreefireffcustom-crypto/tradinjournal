import { describe, expect, it } from 'vitest';
import { maxDrawdown,
  combinations, computeAnalytics, exitEfficiency, firstRuleBroken, fixLabel, holdView, lateCut, niceDuration,
  ruleWaterfall, segments, streaks, usualSize, weekStart, type AnalyticsTrade,
} from '../analytics-compute.js';
import { computeDashboard, findLeaks, skipGain, tradeContext, type ComputeOptions } from '../compute.js';

const H = 3_600_000, D = 86_400_000, M = 60_000;
const MON = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026 00:00 UTC
let seq = 0;
function tr(p: Partial<AnalyticsTrade> & { open: number; net: number }): AnalyticsTrade {
  return { id: `a${++seq}`, symbol: 'XAUUSD', side: 'LONG', close: p.open + 30 * M, volume: 1, r: null, mae: null, mfe: null, tags: [], ...p };
}
const opts = (now: number, o: Partial<ComputeOptions> = {}): ComputeOptions => ({ now, window: { from: null, to: null }, filters: {}, startingBalance: 10_000, ...o });

/** A deterministic 6-week book: London wins, late-day and GBPJPY losses, a few after-2-losses trades. */
function book(withR = false): AnalyticsTrade[] {
  const T: AnalyticsTrade[] = [];
  for (let w = 0; w < 6; w++) {
    for (let d = 0; d < 5; d++) {
      const day = MON - 5 * 7 * D + w * 7 * D + d * D;
      T.push(tr({ open: day + 8 * H, net: 120, r: withR ? 1.2 : null, volume: d === 4 ? 3 : 1 }));          // London win (Fridays oversized)
      T.push(tr({ open: day + 9 * H, net: d % 2 ? -60 : 90, r: withR ? (d % 2 ? -0.6 : 0.9) : null, symbol: 'EURUSD' }));
      if (d === 3) T.push(tr({ open: day + 16 * H, net: -150, r: withR ? -1.5 : null, symbol: 'GBPJPY', volume: 2 })); // late GBPJPY loss, oversized
    }
  }
  return T;
}

describe('calendar helpers', () => {
  it('weekStart is the UTC Monday', () => {
    expect(weekStart(MON + 3 * D + 5 * H)).toBe('2026-11-02');
    expect(weekStart(MON - 1)).toBe('2026-10-26'); // Sunday night belongs to the previous week
    expect(weekStart(MON)).toBe('2026-11-02');
  });
  it('niceDuration rounds up to a readable step', () => {
    expect(niceDuration(50 * M)).toBe(H);
    expect(niceDuration(2.5 * H)).toBe(3 * H);
    expect(niceDuration(10 * D)).toBe(14 * D);
  });
  it('streaks count consecutive wins and losses; a flat trade breaks both', () => {
    const T = [10, 5, -1, -2, -3, 0, -4, 7].map((net, i) => tr({ open: MON + i * H, net }));
    expect(streaks(T)).toEqual({ win: 2, loss: 3 });
  });
});

describe('time', () => {
  it('lateCut picks the hour after which trading loses the most (same rule as the dashboard leak)', () => {
    const T = book();
    const late = lateCut(T)!;
    const leak = findLeaks(T, tradeContext(T)).find(l => l.key === 'late')!;
    expect(late.net).toBe(leak.net);
    expect(`After ${String(late.from).padStart(2, '0')}:00`).toBe(leak.label);
    expect(late.n).toBe(leak.trades);
  });
});

describe('overview segments', () => {
  it('keeps symbol × session groups of 3+, best first, top and bottom when there are many', () => {
    const T: AnalyticsTrade[] = [];
    'ABCDEFGHIJ'.split('').forEach((s, i) => { for (let k = 0; k < 3; k++) T.push(tr({ open: MON + k * D + 8 * H, net: (i - 5) * 10, symbol: s })); });
    T.push(tr({ open: MON + 8 * H, net: 999, symbol: 'ZZZ' })); // only 1 trade: left out
    const all = segments(T, false);
    expect(all.rows).toHaveLength(10);
    expect(all.rows[0]!.symbol).toBe('J');
    expect(all.rows.some(r => r.symbol === 'ZZZ')).toBe(false);
    const few = segments(T, false, 4);
    expect(few.rows.map(r => r.symbol)).toEqual(['J', 'I', 'B', 'A']);
    expect(few.hidden).toBe(6);
    expect(few.rows[0]!.avg).toBe(40);
  });
});

describe('rules waterfall', () => {
  it('counts each trade once, under the first rule it broke, and adds up to the net', () => {
    const T = book().sort((a, b) => a.close - b.close);
    const ctx = tradeContext(T);
    const first = firstRuleBroken(T, ctx)!;
    const wf = ruleWaterfall(T, first);
    const parts = wf.kept.n + wf.rules.reduce((a, r) => a + r.n, 0);
    expect(parts).toBe(T.length);
    expect(wf.kept.net + wf.rules.reduce((a, r) => a + r.net, 0)).toBeCloseTo(wf.total.net, 6);
    expect(wf.rules.map(r => r.key)).toContain('oversized');
  });
  it('needs the minimum trades', () => {
    const T = book().slice(0, 10);
    expect(firstRuleBroken(T, tradeContext(T))).toBeNull();
  });
});

describe('what-if combinations', () => {
  it('never double counts a trade that is in two fixes', () => {
    const a = tr({ open: MON, net: -100 }), b = tr({ open: MON + H, net: -50 }), c = tr({ open: MON + 2 * H, net: 30 });
    const { gains, removed } = combinations([a, b, c], [[a.id, b.id], [b.id, c.id]]);
    expect(gains).toEqual([0, 150, 20, 120]);
    expect(removed).toEqual([0, 2, 2, 3]);
  });
  it('labels fixes as rules', () => {
    expect(fixLabel('late', 'After 14:00')).toBe('No trades after 14:00');
    expect(fixLabel('sym:GBPJPY', 'GBPJPY')).toBe('No GBPJPY');
    expect(fixLabel('after-losses', 'After 2 losses')).toBe('Day ends after 2 losses');
  });
});

describe('risk', () => {
  it('hold: losers held longer than most winners', () => {
    const T: AnalyticsTrade[] = [];
    for (let i = 0; i < 8; i++) T.push(tr({ open: MON + i * D, close: MON + i * D + 30 * M, net: 50 }));
    for (let i = 0; i < 5; i++) T.push(tr({ open: MON + i * D + 9 * H, close: MON + i * D + 13 * H, net: -40 }));
    const h = holdView(T, false)!;
    expect(h.unit).toBe('$');
    expect(h.ratio).toBe(8);
    expect(h.longLosers).toEqual({ thresholdMs: 30 * M, n: 5, net: -200 });
    expect(holdView(T.slice(0, 9), false)).toBeNull();
  });
  it('exit efficiency only from winners with MFE', () => {
    const T = [100, 50, 80, 90, 60].map((net, i) => tr({ open: MON + i * H, net, mfe: 100, mae: -10 }));
    T.push(tr({ open: MON + 9 * H, net: -20, mfe: 40, mae: -30 }));
    const e = exitEfficiency(T)!;
    expect(e.n).toBe(5);
    expect(e.avg).toBe(0.76);
    expect(e.bins[9]!.n).toBe(2); // 90% and 100% kept
    expect(exitEfficiency(T.slice(0, 4))).toBeNull();
  });
  it('usual size is the median volume per symbol (3+ trades)', () => {
    const u = usualSize([tr({ open: 0, net: 1, volume: 1 }), tr({ open: 1, net: 1, volume: 3 }), tr({ open: 2, net: 1, volume: 2 }), tr({ open: 3, net: 1, symbol: 'X', volume: 9 })]);
    expect(u.get('XAUUSD')).toBe(2);
    expect(u.get('X')).toBeNull();
  });
});

describe('computeAnalytics', () => {
  it('returns nulls (and empty nav values) with no trades', () => {
    const out = computeAnalytics([], opts(MON));
    expect(out.overview).toBeNull();
    expect(out.nav.every(n => n.value == null)).toBe(true);
    expect(out.counts.trades).toBe(0);
  });

  it('agrees with the dashboard on net, leaks and the two-fix gain', () => {
    const T = book();
    const now = MON + 7 * D;
    const a = computeAnalytics(T, opts(now));
    const d = computeDashboard(T, opts(now));
    expect(a.overview!.net.net).toBe(d.kpis!.netPnl);
    const ctx = tradeContext(T);
    const leaks = findLeaks([...T].sort((x, y) => x.close - y.close), ctx);
    expect(a.whatif!.fixes.map(f => f.alone)).toEqual(leaks.map(l => -l.net));
    expect(a.whatif!.gains[3]).toBe(skipGain(T, leaks.slice(0, 2)).gain);
    expect(a.nav.find(n => n.view === 'whatif')!.value).toBe(a.whatif!.gains[a.whatif!.defaultMask]);
    // Default: fix #1, plus the other fix that adds the most on top of it.
    const w = a.whatif!;
    expect(w.defaultMask & 1).toBe(1);
    const adds = w.fixes.map((_, i) => (i ? w.gains[1 | (1 << i)]! - w.gains[1]! : -Infinity));
    if (Math.max(...adds) > 0) expect(w.defaultMask).toBe(1 | (1 << adds.indexOf(Math.max(...adds))));
    // Overview "rules broken" + rules kept add up to the net.
    const wf = a.behaviour!.waterfall!;
    expect(a.overview!.rulesBroken!.net + wf.kept.net).toBeCloseTo(a.overview!.net.net, 6);
    expect(a.behaviour!.score!.score).toBe(d.behaviour!.score);
  });

  it('uses $ when too few trades carry R, and R when most do', () => {
    const noR = computeAnalytics(book(false), opts(MON + 7 * D));
    expect(noR.risk!.unit).toBe('$');
    expect(noR.overview!.segUnit).toBe('$');
    expect(noR.performance!.rUnit).toBe(false);
    expect(noR.performance!.days.every(d => d.r == null)).toBe(true);
    expect(noR.nav.find(n => n.view === 'risk')!.fmt).toBe('money');
    const withR = computeAnalytics(book(true), opts(MON + 7 * D));
    expect(withR.risk!.unit).toBe('R');
    expect(withR.nav.find(n => n.view === 'risk')!.fmt).toBe('r');
    expect(withR.risk!.distribution!.unit).toBe('R');
  });

  it('hides MAE/MFE widgets without metric data, and shows what the break-even what-if needs', () => {
    const out = computeAnalytics(book(true), opts(MON + 7 * D));
    expect(out.risk!.maeMfe).toBeNull();
    expect(out.risk!.exit).toBeNull();
    expect(out.whatif!.breakEven).toBeNull();
    expect(out.whatif!.breakEvenNeeds).toBe('mae');
  });

  it('performance: weeks are Monday-based, green weeks counted, worst week named', () => {
    const out = computeAnalytics(book(), opts(MON + 7 * D));
    const p = out.performance!;
    expect(p.weeks).toHaveLength(6);
    expect(p.weeks.every(w => new Date(`${w.start}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(p.greenWeeks).toBe(p.weeks.filter(w => w.net > 0).length);
    expect(p.days.reduce((a, d) => a + d.n, 0)).toBe(out.counts.trades);
    expect(out.nav.find(n => n.view === 'performance')).toMatchObject({ value: p.greenWeeks, den: 6, fmt: 'weeks' });
  });

  it('respects filters and the window like the dashboard', () => {
    const T = book();
    const out = computeAnalytics(T, opts(MON + 7 * D, { filters: { symbol: 'GBPJPY' } }));
    expect(out.counts.trades).toBe(T.filter(t => t.symbol === 'GBPJPY').length);
    expect(out.options.symbols.map(s => s.symbol)).toContain('XAUUSD'); // options come from the whole window
    const win = computeAnalytics(T, opts(MON + 7 * D, { window: { from: MON - 7 * D, to: null } }));
    expect(win.counts.trades).toBeLessThan(T.length);
  });

  it('behaviour: groups by losses earlier that day and by size, plus journal tags and emotions', () => {
    const T = book().map((t, i) => (i % 5 === 0 ? { ...t, tags: ['breakout'], emotion: 'FOMO' } : t));
    const out = computeAnalytics(T, opts(MON + 7 * D));
    const b = out.behaviour!;
    expect(b.byLosses.map(x => x.key)).toEqual(['0', '1', '2', '3+']);
    expect(b.byLosses.reduce((a, x) => a + x.n, 0)).toBe(T.length);
    expect(b.tags[0]!.label).toBe('breakout');
    expect(b.emotions[0]!.label).toBe('FOMO');
    expect(b.strips!.every(s => /^[01]+$/.test(s.bits))).toBe(true);
  });

  it('symbols: cumulative series start at 0 and end at the net', () => {
    const out = computeAnalytics(book(), opts(MON + 7 * D));
    for (const s of out.symbols!.series) {
      expect(s.pts[0]!.v).toBe(0);
      expect(s.pts.at(-1)!.v).toBeCloseTo(s.net, 6);
    }
    expect(out.symbols!.grid.cells.length).toBe(out.symbols!.grid.symbols.length * 3);
  });
});

describe('maxDrawdown', () => {
  it('is the largest fall from a running peak, in close order', () => {
    const T = [{ net: 100, close: 1 }, { net: -40, close: 2 }, { net: 30, close: 3 }, { net: -120, close: 4 }, { net: 200, close: 5 }];
    expect(maxDrawdown(T)).toBe(-130);
    expect(maxDrawdown([...T].reverse())).toBe(-130);
  });
  it('is 0 when equity never falls', () => {
    expect(maxDrawdown([{ net: 10, close: 1 }, { net: 5, close: 2 }])).toBe(0);
    expect(maxDrawdown([])).toBe(0);
  });
  it('counts a fall from the start as drawdown', () => {
    expect(maxDrawdown([{ net: -50, close: 1 }, { net: 20, close: 2 }])).toBe(-50);
  });
});
