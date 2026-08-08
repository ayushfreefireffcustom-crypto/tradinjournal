import { describe, it, expect } from 'vitest';
import {
  biasTone,
  deltaPct,
  formatMacroNumber,
  formatSignedPct,
  formatScore,
  formatBiasLabel,
  formatAsOf,
  averageBiasScore,
  formatIndicatorValue,
  indicatorDelta,
  formatWhen,
  impactTone,
} from './macro-format';

describe('biasTone', () => {
  it('classifies bull / bear / neutral labels', () => {
    expect(biasTone('STRONG_BULLISH')).toBe('bull');
    expect(biasTone('MILD_BEARISH')).toBe('bear');
    expect(biasTone('NEUTRAL')).toBe('neutral');
  });
});

describe('deltaPct', () => {
  it('computes signed percent and rejects bad inputs', () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10);
    expect(deltaPct(90, 100)).toBeCloseTo(-10);
    expect(deltaPct(100, 0)).toBeNull();
    expect(deltaPct(100, null)).toBeNull();
    expect(deltaPct(Number.NaN, 1)).toBeNull();
  });
});

describe('formatMacroNumber', () => {
  it('compacts large magnitudes', () => {
    expect(formatMacroNumber(6_200_000)).toBe('6.20M');
    expect(formatMacroNumber(12_500)).toBe('12.5K');
    expect(formatMacroNumber(Number.NaN)).toBe('—');
  });
});

describe('formatSignedPct / formatScore / formatBiasLabel', () => {
  it('formats signed pct and clamps score', () => {
    expect(formatSignedPct(1.234)).toBe('+1.23%');
    expect(formatSignedPct(-0.5)).toBe('-0.50%');
    expect(formatSignedPct(null)).toBe('—');
    expect(formatScore(72.4)).toBe('72');
    expect(formatScore(150)).toBe('100');
    expect(formatBiasLabel('STRONG_BULLISH')).toBe('STRONG BULLISH');
  });
});

describe('formatAsOf', () => {
  it('renders relative time', () => {
    const now = Date.parse('2026-08-07T12:00:00.000Z');
    expect(formatAsOf('2026-08-07T11:59:30.000Z', now)).toBe('30s ago');
    expect(formatAsOf('2026-08-07T11:00:00.000Z', now)).toBe('1h ago');
    expect(formatAsOf('not-a-date', now)).toBe('—');
  });
});

describe('formatIndicatorValue', () => {
  it('scales monetary units to $T/$B and counts to M', () => {
    expect(formatIndicatorValue(6748567, 'mn $')).toBe('$6.75T'); // WALCL
    expect(formatIndicatorValue(1.45, 'bn $')).toBe('$1.45B'); // ON RRP
    expect(formatIndicatorValue(907324, 'mn $')).toBe('$907.32B'); // TGA
    expect(formatIndicatorValue(24270.599, 'bn chained 2017$')).toBe('$24.27T'); // Real GDP
    expect(formatIndicatorValue(158858, 'thousands')).toBe('158.86M'); // Payrolls
  });
  it('formats percents and indices', () => {
    expect(formatIndicatorValue(4.69, '%')).toBe('4.69%');
    expect(formatIndicatorValue(332.568, 'index')).toBe('332.6');
    expect(formatIndicatorValue(Number.NaN, '%')).toBe('—');
  });
});

describe('indicatorDelta', () => {
  it('shows rate moves in basis points', () => {
    expect(indicatorDelta(4.69, 4.63, '%')).toEqual({ text: '+6bp', dir: 1 });
    expect(indicatorDelta(4.1, 4.2, '%')).toEqual({ text: '-10bp', dir: -1 });
    expect(indicatorDelta(3.63, 3.63, '%')).toEqual({ text: '0bp', dir: 0 });
  });
  it('shows non-rate moves as signed percent', () => {
    expect(indicatorDelta(332.568, 333.979, 'index')).toEqual({ text: '-0.42%', dir: -1 });
    expect(indicatorDelta(100, null, 'index')).toBeNull();
  });
});

describe('formatWhen', () => {
  it('reads future and past', () => {
    const now = Date.parse('2026-08-07T12:00:00.000Z');
    expect(formatWhen('2026-08-07T15:00:00.000Z', now)).toBe('in 3h');
    expect(formatWhen('2026-08-09T12:00:00.000Z', now)).toBe('in 2d');
    expect(formatWhen('2026-08-07T11:55:00.000Z', now)).toBe('5m ago');
    expect(formatWhen('nope', now)).toBe('—');
  });
});

describe('impactTone', () => {
  it('maps impact strings and numeric tiers', () => {
    expect(impactTone('High')).toBe('high');
    expect(impactTone('medium')).toBe('medium');
    expect(impactTone('3')).toBe('high');
    expect(impactTone(null)).toBe('none');
  });
});

describe('averageBiasScore', () => {
  it('averages finite scores only', () => {
    expect(averageBiasScore([])).toBeNull();
    expect(averageBiasScore([{ score: 40 }, { score: 60 }])).toBe(50);
    expect(averageBiasScore([{ score: Number.NaN }, { score: 80 }])).toBe(80);
  });
});
