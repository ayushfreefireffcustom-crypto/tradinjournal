import { describe, it, expect } from 'vitest';
import { deriveLevels } from '../levels.js';
import type { SRLevel } from '../types.js';

const noSR: { support: SRLevel[]; resistance: SRLevel[] } = { support: [], resistance: [] };

describe('deriveLevels — LONG', () => {
  const lv = deriveLevels({ price: 100, atr: 2, direction: 'LONG', ...noSR });
  it('entry brackets the price', () => {
    expect(lv.entryLow).toBeLessThan(100);
    expect(lv.entryHigh).toBeGreaterThan(100);
  });
  it('stop is below entry', () => {
    expect(lv.stop).toBeLessThan(lv.entryLow);
  });
  it('targets strictly ascend above entry', () => {
    expect(lv.t1).toBeGreaterThan(lv.entryHigh);
    expect(lv.t2).toBeGreaterThan(lv.t1);
    expect(lv.t3).toBeGreaterThan(lv.t2);
  });
});

describe('deriveLevels — SHORT', () => {
  const lv = deriveLevels({ price: 100, atr: 2, direction: 'SHORT', ...noSR });
  it('stop is above entry', () => {
    expect(lv.stop).toBeGreaterThan(lv.entryHigh);
  });
  it('targets strictly descend below entry', () => {
    expect(lv.t1).toBeLessThan(lv.entryLow);
    expect(lv.t2).toBeLessThan(lv.t1);
    expect(lv.t3).toBeLessThan(lv.t2);
  });
});

describe('deriveLevels — S/R influence', () => {
  it('uses a nearby support as the LONG stop when in-band', () => {
    // support 2.4 below price (1.2*ATR, inside [0.8,3]) → stop near it, tighter than 1.5*ATR
    const withSR = deriveLevels({
      price: 100,
      atr: 2,
      direction: 'LONG',
      support: [{ price: 97.6, label: 'swing low', strength: 3 }],
      resistance: [],
    });
    const plain = deriveLevels({ price: 100, atr: 2, direction: 'LONG', ...noSR });
    // S/R stop (~97.4) sits above the pure -1.5*ATR stop (97) → tighter risk.
    expect(withSR.stop).toBeGreaterThan(plain.stop);
    expect(withSR.stop).toBeLessThan(100);
  });

  it('ignores an out-of-band far support and uses the ATR stop', () => {
    const far = deriveLevels({
      price: 100,
      atr: 2,
      direction: 'LONG',
      support: [{ price: 80, label: 'swing low', strength: 3 }], // 10*ATR away → ignored
      resistance: [],
    });
    const plain = deriveLevels({ price: 100, atr: 2, direction: 'LONG', ...noSR });
    expect(far.stop).toBeCloseTo(plain.stop, 6);
  });
});

describe('deriveLevels — degenerate input', () => {
  it('returns WAIT/neutral on bad price or ATR', () => {
    const a = deriveLevels({ price: 0, atr: 2, direction: 'LONG', ...noSR });
    expect(a.direction).toBe('WAIT');
    const b = deriveLevels({ price: 100, atr: 0, direction: 'SHORT', ...noSR });
    expect(b.direction).toBe('WAIT');
  });
});
