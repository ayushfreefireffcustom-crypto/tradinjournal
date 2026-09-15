import { describe, it, expect } from 'vitest';
import {
  trainLogistic,
  predictLogistic,
  fitIsotonic,
  applyIsotonic,
  aucScore,
  trainMetaModel,
  predictHitProbability,
} from '../meta-model.js';
import { buildMetaFeatures, META_FEATURE_NAMES } from '../meta-features.js';
import type { TechnicalFeatures } from '../types.js';

const baseFeatures: TechnicalFeatures = {
  price: 100,
  atr: 2,
  rsi: 55,
  trend: 'up',
  ema20: 101,
  ema50: 99,
  support: [],
  resistance: [],
  recentHigh: 105,
  recentLow: 95,
  bars: 120,
};

describe('logistic + isotonic', () => {
  it('learns a separable direction signal', () => {
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 80; i++) {
      const hit = i % 2 === 0 ? 1 : 0;
      X.push([hit === 1 ? 0.8 : 0.2, hit === 1 ? 0.7 : 0.3]);
      y.push(hit);
    }
    const m = trainLogistic(X, y, { epochs: 600, lr: 0.15 });
    expect(predictLogistic(m, [0.9, 0.8])).toBeGreaterThan(0.55);
    expect(predictLogistic(m, [0.1, 0.2])).toBeLessThan(0.45);
  });

  it('isotonic is non-decreasing', () => {
    const raw = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
    const labels = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1];
    const iso = fitIsotonic(raw, labels)!;
    expect(iso).toBeTruthy();
    let prev = -1;
    for (const x of [0.15, 0.35, 0.55, 0.75, 0.9]) {
      const y = applyIsotonic(iso, x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('aucScore ranks well', () => {
    expect(aucScore([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1);
    expect(aucScore([0.5, 0.5], [1, 0])).toBe(0.5);
  });
});

describe('buildMetaFeatures / trainMetaModel', () => {
  it('builds fixed-length snapshot', () => {
    const snap = buildMetaFeatures({
      direction: 'LONG',
      heuristicConfidence: 70,
      features: baseFeatures,
      lanes: [{ id: 'macro', score: 0.3, weight: 0.25, rationale: 'm' }],
      agreement: 0.8,
    });
    expect(snap.values).toHaveLength(META_FEATURE_NAMES.length);
    expect(snap.heuristicConfidence).toBe(70);
  });

  it('trains an artifact from synthetic graded rows', () => {
    const X: number[][] = [];
    const y: number[] = [];
    const asOfMs: number[] = [];
    const t0 = Date.UTC(2025, 0, 1);
    for (let i = 0; i < 60; i++) {
      const hit = i % 3 !== 0 ? 1 : 0;
      X.push([
        1,
        hit ? 0.75 : 0.4,
        0.1,
        0.2,
        0.02,
        0.5,
        hit ? 0.3 : -0.2,
        0,
        0,
        hit ? 0.8 : 0.4,
      ]);
      y.push(hit);
      asOfMs.push(t0 + i * 86400_000);
    }
    const art = trainMetaModel({ X, y, asOfMs, featureNames: [...META_FEATURE_NAMES] });
    expect(art.sampleSize).toBe(60);
    expect(art.logistic.featureCount).toBe(META_FEATURE_NAMES.length);
    const pHit = predictHitProbability(art, X[1]!);
    const pMiss = predictHitProbability(art, X[0]!);
    expect(pHit).toBeGreaterThan(0.05);
    expect(pMiss).toBeLessThan(0.95);
  });
});
