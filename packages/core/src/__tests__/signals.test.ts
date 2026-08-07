import { describe, it, expect } from 'vitest';
import {
  computeAtr,
  computeSignal,
  directionFromBias,
  DEFAULT_ACCOUNT_SIZE,
  RISK_FRACTION,
  STOP_ATR_MULT,
} from '../macro/signals.js';
import type { OhlcBar } from '../macro/signals.js';
import type { BiasResult } from '../macro/types.js';

function bias(score: number, label: BiasResult['label'] = 'NEUTRAL'): BiasResult {
  return { asset: 'BTC', score, label, supporting: ['Net liquidity'], opposing: ['US dollar'] };
}

function rampBars(n: number, start = 100): OhlcBar[] {
  const out: OhlcBar[] = [];
  for (let i = 0; i < n; i++) {
    const c = start + i;
    out.push({ high: c + 2, low: c - 2, close: c });
  }
  return out;
}

describe('computeAtr', () => {
  it('returns null for empty / tiny series', () => {
    expect(computeAtr([])).toBeNull();
    expect(computeAtr([{ high: 1, low: 0.5, close: 0.8 }])).toBeNull();
  });

  it('computes a positive ATR for a ramp', () => {
    const atr = computeAtr(rampBars(30));
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it('rejects non-finite bars', () => {
    expect(computeAtr([
      { high: 1, low: 0, close: 0.5 },
      { high: Number.NaN, low: 0, close: 0.5 },
    ])).toBeNull();
  });
});

describe('directionFromBias', () => {
  it('maps score bands', () => {
    expect(directionFromBias(bias(70, 'BULLISH'))).toBe('LONG');
    expect(directionFromBias(bias(30, 'BEARISH'))).toBe('SHORT');
    expect(directionFromBias(bias(50))).toBe('WAIT');
  });

  it('lets mild trend nudge across the boundary', () => {
    expect(directionFromBias(bias(53), 1)).toBe('LONG'); // 53+3=56
    expect(directionFromBias(bias(47), -1)).toBe('SHORT'); // 47-3=44
  });
});

describe('computeSignal', () => {
  it('sizes 1% risk for LONG', () => {
    const s = computeSignal({
      asset: 'BTC',
      price: 100,
      atr: 4,
      bias: bias(65, 'BULLISH'),
    });
    expect(s.direction).toBe('LONG');
    expect(s.stop).toBeLessThan(s.entryLow);
    expect(s.t1).toBeGreaterThan(s.entryHigh);
    expect(s.t3).toBeGreaterThan(s.t2);
    expect(s.qty).not.toBeNull();
    // r = 1.5 * atr = 6; risk = 1000; qty = 1000/6
    expect(s.r).toBeCloseTo(4 * STOP_ATR_MULT, 5);
    expect(s.qty!).toBeCloseTo((DEFAULT_ACCOUNT_SIZE * RISK_FRACTION) / s.r, 3);
    expect(s.rationale.toLowerCase()).toContain('not financial advice');
  });

  it('inverts geometry for SHORT', () => {
    const s = computeSignal({
      asset: 'XAU',
      price: 2000,
      atr: 20,
      bias: bias(35, 'BEARISH'),
    });
    expect(s.direction).toBe('SHORT');
    expect(s.stop).toBeGreaterThan(s.entryHigh);
    expect(s.t1).toBeLessThan(s.entryLow);
  });

  it('WAIT has null qty and capped confidence', () => {
    const s = computeSignal({
      asset: 'SPX',
      price: 500,
      atr: 5,
      bias: bias(50),
    });
    expect(s.direction).toBe('WAIT');
    expect(s.qty).toBeNull();
    expect(s.confidence).toBeLessThanOrEqual(40);
  });

  it('handles bad price/atr safely', () => {
    const s = computeSignal({ asset: 'DXY', price: 0, atr: -1, bias: bias(80, 'BULLISH') });
    expect(s.direction).toBe('WAIT');
    expect(s.confidence).toBe(0);
    expect(s.qty).toBeNull();
  });

  it('is deterministic', () => {
    const input = { asset: 'BTC' as const, price: 65000, atr: 800, bias: bias(72, 'BULLISH') };
    expect(computeSignal(input)).toEqual(computeSignal(input));
  });
});
