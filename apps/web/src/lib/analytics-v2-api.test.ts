import { describe, expect, it } from 'vitest';
import {
  addedBy, analyticsQuery, calendarWeeks, fmtHold, heat, monthLabel, multDomain, navText, pageCols, viewFromSearch, whatIfSteps,
  type AnaDay, type AnaWeek,
} from './analytics-v2-api';

const day = (d: string, net: number): AnaDay => ({ d, net, n: 1, wins: net > 0 ? 1 : 0, r: null });

describe('analytics v2 helpers', () => {
  it('navText formats each headline kind', () => {
    expect(navText({ view: 'overview', value: 9308, fmt: 'money', tone: 'up' })).toBe('+$9,308');
    expect(navText({ view: 'time', value: -4700, fmt: 'kmoney', tone: 'dn' })).toBe('−$4.7k');
    expect(navText({ view: 'risk', value: 0.29, fmt: 'r', tone: 'up' })).toBe('+0.29R');
    expect(navText({ view: 'performance', value: 11, den: 13, fmt: 'weeks', tone: 'flat' })).toBe('11/13 wk');
    expect(navText({ view: 'whatif', value: null, fmt: 'kmoney', tone: 'flat' })).toBe('');
    expect(navText(undefined)).toBe('');
  });

  it('viewFromSearch falls back to overview', () => {
    expect(viewFromSearch('?view=time')).toBe('time');
    expect(viewFromSearch('?view=nope')).toBe('overview');
    expect(viewFromSearch('')).toBe('overview');
  });

  it('analyticsQuery drops empty params', () => {
    expect(analyticsQuery({ accountId: 'a1', range: '90D', symbol: undefined, tag: '' })).toBe('accountId=a1&range=90D');
  });

  it('calendarWeeks fills every week from first to last, Monday first, empty weeks included', () => {
    // Wed 4 Nov, then Fri 20 Nov 2026 (week of 9 Nov has no trades)
    const days = [day('2026-11-04', 100), day('2026-11-20', -50)];
    const weeks: AnaWeek[] = [{ start: '2026-11-02', n: 1, wins: 1, net: 100 }, { start: '2026-11-16', n: 1, wins: 0, net: -50 }];
    const { rows, cols } = calendarWeeks(days, weeks);
    expect(rows).toEqual([1, 2, 3, 4, 5]);
    expect(cols.map(c => c.start)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(cols[0]!.days.map(d => d.d)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(cols[0]!.days[2]!.cell!.net).toBe(100);
    expect(cols[1]!.total).toBeNull();
    expect(cols[2]!.days[4]!.cell!.net).toBe(-50);
  });

  it('calendarWeeks adds weekend rows only when traded', () => {
    const { rows, cols } = calendarWeeks([day('2026-11-08', 10)], [{ start: '2026-11-02', n: 1, wins: 1, net: 10 }]); // Sunday
    expect(rows).toEqual([1, 2, 3, 4, 5, 0]);
    expect(cols[0]!.days.at(-1)!.d).toBe('2026-11-08');
    expect(calendarWeeks([], []).cols).toEqual([]);
  });

  it('pageCols shows the latest columns and pages back', () => {
    const c = [1, 2, 3, 4, 5, 6, 7];
    expect(pageCols(c, 3, 0)).toEqual({ shown: [5, 6, 7], back: 0, maxBack: 4 });
    expect(pageCols(c, 3, 3).shown).toEqual([2, 3, 4]);
    expect(pageCols(c, 3, 99)).toEqual({ shown: [1, 2, 3], back: 4, maxBack: 4 });
    expect(pageCols(c, 10, 0).shown).toEqual(c);
  });

  it('what-if steps add only new trades, and "on top" uses the union', () => {
    // fixes A and B share trades: A alone 100, B alone 80, together 130.
    const w = { fixes: [{ key: 'a', label: 'A', alone: 100, trades: 3 }, { key: 'b', label: 'B', alone: 80, trades: 2 }], gains: [0, 100, 80, 130], removed: [0, 3, 2, 4] };
    expect(whatIfSteps(w, 3)).toEqual([{ key: 'a', label: 'A', delta: 100, trades: 3 }, { key: 'b', label: 'B', delta: 30, trades: 1 }]);
    expect(whatIfSteps(w, 2)).toEqual([{ key: 'b', label: 'B', delta: 80, trades: 2 }]);
    expect(addedBy(w, 1, 1)).toBe(30);   // B on top of A
    expect(addedBy(w, 3, 1)).toBe(30);   // B counted after A
    expect(addedBy(w, 3, 0)).toBe(100);  // A first
    expect(addedBy(w, 0, 1)).toBe(80);
  });

  it('multDomain: shared scale covers every series and 0', () => {
    const s = [{ pts: [{ v: 0 }, { v: 500 }] }, { pts: [{ v: 0 }, { v: -200 }] }];
    expect(multDomain(s, true, 0)).toEqual([-200, 500]);
    expect(multDomain(s, false, 1)).toEqual([-200, 0]);
    expect(multDomain([{ pts: [{ v: 0 }] }], false, 0)).toEqual([-1, 1]);
  });

  it('fmtHold, heat, monthLabel', () => {
    expect(fmtHold(45 * 60_000)).toBe('45m');
    expect(fmtHold(3 * 3_600_000)).toBe('3h');
    expect(fmtHold(36 * 3_600_000)).toBe('1.5d');
    expect(heat(25, 100)).toBe(0.5);
    expect(heat(-400, 100)).toBe(1);
    expect(heat(5, 0)).toBe(0);
    expect(monthLabel('2026-08', false)).toBe('Aug');
    expect(monthLabel('2025-12', true)).toBe('Dec ’25');
  });
});
