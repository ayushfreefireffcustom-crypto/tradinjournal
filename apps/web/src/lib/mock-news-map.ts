// Mock-mode data for the News page (NEXT_PUBLIC_USE_MOCKS=true only; served by
// app/data/news/today and app/data/news/reactions). Same scene as the approved
// design: a hot US CPI print leads, crypto liquidations, an oil-terminal strike.
// Times are relative to "now" so the page always looks live.
import type { NewsStory, NewsToday, NewsReactions, ReactionSeries } from '@/lib/news-map-api';

type Seed = [mAgo: number, score: number, desk: NewsStory['desk'], n: number, title: string, short: string, tickers: string[], line?: string];
const SEEDS: Seed[] = [
  [12, 96, 'MACRO', 16, 'US CPI hotter than forecast for a second month', 'Hot US CPI, second month running', ['US10Y', 'DXY', 'XAUUSD', 'US500'], 'Dec cut odds 61% → 38% in 11 min'],
  [4, 88, 'CRYPTO', 6, 'Bitcoin longs flushed: $214M liquidated in 15 minutes', 'BTC longs flushed, $214M', ['BTCUSD', 'ETHUSD'], 'Next long cluster 94,250, 1% below'],
  [87, 81, 'GEOPOLITICAL', 6, 'Drone strike hits a Black Sea oil export terminal', 'Drone strike on Black Sea oil terminal', ['WTI', 'BRENT'], 'Energy adds to the inflation worry'],
  [1, 74, 'RATES', 4, 'Fed funds futures: December cut odds fall to 38%', 'Dec cut odds fall to 38%', ['ZQZ6']],
  [9, 70, 'RATES', 5, 'US 10-year yield jumps 9bp to 4.21%', 'US 10Y yield +9bp to 4.21%', ['US10Y', 'DXY']],
  [482, 61, 'RATES', 3, 'Japan 10-year yield at 1.78%, highest since 2008', 'JGB 10Y at 2008 high', ['USDJPY', 'JP10Y']],
  [11, 58, 'MARKETS', 2, 'S&P 500 futures −0.6%, Nasdaq 100 futures −0.8%', 'US index futures turn lower', ['US100', 'US500']],
  [142, 54, 'CRYPTO', 4, 'Spot Ether ETFs: $212M inflows, fifth day running', 'Ether ETF inflows, 5th day', ['ETHUSD']],
  [402, 47, 'MACRO', 4, 'UK GDP grows 0.1% in Q3, forecast 0.2%', 'UK GDP misses, 0.1%', ['GBPUSD']],
  [12, 45, 'MACRO', 3, 'US jobless claims 221K, forecast 225K', 'Jobless claims 221K', []],
  [40, 42, 'REGULATORY', 2, 'SEC delays two spot Solana ETF decisions to January', 'SEC delays SOL ETFs', ['SOLUSD']],
  [58, 40, 'MACRO', 3, 'ECB accounts: inflation risks broadly balanced, with members split on how long rates need to stay restrictive into next year', 'ECB accounts: risks balanced', ['EURUSD']],
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function mockNewsToday(now = Date.now()): NewsToday {
  const stories: NewsStory[] = SEEDS.map(([m, score, desk, n, title, short, tickers, line], i) => ({
    id: `mn${i + 1}`, url: 'https://example.com/news', title, summary: null, source: 'Reuters', outlets: Array.from({ length: n }, (_, k) => `Outlet ${k + 1}`),
    imageUrl: null, publishedAt: new Date(now - m * 60_000).toISOString(), country: null,
    category: desk === 'RATES' ? 'MACRO' : desk, sentiment: null, relevance: score, impact: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
    marketMoving: score >= 80, tickers, desk, score, scoreSource: 'ai', sourceCount: n, short, line: line ?? null,
  }));
  stories.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return {
    asOf: new Date(now).toISOString(), from: new Date(now - 86_400_000).toISOString(),
    counts: { headlines: 1284, stories: 978, kept: 41, merged: 306, hidden: 937, sources: 18 },
    stories,
  };
}

// key, unit, dp, level, move at the CPI print (pct or bp), drift
const RX: [string, 'bp' | 'pct', number, number, number][] = [
  ['US10Y', 'bp', 2, 4.12, 9], ['DXY', 'pct', 2, 99.22, 0.4], ['EURUSD', 'pct', 4, 1.0875, -0.3], ['XAUUSD', 'pct', 0, 4220, -0.9],
  ['US500', 'pct', 0, 6853, -0.6], ['US100', 'pct', 0, 24375, -0.8], ['BTCUSD', 'pct', 0, 96900, -1.8], ['ETHUSD', 'pct', 0, 3393, -2.4],
  ['WTI', 'pct', 2, 64.07, 0.2], ['BRENT', 'pct', 2, 68.1, 1.1], ['USDJPY', 'pct', 2, 154.3, -0.2], ['GBPUSD', 'pct', 4, 1.2701, -0.3], ['SOLUSD', 'pct', 2, 182.4, -0.6],
];

export function mockReactions(now = Date.now()): NewsReactions {
  const step = 5 * 60_000;
  const end = Math.floor(now / step) * step;
  const print = now - 12 * 60_000;
  const series: ReactionSeries[] = RX.map(([key, unit, dp, level, mv], si) => {
    const r = rng(si + 7);
    const pts: [number, number][] = [];
    let w = 0;
    for (let i = 299; i >= 0; i--) {
      const t = end - i * step;
      w = w * 0.92 + (r() - 0.5) * 0.18;
      const after = t > print ? mv : 0;
      const pct = unit === 'bp' ? 0 : w + after;
      const v = unit === 'bp' ? level + (w * 0.05) + after / 100 : level * (1 + pct / 100);
      pts.push([t, Number(v.toFixed(dp + 2))]);
    }
    return { key, unit, dp, points: pts };
  });
  return { asOf: new Date(now).toISOString(), interval: '5m', series };
}
