// Mock-mode market data: deterministic seeded random walks per symbol so the
// charts/markets pages render without a provider. Dev-only (USE_MOCKS).
import type { PriceAlert } from '@/lib/alerts-api';

export const MOCK_SYMBOLS: { symbol: string; name: string; assetClass: string; base: number; vol: number }[] = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', assetClass: 'crypto', base: 67420, vol: 0.006 },
  { symbol: 'ETHUSDT', name: 'Ethereum', assetClass: 'crypto', base: 3412.8, vol: 0.007 },
  { symbol: 'SOLUSDT', name: 'Solana', assetClass: 'crypto', base: 168.4, vol: 0.01 },
  { symbol: 'BNBUSDT', name: 'BNB', assetClass: 'crypto', base: 592.1, vol: 0.006 },
  { symbol: 'XAUUSD', name: 'Gold', assetClass: 'commodity', base: 2387.4, vol: 0.002 },
  { symbol: 'EURUSD', name: 'Euro / Dollar', assetClass: 'forex', base: 1.0891, vol: 0.0009 },
  { symbol: 'GBPUSD', name: 'Pound / Dollar', assetClass: 'forex', base: 1.2734, vol: 0.001 },
  { symbol: 'USDJPY', name: 'Dollar / Yen', assetClass: 'forex', base: 149.82, vol: 0.001 },
  { symbol: 'US100', name: 'Nasdaq 100', assetClass: 'stock', base: 19217, vol: 0.0025 },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'stock', base: 228.5, vol: 0.004 },
];
const TF_SEC: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Candles ending at the current bar; deterministic per (symbol, tf, bar time). */
export function mockCandles(symbol: string, tf: string, limit = 300, to?: number) {
  const meta = MOCK_SYMBOLS.find(s => s.symbol === symbol.toUpperCase()) ?? { base: 100, vol: 0.004 };
  const step = TF_SEC[tf] ?? 3600;
  const nowBar = Math.floor((to ?? Date.now() / 1000) / step) * step;
  const n = Math.min(limit, 500);
  const scale = Math.sqrt(step / 3600);
  // Walk backwards from the base so the latest close sits near `base`.
  let seed = hash(`${symbol}:${tf}`);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const closes: number[] = [meta.base];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1]! * (1 - (rnd() - 0.47) * meta.vol * scale * 2));
  closes.reverse();
  return closes.map((c, i) => {
    const o = i ? closes[i - 1]! : c * (1 + (rnd() - 0.5) * meta.vol * scale);
    const w = Math.abs(c - o) + c * meta.vol * scale * rnd() * 0.8;
    return { openTime: (nowBar - (n - 1 - i) * step) * 1000, open: o, high: Math.max(o, c) + w * rnd() * 0.6, low: Math.min(o, c) - w * rnd() * 0.6, close: c, volume: Math.round(1000 + rnd() * 9000) };
  });
}

const g = globalThis as unknown as { __mockWatch?: string[]; __mockAlerts?: PriceAlert[] };
export const watchStore = () => (g.__mockWatch ??= ['BTCUSDT', 'XAUUSD', 'US100', 'EURUSD']);
export const setWatch = (s: string[]) => { g.__mockWatch = s; };
export const alertStore = () => (g.__mockAlerts ??= [
  { id: 'al-1', symbol: 'BTCUSDT', accountId: null, direction: 'above', threshold: '68000', lastPrice: '67420', status: 'active', recurring: true, note: 'breakout watch', triggeredAt: null, createdAt: new Date().toISOString() },
  { id: 'al-2', symbol: 'XAUUSD', accountId: null, direction: 'below', threshold: '2370', lastPrice: '2387.4', status: 'active', recurring: false, note: 'retest', triggeredAt: null, createdAt: new Date().toISOString() },
]);
