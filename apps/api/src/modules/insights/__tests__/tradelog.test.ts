import { describe, expect, it } from 'vitest';
import type { TradelogQuery } from '@tradinjournal/contracts';
import { grade as dashGrade, baseline, tradeContext, MIN_TRADES } from '../compute.js';
import {
  bigLossOf, buildBase, buildPath, exitInfo, exportRows, gradeAll, journalByTrade, localDay, pathTf, queryLog, safeTz,
  sortRows, strip, summarize, toInsight, tradeDetail, type TlTrade,
} from '../tradelog.js';
import { genTrades } from './tradelog.fixtures.js';

const NOW = Date.UTC(2026, 10, 14, 12);
const Q = (p: Partial<TradelogQuery> = {}): TradelogQuery => ({ accountId: 'a', range: 'ALL', sort: 'time', dir: 'desc', offset: 0, limit: 50, ...p });
const base = (trades: TlTrade[], journal = new Map()) => buildBase(trades, journal, { tz: 'UTC', startingBalance: 10_000 });

describe('exit info from the closing deal comment', () => {
  it('reads tp / sl prices and stop-outs', () => {
    expect(exitInfo('[sl 1.08120]')).toEqual({ reason: 'sl', sl: 1.0812, tp: null });
    expect(exitInfo('[tp 2650.5]')).toEqual({ reason: 'tp', sl: null, tp: 2650.5 });
    expect(exitInfo('so: 48.2%/120/250')).toEqual({ reason: 'stopout', sl: null, tp: null });
    expect(exitInfo('')).toEqual({ reason: 'other', sl: null, tp: null });
    expect(exitInfo(null).reason).toBe('other');
    expect(exitInfo('[sl]')).toEqual({ reason: 'sl', sl: null, tp: null });
  });
});

describe('days in the viewer time zone', () => {
  it('groups by local close day and falls back to UTC on a bad zone', () => {
    const ms = Date.UTC(2026, 10, 13, 23, 30);
    expect(localDay(ms, 'UTC')).toBe('2026-11-13');
    expect(localDay(ms, safeTz('Asia/Kolkata'))).toBe('2026-11-14');
    expect(localDay(ms, safeTz('America/New_York'))).toBe('2026-11-13');
    expect(safeTz('Not/AZone')).toBe('UTC');
    expect(safeTz(undefined)).toBe('UTC');
  });
});

describe('grades and flags', () => {
  it('need 20 closed trades', () => {
    expect(gradeAll(genTrades({ n: MIN_TRADES - 1 }))).toBeNull();
    expect(gradeAll(genTrades({ n: MIN_TRADES }))).not.toBeNull();
  });
  it('match the dashboard grade with the whole history as the baseline', () => {
    const T = genTrades({ n: 200 });
    const g = gradeAll(T)!;
    const ins = T.map(toInsight);
    const ctx = tradeContext(ins), b = baseline(ins);
    for (const t of ins) {
      const d = dashGrade(t, ctx.get(t.id), b);
      expect(g.get(t.id)!.grade).toBe(d.grade);
      expect(g.get(t.id)!.flags.length).toBe(d.reasons.length);
    }
    const keys = new Set([...g.values()].flatMap(x => x.flags.map(f => f.key)));
    expect([...keys].every(k => ['after-losses', 'revenge', 'oversized', 'losing-hour', 'r-tail'].includes(k))).toBe(true);
  });
  it('filtering never changes a grade', () => {
    const b = base(genTrades({ n: 120 }));
    const all = queryLog(b, Q({ limit: 200 }), NOW).rows;
    const xau = queryLog(b, Q({ symbol: 'XAUUSD', limit: 200 }), NOW).rows;
    for (const r of xau) expect(r.grade).toBe(all.find(x => x.id === r.id)!.grade);
  });
});

