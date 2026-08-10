import { describe, it, expect } from 'vitest';
import {
  ENGINE_VER,
  MACRO_ASSETS,
  scoreAsset,
  scoreAll,
  classifyRegime,
  recessionOdds,
  labelForScore,
  clampScore,
  readFactors,
  trendDir,
  FACTORS,
  SENSITIVITIES,
  SCORE_SCALE,
} from '../macro/index.js';
import type { EngineInput, EngineIndicator } from '../macro/index.js';

function ind(key: string, value: number, prev: number | null): EngineIndicator {
  return { key, value, prev };
}

/** Goldilocks-ish: growth up, inflation down, liquidity up, soft dollar, calm VIX. */
function goldilocksInput(): EngineInput {
  return {
    indicators: [
      ind('CPILFESL', 310, 312), // inflation down
      ind('PAYEMS', 160_000, 159_000), // growth up
      ind('UNRATE', 3.8, 3.9), // unemployment down → growth up
      ind('DFF', 4.3, 4.3), // flat policy
      ind('DGS10', 3.8, 4.0), // yields down
      ind('NET_LIQUIDITY', 6_200_000, 6_000_000), // liquidity up
      ind('BAMLH0A0HYM2', 3.2, 3.5), // credit stress down
      ind('VIXCLS', 14, 18), // risk down
      ind('DTWEXBGS', 120, 122), // dollar down
      ind('T10Y2Y', 0.4, 0.3),
    ],
    markets: [{ symbol: 'DXY', price: 104, changePct: -0.5 }],
  };
}

/** Stagflation-ish: growth down, inflation up, hawkish, stress. */
function stagflationInput(): EngineInput {
  return {
    indicators: [
      ind('CPILFESL', 320, 315), // inflation up
      ind('PAYEMS', 158_000, 160_000), // growth down
      ind('UNRATE', 4.5, 4.2), // unemployment up
      ind('DFF', 5.5, 5.0), // hawkish
      ind('DGS10', 5.0, 4.5),
      ind('NET_LIQUIDITY', 5_500_000, 6_000_000),
      ind('BAMLH0A0HYM2', 5.0, 4.0),
      ind('VIXCLS', 28, 20),
      ind('DTWEXBGS', 125, 120),
      ind('T10Y2Y', -0.5, -0.2),
    ],
    markets: [],
  };
}

describe('ENGINE_VER', () => {
  it('is stamped macro-0.2.x after asset expansion', () => {
    expect(ENGINE_VER).toBe('macro-0.2.0');
  });
});

describe('trendDir', () => {
  it('returns -1 / 0 / 1 from value vs prev', () => {
    expect(trendDir(2, 1)).toBe(1);
    expect(trendDir(1, 2)).toBe(-1);
    expect(trendDir(1, 1)).toBe(0);
    expect(trendDir(1, null)).toBe(0);
  });
  it('honours epsilon', () => {
    expect(trendDir(1.005, 1, 0.01)).toBe(0);
    expect(trendDir(1.02, 1, 0.01)).toBe(1);
  });
});

describe('readFactors', () => {
  it('exposes all catalogued factors', () => {
    const keys = readFactors(goldilocksInput()).map(f => f.key);
    expect(keys).toEqual(FACTORS.map(f => f.key));
  });

  it('reads goldilocks directions', () => {
    const byKey = Object.fromEntries(readFactors(goldilocksInput()).map(f => [f.key, f.direction]));
    expect(byKey.inflation).toBe(-1);
    expect(byKey.growth).toBe(1);
    expect(byKey.liquidity).toBe(1);
    expect(byKey.credit).toBe(-1);
    expect(byKey.risk).toBe(-1);
    expect(byKey.dollar).toBe(-1);
  });
});

describe('labelForScore / clampScore', () => {
  it('clamps to 0–100', () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(50.4)).toBe(50);
  });
  it('maps seven tiers', () => {
    expect(labelForScore(75)).toBe('STRONG_BULLISH');
    expect(labelForScore(65)).toBe('BULLISH');
    expect(labelForScore(56)).toBe('MILD_BULLISH');
    expect(labelForScore(50)).toBe('NEUTRAL');
    expect(labelForScore(43)).toBe('MILD_BEARISH');
    expect(labelForScore(35)).toBe('BEARISH');
    expect(labelForScore(20)).toBe('STRONG_BEARISH');
  });
});

