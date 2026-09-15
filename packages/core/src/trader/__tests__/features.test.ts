import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../features.js';
import { ramp, range, fromCloses } from './fixtures.js';

describe('extractFeatures', () => {
  it('throws only on an empty series', () => {
    expect(() => extractFeatures([])).toThrow();
  });

  it('reports an uptrend and splits S/R around price', () => {
    const f = extractFeatures(ramp(120, 100, 0.5));
    expect(f.trend).toBe('up');
    expect(f.price).toBeGreaterThan(0);
    expect(f.atr).toBeGreaterThan(0);
    // support strictly below price, resistance strictly above.
    for (const s of f.support) expect(s.price).toBeLessThan(f.price);
    for (const r of f.resistance) expect(r.price).toBeGreaterThan(f.price);
  });

  it('reports a downtrend on a falling series', () => {
    const f = extractFeatures(ramp(120, 200, -0.5));
    expect(f.trend).toBe('down');
  });

  it('reports a range on an oscillating series', () => {
    const f = extractFeatures(range(120, 100, 1));
    expect(f.trend).toBe('range');
  });

  it('falls back to a price-proxy ATR and neutral RSI on a tiny series', () => {
    const f = extractFeatures(fromCloses([100, 101]));
    expect(f.atr).toBeGreaterThan(0);
    expect(f.rsi).toBe(50); // rsi() null → neutral fallback
    expect(f.bars).toBe(2);
  });

  it('nearest support/resistance is ordered by proximity to price', () => {
    const f = extractFeatures(ramp(150, 50, 0.4));
    if (f.support.length >= 2) {
      expect(f.support[0]!.price).toBeGreaterThan(f.support[1]!.price); // nearest (highest) first
    }
    if (f.resistance.length >= 2) {
      expect(f.resistance[0]!.price).toBeLessThan(f.resistance[1]!.price); // nearest (lowest) first
    }
  });
});
