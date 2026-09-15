import { describe, it, expect } from 'vitest';
import { directionFromFeatures, buildTechnicalAnalysis, reconcileTimeframes } from '../analysis.js';
import { extractFeatures } from '../features.js';
import { validateLevels } from '../guardrails.js';
import { ramp, range } from './fixtures.js';
import type { TfFeatures } from '../types.js';

const up = extractFeatures(ramp(150, 100, 0.6));
const down = extractFeatures(ramp(150, 200, -0.6));
const flat = extractFeatures(range(150, 100, 1));

describe('directionFromFeatures', () => {
  it('maps up→LONG, down→SHORT, range→WAIT', () => {
    expect(directionFromFeatures(up)).toBe('LONG');
    expect(directionFromFeatures(down)).toBe('SHORT');
    expect(directionFromFeatures(flat)).toBe('WAIT');
  });
});

describe('buildTechnicalAnalysis', () => {
  it('LONG analysis is internally valid and carries S/R + rationale', () => {
    const a = buildTechnicalAnalysis('1h', up);
    expect(a.direction).toBe('LONG');
    expect(validateLevels(a, { price: up.price, atr: up.atr }).ok).toBe(true);
    expect(a.confidence).toBeGreaterThan(0);
    expect(a.rationale).toMatch(/Not financial advice/);
    expect(a.perTimeframe[0]!.tf).toBe('1h');
  });
  it('SHORT analysis validates', () => {
    const a = buildTechnicalAnalysis('4h', down);
    expect(a.direction).toBe('SHORT');
    expect(validateLevels(a, { price: down.price, atr: down.atr }).ok).toBe(true);
  });
  it('WAIT caps confidence and still returns reference levels', () => {
    const a = buildTechnicalAnalysis('15m', flat);
    expect(a.direction).toBe('WAIT');
    expect(a.confidence).toBeLessThanOrEqual(45);
  });
});

describe('reconcileTimeframes', () => {
  it('single timeframe behaves like the direct build', () => {
    const one: TfFeatures[] = [{ tf: '1h', features: up }];
    const a = reconcileTimeframes(one);
    expect(a.direction).toBe('LONG');
    expect(a.perTimeframe).toHaveLength(1);
  });

  it('HTF sets the bias; agreeing TFs raise confidence', () => {
    const agree: TfFeatures[] = [
      { tf: '15m', features: up },
      { tf: '1h', features: up },
      { tf: '4h', features: up },
    ];
    const a = reconcileTimeframes(agree);
    expect(a.direction).toBe('LONG'); // 4h (highest) is up
    expect(validateLevels(a, { price: up.price, atr: up.atr }).ok).toBe(true);
    expect(a.perTimeframe).toHaveLength(3);
  });

  it('HTF bias wins even when a lower TF disagrees, with lower confidence', () => {
    const mixed: TfFeatures[] = [
      { tf: '15m', features: down }, // lower TF opposes
      { tf: '4h', features: up }, // higher TF = bias
    ];
    const allAgree: TfFeatures[] = [
      { tf: '15m', features: up },
      { tf: '4h', features: up },
    ];
    const m = reconcileTimeframes(mixed);
    const c = reconcileTimeframes(allAgree);
    expect(m.direction).toBe('LONG'); // follows the 4h bias
    expect(m.confidence).toBeLessThan(c.confidence); // disagreement penalised
  });

  it('a ranging higher timeframe yields WAIT', () => {
    const a = reconcileTimeframes([
      { tf: '15m', features: up },
      { tf: '4h', features: flat },
    ]);
    expect(a.direction).toBe('WAIT');
  });

  it('throws on empty input', () => {
    expect(() => reconcileTimeframes([])).toThrow();
  });
});
