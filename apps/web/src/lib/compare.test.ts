import { describe, expect, it } from 'vitest';
import type { Candle } from '@/lib/market-api';
import { compareCsv, compareSeries } from './compare';

const s = (closes: Array<[number, number]>): Candle[] => closes.map(([t, c]) => ({ openTime: t, open: c, high: c, low: c, close: c, volume: 1 }));

describe('compareSeries', () => {
  it('rebases to 0 % on the first shared bar and keeps only shared bars', () => {
    const a = s([[1, 100], [2, 110], [3, 99], [4, 121]]);
    const b = s([[2, 50], [3, 55], [4, 60]]); // starts a bar later
    const c = compareSeries([a, b]);
    expect(c.times).toEqual([2, 3, 4]);
    expect(c.pct[0]![0]).toBe(0);
    expect(c.pct[0]![2]).toBeCloseTo(10);
    expect(c.pct[1]![2]).toBeCloseTo(20);
    expect(c.stats[1]!.vsFirst!).toBeCloseTo(10);
    expect(c.stats[0]!.maxDd!).toBeCloseTo(-10);
    expect(c.stats[0]!.corrToFirst).toBe(1);
  });
  it('lines up stock bars that open at :30 with crypto bars on the hour', () => {
    const H = 3_600_000;
    const btc = s([[14 * H, 100], [15 * H, 101], [16 * H, 102], [17 * H, 103]]);
    const goog = s([[14.5 * H, 200], [15.5 * H, 210], [16.5 * H, 220]]);
    const c = compareSeries([btc, goog], H);
    expect(c.times).toEqual([14 * H, 15 * H, 16 * H]);
    expect(c.pct[1]![2]).toBeCloseTo(10);
    const D = 24 * H;
    const day = compareSeries([s([[0, 1], [D, 2]]), s([[13.5 * H, 5], [D + 13.5 * H, 10]])], D);
    expect(day.times).toEqual([0, D]);
    expect(day.pct[1]![1]).toBeCloseTo(100);
  });
  it('copes with an empty series', () => {
    const c = compareSeries([s([[1, 1]]), []]);
    expect(c.times).toEqual([]);
    expect(c.stats[1]!.ret).toBeNull();
  });
  it('writes a CSV with one column per symbol', () => {
    const c = compareSeries([s([[0, 100], [86_400_000, 105]]), s([[0, 10], [86_400_000, 9]])]);
    expect(compareCsv(['BTC', 'ETH'], c).split('\n')).toEqual(['time,BTC %,ETH %', '1970-01-01T00:00:00.000Z,0.0000,0.0000', '1970-01-02T00:00:00.000Z,5.0000,-10.0000']);
  });
});
