// Pure technical indicators for the Trader Master engine. No I/O.
// Every function is defensive: bad/short input yields a null or a safe default,
// never a throw — the orchestrator degrades gracefully rather than 500ing.
import type { Candle, SRLevel, Trend } from './types.js';

/** Simple moving average of the last `period` values. null if too short. */
export function sma(values: number[], period: number): number | null {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  let sum = 0;
  for (const v of slice) {
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum / period;
}

/**
 * Exponential moving average (final value), seeded with the SMA of the first
 * `period` values then smoothed. null when there are fewer than `period` values.
 */
export function ema(values: number[], period: number): number | null {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  const seed = sma(values.slice(0, period), period);
  if (seed == null) return null;
  let e = seed;
  for (let i = period; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isFinite(v)) return null;
    e = v * k + e * (1 - k);
  }
  return e;
}

/**
 * Wilder RSI over `period` (default 14) on a close series. Returns a value in
 * [0,100], or null when there aren't enough closes. 100/0 for one-sided runs.
 */
export function rsi(closes: number[], period = 14): number | null {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  // First average over the initial `period` deltas.
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (!Number.isFinite(diff)) return null;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // Wilder smoothing for the rest.
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (!Number.isFinite(diff)) return null;
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface SwingPoint {
  index: number;
  price: number;
  kind: 'high' | 'low';
}

/**
 * Fractal swing highs/lows: a bar whose high is the strict max (low the strict
 * min) of the window `±lookback`. Endpoints (without a full window) are skipped.
 */
export function swingPoints(candles: Candle[], lookback = 2): SwingPoint[] {
  const out: SwingPoint[] = [];
  if (!Array.isArray(candles) || candles.length < lookback * 2 + 1) return out;
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      const o = candles[j]!;
      if (o.high >= c.high) isHigh = false;
      if (o.low <= c.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, price: c.high, kind: 'high' });
    if (isLow) out.push({ index: i, price: c.low, kind: 'low' });
  }
  return out;
}

/**
 * Cluster nearby swing prices into S/R levels. Prices within `tolerancePct` of a
 * cluster's mean merge into it; `strength` counts the merged swings. Returned
 * sorted by price ascending. More-touched clusters get a higher strength.
 */
export function clusterLevels(
  points: SwingPoint[],
  tolerancePct = 0.0025,
): SRLevel[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; kind: 'high' | 'low' }[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    const mean = last ? last.prices.reduce((a, b) => a + b, 0) / last.prices.length : 0;
    if (last && Math.abs(p.price - mean) <= mean * tolerancePct) {
      last.prices.push(p.price);
    } else {
      clusters.push({ prices: [p.price], kind: p.kind });
    }
  }
  return clusters
    .map((c) => {
      const price = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      return {
        price,
        strength: c.prices.length,
        label: c.kind === 'high' ? 'swing high' : 'swing low',
      };
    })
    .sort((a, b) => a.price - b.price);
}

/**
 * Trend from EMA stack + slope. `up` when fast EMA is above slow and price is
 * above the fast EMA; `down` for the mirror; else `range`.
 */
export function classifyTrend(price: number, ema20: number, ema50: number): Trend {
  if (![price, ema20, ema50].every(Number.isFinite)) return 'range';
  const spread = Math.abs(ema20 - ema50) / (ema50 || 1);
  // Too tight to call a trend → range.
  if (spread < 0.0015) return 'range';
  if (ema20 > ema50 && price >= ema20) return 'up';
  if (ema20 < ema50 && price <= ema20) return 'down';
  return 'range';
}
