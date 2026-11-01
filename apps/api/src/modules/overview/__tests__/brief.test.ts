import { describe, expect, it } from 'vitest';
import type { Overview } from '../overview.service.js';
import { weeklyMarketBrief, type BriefDeps } from '../brief.service.js';

const overview = {
  asOf: '', breadth: { up: 60, down: 35, flat: 5, advanceRatio: 0.63, medianChange: 0.8, avgChange: 1 },
  gainers: [], losers: [], heatmap: [],
  sectors: [{ sector: 'AI', count: 4, change24h: 2, change7d: 12.5, change30d: 20, volume24h: 1, vsBtc7d: 9.3, vsBtc30d: 10, leaders: ['FET'] }, { sector: 'Meme', count: 5, change24h: -1, change7d: -6.2, change30d: -3, volume24h: 1, vsBtc7d: -9.4, vsBtc30d: -12, leaders: ['DOGE'] }],
  fearGreed: { value: 34, label: 'Fear', history: Array.from({ length: 30 }, (_, i) => ({ time: i, value: 20 + i })) },
  altSeason: { index: 40, label: 'neither', counted: 49, btc90: 5, window: 90 },
  macro: [{ symbol: 'US500', name: 'S&P 500', group: 'Indices', price: 6000, change1d: 0.4, spark: [100, 100, 100, 100, 100, 102] }],
  week: { btc7d: 3.2, eth7d: -1.4, gainers: [{ base: 'FET', change7d: 22 }], losers: [{ base: 'PEPE', change7d: -15 }] },
} as unknown as Overview;
const deps = (over: Partial<BriefDeps> = {}): BriefDeps => ({
  overview: async () => overview,
  derivatives: async () => ({ asOf: '', source: 'bybit', rows: [], totals: { oiValue: 1, weightedFunding: 0.0071, positiveShare: 0.7 }, detailFor: 0, liquidations: null, note: null }),
  ai: () => false, write: async () => ({}), now: () => Date.UTC(2026, 10, 1), cache: false, ...over,
});

describe('weekly market brief', () => {
  it('writes a template brief from the week’s numbers when AI is off', async () => {
    const b = await weeklyMarketBrief(deps());
    expect(b).toMatchObject({ source: 'rules', weekEnding: '2026-11-01', headline: 'Bitcoin rose 3.2% this week' });
    expect(b.summary).toContain('Ether fell 1.4%');
    expect(b.bullets.join(' ')).toContain('FET +22.0%');
    expect(b.bullets.join(' ')).toContain('Best sector AI (+12.5%), weakest Meme (-6.2%)');
    expect(b.bullets.join(' ')).toContain('Fear & Greed at 34 (Fear), from 42 a week ago');
    expect(b.bullets.join(' ')).toContain('0.0071%');
  });
  it('uses Claude’s brief when it is well formed, with only the facts in the prompt', async () => {
    const seen: string[] = [];
    const good = { headline: 'A quiet week led by AI coins', summary: 'Bitcoin added 3.2% while Ether slipped 1.4%. AI tokens led.', bullets: ['FET rose 22%.', 'Memes lagged by 9.4 points.'], watch: 'Whether AI keeps leading Bitcoin.' };
    const b = await weeklyMarketBrief(deps({ ai: () => true, write: async (m) => { seen.push(m[1]!.content); return good; } }));
    expect(b).toMatchObject({ source: 'ai', ...good });
    expect(seen[0]).toContain('"btc7d":3.2');
    const bad = await weeklyMarketBrief(deps({ ai: () => true, write: async () => ({ headline: 'x', bullets: [] }) }));
    expect(bad.source).toBe('rules');
  });
  it('still works without derivatives data', async () => {
    const b = await weeklyMarketBrief(deps({ derivatives: async () => { throw new Error('down'); } }));
    expect(b.bullets.join(' ')).not.toContain('Funding');
  });
});
