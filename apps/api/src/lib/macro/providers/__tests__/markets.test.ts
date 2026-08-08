import { describe, it, expect } from 'vitest';
import { parseBinanceBtc, parseGoldXau, parseFinnhubSpy, parseErApiDxy } from '../markets-parse.js';

describe('parseBinanceBtc', () => {
  it('maps lastPrice + priceChangePercent', () => {
    const q = parseBinanceBtc({ lastPrice: '65000.5', priceChangePercent: '1.25' });
    expect(q).toMatchObject({ symbol: 'BTC', price: 65000.5, changePct: 1.25, source: 'binance' });
  });
  it('rejects non-positive prices', () => {
    expect(parseBinanceBtc({ lastPrice: '0' })).toBeNull();
    expect(parseBinanceBtc({})).toBeNull();
  });
});

describe('parseGoldXau', () => {
  it('maps price', () => {
    const q = parseGoldXau({ price: 2401.2 });
    expect(q).toMatchObject({ symbol: 'XAU', price: 2401.2, changePct: null, source: 'gold-api' });
  });
  it('rejects missing price', () => {
    expect(parseGoldXau({})).toBeNull();
  });
});

describe('parseFinnhubSpy', () => {
  it('maps current + percent change as SPX proxy', () => {
    const q = parseFinnhubSpy({ c: 520.1, dp: -0.4 });
    expect(q).toMatchObject({ symbol: 'SPX', price: 520.1, changePct: -0.4, source: 'finnhub' });
  });
});

describe('parseErApiDxy', () => {
  it('computes the ICE Dollar Index in a realistic range from USD-base rates', () => {
    const q = parseErApiDxy({
      result: 'success',
      time_last_update_unix: 1_700_000_000,
      rates: { EUR: 0.92, JPY: 150, GBP: 0.79, CAD: 1.36, SEK: 10.5, CHF: 0.88 },
    });
    expect(q).not.toBeNull();
    expect(q!.symbol).toBe('DXY');
    expect(q!.source).toBe('er-api');
    // Real DXY is roughly 80–120; the old geo-mean produced ~3.2 (a bug).
    expect(q!.price).toBeGreaterThan(80);
    expect(q!.price).toBeLessThan(130);
    expect(q!.asOf.toISOString()).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });
  it('rejects incomplete baskets', () => {
    expect(parseErApiDxy({ result: 'success', rates: { EUR: 0.92 } })).toBeNull();
    expect(parseErApiDxy({ result: 'error', rates: {} })).toBeNull();
  });
});
