import { describe, it, expect } from 'vitest';
import {
  reconcileLanes,
  macroBiasToLane,
  flowLane,
  mapSymbolToMacroAsset,
  directionToScore,
} from '../lanes.js';

describe('mapSymbolToMacroAsset', () => {
  it('maps common symbols', () => {
    expect(mapSymbolToMacroAsset('BTCUSDT')).toBe('BTC');
    expect(mapSymbolToMacroAsset('ETHUSD')).toBe('ETH');
    expect(mapSymbolToMacroAsset('XAUUSD')).toBe('XAU');
    expect(mapSymbolToMacroAsset('EURUSD')).toBeNull();
  });
});

describe('reconcileLanes', () => {
  it('keeps technical direction when lanes agree', () => {
    const r = reconcileLanes('LONG', 70, [
      macroBiasToLane(62, 'BULLISH'),
      flowLane(0.4, 'Funding soft + CVD bid'),
    ]);
    expect(r.direction).toBe('LONG');
    expect(r.confidence).toBeGreaterThanOrEqual(55);
    expect(r.lanes.length).toBe(3);
    expect(r.agreement).toBeGreaterThan(0.5);
  });

  it('forces WAIT when macro+flow oppose a LONG', () => {
    const r = reconcileLanes('LONG', 72, [
      macroBiasToLane(28, 'BEARISH'),
      flowLane(-0.7, 'Crowded longs, funding elevated'),
    ]);
    expect(r.direction).toBe('WAIT');
    expect(r.confidence).toBeLessThanOrEqual(45);
  });

  it('never invents LONG/SHORT from WAIT technical', () => {
    const r = reconcileLanes('WAIT', 40, [
      macroBiasToLane(75, 'STRONG_BULLISH'),
      flowLane(0.8, 'Aggressive buy CVD'),
    ]);
    expect(r.direction).toBe('WAIT');
  });

  it('directionToScore is signed', () => {
    expect(directionToScore('LONG')).toBeGreaterThan(0);
    expect(directionToScore('SHORT')).toBeLessThan(0);
    expect(directionToScore('WAIT')).toBe(0);
  });
});
