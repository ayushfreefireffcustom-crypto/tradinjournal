// Mock-mode macro state (dev-only). Plausible, internally consistent numbers so
// every macro panel renders; not real data.
import type { MacroState } from '@/lib/macro-api';

const now = () => new Date().toISOString();
const hist = (end: number, step: number, n = 12, wobble = 0.15) =>
  Array.from({ length: n }, (_, i) => +(end - step * (n - 1 - i) + Math.sin(i * 1.7) * Math.abs(step) * wobble).toFixed(3));

export function mockMacroState(): MacroState {
  const t = now();
  const m = (key: string, label: string, value: number, prev: number, unit: string | null, history?: number[], forecast?: number) =>
    ({ key, label, value, prev, unit, source: 'FRED', asOf: t, history: history ?? hist(value, (value - prev) / 1.5), forecast: forecast ?? null });
  return {
    asOf: t,
    engineVer: 'engine v4.2',
    regime: { growth: 'up', inflation: 'down', label: 'Goldilocks', recessionOdds: 22 },
    macro: [
      m('CPIAUCSL', 'CPI y/y', 2.9, 3.1, '%', [3.7, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3.0, 3.0, 2.95, 2.9, 2.9]),
      m('CPILFESL', 'Core CPI y/y', 3.2, 3.3, '%'),
      m('PCEPILFE', 'Core PCE y/y', 2.7, 2.8, '%'),
      m('PPIACO', 'PPI y/y', 1.8, 2.1, '%'),
      m('GDPC1', 'Real GDP q/q ann.', 2.4, 2.1, '%', [1.2, 1.4, 1.6, 1.5, 1.9, 2.0, 2.2, 2.1, 2.3, 2.1, 2.4, 2.4]),
      m('GDPNOW', 'GDPNow', 2.4, 2.2, '%', [1.4, 1.6, 1.8, 1.7, 2.0, 2.1, 2.0, 2.2, 2.3, 2.2, 2.4, 2.4]),
      m('RSAFS', 'Retail sales m/m', 0.4, 0.2, '%'),
      m('UMCSENT', 'UoM sentiment', 69.0, 68.9, null),
      m('UNRATE', 'Unemployment rate', 4.2, 4.1, '%', [3.7, 3.7, 3.8, 3.8, 3.9, 3.9, 4.0, 4.0, 4.1, 4.1, 4.2, 4.2]),
      m('PAYEMS', 'Nonfarm payrolls', 142, 89, 'K'),
      m('ICSA', 'Initial claims', 241, 228, 'K'),
      m('FEDFUNDS', 'Fed funds (effective)', 4.5, 4.5, '%', [5.33, 5.33, 5.33, 5.33, 5.33, 5.08, 4.83, 4.58, 4.5, 4.5, 4.5, 4.5]),
      m('DFF', 'Fed funds (daily)', 4.5, 4.5, '%', [5.33, 5.33, 5.33, 5.33, 5.33, 5.08, 4.83, 4.58, 4.5, 4.5, 4.5, 4.5]),
      m('FEDTARMD', 'FOMC median dot', 3.9, 4.1, '%'),
      m('ECBDFR', 'ECB deposit rate', 3.25, 3.5, '%'),
      m('DGS3MO', 'UST 3M', 4.62, 4.66, '%'), m('DGS2', 'UST 2Y', 4.05, 4.09, '%'), m('DGS5', 'UST 5Y', 4.01, 3.98, '%'),
      m('DGS10', 'UST 10Y', 4.21, 4.18, '%'), m('DGS30', 'UST 30Y', 4.48, 4.45, '%'), m('DFII10', '10Y real yield', 1.92, 1.95, '%'),
      m('T10Y2Y', '10Y–2Y spread', 0.16, 0.09, '%'), m('T10Y3M', '10Y–3M spread', -0.41, -0.48, '%'), m('T10YIE', '10Y breakeven', 2.29, 2.31, '%'),
      m('WALCL', 'Fed balance sheet', 7042, 7061, 'B'), m('RRPONTSYD', 'Reverse repo', 312, 341, 'B'), m('WTREGEN', 'Treasury General Account', 812, 790, 'B'),
      m('NET_LIQUIDITY', 'Net liquidity', 5918, 5930, 'B'),
      m('VIXCLS', 'VIX', 15.8, 17.2, null), m('BAMLH0A0HYM2', 'HY credit spread', 3.12, 3.21, '%'), m('NFCI', 'Financial conditions', -0.52, -0.49, null),
      m('MORTGAGE30US', '30Y mortgage', 6.48, 6.52, '%'), m('DTWEXBGS', 'Broad dollar index', 121.4, 121.9, null),
    ],
    markets: [
      { symbol: 'DXY', price: 104.18, changePct: -0.18, asOf: t }, { symbol: 'UST', price: 4.21, changePct: 0.7, asOf: t },
      { symbol: 'XAU', price: 2387.4, changePct: 0.84, asOf: t }, { symbol: 'SPX', price: 5821, changePct: 0.41, asOf: t },
      { symbol: 'OIL', price: 71.2, changePct: -1.1, asOf: t }, { symbol: 'BTC', price: 67420, changePct: 2.41, asOf: t },
      { symbol: 'NDX', price: 20512, changePct: 0.62, asOf: t }, { symbol: 'ETH', price: 3412.8, changePct: 1.12, asOf: t },
    ],
    bias: [
      { asset: 'XAU', score: 71, label: 'BULLISH', supporting: ['Falling real yields', 'Central-bank buying', 'Softer dollar'], opposing: ['Strong equities reduce haven demand'] },
      { asset: 'SPX', score: 63, label: 'BULLISH', supporting: ['Disinflation', 'Earnings revisions up', 'Liquidity stable'], opposing: ['Rich valuations'] },
      { asset: 'DXY', score: 38, label: 'BEARISH', supporting: ['Rate differentials still wide'], opposing: ['Fed easing path', 'Improving global growth'] },
      { asset: 'BTC', score: 66, label: 'BULLISH', supporting: ['ETF inflows', 'Liquidity stable'], opposing: ['Funding could turn crowded'] },
      { asset: 'ETH', score: 52, label: 'NEUTRAL', supporting: ['Positive funding'], opposing: ['Relative weakness vs BTC'] },
      { asset: 'UST', score: 41, label: 'BEARISH', supporting: ['Cooling inflation'], opposing: ['Heavy issuance', 'Sticky services CPI'] },
      { asset: 'OIL', score: 34, label: 'BEARISH', supporting: ['Geopolitical premium'], opposing: ['OPEC+ supply', 'Soft China demand'] },
      { asset: 'NDX', score: 61, label: 'BULLISH', supporting: ['AI capex cycle'], opposing: ['Export curbs'] },
    ],
    events: [
      { title: 'US CPI y/y', country: 'US', impact: 'HIGH', at: new Date(Date.now() + 3.8 * 3600e3).toISOString(), forecast: '2.9', prev: '3.0' },
      { title: 'Philly Fed index', country: 'US', impact: 'MEDIUM', at: new Date(Date.now() + 5.4 * 3600e3).toISOString(), forecast: '3.0', prev: '1.7' },
      { title: 'China GDP q/q', country: 'CN', impact: 'HIGH', at: new Date(Date.now() + 16 * 3600e3).toISOString(), forecast: '1.1', prev: '0.9' },
    ],
    headlines: [
      { title: 'Gold slips ahead of CPI as real yields tick higher', source: 'Bloomberg', url: 'https://example.com', at: new Date(Date.now() - 41 * 60e3).toISOString() },
      { title: 'ECB’s Lane: no rush to cut again before December', source: 'FT', url: 'https://example.com', at: new Date(Date.now() - 60 * 60e3).toISOString() },
    ],
    fx: [
      { code: 'EUR', rate: 0.918, asOf: t }, { code: 'GBP', rate: 0.785, asOf: t }, { code: 'JPY', rate: 149.8, asOf: t }, { code: 'CHF', rate: 0.862, asOf: t },
      { code: 'AUD', rate: 1.49, asOf: t }, { code: 'CAD', rate: 1.378, asOf: t }, { code: 'NZD', rate: 1.65, asOf: t }, { code: 'CNY', rate: 7.11, asOf: t },
    ],
  };
}
