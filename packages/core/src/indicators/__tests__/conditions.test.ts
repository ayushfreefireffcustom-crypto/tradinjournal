import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { conditionWarmup, describeCondition, evaluateCondition, validateCondition, type Condition } from '../conditions.js';

const bars = (cs: number[]): Candle[] => cs.map((c, i) => ({ openTime: i * 3_600_000, open: c, high: c + 1, low: c - 1, close: c, volume: 10 }));
const price = (output = 'close') => ({ kind: 'indicator' as const, id: 'price', output });
const ema = (n: number) => ({ kind: 'indicator' as const, id: 'ema', output: 'value', params: { length: n } });
const rsi = (n = 14) => ({ kind: 'indicator' as const, id: 'rsi', output: 'value', params: { length: n } });

describe('conditions', () => {
  it('compares an indicator with a value', () => {
    const up = bars(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(evaluateCondition({ left: rsi(), operator: 'gt', right: { kind: 'value', value: 70 } }, up)).toMatchObject({ met: true, left: 100 });
    expect(evaluateCondition({ left: rsi(), operator: 'lt', right: { kind: 'value', value: 30 } }, up).met).toBe(false);
    expect(evaluateCondition({ left: price(), operator: 'gte', right: { kind: 'value', value: 139 } }, up).met).toBe(true);
    expect(evaluateCondition({ left: price(), operator: 'lte', right: { kind: 'value', value: 138.9 } }, up).met).toBe(false);
  });

  it('detects crosses only on the bar they happen', () => {
    // Flat at 100 then a jump: close crosses above EMA(5) exactly on the jump bar.
    const cs = [...new Array(20).fill(100), 110, 111];
    const cond: Condition = { left: price(), operator: 'crosses_above', right: ema(5) };
    expect(evaluateCondition(cond, bars(cs.slice(0, 20))).met).toBe(false);
    expect(evaluateCondition(cond, bars(cs.slice(0, 21))).met).toBe(true);
    expect(evaluateCondition(cond, bars(cs)).met).toBe(false); // already above: not a new cross
    const down: Condition = { left: price(), operator: 'crosses_below', right: ema(5) };
    expect(evaluateCondition(down, bars([...new Array(20).fill(100), 90])).met).toBe(true);
  });

  it('reports whether a level condition already held on the bar before', () => {
    const lt = (v: number): Condition => ({ left: price(), operator: 'lt', right: { kind: 'value', value: v } });
    const c = bars([100, 99, 98]);
    expect(evaluateCondition(lt(98.5), c)).toMatchObject({ met: true, prevMet: false });
    expect(evaluateCondition(lt(99.5), c)).toMatchObject({ met: true, prevMet: true });
    expect(evaluateCondition({ left: price(), operator: 'crosses_below', right: { kind: 'value', value: 98.5 } }, c)).toMatchObject({ met: true, prevMet: null });
  });

  it('treats equality within 0.1 %', () => {
    const c = bars(new Array(5).fill(1000));
    expect(evaluateCondition({ left: price(), operator: 'eq', right: { kind: 'value', value: 1000.9 } }, c).met).toBe(true);
    expect(evaluateCondition({ left: price(), operator: 'eq', right: { kind: 'value', value: 1001.5 } }, c).met).toBe(false);
  });

  it('says "not enough data" instead of guessing', () => {
    const short = bars([1, 2, 3]);
    expect(evaluateCondition({ left: rsi(), operator: 'gt', right: { kind: 'value', value: 50 } }, short).met).toBeNull();
    expect(evaluateCondition({ left: price(), operator: 'crosses_above', right: { kind: 'value', value: 2 } }, bars([3])).met).toBeNull();
    expect(evaluateCondition({ left: price(), operator: 'gt', right: { kind: 'value', value: 2 } }, []).met).toBeNull();
  });

  it('only lets like be compared with like', () => {
    expect(() => validateCondition({ left: price(), operator: 'gt', right: ema(50) })).not.toThrow();
    expect(() => validateCondition({ left: rsi(), operator: 'gt', right: { kind: 'indicator', id: 'mfi', output: 'value' } })).not.toThrow();
    expect(() => validateCondition({ left: { kind: 'indicator', id: 'macd', output: 'macd' }, operator: 'crosses_above', right: { kind: 'indicator', id: 'macd', output: 'signal' } })).not.toThrow();
    expect(() => validateCondition({ left: { kind: 'indicator', id: 'volume', output: 'value' }, operator: 'gt', right: { kind: 'indicator', id: 'volsma', output: 'value' } })).not.toThrow();
    expect(() => validateCondition({ left: { kind: 'indicator', id: 'obv', output: 'value' }, operator: 'gt', right: { kind: 'indicator', id: 'volume', output: 'value' } })).toThrow(/same units/);
    expect(() => validateCondition({ left: rsi(), operator: 'gt', right: ema(20) })).toThrow(/same units/);
    expect(() => validateCondition({ left: { kind: 'indicator', id: 'macd', output: 'macd' }, operator: 'gt', right: { kind: 'indicator', id: 'atr', output: 'value' } })).toThrow(/same units/);
    expect(() => validateCondition({ left: rsi(), operator: 'gt', right: { kind: 'value', value: 120 } })).toThrow(/0 to 100/);
    expect(() => validateCondition({ left: rsi(0), operator: 'gt', right: { kind: 'value', value: 50 } })).toThrow(/between 1 and 500/);
    expect(() => validateCondition({ left: { kind: 'indicator', id: 'nope', output: 'value' }, operator: 'gt', right: { kind: 'value', value: 1 } })).toThrow(/Unknown indicator/);
    expect(() => validateCondition({ left: rsi(), operator: 'between' as never, right: { kind: 'value', value: 1 } })).toThrow(/Unknown operator/);
  });

  it('reads well and knows how much history it needs', () => {
    const c: Condition = { left: ema(20), operator: 'crosses_above', right: ema(50) };
    expect(describeCondition(c, { left: 101.234, right: 100.5 })).toBe('EMA(20) crossed above EMA(50) (now 101.23 vs 100.50)');
    expect(describeCondition({ left: rsi(), operator: 'lt', right: { kind: 'value', value: 30 } }, { left: 28.44, right: 30 })).toBe('RSI(14) is below 30 (now 28.44)');
    expect(describeCondition({ left: { kind: 'indicator', id: 'bb', output: 'upper' }, operator: 'lt', right: price() })).toBe('Bollinger Bands Upper(20, 2) is below Close');
    expect(describeCondition({ left: price(), operator: 'gt', right: { kind: 'value', value: 1 } }, { left: 78062.04, right: 1 })).toBe('Close is above 1 (now 78,062)');
    expect(describeCondition(c)).toBe('EMA(20) crosses above EMA(50)');
    expect(conditionWarmup(c)).toBeGreaterThanOrEqual(150);
  });
});
