import { describe, it, expect } from 'vitest';
import { validateLevels } from '../guardrails.js';
import { deriveLevels } from '../levels.js';
import type { AnalysisLevels } from '../types.js';

const ctx = { price: 100, atr: 2 };

describe('validateLevels — accepts good sets', () => {
  it('accepts engine-derived LONG levels', () => {
    const lv = deriveLevels({ price: 100, atr: 2, direction: 'LONG', support: [], resistance: [] });
    expect(validateLevels(lv, ctx).ok).toBe(true);
  });
  it('accepts engine-derived SHORT levels', () => {
    const lv = deriveLevels({ price: 100, atr: 2, direction: 'SHORT', support: [], resistance: [] });
    expect(validateLevels(lv, ctx).ok).toBe(true);
  });
  it('accepts WAIT reference levels regardless of tradability', () => {
    const lv: AnalysisLevels = { direction: 'WAIT', entryLow: 99, entryHigh: 101, stop: 98, t1: 102, t2: 103, t3: 104 };
    expect(validateLevels(lv, ctx).ok).toBe(true);
  });
});

describe('validateLevels — rejects bad sets (this is the hallucination gate)', () => {
  it('rejects a LONG with the stop on the wrong side', () => {
    const bad: AnalysisLevels = { direction: 'LONG', entryLow: 99, entryHigh: 101, stop: 105, t1: 103, t2: 104, t3: 106 };
    const r = validateLevels(bad, ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/stop not below/);
  });
  it('rejects unordered LONG targets', () => {
    const bad: AnalysisLevels = { direction: 'LONG', entryLow: 99, entryHigh: 101, stop: 98, t1: 104, t2: 103, t3: 105 };
    expect(validateLevels(bad, ctx).ok).toBe(false);
  });
  it('rejects a SHORT with ascending targets', () => {
    const bad: AnalysisLevels = { direction: 'SHORT', entryLow: 99, entryHigh: 101, stop: 103, t1: 98, t2: 99, t3: 97 };
    expect(validateLevels(bad, ctx).ok).toBe(false);
  });
  it('rejects an entry that drifts far from price', () => {
    const bad: AnalysisLevels = { direction: 'LONG', entryLow: 109, entryHigh: 111, stop: 108, t1: 112, t2: 113, t3: 114 };
    const r = validateLevels(bad, ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/drifts too far/);
  });
  it('rejects non-finite or non-positive levels', () => {
    const bad: AnalysisLevels = { direction: 'LONG', entryLow: NaN, entryHigh: 101, stop: 98, t1: 102, t2: 103, t3: 104 };
    expect(validateLevels(bad, ctx).ok).toBe(false);
    const neg: AnalysisLevels = { direction: 'LONG', entryLow: -1, entryHigh: 101, stop: 98, t1: 102, t2: 103, t3: 104 };
    expect(validateLevels(neg, ctx).ok).toBe(false);
  });
  it('rejects a too-tight R:R below the floor', () => {
    // risk = 3 (100→97), T1 only +1 → R:R 0.33 < 0.9
    const bad: AnalysisLevels = { direction: 'LONG', entryLow: 99, entryHigh: 101, stop: 97, t1: 101.5, t2: 108, t3: 110 };
    const r = validateLevels(bad, ctx);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/R:R below/);
  });
});
