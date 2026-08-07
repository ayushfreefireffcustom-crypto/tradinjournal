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

describe('averageBiasScore', () => {
  it('averages finite scores only', () => {
    expect(averageBiasScore([])).toBeNull();
    expect(averageBiasScore([{ score: 40 }, { score: 60 }])).toBe(50);
    expect(averageBiasScore([{ score: Number.NaN }, { score: 80 }])).toBe(80);
  });
});
