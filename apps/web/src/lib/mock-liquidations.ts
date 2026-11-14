// Mock-mode (NEXT_PUBLIC_USE_MOCKS) liquidation map + max pain. Runs the real
// core model over a seeded synthetic 48h of 15-minute perp bars, so previews
// show realistic ladders without calling any exchange. Never used in production.
import { buildLiquidationMap, type LiqBar, type LiqOiPoint } from '../../../../packages/core/src/liquidation/model';
import type { LiquidationCoin, LiquidationMap, LiquidationWindow, MaxPainBoard } from './liquidations-api';

const BASE: Record<LiquidationCoin, number> = { BTC: 95_200, ETH: 3_310, SOL: 182, XRP: 2.31, BNB: 905, DOGE: 0.32 };
const BAR_MS = 15 * 60_000;
const BARS: Record<LiquidationWindow, number> = { '24h': 96, '48h': 192, '7d': 672 };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function series(coin: LiquidationCoin, n: number, now: number) {
  const r = rng([...coin].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const end = BASE[coin];
  const bars: LiqBar[] = [];
  const oi: LiqOiPoint[] = [];
  let p = end * 1.03;
  let o = 1_000;
  for (let i = 0; i < n; i++) {
    const t = now - (n - i) * BAR_MS;
    const drift = (end - p) / Math.max(1, n - i) ;
    const c = Math.max(1e-9, p + drift + (r() - 0.5) * end * 0.006);
    const h = Math.max(p, c) * (1 + r() * 0.002);
    const l = Math.min(p, c) * (1 - r() * 0.002);
    const volume = (50 + r() * 150) * (95_200 / end);
    bars.push({ t, o: p, h, l, c, volume, takerBuy: volume * (0.4 + r() * 0.2) });
    o = Math.max(100, o + (r() - 0.4) * 40);
    oi.push({ t, oi: o * (95_200 / end) });
    p = c;
  }
  return { bars, oi };
}

export function mockLiquidationMap(coin: LiquidationCoin, window: LiquidationWindow, now = Date.now()): LiquidationMap {
  const { bars, oi } = series(coin, BARS[window], now);
  const res = buildLiquidationMap({ bars, oi }, { barMs: BAR_MS, price: bars.at(-1)!.c, now });
  return {
    coin, symbol: `${coin}USDT`, price: res.price, asOf: new Date(now).toISOString(), estimated: true, window,
    step: res.step, bands: res.bands, maxPain: res.maxPain,
    path: bars.map(b => ({ t: new Date(b.t).toISOString(), p: b.c })),
    lastHour: { totalUsd: 41_200_000, longShare: 0.73 },
    sources: ['Sample data (mock mode)', 'TRADElogs estimate (leverage-tier model)'],
  };
}

export function mockMaxPainBoard(now = Date.now()): MaxPainBoard {
  const coins = Object.keys(BASE) as LiquidationCoin[];
  return {
    asOf: new Date(now).toISOString(), estimated: true,
    rows: coins.map(coin => { const m = mockLiquidationMap(coin, '48h', now); return { coin, price: m.price, ...m.maxPain }; }),
  };
}
