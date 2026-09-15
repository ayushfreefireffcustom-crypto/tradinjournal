import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the concrete providers so routing is tested without any network. The
// crypto check (isBinanceSymbol) is the switch between Binance and Twelve Data.
const { isBinanceSymbol } = vi.hoisted(() => ({ isBinanceSymbol: vi.fn(async () => false) }));

vi.mock('../providers/binance.js', () => ({
  createBinanceProvider: () => ({ name: 'binance', getCandles: async () => [] }),
  isBinanceSymbol,
}));
vi.mock('../providers/mt5.js', () => ({
  createMt5Provider: () => ({ name: 'mt5', getCandles: async () => [] }),
}));
vi.mock('../providers/twelvedata.js', () => ({
  createTwelveDataProvider: () => ({ name: 'twelvedata', getCandles: async () => [] }),
}));
vi.mock('../providers/yahoo.js', () => ({
  createYahooProvider: () => ({ name: 'yahoo', getCandles: async () => [] }),
}));

import { resolveProvider } from '../providers/index.js';

describe('resolveProvider routing', () => {
  beforeEach(() => isBinanceSymbol.mockReset());

  it('routes an explicit broker request to MT5 (no crypto check)', async () => {
    isBinanceSymbol.mockResolvedValue(false);
    const p = await resolveProvider('AUDCAD.z', true);
    expect(p?.name).toBe('mt5');
  });

  it('routes a Binance-listed symbol to Binance', async () => {
    isBinanceSymbol.mockResolvedValue(true);
    const p = await resolveProvider('BTCUSDT', false);
    expect(p?.name).toBe('binance');
  });

  it('non-crypto symbol falls back to the free Yahoo provider when Twelve Data is off', async () => {
    isBinanceSymbol.mockResolvedValue(false);
    const p = await resolveProvider('AAPL', false);
    expect(p?.name).toBe('yahoo');
  });
});
