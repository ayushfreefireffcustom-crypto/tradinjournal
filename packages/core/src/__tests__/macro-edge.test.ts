import { describe, it, expect } from 'vitest';
import {
  scoreAsset,
  scoreAll,
  classifyRegime,
  recessionOdds,
  readFactors,
  trendDir,
  clampScore,
  labelForScore,
  ENGINE_VER,
} from '../macro/index.js';
import type { EngineInput, EngineIndicator } from '../macro/index.js';

function ind(key: string, value: number, prev: number | null): EngineIndicator {
  return { key, value, prev };
}

describe('edge cases: malformed / extreme inputs', () => {
  it('ignores NaN indicator values (treated as absent)', () => {
    const input: EngineInput = {
      indicators: [ind('VIXCLS', Number.NaN, 20), ind('CPILFESL', 310, 312)],
      markets: [],
    };
    const vix = readFactors(input).find(f => f.key === 'risk');
    expect(vix?.direction).toBe(0);
    // Still scores other factors
    expect(scoreAsset('XAU', input).score).not.toBeNaN();
  });

  it('ignores Infinity without blowing the score', () => {
    const input: EngineInput = {
      indicators: [ind('NET_LIQUIDITY', Number.POSITIVE_INFINITY, 1)],
      markets: [],
    };
    const r = scoreAsset('BTC', input);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('clamps pathological weighted sums to 0 and 100', () => {
    expect(clampScore(-1e9)).toBe(0);
    expect(clampScore(1e9)).toBe(100);
  });

  it('handles prev === value as flat (direction 0)', () => {
    expect(trendDir(100, 100)).toBe(0);
    const input: EngineInput = {
      indicators: [
        ind('CPILFESL', 310, 310),
        ind('PAYEMS', 160_000, 160_000),
        ind('UNRATE', 4.0, 4.0),
      ],
      markets: [],
    };
    expect(classifyRegime(input).label).toBe('Unclear');
  });

  it('resolves conflicting growth signals (NFP up + unemployment up) via net score', () => {
    const input: EngineInput = {
      indicators: [
        ind('PAYEMS', 161_000, 160_000), // +1
        ind('UNRATE', 4.5, 4.0), // unemployment up → growth −1 → net 0
      ],
      markets: [],
    };
    const growth = readFactors(input).find(f => f.key === 'growth');
    expect(growth?.direction).toBe(0);
  });

  it('prefers Core CPI over headline when both present', () => {
    const input: EngineInput = {
      indicators: [
        ind('CPILFESL', 310, 312), // down
        ind('CPIAUCSL', 320, 310), // up — must not win
      ],
      markets: [],
    };
    expect(readFactors(input).find(f => f.key === 'inflation')?.direction).toBe(-1);
  });

  it('falls back to DXY market change when DTWEXBGS missing', () => {
    const up: EngineInput = {
      indicators: [],
      markets: [{ symbol: 'DXY', price: 105, changePct: 0.8 }],
    };
    expect(readFactors(up).find(f => f.key === 'dollar')?.direction).toBe(1);

    const flat: EngineInput = {
      indicators: [],
      markets: [{ symbol: 'DXY', price: 105, changePct: 0.01 }],
    };
    expect(readFactors(flat).find(f => f.key === 'dollar')?.direction).toBe(0);
  });

  it('does not put flat factors into supporting/opposing', () => {
    const r = scoreAsset('SPX', {
      indicators: [ind('VIXCLS', 20, 20)],
      markets: [],
    });
    expect(r.supporting).not.toContain('Risk (VIX)');
    expect(r.opposing).not.toContain('Risk (VIX)');
  });

  it('never duplicates an asset in scoreAll', () => {
    const all = scoreAll({ indicators: [], markets: [] });
    expect(all.map(a => a.asset).sort()).toEqual([
      'BTC', 'DXY', 'ETH', 'NDX', 'OIL', 'SOL', 'SPX', 'UST', 'XAG', 'XAU',
    ]);
  });

  it('recessionOdds stays in [5, 85] even with max stress stack', () => {
    const input: EngineInput = {
      indicators: [
        ind('T10Y2Y', -1.5, -0.5),
        ind('UNRATE', 8, 5),
        ind('PAYEMS', 100_000, 160_000),
        ind('BAMLH0A0HYM2', 10, 3),
        ind('VIXCLS', 45, 20),
      ],
      markets: [],
    };
    const odds = recessionOdds(input);
    expect(odds).toBeGreaterThanOrEqual(5);
    expect(odds).toBeLessThanOrEqual(85);
  });

  it('boundary labels at exact thresholds', () => {
    expect(labelForScore(70)).toBe('STRONG_BULLISH');
    expect(labelForScore(69)).toBe('BULLISH');
    expect(labelForScore(55)).toBe('MILD_BULLISH');
    expect(labelForScore(54)).toBe('NEUTRAL');
    expect(labelForScore(46)).toBe('NEUTRAL');
    expect(labelForScore(45)).toBe('MILD_BEARISH');
    expect(labelForScore(41)).toBe('MILD_BEARISH');
    expect(labelForScore(40)).toBe('BEARISH');
    expect(labelForScore(31)).toBe('BEARISH');
    expect(labelForScore(30)).toBe('STRONG_BEARISH');
    expect(labelForScore(0)).toBe('STRONG_BEARISH');
    expect(labelForScore(100)).toBe('STRONG_BULLISH');
  });

  it('ENGINE_VER is non-empty and stable for this release', () => {
    expect(ENGINE_VER.length).toBeGreaterThan(0);
    expect(ENGINE_VER.startsWith('macro-')).toBe(true);
  });
});
