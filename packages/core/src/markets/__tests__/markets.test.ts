import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { altcoinSeason, annualisedFunding, breadth, correlation, correlationMatrix, dailyReturns, returnOver, returnYtd, sectorOf, squeezeOf, symbolStats } from '../index.js';

const DAY = 86_400_000;
const day0 = Date.UTC(2026, 6, 1);
const daily = (closes: number[], start = day0): Candle[] => closes.map((c, i) => ({ openTime: start + i * DAY, open: c, high: c, low: c, close: c, volume: 1 }));

describe('sectors', () => {
  it('maps known coins and buckets the rest as Other', () => {
    expect(sectorOf('btc')).toBe('Store of value');
    expect(sectorOf('SOL')).toBe('Smart-contract L1');
    expect(sectorOf('PEPE')).toBe('Meme');
    expect(sectorOf('FET')).toBe('AI');
    expect(sectorOf('UNKNOWNCOIN')).toBe('Other');
  });
});

describe('returns', () => {
  it('works out 7/30/90 day and year-to-date changes', () => {
    const c = daily(Array.from({ length: 120 }, (_, i) => 100 + i));
    expect(returnOver(c, 7)).toBeCloseTo((219 / 212 - 1) * 100);
    expect(returnOver(c, 200)).toBeNull();
    // Starts 1 Jul 2026, so there is no close from the previous year.
    expect(returnYtd(c)).toBeNull();
    const span = daily([100, 110, 121], Date.UTC(2025, 11, 31));
    expect(returnYtd(span)).toBeCloseTo(21);
    expect(dailyReturns([100, 110, 99])).toEqual([0.10000000000000009, -0.09999999999999998]);
  });
});

describe('symbol stats', () => {
  it('measures volatility, drawdown, up days and beta against a benchmark', () => {
    // Alternating +2 % / -1 %: up two days in three.
    const closes = [100];
    for (let i = 1; i < 120; i++) closes.push(closes[i - 1]! * (i % 3 === 0 ? 0.99 : 1.02));
    const btc = daily(closes);
    // Twice as jumpy, same days: beta about 2, correlation 1.
    const alt = daily(closes.map((c, i) => (i === 0 ? 100 : 0)).reduce<number[]>((acc, _, i) => { acc.push(i === 0 ? 100 : acc[i - 1]! * (1 + 2 * (closes[i]! / closes[i - 1]! - 1))); return acc; }, []));
    const s = symbolStats(alt, btc);
    expect(s.beta90!).toBeCloseTo(2, 5);
    expect(s.corr90!).toBeCloseTo(1, 5);
    expect(s.upDayRatio90!).toBeCloseTo(2 / 3, 1);
    expect(s.maxDrawdown90!).toBeCloseTo(-2, 0); // the worst fall is one -2 % day
    expect(s.realisedVol30!).toBeGreaterThan(0);
    expect(s.returns.d7).not.toBeNull();
  });
  it('drawdown runs peak to trough', () => {
    expect(symbolStats(daily([100, 120, 90, 110, 80, 100])).maxDrawdown90).toBeCloseTo(-33.33, 1);
  });
  it('says nothing without enough history', () => {
    const s = symbolStats(daily([100, 101, 102]));
    expect(s).toMatchObject({ realisedVol30: null, upDayRatio90: null, beta90: null, corr90: null, returns: { d7: null, d30: null, d90: null } });
  });
});

describe('correlation', () => {
  it('is 1 for moves in step, -1 for opposite moves, null when too short', () => {
    const a = Array.from({ length: 30 }, (_, i) => Math.sin(i));
    expect(correlation(a, a.map((x) => 2 * x + 1))).toBeCloseTo(1);
    expect(correlation(a, a.map((x) => -x))).toBeCloseTo(-1);
    expect(correlation([1, 2], [2, 3])).toBeNull();
  });
  it('lines up days before comparing', () => {
    const x = daily(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5));
    const y = x.filter((_, i) => i % 7 !== 3); // missing days
    const m = correlationMatrix([x, y]);
    expect(m[0]![0]).toBe(1);
    expect(m[0]![1]!).toBeCloseTo(1, 5);
  });
});

describe('altcoin season and breadth', () => {
  it('counts alts beating BTC', () => {
    const alts = Array.from({ length: 20 }, (_, i) => i * 5); // 0..95
    expect(altcoinSeason(alts, 10)).toMatchObject({ index: 85, label: 'altcoin season', counted: 20 });
    expect(altcoinSeason(alts, 90)).toMatchObject({ index: 5, label: 'bitcoin season' });
    expect(altcoinSeason([1, 2], 0).index).toBeNull();
  });
  it('splits advancers and decliners', () => {
    expect(breadth([2, -1, 0.05, 5, -3])).toMatchObject({ up: 2, down: 2, flat: 1, advanceRatio: 0.5, medianChange: 0.05 });
  });
});

describe('derivatives reads', () => {
  it('names squeezes and builds from price and open interest together', () => {
    expect(squeezeOf(6, -8)).toBe('short_squeeze');
    expect(squeezeOf(-6, -8)).toBe('long_squeeze');
    expect(squeezeOf(-6, 8)).toBe('short_build');
    expect(squeezeOf(6, 8)).toBe('long_build');
    expect(squeezeOf(1, -20)).toBeNull();
    expect(squeezeOf(null, 5)).toBeNull();
    expect(annualisedFunding(0.01)).toBeCloseTo(10.95);
    expect(annualisedFunding(0.01, 4)).toBeCloseTo(21.9);
  });
});
