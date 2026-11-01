import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { conditionWarmup, evaluateCondition, explainCondition, validateCondition, WATCH_RULES, watchRuleFor } from '../index.js';

const bars = (n: number): Candle[] => Array.from({ length: n }, (_, i) => {
  const c = 100 + 15 * Math.sin(i / 12) + (i % 5) * 0.3;
  return { openTime: i * 3_600_000, open: c - 0.2, high: c + 1, low: c - 1, close: c, volume: 100 + (i % 9) * 20 };
});

describe('watch rules', () => {
  it('are all valid conditions that evaluate on real-looking data', () => {
    const c = bars(700);
    const ids = new Set<string>();
    for (const r of WATCH_RULES) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(() => validateCondition(r.condition)).not.toThrow();
      expect(conditionWarmup(r.condition)).toBeLessThan(700);
      const e = evaluateCondition(r.condition, c);
      expect([r.id, e.left != null && e.right != null]).toEqual([r.id, true]);
      for (const t of [r.explain.what, r.explain.why, r.explain.caution]) expect(t.length).toBeGreaterThan(20);
    }
    expect(WATCH_RULES.length).toBeGreaterThanOrEqual(15);
  });
  it('recognises a catalogue rule from its condition, whatever object it came in', () => {
    const r = WATCH_RULES.find((x) => x.id === 'golden-cross')!;
    expect(watchRuleFor(JSON.parse(JSON.stringify(r.condition)))?.id).toBe('golden-cross');
    expect(watchRuleFor({ ...r.condition, operator: 'crosses_below' })?.id).toBe('death-cross');
    // Key order in params doesn't matter (JSONB reorders them).
    const bb = WATCH_RULES.find((x) => x.id === 'bb-break-up')!;
    expect(watchRuleFor({ ...bb.condition, right: { kind: 'indicator', id: 'bb', output: 'upper', params: { mult: 2, length: 20 } } })?.id).toBe('bb-break-up');
    expect(watchRuleFor({ ...r.condition, left: { ...r.condition.left, params: { length: 49 } } })).toBeUndefined();
  });
  it('explains custom rules from their indicator', () => {
    const e = explainCondition({ left: { kind: 'indicator', id: 'cci', output: 'value', params: { length: 20 } }, operator: 'crosses_below', right: { kind: 'value', value: -100 } });
    expect(e.what).toBe('Fires on the moment CCI(20) crosses below -100, checked at each bar close.');
    expect(e.why).toMatch(/Momentum oscillators/);
    expect(explainCondition(WATCH_RULES[0]!.condition)).toEqual(WATCH_RULES[0]!.explain);
  });
});