describe('scoreAsset (deterministic)', () => {
  it('returns neutral on empty input', () => {
    for (const asset of MACRO_ASSETS) {
      const r = scoreAsset(asset, { indicators: [], markets: [] });
      expect(r.score).toBe(50);
      expect(r.label).toBe('NEUTRAL');
      expect(r.supporting).toEqual([]);
      expect(r.opposing).toEqual([]);
    }
  });

  it('is reproducible for the same input', () => {
    const input = goldilocksInput();
    const a = scoreAll(input);
    const b = scoreAll(input);
    expect(a).toEqual(b);
  });

  it('scores all MVP assets within 0–100 with evidence arrays', () => {
    for (const asset of MACRO_ASSETS) {
      const r = scoreAsset(asset, goldilocksInput());
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.supporting.length + r.opposing.length).toBeGreaterThan(0);
    }
  });

  it('boosts XAU when dollar weakens and liquidity expands (goldilocks)', () => {
    const xau = scoreAsset('XAU', goldilocksInput());
    expect(xau.score).toBeGreaterThan(50);
    expect(xau.supporting).toEqual(expect.arrayContaining(['US dollar', 'Net liquidity']));
  });

  it('hurts SPX under stagflation stress', () => {
    const spx = scoreAsset('SPX', stagflationInput());
    expect(spx.score).toBeLessThan(50);
    expect(spx.opposing.length).toBeGreaterThan(0);
  });

  it('lifts DXY when policy hawkish and risk elevated', () => {
    const dxy = scoreAsset('DXY', stagflationInput());
    expect(dxy.score).toBeGreaterThan(50);
  });

  it('every asset has a full sensitivity row', () => {
    for (const asset of MACRO_ASSETS) {
      for (const f of FACTORS) {
        expect(typeof SENSITIVITIES[asset][f.key]).toBe('number');
      }
    }
  });

  it('SCORE_SCALE is part of the stamped engine contract', () => {
    expect(SCORE_SCALE).toBe(6);
  });
});

describe('classifyRegime', () => {
  it('labels Goldilocks when growth up + inflation down', () => {
    const r = classifyRegime(goldilocksInput());
    expect(r.label).toBe('Goldilocks');
    expect(r.growth).toBe('up');
    expect(r.inflation).toBe('down');
    expect(r.recessionOdds).toBeGreaterThanOrEqual(5);
    expect(r.recessionOdds).toBeLessThanOrEqual(85);
  });

  it('labels Stagflation when growth down + inflation up', () => {
    const r = classifyRegime(stagflationInput());
    expect(r.label).toBe('Stagflation');
    expect(r.growth).toBe('down');
    expect(r.inflation).toBe('up');
  });

  it('labels Reflation when both up', () => {
    const input: EngineInput = {
      indicators: [
        ind('CPILFESL', 320, 310),
        ind('PAYEMS', 161_000, 160_000),
        ind('UNRATE', 3.7, 3.8),
      ],
      markets: [],
    };
    expect(classifyRegime(input).label).toBe('Reflation');
  });

  it('labels Deflation when both down', () => {
    const input: EngineInput = {
      indicators: [
        ind('CPILFESL', 300, 310),
        ind('PAYEMS', 158_000, 160_000),
        ind('UNRATE', 5.0, 4.5),
      ],
      markets: [],
    };
    expect(classifyRegime(input).label).toBe('Deflation');
  });

  it('labels Unclear when no growth/inflation signal', () => {
    expect(classifyRegime({ indicators: [], markets: [] }).label).toBe('Unclear');
  });
});

describe('recessionOdds', () => {
  it('rises with inverted curve + labour weakness + stress', () => {
    const calm = recessionOdds(goldilocksInput());
    const stressed = recessionOdds(stagflationInput());
    expect(stressed).toBeGreaterThan(calm);
    expect(stressed).toBeLessThanOrEqual(85);
    expect(calm).toBeGreaterThanOrEqual(5);
  });
});