describe('list, filters, paging', () => {
  const T = genTrades({ n: 300, open: 2 });
  const b = base(T);

  it('pages with stable order and full-day subtotals', () => {
    const p1 = queryLog(b, Q({ limit: 50 }), NOW);
    const p2 = queryLog(b, Q({ limit: 50, offset: 50 }), NOW);
    expect(p1.rows).toHaveLength(50);
    expect(p1.hasMore).toBe(true);
    expect(p1.rows[0]!.status).toBe('OPEN'); // open positions first when newest first
    expect(new Set([...p1.rows, ...p2.rows].map(r => r.id)).size).toBe(100);
    const last = p1.rows.at(-1)!;
    const day = p1.days.find(d => d.day === last.day)!;
    const allOnDay = T.filter(t => t.status === 'CLOSED' && localDay(t.close!, 'UTC') === last.day);
    expect(day.n).toBe(allOnDay.length);
    expect(day.net).toBeCloseTo(allOnDay.reduce((s, t) => s + t.net, 0), 2);
    const end = queryLog(b, Q({ limit: 200, offset: 200 }), NOW);
    expect(end.hasMore).toBe(false);
    expect(end.rows).toHaveLength(102);
  });

  it('summary covers closed trades only and adds up', () => {
    const d = queryLog(b, Q(), NOW);
    const s = d.summary!;
    const closed = T.filter(t => t.status === 'CLOSED');
    expect(s.trades).toBe(300);
    expect(s.open).toBe(2);
    expect(s.wins + s.losses).toBe(300);
    expect(s.net).toBeCloseTo(closed.reduce((a, t) => a + t.net, 0), 1);
    expect(s.fees).toBeCloseTo(closed.reduce((a, t) => a + t.commission + t.swap, 0), 1);
    expect(Object.values(s.gradeMix!).reduce((a, n) => a + n, 0)).toBe(300);
    expect(d.useR).toBe(true);
    expect(d.counts).toMatchObject({ matching: 302, inWindow: 302, allClosed: 300, all: 302, withR: 300 });
  });

  it('filters: symbol, side, result, rule, grade, search', () => {
    const sym = queryLog(b, Q({ symbol: 'NAS100', limit: 200 }), NOW);
    expect(sym.rows.every(r => r.symbol === 'NAS100')).toBe(true);
    const shorts = queryLog(b, Q({ side: 'SHORT', result: 'loss', limit: 200 }), NOW);
    expect(shorts.rows.every(r => r.side === 'SHORT' && r.net <= 0 && r.status === 'CLOSED')).toBe(true);
    const broken = queryLog(b, Q({ rule: 'any', limit: 200 }), NOW);
    expect(broken.counts.matching).toBe(broken.views.ruleBroken);
    expect(broken.rows.every(r => r.flags.length > 0)).toBe(true);
    const df = queryLog(b, Q({ grade: 'D,F', limit: 200 }), NOW);
    expect(df.counts.matching).toBe(df.views.gradeDF);
    const big = queryLog(b, Q({ result: 'bigloss', limit: 200 }), NOW);
    expect(big.bigLoss).toEqual({ unit: 'R', threshold: -1 });
    expect(big.rows.every(r => r.r! < -1)).toBe(true);
    expect(big.counts.matching).toBe(big.views.bigLosers);
    const sl = queryLog(b, Q({ result: 'sl', limit: 200 }), NOW);
    expect(sl.rows.every(r => r.exitReason === 'sl' && r.sl === r.exit)).toBe(true);
    const ticket = T[5]!.id;
    expect(queryLog(b, Q({ q: ticket }), NOW).rows.map(r => r.id)).toEqual([ticket]);
    const open = queryLog(b, Q({ result: 'open' }), NOW);
    expect(open.counts.matching).toBe(2);
    expect(open.summary).toBeNull();
  });

  it('searches journal notes, tags and emotions', () => {
    const j = journalByTrade([
      { id: 'j1', tradeId: T[3]!.id, body: 'Chased the breakout', emotion: 'FOMO', tags: ['breakout'], entryDate: new Date(2) },
      { id: 'j2', tradeId: T[3]!.id, body: '', emotion: null, tags: ['news'], entryDate: new Date(1) },
    ]);
    const bj = base(T, j);
    expect(queryLog(bj, Q({ q: 'chased' }), NOW).rows.map(r => r.id)).toEqual([T[3]!.id]);
    expect(queryLog(bj, Q({ tag: 'news' }), NOW).rows.map(r => r.id)).toEqual([T[3]!.id]);
    expect(queryLog(bj, Q({ tag: 'FOMO' }), NOW).rows).toHaveLength(1);
    const row = queryLog(bj, Q({ q: 'chased' }), NOW).rows[0]!;
    expect(row).toMatchObject({ tags: ['breakout', 'news'], emotion: 'FOMO', noted: true });
    expect(queryLog(bj, Q(), NOW).options.tags).toEqual(['breakout', 'FOMO', 'news']);
  });

  it('date window by close time', () => {
    const from = Date.UTC(2026, 9, 1), to = Date.UTC(2026, 9, 31, 23, 59);
    const d = queryLog(b, Q({ from, to, limit: 200 }), NOW);
    expect(d.rows.every(r => r.closeTime! >= from && r.closeTime! <= to)).toBe(true);
    expect(d.counts.inWindow).toBe(d.views.all);
    expect(d.strip.days.every(x => x.day >= '2026-10-01' && x.day <= '2026-10-31')).toBe(true);
  });

  it('sorts by net, hold, symbol and R (R nulls last)', () => {
    const rows = queryLog(b, Q({ sort: 'net', dir: 'asc', limit: 200 }), NOW).rows;
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.net).toBeGreaterThanOrEqual(rows[i - 1]!.net);
    const r = sortRows(queryLog(b, Q({ limit: 200 }), NOW).rows, 'r', 'desc');
    expect(r.at(-1)!.r).toBeNull();
    expect(r[0]!.r!).toBeGreaterThanOrEqual(r[1]!.r!);
  });

  it('export returns every match in order', () => {
    const rows = exportRows(b, { ...Q(), result: 'win' }, NOW);
    expect(rows.length).toBe(queryLog(b, Q({ result: 'win' }), NOW).counts.matching);
  });
});

