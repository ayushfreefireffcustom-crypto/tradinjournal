// Signals with fake market data: no network.
import { describe, expect, it } from 'vitest';
import { listSignals, symbolSignals, type SignalsDeps } from '../signals.service.js';

const NOW = Date.UTC(2026, 10, 1, 12, 30);
const MS: Record<string, number> = { '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
const curve = (dir: number) => (i: number) => 1000 * Math.exp(dir * (i * 0.0005 + i * i * 0.00001));
const shape: Record<string, (i: number) => number> = { UPUSDT: curve(1), DNUSDT: curve(-1) };
const loads: Array<[string, string, number]> = [];
const deps: SignalsDeps = {
  universe: async (n) => [
    { symbol: 'UPUSDT', base: 'UP', price: 1, change24h: 2, volume24h: 3e6, high24h: 0, low24h: 0 },
    { symbol: 'DNUSDT', base: 'DN', price: 1, change24h: -2, volume24h: 2e6, high24h: 0, low24h: 0 },
    { symbol: 'NEWUSDT', base: 'NEW', price: 1, change24h: 0, volume24h: 1e6, high24h: 0, low24h: 0 },
  ].slice(0, n),
  loadCandles: async (symbol, tf, limit) => {
    loads.push([symbol, tf, limit]);
    if (symbol === 'NEWUSDT' && tf === '1d') return []; // listed this week: no daily bars yet
    const f = shape[symbol] ?? curve(1);
    const n = 260;
    const first = Math.floor(NOW / MS[tf]!) * MS[tf]! - (n - 1) * MS[tf]!;
    // The last bar is still forming and spikes the other way; it must be ignored.
    return Array.from({ length: n }, (_, i) => {
      const c = i === n - 1 ? f(i) * (symbol === 'UPUSDT' ? 0.5 : 2) : f(i);
      return { openTime: first + i * MS[tf]!, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 100 };
    }).slice(-limit);
  },
  now: () => NOW,
  cache: false,
};

describe('signals', () => {
  it('rates each pair on 1h, 4h and 1d from closed bars', async () => {
    loads.length = 0;
    const r = await listSignals(3, deps);
    expect(r.rows.map((x) => x.symbol)).toEqual(['UPUSDT', 'DNUSDT', 'NEWUSDT']);
    const up = r.rows[0]!.ratings;
    for (const tf of ['1h', '4h', '1d'] as const) {
      expect(['buy', 'strong_buy']).toContain(up[tf]!.label);
      expect(up[tf]!.ma).toBe(1);
      expect(['sell', 'strong_sell']).toContain(r.rows[1]!.ratings[tf]!.label);
    }
    expect(r.rows[2]!.ratings['1d']).toBeNull(); // no data is "—", never neutral
    expect(r.rows[2]!.ratings['1h']).not.toBeNull();
    expect(loads).toHaveLength(9);
    expect(loads.every(([, , limit]) => limit === 300)).toBe(true);
    expect(r.barTimes['1h']).toBe(new Date(Math.floor(NOW / MS['1h']!) * MS['1h']! - MS['1h']!).toISOString());
  });

  it('shows every vote for one symbol', async () => {
    const s = await symbolSignals(' upusdt ', deps);
    expect(s.symbol).toBe('UPUSDT');
    expect(s.timeframes.map((t) => t.tf)).toEqual(['1h', '4h', '1d']);
    const h = s.timeframes[0]!;
    expect(h.bars).toBe(259);
    expect(h.ma!.components.length).toBe(16);
    expect(h.osc!.components.length).toBe(10);
    expect(h.ma!.components.find((c) => c.name === 'SMA (200)')).toMatchObject({ vote: 1, reason: 'Price above' });
    const fresh = await symbolSignals('NEWUSDT', deps);
    expect(fresh.timeframes[2]).toMatchObject({ tf: '1d', label: null, bars: 0 });
  });

  it('refuses nonsense and symbols with no data at all', async () => {
    await expect(symbolSignals('BTC/USDT', deps)).rejects.toThrow(/isn’t a market symbol/);
    const none = { ...deps, loadCandles: async () => [] };
    await expect(symbolSignals('ZZZUSDT', none)).rejects.toThrow(/No market data for ZZZUSDT/);
  });
});
