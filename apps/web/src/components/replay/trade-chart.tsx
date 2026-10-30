// Price helpers for the replay charts: instrument precision, pip size, the
// favourable move of a trade, and mapping real OHLC bars onto a trade window.
import type { Trade } from '@/lib/api';
import type { Candle } from '@/lib/market-api';

// Broker symbols carry suffixes (AUDCAD.z, GOLD.i#), so name-matching alone is
// brittle. Decimals and pip size are derived from the price magnitude, which
// works for any suffix: FX majors ~1.08, JPY ~150, gold ~2400, indices/BTC big.
export function decimals(symbol: string, price?: number | null): number {
  if (symbol.includes('JPY')) return 3;
  if (price != null) {
    const a = Math.abs(price);
    if (a >= 5000) return 1; // indices, BTC
    if (a >= 20) return 2;   // gold, silver, small indices
  }
  return 5; // FX majors
}
export function fmtPrice(symbol: string, v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(decimals(symbol, v));
}
export function pipSize(symbol: string, price?: number | null): number {
  if (symbol.includes('JPY')) return 0.01;
  if (price != null) {
    const a = Math.abs(price);
    if (a >= 5000) return 1;   // indices, BTC: one point
    if (a >= 20) return 0.1;   // gold
  }
  return 0.0001; // FX majors
}
/** Signed favourable move in pips (positive = trade moved your way). */
export function pipMove(trade: Trade): number {
  const exit = trade.exitPrice ?? trade.entryPrice;
  const signed = (exit - trade.entryPrice) * (trade.direction === 'LONG' ? 1 : -1);
  return signed / pipSize(trade.symbol, trade.entryPrice);
}

// Map real OHLC bars into the renderer's shape, aligning entry/exit to the bars
// nearest the trade's open/close times.
export function candlesFromReal(trade: Trade, real: Candle[]) {
  const candles = real.map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close }));
  const openMs = new Date(trade.openTime).getTime();
  const closeMs = trade.closeTime ? new Date(trade.closeTime).getTime() : openMs;
  const nearest = (t: number) => {
    let best = 0;
    let bestD = Infinity;
    real.forEach((c, i) => {
      const d = Math.abs(c.openTime - t);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const min = Math.min(...candles.map(c => c.l));
  const max = Math.max(...candles.map(c => c.h));
  return { candles, entryIdx: nearest(openMs), exitIdx: nearest(closeMs), min, max };
}
