// Insights with trade data (trade-data module): R from the stop at entry, stop
// moves and MAE/MFE switch widgets on only when enough trades carry them.
import { describe, expect, it } from 'vitest';
import { computeDashboard, findLeaks, tradeContext, type InsightTrade } from '../compute.js';
import { computeAnalytics } from '../analytics-compute.js';
import { buildBase, type TlTrade } from '../tradelog.js';
import { computeTradeReview } from '../trade-review.js';
import { pos, MON, H, D } from '../../trade-data/__tests__/fixtures.js';

let seq = 0;
function tr(p: Partial<InsightTrade> & { open: number; net: number }): InsightTrade {
  return { id: `x${++seq}`, symbol: 'XAUUSD', side: 'LONG', close: p.open + 30 * 60_000, volume: 1, r: null, mae: null, mfe: null, tags: [], ...p };
}
/** 30 trades over 15 days; every 5th widened its stop and lost. */
function book(opts: { r?: boolean; mae?: boolean; moved?: boolean }): InsightTrade[] {
  const out: InsightTrade[] = [];
  for (let i = 0; i < 30; i++) {
    const loser = i % 5 === 0;
    const net = loser ? -120 : i % 3 === 0 ? -40 : 60;
    out.push(tr({
      open: MON + Math.floor(i / 2) * D + (8 + (i % 2) * 2) * H, net,
      r: opts.r ? net / 50 : null,
      mae: opts.mae ? (net < 0 ? 80 : 20) : null, mfe: opts.mae ? (net < 0 ? 150 : 90) : null,
      stopMove: opts.moved ? (loser ? 'widened' : null) : undefined,
    }));
  }
  return out;
}
const opts = { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 10_000 };

describe('dashboard with and without trade data', () => {
  it('without it: $ widgets, no MAE scatter, no moved-stop leak or markers', () => {
    const d = computeDashboard(book({}), opts);
    expect(d.distribution?.unit).toBe('$');
    expect(d.maeMfe).toBeNull();
    expect(d.counts).toMatchObject({ withR: 0, withMae: 0 });
    expect(d.leaks.rows.some(l => l.key === 'moved-stop')).toBe(false);
    expect(d.equity!.trades.some(p => p.moved)).toBe(false);
  });
  it('with it: R distribution and rolling, MAE scatter with "green first", moved-stop leak and markers', () => {
    const T = book({ r: true, mae: true, moved: true });
    const d = computeDashboard(T, opts);
    expect(d.distribution?.unit).toBe('R');
    expect(d.kpis?.expectancyR).not.toBeNull();
    expect(d.maeMfe?.points).toHaveLength(30);
    expect(d.maeMfe?.gaveBack?.trades).toBeGreaterThan(0);
    const leak = d.leaks.rows.find(l => l.key === 'moved-stop');
    expect(leak).toMatchObject({ label: 'Moved stop', trades: 6, net: -720 });
    expect(d.equity!.trades.filter(p => p.moved)).toHaveLength(6);
  });
  it('the moved-stop leak needs widened stops (tightened ones are fine)', () => {
    const T = book({ moved: true }).map(t => (t.stopMove === 'widened' ? { ...t, stopMove: 'tightened' as const } : t));
    expect(findLeaks(T, tradeContext(T)).some(l => l.key === 'moved-stop')).toBe(false);
  });
});

describe('analytics', () => {
  it('uses R and MAE when present and offers "never widen the stop"', () => {
    const a = computeAnalytics(book({ r: true, mae: true, moved: true }), opts);
    expect(a.counts.withR).toBe(30);
    expect(a.counts.withMae).toBe(30);
    expect(JSON.stringify(a)).toContain('Never widen the stop');
    const none = computeAnalytics(book({}), opts);
    expect(JSON.stringify(none)).not.toContain('Never widen the stop');
  });
});

describe('trade log', () => {
  it('a widened stop shows as a chip field on the row; nothing without data', () => {
    const base: TlTrade = { id: '1', symbol: 'XAUUSD', side: 'LONG', status: 'CLOSED', open: MON, close: MON + H, volume: 1, entry: 2000, exit: 1990, net: -1000, gross: -1000, commission: 0, swap: 0, r: -2, holdSecs: 3600, closeComment: null };
    const b = buildBase([{ ...base, stopMove: 'widened' }, { ...base, id: '2' }], new Map(), { startingBalance: 0 });
    expect(b.rows[0]!.moved).toBe('widened');
    expect('moved' in b.rows[1]!).toBe(false);
  });
});

describe('trade review', () => {
  it('a recorded stop at entry gives the stop, risk and R; R for the history comes from extras too', () => {
    const t = pos({ open: MON, net: -250, id: '77' }); // −2.5 points on 1 lot of gold
    const extras = new Map([['77', { r: -0.5, risk: 500, stop: 1995, move: 'widened' as const }]]);
    const r = computeTradeReview({ now: MON + D, positions: [t], positionId: '77', cash: [], storedR: null, extras });
    expect(r).toMatchObject({ stop: 1995, stopFrom: 'level', risk: { r: -0.5, amount: 500 } });
  });
  it('an open position with a stop shows money at risk (no R yet)', () => {
    const t = pos({ open: MON, id: '78', open_: true });
    const r = computeTradeReview({ now: MON + H, positions: [t], positionId: '78', cash: [], storedR: null, extras: new Map([['78', { r: null, risk: 300, stop: 1997, move: null }]]) });
    expect(r).toMatchObject({ stop: 1997, risk: { r: null, amount: 300 } });
  });
  it('without trade data nothing changes', () => {
    const t = pos({ open: MON, id: '79' });
    expect(computeTradeReview({ now: MON + D, positions: [t], positionId: '79', cash: [], storedR: null })).toMatchObject({ stop: null, risk: null, stopFrom: null });
  });
});
