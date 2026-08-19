// Turn a candle series into the TechnicalFeatures bundle the level/analysis math
// (and the LLM narrative) consume. Pure — no I/O.
import { computeAtr } from '../macro/signals.js';
import type { Candle, TechnicalFeatures } from './types.js';
import { ema, rsi, swingPoints, clusterLevels, classifyTrend } from './indicators.js';

/** Proxy ATR when the true ATR can't be computed: a small fraction of price. */
function proxyAtr(price: number): number {
  return Math.abs(price) * 0.01;
}

/**
 * Extract features from candles (oldest→newest). Robust to short series: falls
 * back to price-proxy ATR and neutral RSI so downstream always has usable
 * numbers. Throws only if there is literally no candle.
 */
export function extractFeatures(candles: Candle[]): TechnicalFeatures {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('extractFeatures: no candles');
  }
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1]!;
  const price = last.close;

  const atrRaw = computeAtr(
    candles.map((c) => ({ high: c.high, low: c.low, close: c.close })),
    14,
  );
  const atr = atrRaw != null && atrRaw > 0 ? atrRaw : proxyAtr(price);

  const rsiRaw = rsi(closes, 14);
  const rsiVal = rsiRaw != null ? rsiRaw : 50;

  const ema20 = ema(closes, 20) ?? price;
  const ema50 = ema(closes, 50) ?? ema20;
  const trend = classifyTrend(price, ema20, ema50);

  // S/R from clustered fractal swings, split around the current price.
  const levels = clusterLevels(swingPoints(candles, 2));
  const support = levels
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price); // nearest (highest) first
  const resistance = levels
    .filter((l) => l.price > price)
    .sort((a, b) => a.price - b.price); // nearest (lowest) first

  const recentWindow = candles.slice(-Math.min(candles.length, 50));
  const recentHigh = Math.max(...recentWindow.map((c) => c.high));
  const recentLow = Math.min(...recentWindow.map((c) => c.low));

  return {
    price,
    atr,
    rsi: rsiVal,
    trend,
    ema20,
    ema50,
    support,
    resistance,
    recentHigh,
    recentLow,
    bars: candles.length,
  };
}
