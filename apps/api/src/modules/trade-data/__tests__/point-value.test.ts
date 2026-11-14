import { describe, expect, it } from 'vitest';
import { learnedValue, marketKey, pointValues, specPointValueUsd, standardSpec, tradePointValue } from '../point-value.js';
import { MON, H, pos } from './fixtures.js';

describe('symbols and specs', () => {
  it('normalises broker names', () => {
    expect(marketKey('XAUUSD.m')).toBe('XAUUSD');
    expect(marketKey('XAUUSDm')).toBe('XAUUSD');
    expect(marketKey('GOLD')).toBe('XAUUSD');
    expect(marketKey('BTCUSDT')).toBe('BTCUSD');
  });
  it('only broker-independent specs', () => {
    expect(standardSpec('EURUSD')).toMatchObject({ kind: 'fx', contractSize: 100_000 });
    expect(standardSpec('XAUUSD')).toMatchObject({ kind: 'metal', contractSize: 100 });
    expect(standardSpec('NAS100')).toBeNull();
    expect(specPointValueUsd('EURUSD', 1.08)).toBe(100_000);
    expect(specPointValueUsd('USDJPY', 150)).toBeCloseTo(666.67, 1);
    expect(specPointValueUsd('EURGBP', 0.85)).toBeNull(); // needs a GBP rate
  });
});

describe('value per point', () => {
  it('own fills, then learned per symbol, then the spec (USD accounts only)', () => {
    expect(tradePointValue(pos({ open: MON, net: 50 }))).toBeCloseTo(100);
    expect(learnedValue([100, 101])).toBeCloseTo(100.5);
    expect(learnedValue([100, 300])).toBeNull();
    const a = pos({ open: MON, net: 50 }), b = pos({ open: MON + H, net: -20 });
    const flat = pos({ open: MON + 2 * H, net: 0 }); // no move: own value unknown
    const eur = pos({ open: MON, symbol: 'EURUSD', net: 0, entry: 1.08 });
    const nas = pos({ open: MON, symbol: 'NAS100', net: 0, entry: 20000 });
    const pv = pointValues([a, b, flat, eur, nas], 'USD');
    expect(pv.get(a.positionId)).toEqual({ value: expect.closeTo(100, 6), source: 'trade' });
    expect(pv.get(flat.positionId)?.source).toBe('symbol');
    expect(pv.get(eur.positionId)).toEqual({ value: 100_000, source: 'spec' });
    expect(pv.get(nas.positionId)).toBeUndefined();
    expect(pointValues([eur], 'EUR').get(eur.positionId)).toBeUndefined();
  });
});
