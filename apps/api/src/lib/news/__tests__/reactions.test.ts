import { describe, it, expect } from 'vitest';
import { yahooPoints, trimSince, WATCH, BARS } from '../reactions.js';

describe('reactions', () => {
  it('serves the scoreboard watch set first', () => {
    expect(WATCH.slice(0, 9).map(w => w.key)).toEqual(['US10Y', 'DXY', 'EURUSD', 'XAUUSD', 'US500', 'US100', 'BTCUSD', 'ETHUSD', 'WTI']);
    expect(WATCH.find(w => w.key === 'US10Y')!.unit).toBe('bp');
    expect(WATCH.find(w => w.key === 'XAUUSD')!.sym).toBe('GC=F');
  });

  it('parses a Yahoo chart body, dropping null bars', () => {
    const pts = yahooPoints({ chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [10, null, 12] }] } }] } });
    expect(pts).toEqual([[1000, 10], [3000, 12]]);
    expect(yahooPoints({})).toEqual([]);
  });

  it('keeps only the last BARS points', () => {
    const n = BARS + 50;
    const pts = yahooPoints({ chart: { result: [{ timestamp: Array.from({ length: n }, (_, i) => i), indicators: { quote: [{ close: Array.from({ length: n }, () => 1) }] } }] } });
    expect(pts.length).toBe(BARS);
  });

  it('trims to since, keeping the last bar before it as the base', () => {
    const dto = { asOf: '', interval: '5m' as const, series: [{ key: 'DXY' as const, unit: 'pct' as const, dp: 2, points: [[1000, 1], [2000, 2], [3000, 3]] as [number, number][] }] };
    expect(trimSince(dto, new Date(2500).toISOString()).series[0]!.points).toEqual([[2000, 2], [3000, 3]]);
    expect(trimSince(dto, new Date(9000).toISOString()).series[0]!.points).toEqual([[3000, 3]]);
    expect(trimSince(dto)).toBe(dto);
  });
});
