import { describe, it, expect } from 'vitest';
import {
  groupIndicators,
  blurbFor,
  formatObsDate,
  sourceLabel,
  INDICATOR_META,
  GROUP_ORDER,
  type MacroIndicator,
} from './macro-meta';

function ind(key: string): MacroIndicator {
  return { key, label: key, value: 1, prev: 1, unit: null, source: 'fred', asOf: '2026-06-01T00:00:00.000Z' };
}

describe('groupIndicators', () => {
  it('buckets known keys into themed panels in reading order', () => {
    const groups = groupIndicators([ind('DGS10'), ind('CPIAUCSL'), ind('WALCL'), ind('DGS2')]);
    const names = groups.map(g => g.group);
    // Rates & Yield Curve precedes Inflation & Prices in GROUP_ORDER.
    expect(names.indexOf('Rates & Yield Curve')).toBeLessThan(names.indexOf('Inflation & Prices'));
    const rates = groups.find(g => g.group === 'Rates & Yield Curve');
    expect(rates?.items.map(i => i.key).sort()).toEqual(['DGS10', 'DGS2']);
  });

  it('every known indicator maps to a group in GROUP_ORDER', () => {
    for (const meta of Object.values(INDICATOR_META)) {
      expect(GROUP_ORDER).toContain(meta.group);
    }
  });

  it('keeps unknown keys visible instead of dropping them', () => {
    const groups = groupIndicators([ind('UNKNOWN_KEY')]);
    const all = groups.flatMap(g => g.items.map(i => i.key));
    expect(all).toContain('UNKNOWN_KEY');
  });
});

describe('blurbFor / sourceLabel / formatObsDate', () => {
  it('returns education copy for known keys, null otherwise', () => {
    expect(blurbFor('NET_LIQUIDITY')).toContain('Net liquidity');
    expect(blurbFor('NOPE')).toBeNull();
  });
  it('humanizes sources', () => {
    expect(sourceLabel('fred')).toBe('FRED');
    expect(sourceLabel('binance')).toBe('Binance');
    expect(sourceLabel('whatever')).toBe('WHATEVER');
  });
  it('formats an observation date', () => {
    expect(formatObsDate('2026-06-01T00:00:00.000Z')).toMatch(/2026/);
    expect(formatObsDate('bad')).toBe('—');
  });
});