describe('no R, few trades, empty', () => {
  it('switches big losers to $ and hides R without stops', () => {
    const b = base(genTrades({ n: 60, withR: false }));
    const d = queryLog(b, Q(), NOW);
    expect(d.useR).toBe(false);
    expect(d.summary!.avgR).toBeNull();
    expect(d.bigLoss!.unit).toBe('$');
    const big = queryLog(b, Q({ result: 'bigloss', limit: 200 }), NOW);
    expect(big.rows.every(r => r.net < (d.bigLoss as { threshold: number }).threshold)).toBe(true);
  });
  it('one trade: no grades, no strip AI', () => {
    const d = queryLog(base(genTrades({ n: 1 })), Q(), NOW);
    expect(d.graded).toBe(false);
    expect(d.rows[0]!.grade).toBeNull();
    expect(d.summary!.ruleBroken).toBeNull();
    expect(d.summary!.gradeMix).toBeNull();
    expect(d.views).toEqual({ all: 1, ruleBroken: null, gradeDF: null, bigLosers: null });
    expect(d.strip.ai).toBeNull();
  });
  it('zero trades', () => {
    const d = queryLog(base([]), Q(), NOW);
    expect(d.rows).toEqual([]);
    expect(d.summary).toBeNull();
    expect(d.strip.days).toEqual([]);
    expect(bigLossOf([])).toBeNull();
    expect(summarize([], true)).toBeNull();
  });
});

describe('daily strip AI line', () => {
  it('names the rule most of the worst days share, and only then', () => {
    const b = base(genTrades({ n: 400 }));
    const rows = queryLog(b, Q({ limit: 200 }), NOW);
    const s = strip(b.rows, new Set(rows.rows.map(r => r.day)), true);
    expect(s.days.length).toBeGreaterThan(10);
    if (s.ai) {
      const m = s.ai.text.match(/^(\d+) of your (\d+) worst days had a trade /)!;
      expect(Number(m[1])).toBeGreaterThanOrEqual(Math.ceil(Number(m[2]) / 2));
    }
    expect(strip(b.rows, new Set(), false).ai).toBeNull();
  });
});

describe('trade detail', () => {
  it('reasons match the row flags and similar trades exclude the trade', () => {
    const T = genTrades({ n: 250 });
    const b = base(T);
    const flagged = b.rows.find(r => r.flags.length >= 2)!;
    const d = tradeDetail(b, flagged.id)!;
    expect(d.reasons.map(x => x.key)).toEqual(flagged.flags.map(f => f.key));
    expect(d.reasons.every(x => x.detail.length > 0)).toBe(true);
    expect(d.similar).not.toBeNull();
    expect(d.similar!.ids).not.toContain(flagged.id);
    expect(d.similar!.results.length).toBeLessThanOrEqual(12);
    expect(d.balanceBefore).toBeGreaterThan(0);
    expect(tradeDetail(b, 'nope')).toBeNull();
  });
});

describe('price paths', () => {
  const row = { id: 'x', openTime: Date.UTC(2026, 10, 13, 14), closeTime: Date.UTC(2026, 10, 13, 16), entry: 100, exit: 103, sl: 98, tp: null };
  const bars = Array.from({ length: 30 }, (_, i) => ({ openTime: row.openTime - 15 * 60_000 + i * 5 * 60_000, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100 + i * 0.1 }));
  it('picks the finest timeframe within 90 bars', () => {
    expect(pathTf(0, 30 * 60_000).tf).toBe('1m');
    expect(pathTf(0, 2 * 3_600_000).tf).toBe('5m');
    expect(pathTf(0, 3 * 86_400_000).tf).toBe('1h');
    expect(pathTf(0, 400 * 86_400_000).tf).toBe('1d');
  });
  it('runs entry → bars → exit and keeps sl/tp', () => {
    const p = buildPath(row, bars, { tf: '5m', ms: 300_000 })!;
    expect(p.points[0]).toBe(100);
    expect(p.points.at(-1)).toBe(103);
    expect(p.points.length).toBeLessThanOrEqual(48);
    expect(p.sl).toBe(98);
    expect(p.lo).toBeCloseTo(99.3); // first bar that overlaps the trade
  });
  it('refuses candles from a different instrument or outside the trade', () => {
    expect(buildPath(row, bars.map(b => ({ ...b, high: b.high * 10, low: b.low * 10, close: b.close * 10 })), { tf: '5m', ms: 300_000 })).toBeNull();
    expect(buildPath(row, [], { tf: '5m', ms: 300_000 })).toBeNull();
    expect(buildPath({ ...row, closeTime: null }, bars, { tf: '5m', ms: 300_000 })).toBeNull();
  });
});

describe('performance', () => {
  it('5,000 trades: build once, then filter + page fast', () => {
    const T = genTrades({ n: 5000, seed: 11 });
    const t0 = performance.now();
    const b = base(T);
    const t1 = performance.now();
    const d = queryLog(b, Q({ rule: 'any', sort: 'net' }), NOW);
    const t2 = performance.now();
    expect(d.rows).toHaveLength(50);
    expect(t1 - t0).toBeLessThan(3000);
    expect(t2 - t1).toBeLessThan(300);
  });
});
