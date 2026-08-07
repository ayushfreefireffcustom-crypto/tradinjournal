import { describe, it, expect } from 'vitest';
import { paperFillFromSignal } from '@/components/macro/paper-blotter';
import type { MacroSignal } from '@/lib/macro-api';

const base: MacroSignal = {
  asset: 'BTC',
  direction: 'LONG',
  entryLow: 100,
  entryHigh: 102,
  stop: 95,
  t1: 107,
  t2: 112,
  t3: 118,
  confidence: 60,
  rationale: 'test',
  invalidation: 'test',
  accountSize: 100000,
  qty: 10,
  asOf: '2026-08-07T00:00:00.000Z',
  engineVer: 'macro-0.1.0',
};

describe('paperFillFromSignal', () => {
  it('builds a mid-entry fill for LONG', () => {
    const f = paperFillFromSignal(base);
    expect(f).not.toBeNull();
    expect(f!.entry).toBe(101);
    expect(f!.qty).toBe(10);
    expect(f!.direction).toBe('LONG');
  });

  it('skips WAIT and null qty', () => {
    expect(paperFillFromSignal({ ...base, direction: 'WAIT' })).toBeNull();
    expect(paperFillFromSignal({ ...base, qty: null })).toBeNull();
  });
});
