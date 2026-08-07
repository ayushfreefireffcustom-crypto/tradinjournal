import { describe, it, expect } from 'vitest';
import { computeAtr } from '@tradinjournal/core';
import { proxyAtr } from '../atr-util.js';

describe('proxyAtr', () => {
  it('returns frac of price', () => {
    expect(proxyAtr(100, 0.01)).toBeCloseTo(1);
  });
  it('rejects bad prices', () => {
    expect(proxyAtr(0)).toBeNull();
    expect(proxyAtr(-5)).toBeNull();
    expect(proxyAtr(Number.NaN)).toBeNull();
  });
});

describe('computeAtr sanity with kline-like bars', () => {
  it('ATR stays below typical high-low range sum', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({
      high: 100 + i + 1,
      low: 100 + i - 1,
      close: 100 + i,
    }));
    const atr = computeAtr(bars, 14);
    expect(atr).not.toBeNull();
    expect(atr!).toBeLessThan(10);
    expect(atr!).toBeGreaterThan(0);
  });
});
