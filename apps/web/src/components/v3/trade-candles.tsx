'use client';

// Candle data for a single position's chart: real candles when the market API
// has the window, otherwise a deterministic path anchored to the fills (callers
// label that as illustrative). The charts themselves live in components/v6.
import { useEffect, useState } from 'react';
import type { Trade } from '@/lib/api';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';

const TF_SECONDS: [MarketTimeframe, number][] = [
  ['1m', 60], ['5m', 300], ['15m', 900], ['30m', 1800], ['1h', 3600], ['4h', 14400], ['1d', 86400], ['1w', 604800], ['1M', 2592000],
];
function chooseTf(windowSec: number): MarketTimeframe {
  for (const [tf, s] of TF_SECONDS) if (windowSec / s <= 400) return tf;
  return '1M';
}
/** Padded from/to (epoch seconds) + timeframe for a trade's chart window. */
export function tradeWindow(trade: Trade): { from: number; to: number; tf: MarketTimeframe } {
  const openSec = Math.floor(new Date(trade.openTime).getTime() / 1000);
  const closeSec = trade.closeTime ? Math.floor(new Date(trade.closeTime).getTime() / 1000) : openSec + 3600;
  const d = Math.max(closeSec - openSec, 300);
  const pad = Math.round(d * 0.4);
  return { from: openSec - pad, to: closeSec + pad, tf: chooseTf(closeSec - openSec + pad * 2) };
}

/** Real candles for the trade window, or null when no provider covers it. */
export function useTradeCandles(trade: Trade | null, accountId?: string) {
  const [state, setState] = useState<{ id: string | null; candles: Candle[] | null; loading: boolean }>({ id: null, candles: null, loading: false });
  useEffect(() => {
    if (!trade) { setState({ id: null, candles: null, loading: false }); return; }
    let alive = true;
    setState({ id: trade.positionId, candles: null, loading: true });
    const { from, to, tf } = tradeWindow(trade);
    marketApi.candles({ symbol: trade.symbol, tf, from, to, limit: 500, accountId })
      .then(r => { if (alive) setState({ id: trade.positionId, candles: r.candles.length >= 2 ? r.candles : null, loading: false }); })
      .catch(() => { if (alive) setState({ id: trade.positionId, candles: null, loading: false }); });
    return () => { alive = false; };
  }, [trade?.positionId, trade?.symbol, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

type Bar = { o: number; h: number; l: number; c: number };
/**
 * Deterministic illustrative path (seeded by position id): a Brownian bridge
 * that closes exactly on the entry and exit fills, with a random walk either
 * side. Volatility scales with the trade's own move so scalps and swings both
 * look plausible. Never presented as market data.
 */
export function synthCandles(trade: Trade, n = 72) {
  let seed = (parseInt(trade.positionId.replace(/\D/g, '').slice(-9), 10) || 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const entry = trade.entryPrice, exit = trade.exitPrice ?? entry;
  const e = Math.round(n * 0.24), x = Math.round(n * 0.7);
  const sig = Math.max(Math.abs(exit - entry), Math.abs(entry) * 0.0012) / Math.sqrt(x - e) * 0.85;
  const p = new Array<number>(n + 1).fill(entry);
  for (let i = e - 1; i >= 0; i--) p[i] = p[i + 1]! + gauss() * sig;
  const w = [0];
  for (let i = 1; i <= x - e; i++) w.push(w[i - 1]! + gauss() * sig);
  const wEnd = w[x - e]!;
  for (let i = e; i <= x; i++) { const k = (i - e) / (x - e); p[i] = entry + (w[i - e]! - k * wEnd) + k * (exit - entry); }
  for (let i = x + 1; i <= n; i++) p[i] = p[i - 1]! + gauss() * sig;
  const candles: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    const o = p[i - 1]!, c = p[i]!;
    candles.push({ o, c, h: Math.max(o, c) + Math.abs(gauss()) * sig * 0.45, l: Math.min(o, c) - Math.abs(gauss()) * sig * 0.45 });
  }
  return { candles, entryIdx: e - 1, exitIdx: x - 1, min: Math.min(...candles.map(b => b.l)), max: Math.max(...candles.map(b => b.h)) };
}
