import { describe, expect, it } from 'vitest';
import { mockLiquidationMap, mockMaxPainBoard } from './mock-liquidations';

describe('mock liquidations (mock mode only)', () => {
  const now = Date.UTC(2026, 10, 12, 13, 42);
  it('builds a real ladder from the core model', () => {
    const m = mockLiquidationMap('BTC', '48h', now);
    expect(m.estimated).toBe(true);
    expect(m.path).toHaveLength(192);
    expect(m.bands.length).toBeGreaterThan(20);
    for (let i = 1; i < m.bands.length; i++) expect(m.bands[i]!.price).toBeGreaterThan(m.bands[i - 1]!.price);
    expect(m.maxPain.longPct).toBeLessThanOrEqual(0);
    expect(m.maxPain.shortPct).toBeGreaterThanOrEqual(0);
    expect(m.sources[0]).toMatch(/Sample/);
  });
  it('is deterministic and covers all six coins', () => {
    expect(mockLiquidationMap('ETH', '24h', now)).toEqual(mockLiquidationMap('ETH', '24h', now));
    expect(mockMaxPainBoard(now).rows.map(r => r.coin)).toEqual(['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE']);
  });
});
