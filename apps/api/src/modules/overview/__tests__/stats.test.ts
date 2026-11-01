import { describe, expect, it } from 'vitest';
import { statsFor, type StatsDeps } from '../stats.service.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1, 12);
const daily = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ openTime: NOW - (n - i) * DAY + DAY - 1, open: 1, high: 1, low: 1, close: f(i), volume: 1 }));
const deps = (over: Partial<StatsDeps> = {}): StatsDeps => ({
  daily: async (s) => (s === 'BTCUSDT' ? daily(120, (i) => 100 * 1.01 ** i) : s === 'NONE' ? [] : daily(400, (i) => 50 * 1.02 ** i)),
  isCrypto: async (s) => s.endsWith('USDT'),
  volume24h: async () => 1.5e9,
  perp: async () => ({ funding: 0.01, nextFundingTime: NOW + 3600_000, fundingIntervalH: 8, oiValue: 2e9, annualised: 10.95 }),
  now: () => NOW,
  cache: false,
  ...over,
});

describe('symbol stats', () => {
  it('combines price stats, liquidity and funding for a crypto pair', async () => {
    const s = await statsFor('ethusdt', deps());
    expect(s).toMatchObject({ symbol: 'ETHUSDT', crypto: true, volume24h: 1.5e9, benchmark: 'BTC' });
    expect(s.returns.d7!).toBeCloseTo((1.02 ** 7 - 1) * 100, 1);
    expect(s.upDayRatio90).toBe(1);
    expect(s.maxDrawdown90).toBe(0);
    expect(s.funding).toMatchObject({ funding: 0.01 });
    expect(s.beta90).not.toBeNull();
  });
  it('BTC against itself is beta 1; FX has no funding or liquidity line', async () => {
    expect(await statsFor('BTCUSDT', deps())).toMatchObject({ beta90: 1, corr90: 1 });
    const fx = await statsFor('EURUSD', deps({ daily: async (s) => (s === 'BTCUSDT' ? daily(120, (i) => 100 + i) : daily(300, (i) => 1.1 + (i % 2) * 0.001)) }));
    expect(fx).toMatchObject({ crypto: false, volume24h: null, funding: null });
  });
  it('refuses junk and empty symbols', async () => {
    await expect(statsFor('BTC/USDT', deps())).rejects.toThrow(/market symbol/);
    await expect(statsFor('NONE', deps())).rejects.toThrow(/No daily data/);
  });
});
