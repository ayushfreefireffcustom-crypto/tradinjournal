// Mock-mode news + economic calendar (dev-only). Times are relative to "now" so
// the feed and the calendar's now-line always look live.
import type { NewsItem, CalendarEvent } from '@/lib/api';

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
type Seed = [string, string, string, number, NewsItem['category'], NewsItem['sentiment'], NewsItem['impact'], number, boolean?];
const SEEDS: Seed[] = [
  ['Bitcoin ETFs log fifth straight day of inflows as price nears range high', 'Spot products took in $612M yesterday, the longest streak since July. Funding stays neutral, suggesting the move is spot-led rather than leveraged.', 'Reuters', 12, 'CRYPTO', 'BULLISH', 'HIGH', 92, true],
  ['Gold slips ahead of CPI as real yields tick higher', 'Traders trim longs into the print; options imply a $28 move.', 'Bloomberg', 41, 'MACRO', 'BEARISH', 'MEDIUM', 81],
  ['ECB’s Lane: no rush to cut again before December', 'Euro steadies near 1.089 after comments.', 'FT', 60, 'MACRO', 'NEUTRAL', 'MEDIUM', 63],
  ['SEC approves options on two more spot crypto ETFs', 'Adds hedging tools for institutions.', 'CoinDesk', 120, 'REGULATORY', 'BULLISH', 'LOW', 48],
  ['Chipmakers slide as export curbs widen', 'Nasdaq futures down 0.6% pre-market.', 'WSJ', 180, 'MARKETS', 'BEARISH', 'HIGH', 74],
  ['Oil steadies as Red Sea shipping insurance costs climb', 'Brent holds above $78 with freight rates near two-month highs.', 'Reuters', 205, 'GEOPOLITICAL', 'NEUTRAL', 'MEDIUM', 55],
  ['Yen firms after Ministry of Finance repeats intervention warning', 'USD/JPY pulls back from 150 as officials flag one-sided moves.', 'Nikkei', 240, 'MACRO', 'BEARISH', 'MEDIUM', 66],
  ['Ether funding turns positive for first time in two weeks', 'Perp basis widens as open interest climbs 8%.', 'The Block', 300, 'CRYPTO', 'BULLISH', 'LOW', 52],
  ['UK retail sales beat estimates on autumn clothing demand', 'Sterling ticks up against the dollar.', 'Bloomberg', 330, 'MACRO', 'BULLISH', 'MEDIUM', 58],
  ['Nasdaq 100 earnings: three megacaps report after the close', 'Implied moves are above their four-quarter average.', 'CNBC', 380, 'MARKETS', 'NEUTRAL', 'HIGH', 70],
  ['EU lawmakers agree stablecoin reserve rules under MiCA review', 'Issuers get 12 months to comply.', 'FT', 420, 'REGULATORY', 'NEUTRAL', 'LOW', 40],
  ['Copper hits three-week high on China stimulus hopes', 'Metals rally as property support measures broaden.', 'Reuters', 500, 'MARKETS', 'BULLISH', 'LOW', 45],
];
export const MOCK_NEWS: NewsItem[] = SEEDS.map(([title, summary, source, m, category, sentiment, impact, relevance, mm], i) => ({
  id: `n${i + 1}`, url: 'https://example.com/news', title, summary, source, outlets: [source], imageUrl: null,
  publishedAt: ago(m), country: null, category, sentiment, relevance, impact, marketMoving: !!mm,
}));
export const MOCK_SOURCES = [
  { key: 'Reuters', label: 'Reuters', category: 'MARKETS' }, { key: 'Bloomberg', label: 'Bloomberg', category: 'MARKETS' },
  { key: 'FT', label: 'Financial Times', category: 'MACRO' }, { key: 'WSJ', label: 'Wall Street Journal', category: 'MARKETS' },
  { key: 'CoinDesk', label: 'CoinDesk', category: 'CRYPTO' }, { key: 'The Block', label: 'The Block', category: 'CRYPTO' },
  { key: 'CNBC', label: 'CNBC', category: 'MARKETS' }, { key: 'Nikkei', label: 'Nikkei Asia', category: 'MACRO' },
];
const g = globalThis as unknown as { __newsPrefs?: string[]; __calWatch?: Set<string> };
export const newsPrefs = () => (g.__newsPrefs ??= []);
export const setNewsPrefs = (s: string[]) => { g.__newsPrefs = s; };
export const calWatch = () => (g.__calWatch ??= new Set(['e-cpi', 'e-core']));

