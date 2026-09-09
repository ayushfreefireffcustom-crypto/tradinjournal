import { describe, it, expect } from 'vitest';
import { gradeAnalysis, lowestTimeframe, outcomeRMultiple, timeframeMs } from '../grade.js';
import type { Candle } from '../types.js';

function bar(openTime: number, high: number, low: number, close = (high + low) / 2): Candle {
  return { openTime, open: close, high, low, close, volume: 1 };
}

const asOf = Date.UTC(2026, 0, 1, 12, 0, 0);

describe('lowestTimeframe / timeframeMs', () => {
  it('picks the lowest TF', () => {
    expect(lowestTimeframe(['4h', '15m', '1h'])).toBe('15m');
    expect(lowestTimeframe([])).toBe('1h');
  });
  it('maps known TFs to ms', () => {
    expect(timeframeMs('15m')).toBe(15 * 60_000);
    expect(timeframeMs('1d')).toBe(24 * 60 * 60_000);
  });
});

describe('gradeAnalysis', () => {
  const longBase = {
    direction: 'LONG' as const,
    entryLow: 100,
    entryHigh: 101,
    stop: 97,
    t1: 104,
    t2: 107,
    t3: 110,
    asOfMs: asOf,
    horizonBars: 5,
  };

  it('SKIPPED for WAIT', () => {
    const r = gradeAnalysis({ ...longBase, direction: 'WAIT' }, []);
    expect(r.outcome).toBe('SKIPPED');
  });

  it('TARGET_HIT when T1 clears before stop', () => {
    const candles = [
      bar(asOf + 60_000, 102, 100),
      bar(asOf + 120_000, 104.5, 101),
    ];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBe('TARGET_HIT');
    expect(r.hitLevel).toBe('T1');
  });

  it('upgrades hitLevel when T3 clears on the hit bar', () => {
    const candles = [bar(asOf + 60_000, 111, 100)];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBe('TARGET_HIT');
    expect(r.hitLevel).toBe('T3');
  });

  it('STOP_HIT wins same-bar ambiguity', () => {
    const candles = [bar(asOf + 60_000, 105, 96)];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBe('STOP_HIT');
    expect(r.hitLevel).toBeNull();
  });

  it('EXPIRED after horizon with neither barrier', () => {
    const candles = Array.from({ length: 5 }, (_, i) =>
      bar(asOf + (i + 1) * 60_000, 102, 99),
    );
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBe('EXPIRED');
    expect(r.barsUsed).toBe(5);
  });

  it('returns null outcome while still inside horizon', () => {
    const candles = [bar(asOf + 60_000, 102, 99)];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBeNull();
    expect(r.barsUsed).toBe(1);
  });

  it('ignores candles at or before asOf', () => {
    const candles = [
      bar(asOf, 120, 90), // should be ignored
      bar(asOf + 60_000, 102, 99),
    ];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBeNull();
    expect(r.barsUsed).toBe(1);
  });

  it('grades SHORT symmetrically', () => {
    const short = {
      direction: 'SHORT' as const,
      entryLow: 99,
      entryHigh: 100,
      stop: 103,
      t1: 96,
      t2: 93,
      t3: 90,
      asOfMs: asOf,
      horizonBars: 5,
    };
    const hit = gradeAnalysis(short, [bar(asOf + 60_000, 100, 95.5)]);
    expect(hit.outcome).toBe('TARGET_HIT');
    expect(hit.hitLevel).toBe('T1');

    const stop = gradeAnalysis(short, [bar(asOf + 60_000, 104, 99)]);
    expect(stop.outcome).toBe('STOP_HIT');
  });

  it('tracks MFE / MAE', () => {
    const candles = [
      bar(asOf + 60_000, 103, 98), // fav ~2.5%, adv ~2.5% from mid 100.5
      bar(asOf + 120_000, 104.2, 99),
    ];
    const r = gradeAnalysis(longBase, candles);
    expect(r.outcome).toBe('TARGET_HIT');
    expect(r.mfePct).toBeGreaterThan(0);
    expect(r.maePct).toBeGreaterThan(0);
  });
});

describe('outcomeRMultiple', () => {
  it('maps outcomes to R', () => {
    expect(outcomeRMultiple('STOP_HIT', null)).toBe(-1);
    expect(outcomeRMultiple('TARGET_HIT', 'T1')).toBe(1);
    expect(outcomeRMultiple('TARGET_HIT', 'T3')).toBe(3.2);
    expect(outcomeRMultiple('EXPIRED', null)).toBe(0);
    expect(outcomeRMultiple('SKIPPED', null)).toBeNull();
  });
});
