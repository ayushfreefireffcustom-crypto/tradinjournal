import { describe, expect, it } from 'vitest';
import { fmtCompact, fmtDuration, fmtNum, fmtPct, fmtUnknown, fmtUsd, fmtUsdCompact, pnlClass, UNKNOWN } from './format';

describe('fmtUsd', () => {
  it('groups, keeps cents and uses a real minus', () => {
    expect(fmtUsd(1284.5)).toBe('$1,284.50');
    expect(fmtUsd(-118.2)).toBe('−$118.20');
    expect(fmtUsd(1284, { digits: 0 })).toBe('$1,284');
    expect(fmtUsd(12.5, { minDigits: 0 })).toBe('$12.5');
  });
  it('signs gains only when asked, and never signs a zero', () => {
    expect(fmtUsd(1284, { digits: 0, signed: true })).toBe('+$1,284');
    expect([fmtUsd(0, { signed: true }), fmtUsd(-0.004), fmtUsd(-0.4, { digits: 0 }), fmtUsd(0.3, { digits: 0, signed: true })]).toEqual(['$0.00', '$0.00', '$0', '$0']);
  });
  it('shows a missing value as a dash, never $0', () => {
    for (const v of [null, undefined, NaN, Infinity]) expect(fmtUsd(v as number)).toBe(UNKNOWN);
  });
});

describe('fmtUsdCompact', () => {
  it('picks the unit after rounding', () => {
    expect([fmtUsdCompact(25000), fmtUsdCompact(1500), fmtUsdCompact(-300), fmtUsdCompact(2_400_000)]).toEqual(['$25k', '$1.5k', '−$300', '$2.4M']);
    expect([fmtUsdCompact(-0.4), fmtUsdCompact(999.6), fmtUsdCompact(9960), fmtUsdCompact(-999_600), fmtUsdCompact(1_100_000_000)]).toEqual(['$0', '$1.0k', '$10k', '−$1.0M', '$1.10B']);
    expect(fmtUsdCompact(1500, { signed: true })).toBe('+$1.5k');
    expect(fmtUsdCompact(null)).toBe(UNKNOWN);
  });
});

describe('fmtPct', () => {
  it('takes a percent by default and a ratio when asked', () => {
    expect(fmtPct(12.34)).toBe('12.3%');
    expect(fmtPct(0.1234, { ratio: true })).toBe('12.3%');
    expect(fmtPct(-3.456, { digits: 2 })).toBe('−3.46%');
  });
  it('signs only what shows as non-zero', () => {
    expect([fmtPct(1.2, { signed: true }), fmtPct(0.04, { signed: true }), fmtPct(-0.04, { signed: true }), fmtPct(-0.06, { signed: true })]).toEqual(['+1.2%', '0.0%', '0.0%', '−0.1%']);
    expect(fmtPct(undefined)).toBe(UNKNOWN);
  });
});

describe('fmtNum and fmtCompact', () => {
  it('drops trailing zeros unless asked to keep them', () => {
    expect([fmtNum(1284.5), fmtNum(2), fmtNum(2, { minDigits: 2 }), fmtNum(-0.25), fmtNum(-0.001), fmtNum(3, { signed: true })]).toEqual(['1,284.5', '2', '2.00', '−0.25', '0', '+3']);
  });
  it('shortens big counts', () => {
    expect([fmtCompact(950), fmtCompact(1234), fmtCompact(3_400_000), fmtCompact(1_100_000_000), fmtCompact(-2500), fmtCompact(-0.2)]).toEqual(['950', '1.2K', '3.40M', '1.10B', '−2.5K', '0']);
    expect(fmtCompact(NaN)).toBe(UNKNOWN);
  });
});

describe('fmtDuration', () => {
  it('reads like a person would say it', () => {
    expect([fmtDuration(45), fmtDuration(2880), fmtDuration(7800), fmtDuration(3600), fmtDuration(97200), fmtDuration(86400), fmtDuration(null)]).toEqual(['45s', '48m', '2h 10m', '1h', '1d 3h', '1d', UNKNOWN]);
  });
});

describe('pnlClass and fmtUnknown', () => {
  it('colours by sign, muted when flat or unknown', () => {
    expect([pnlClass(5), pnlClass(-0.01), pnlClass(0), pnlClass(1e-12), pnlClass(null), pnlClass(NaN)]).toEqual(['pos', 'neg', 'flat', 'flat', 'flat', 'flat']);
  });
  it('wraps any formatter', () => {
    expect(fmtUnknown<number>(null, (x) => `${x}`)).toBe(UNKNOWN);
    expect(fmtUnknown(3, (x) => `${x} trades`)).toBe('3 trades');
  });
});
