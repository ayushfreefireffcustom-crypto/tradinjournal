import { describe, expect, it } from 'vitest';
import { shouldPromoteLgbm } from '../model-gate.js';

const win = {
  sampleSize: 220,
  lgbmAuc: 0.62,
  logisticAuc: 0.55,
  lgbmBrier: 0.18,
  logisticBrier: 0.22,
};

describe('shouldPromoteLgbm', () => {
  it('does not serve a model that fails sample, AUC, or Brier gates', () => {
    expect(shouldPromoteLgbm({ ...win, sampleSize: 40 }).promote).toBe(false);
    expect(shouldPromoteLgbm({ ...win, lgbmAuc: 0.56 }).promote).toBe(false);
    expect(shouldPromoteLgbm({ ...win, lgbmBrier: 0.25 }).promote).toBe(false);
    expect(shouldPromoteLgbm({ ...win, logisticBrier: null }).promote).toBe(false);
  });

  it('promotes only when both ranking and calibration beat the champion', () => {
    const d = shouldPromoteLgbm(win);
    expect(d.promote).toBe(true);
    expect(d.reason).toMatch(/beat logistic/);
  });
});
