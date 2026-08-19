import { describe, it, expect } from 'vitest';
import { sma, ema, rsi, swingPoints, clusterLevels, classifyTrend } from '../indicators.js';
import { fromCloses, ramp } from './fixtures.js';

describe('sma', () => {
  it('averages the last `period` values', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([2, 4, 6], 2)).toBe(5); // last two: (4+6)/2
  });
  it('returns null when too short or period invalid', () => {
    expect(sma([1, 2], 5)).toBeNull();
    expect(sma([1, 2, 3], 0)).toBeNull();
  });
  it('rejects non-finite values', () => {
    expect(sma([1, NaN, 3], 3)).toBeNull();
  });
});

describe('ema', () => {
  it('equals a flat series value', () => {
    expect(ema([5, 5, 5, 5, 5], 3)).toBeCloseTo(5, 6);
  });
  it('tracks toward the latest value on a rising series', () => {
    const e = ema([1, 2, 3, 4, 5, 6, 7, 8], 3)!;
    // EMA lags price but sits between the seed and the last close.
    expect(e).toBeGreaterThan(4);
    expect(e).toBeLessThan(8);
  });
  it('returns null when too short', () => {
    expect(ema([1, 2], 5)).toBeNull();
  });
});

describe('rsi', () => {
  it('is 100 for a strictly rising series (no losses)', () => {
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)).toBe(100);
  });
  it('is low for a strictly falling series', () => {
    const v = rsi([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 14)!;
    expect(v).toBeLessThan(5);
  });
  it('is ~50 for an alternating series', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const v = rsi(closes, 14)!;
    expect(v).toBeGreaterThan(35);
    expect(v).toBeLessThan(65);
  });
  it('returns null when too short', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });
});

describe('swingPoints', () => {
  it('finds a local high and low', () => {
    // peak at index 3 (value 5), trough at index 6 (value 0)
    const candles = fromCloses([1, 2, 3, 5, 3, 2, 0, 2, 3], 0.01);
    const pts = swingPoints(candles, 2);
    const highs = pts.filter((p) => p.kind === 'high').map((p) => p.index);
    const lows = pts.filter((p) => p.kind === 'low').map((p) => p.index);
    expect(highs).toContain(3);
    expect(lows).toContain(6);
  });
  it('returns [] on a too-short series', () => {
    expect(swingPoints(fromCloses([1, 2, 3]), 2)).toEqual([]);
  });
});

describe('clusterLevels', () => {
  it('merges nearby swings and counts strength', () => {
    const pts = [
      { index: 1, price: 100, kind: 'high' as const },
      { index: 5, price: 100.1, kind: 'high' as const },
      { index: 9, price: 120, kind: 'high' as const },
    ];
    const levels = clusterLevels(pts, 0.01);
    expect(levels).toHaveLength(2);
    const near100 = levels.find((l) => Math.abs(l.price - 100) < 1)!;
    expect(near100.strength).toBe(2); // the two ~100 swings merged
  });
  it('returns [] for no points', () => {
    expect(clusterLevels([], 0.01)).toEqual([]);
  });
});

describe('classifyTrend', () => {
  it('calls an uptrend when ema20>ema50 and price above', () => {
    expect(classifyTrend(110, 108, 100)).toBe('up');
  });
  it('calls a downtrend when ema20<ema50 and price below', () => {
    expect(classifyTrend(90, 92, 100)).toBe('down');
  });
  it('calls range when EMAs are tightly stacked', () => {
    expect(classifyTrend(100, 100.05, 100)).toBe('range');
  });
  it('a real rising ramp classifies as up via its own EMAs', () => {
    const closes = ramp(80, 100, 1).map((c) => c.close);
    const e20 = ema(closes, 20)!;
    const e50 = ema(closes, 50)!;
    expect(classifyTrend(closes[closes.length - 1]!, e20, e50)).toBe('up');
  });
});
