// Synthetic candle builders for Trader Master engine tests. Not a test file.
import type { Candle } from '../types.js';

/** Build a candle from a close, with a symmetric high/low wick of `wick`. */
export function candleAt(close: number, openTime: number, wick = 1): Candle {
  return {
    openTime,
    open: close,
    high: close + wick,
    low: close - wick,
    close,
    volume: 1,
  };
}

/** Candles from an explicit close series (uniform wick). */
export function fromCloses(closes: number[], wick = 1): Candle[] {
  return closes.map((c, i) => candleAt(c, i * 60_000, wick));
}

/** A linear ramp of `n` bars from `start`, +`step` per bar (negative = down). */
export function ramp(n: number, start = 100, step = 1, wick = 1): Candle[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(start + i * step);
  return fromCloses(closes, wick);
}

/** A flat (ranging) series oscillating ±`amp` around `mid`. */
export function range(n: number, mid = 100, amp = 1, wick = 0.5): Candle[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) closes.push(mid + (i % 2 === 0 ? amp : -amp));
  return fromCloses(closes, wick);
}