export const BRIEF = [
  '- **BTCUSD** is pressing the 67.8k range high after ETF inflows; your best trades this month were longs on London-open breaks.\n',
  '- **XAUUSD** faces US CPI at 13:30 — the last two prints moved gold 1%+. Your rule: flat before high-impact data.\n',
  '- **US100** earnings after the close; you lose on Tuesdays and after 15:00 — today is both.\n',
];

/** Economic events across yesterday → +7 days, anchored on local "today". */
export function mockCalendar(): CalendarEvent[] {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const at = (day: number, h: number, m = 0) => new Date(d0.getTime() + day * 864e5 + (h * 60 + m) * 60_000).toISOString();
  const now = Date.now();
  const rows: [string, number, number, number, string, string, CalendarEvent['impact'], string | null, string | null, string | null][] = [
    ['e-gbp', 0, 8, 30, 'GB', 'Retail sales m/m', 'MEDIUM', '0.4', '0.2', '-0.3'],
    ['e-eur', 0, 10, 0, 'EU', 'Trade balance', 'LOW', '12.1', '13.4', '14.0'],
    ['e-cpi', 0, 13, 30, 'US', 'CPI y/y', 'HIGH', null, '2.9', '3.0'],
    ['e-core', 0, 13, 30, 'US', 'Core CPI m/m', 'HIGH', null, '0.3', '0.3'],
    ['e-philly', 0, 15, 0, 'US', 'Philly Fed index', 'MEDIUM', null, '3.0', '1.7'],
    ['e-waller', 0, 19, 0, 'US', 'Fed Waller speaks', 'MEDIUM', null, null, null],
    ['e-gdp', 1, 2, 0, 'CN', 'GDP q/q', 'HIGH', null, '1.1', '0.9'],
    ['e-fcpi', 1, 9, 0, 'EU', 'Final CPI y/y', 'MEDIUM', null, '2.1', '2.1'],
    ['e-bp', 1, 12, 30, 'US', 'Building permits', 'HIGH', null, '1.45M', '1.47M'],
    ['e-uom', 1, 14, 0, 'US', 'UoM sentiment', 'LOW', null, '69.0', '68.9'],
    ['e-jp', 2, 23, 50, 'JP', 'Trade balance', 'LOW', null, '-0.4T', '-0.6T'],
    ['e-rba', 3, 0, 30, 'AU', 'RBA meeting minutes', 'MEDIUM', null, null, null],
    ['e-pmi', 4, 9, 30, 'GB', 'Manufacturing PMI', 'MEDIUM', null, '51.2', '51.5'],
    ['e-cl', 4, 14, 0, 'US', 'Existing home sales', 'MEDIUM', null, '3.92M', '3.86M'],
    ['e-ecb', 5, 12, 15, 'EU', 'ECB rate decision', 'HIGH', null, '3.25%', '3.50%'],
    ['e-jobless', -1, 12, 30, 'US', 'Initial jobless claims', 'MEDIUM', '241K', '235K', '228K'],
  ];
  const cur: Record<string, string> = { GB: 'GBP', EU: 'EUR', US: 'USD', CN: 'CNY', JP: 'JPY', AU: 'AUD' };
  const w = calWatch();
  return rows.map(([id, day, h, m, country, title, impact, actual, forecast, previous]) => {
    const t = at(day, h, m);
    const released = new Date(t).getTime() <= now;
    return { id, title, country, currency: cur[country]!, category: null, impact, eventTime: t, actual: released ? actual ?? forecast : null, forecast, previous, unit: null, actualAt: released ? t : null, watched: w.has(id) };
  });
}
