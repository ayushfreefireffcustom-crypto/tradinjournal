// Market overview with fake data: no network.
import { describe, expect, it } from 'vitest';
import { correlationOverview, marketOverview, MACRO, type OverviewDeps } from '../overview.service.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 1, 12);
const u = (base: string, change24h: number, volume24h: number) => ({ symbol: `${base}USDT`, base, price: 1, change24h, volume24h, high24h: 0, low24h: 0 });
// BTC flat; most alts up 50 % over 90 days, so it's altcoin season; DOGE and PEPE are memes.
const UNI = [u('BTC', 0.5, 9e9), u('ETH', 2, 5e9), u('SOL', 4, 3e9), u('DOGE', -3, 2e9), u('PEPE', -6, 1e9),
  ...Array.from({ length: 12 }, (_, i) => u(`ALT${i}`, i - 3, 1e8 - i))];
const daily = (growth: number, days = 100) => Array.from({ length: days }, (_, i) => ({ openTime: NOW - (days - i) * DAY, open: 1, high: 1, low: 1, close: 100 * (1 + growth) ** i, volume: 1 }));
const deps: OverviewDeps = {
  universe: async (n) => UNI.slice(0, n),
  daily: async (s) => (s === 'BTCUSDT' ? daily(0) : s.startsWith('US') || s.includes('USD') && !s.endsWith('USDT') ? daily(0.001, 30) : s === 'DOGEUSDT' ? daily(-0.002) : daily(0.005)),
  fearGreed: async () => ({ value: 34, label: 'Fear', history: [{ time: 1, value: 30 }, { time: 2, value: 34 }] }),
  now: () => NOW,
  cache: false,
};

describe('market overview', () => {
  it('builds breadth, movers, heatmap and sectors', async () => {
    const o = await marketOverview(deps);
    expect(o.breadth.up + o.breadth.down + o.breadth.flat).toBe(UNI.length);
    expect(o.gainers[0]!.base).toBe('ALT11');
    expect(o.losers[0]!.base).toBe('PEPE');
    expect(o.heatmap.find((h) => h.base === 'DOGE')!.sector).toBe('Meme');
    const meme = o.sectors.find((s) => s.sector === 'Meme')!;
    expect(meme).toMatchObject({ count: 2, change24h: -4.5, leaders: ['DOGE', 'PEPE'] });
    expect(meme.vsBtc7d!).toBeLessThan(10); // DOGE falls, PEPE rises
    expect(o.fearGreed).toMatchObject({ value: 34, label: 'Fear' });
  });
  it('calls altcoin season when most alts beat BTC over 90 days', async () => {
    const o = await marketOverview(deps);
    expect(o.altSeason.btc90).toBeCloseTo(0);
    expect(o.altSeason.label).toBe('altcoin season');
    expect(o.altSeason.index!).toBeGreaterThanOrEqual(75);
  });
  it('shows FX, indices and commodities, with unknowns left blank', async () => {
    const o = await marketOverview({ ...deps, daily: async (s) => (s === 'GER40' ? [] : deps.daily(s, 30)) });
    expect(o.macro).toHaveLength(MACRO.length);
    expect(o.macro.find((m) => m.symbol === 'US500')!.change1d!).toBeCloseTo(0.1, 1);
    expect(o.macro.find((m) => m.symbol === 'GER40')).toMatchObject({ price: null, change1d: null });
    const noFg = await marketOverview({ ...deps, fearGreed: async () => { throw new Error('down'); } });
    expect(noFg.fearGreed).toBeNull();
  });
  it('builds a correlation matrix of the top pairs', async () => {
    const c = await correlationOverview(4, 30, deps);
    expect(c.symbols).toEqual(['BTC', 'ETH', 'SOL', 'DOGE']);
    expect(c.matrix[1]![1]).toBe(1);
    expect(c.matrix).toHaveLength(4);
  });
});
