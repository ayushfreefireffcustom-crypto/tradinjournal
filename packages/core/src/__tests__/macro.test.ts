import { describe, it, expect } from 'vitest';
import { ENGINE_VER, MACRO_ASSETS, scoreAsset } from '../macro/index.js';

describe('macro confluence engine (stub)', () => {
  it('exposes a stamped ENGINE_VER', () => {
    expect(ENGINE_VER).toMatch(/^macro-/);
  });

  it('lists the MVP assets', () => {
    expect([...MACRO_ASSETS]).toEqual(['BTC', 'XAU', 'SPX', 'DXY']);
  });

  it('scoreAsset returns a valid bias shape within 0–100', () => {
    for (const asset of MACRO_ASSETS) {
      const r = scoreAsset(asset);
      expect(r.asset).toBe(asset);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(['BULLISH', 'NEUTRAL', 'BEARISH']).toContain(r.label);
      expect(Array.isArray(r.supporting)).toBe(true);
      expect(Array.isArray(r.opposing)).toBe(true);
    }
  });
});
