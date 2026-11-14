import { describe, expect, it } from 'vitest';
import { computeExcursion, excursionMoney, excursionTf } from '../excursion.js';
import { MON, M, H, D } from './fixtures.js';

const bar = (t: number, low: number, high: number) => ({ openTime: t, low, high, close: (low + high) / 2 });

describe('timeframe', () => {
  it('1m for short trades, coarser for longer ones', () => {
    expect(excursionTf(MON, MON + 2 * H).tf).toBe('1m');
    expect(excursionTf(MON, MON + 20 * H).tf).toBe('5m');
    expect(excursionTf(MON, MON + 4 * D).tf).toBe('15m');
    expect(excursionTf(MON, MON + 15 * D).tf).toBe('1h');
    expect(excursionTf(MON, MON + 400 * D).tf).toBe('1d');
  });
});

describe('excursion', () => {
  // Long from 2000 at 10:00:30, out at 2004 at 10:05:30; 1m bars 10:00–10:06.
  const open = MON + 10 * H + 30_000, close = open + 5 * M;
  const bars = [
    bar(MON + 10 * H, 1980, 2001), // partial (before entry): its low must not count
    bar(MON + 10 * H + M, 1996, 2003),
    bar(MON + 10 * H + 2 * M, 1994, 2006),
    bar(MON + 10 * H + 3 * M, 1997, 2008),
    bar(MON + 10 * H + 4 * M, 2001, 2005),
    bar(MON + 10 * H + 5 * M, 2003, 2030), // partial (after exit): its high must not count
  ];
  it('uses bars fully inside the trade plus the fills', () => {
    expect(computeExcursion({ side: 'LONG', entry: 2000, exit: 2004, open, close }, bars, M)).toEqual({ maePrice: 6, mfePrice: 8, bars: 4 });
    expect(computeExcursion({ side: 'SHORT', entry: 2000, exit: 2004, open, close }, bars, M)).toEqual({ maePrice: 8, mfePrice: 6, bars: 4 });
  });
  it('a trade inside one bar uses its fills only', () => {
    const e = computeExcursion({ side: 'LONG', entry: 2000, exit: 1999, open: MON + 10 * H + 5_000, close: MON + 10 * H + 20_000 }, [bar(MON + 10 * H, 1990, 2010)], M);
    expect(e).toEqual({ maePrice: 1, mfePrice: 0, bars: 0 });
  });
  it('rejects another instrument and missing coverage', () => {
    expect(computeExcursion({ side: 'LONG', entry: 18000, exit: 18010, open, close }, bars, M)).toBeNull();
    expect(computeExcursion({ side: 'LONG', entry: 2000, exit: 2004, open, close }, [], M)).toBeNull();
    expect(computeExcursion({ side: 'LONG', entry: 2000, exit: 2004, open, close: open + 3 * H }, bars, M)).toBeNull(); // bars stop early
  });
  it('money needs a value per point', () => {
    expect(excursionMoney(6, 0.5, 100)).toBe(300);
    expect(excursionMoney(6, 0.5, null)).toBeNull();
  });
});
