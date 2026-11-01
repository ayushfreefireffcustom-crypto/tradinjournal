import { describe, expect, it } from 'vitest';
import { presetRange, rangeText } from './date-presets';
import { closedInSpan, spanBounds, statsForRange } from './stats';
import type { Trade } from './api';

// Wednesday 4 November 2026, mid-afternoon local time.
const NOW = new Date(2026, 10, 4, 15, 30);

describe('date presets', () => {
  it('are calendar periods with Monday weeks', () => {
    expect(presetRange('today', NOW)).toEqual({ from: '2026-11-04', to: '2026-11-04' });
    expect(presetRange('yesterday', NOW)).toEqual({ from: '2026-11-03', to: '2026-11-03' });
    expect(presetRange('thisWeek', NOW)).toEqual({ from: '2026-11-02', to: '2026-11-04' });
    expect(presetRange('lastWeek', NOW)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(presetRange('thisMonth', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-04' });
    expect(presetRange('lastMonth', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('ytd', NOW)).toEqual({ from: '2026-01-01', to: '2026-11-04' });
    expect(presetRange('lastYear', NOW)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('handle a Sunday and a January', () => {
    const sun = new Date(2026, 10, 8, 9);
    expect(presetRange('thisWeek', sun)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(presetRange('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('read naturally', () => {
    expect(rangeText({ from: '2026-03-03', to: '2026-03-21' }, NOW)).toBe('3 Mar – 21 Mar');
    expect(rangeText({ from: '2026-11-04', to: '2026-11-04' }, NOW)).toBe('Wed, 4 Nov');
    expect(rangeText({ from: '2025-12-20', to: '2026-01-05' }, NOW)).toBe('20 Dec 2025 – 5 Jan');
    expect(rangeText({ from: '2025-01-01', to: '2025-12-31' }, NOW)).toBe('1 Jan – 31 Dec 2025');
  });
});

const trade = (closeTime: string | null, netPnl: number, status: 'OPEN' | 'CLOSED' = 'CLOSED'): Trade => ({
  positionId: closeTime ?? 'open', symbol: 'EURUSD', direction: 'LONG', status, openTime: '2026-01-01T00:00:00Z', closeTime, entryPrice: 1, exitPrice: 1, volume: 1,
  grossPnl: netPnl, commission: 0, swap: 0, netPnl, durationSecs: 60, deals: [],
});

describe('custom spans', () => {
  it('include the whole last day', () => {
    const { start, end } = spanBounds({ from: '2026-10-01', to: '2026-10-31' }, NOW.getTime());
    expect(new Date(start!)).toEqual(new Date(2026, 9, 1));
    expect(new Date(end! + 1)).toEqual(new Date(2026, 10, 1));
  });
  it('filter by close time and carry the earlier P&L into the balance', () => {
    const ts = [trade(new Date(2026, 8, 20, 12).toISOString(), 100), trade(new Date(2026, 9, 5, 12).toISOString(), 50), trade(new Date(2026, 9, 31, 23, 59).toISOString(), -20), trade(new Date(2026, 10, 2, 9).toISOString(), 70), trade(null, 0, 'OPEN')];
    const oct = { from: '2026-10-01', to: '2026-10-31' };
    expect(closedInSpan(ts, oct, NOW.getTime()).map((t) => t.netPnl)).toEqual([50, -20]);
    const s = statsForRange(ts, 1000, oct, NOW.getTime());
    expect(s.netPnl).toBe(30);
    expect(s.startingBalance).toBe(1100); // September's +100 came before the window
    expect(s.openTrades).toBe(0); // a window in the past doesn't show what's open now
    expect(statsForRange(ts, 1000, { from: '2026-11-01', to: '2026-11-04' }, NOW.getTime()).openTrades).toBe(1);
  });
});
