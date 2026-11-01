// Indicator maths over whole series (E1). Every function returns one value per
// input bar, aligned to the input, with null until there's enough data: never
// a made-up 0. Conventions follow TradingView's built-ins so numbers match what
// traders see on their charts: EMA seeded with an SMA, Wilder smoothing (RMA)
// for RSI/ATR/ADX, population standard deviation for Bollinger Bands.
import type { Candle } from '../trader/types.js';

export type Series = Array<number | null>;

const nulls = (n: number): Series => new Array<number | null>(n).fill(null);

/** Apply a series function to a series that may start with nulls (e.g. EMA of an RSI). */
function onDefined(src: Series, fn: (vals: number[]) => Series): Series {
  const start = src.findIndex((v) => v != null);
  const out = nulls(src.length);
  if (start < 0) return out;
  const vals = src.slice(start) as number[];
  if (vals.some((v) => v == null)) return out; // a gap in the middle: unknown, not guessed
  const r = fn(vals);
  for (let i = 0; i < r.length; i++) out[start + i] = r[i]!;
  return out;
}

// ── Moving averages ──────────────────────────────────────────────────────────

export function sma(values: number[], n: number): Series {
  const out = nulls(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= n) sum -= values[i - n]!;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first n values (TradingView's ta.ema behaviour after warm-up). */
export function ema(values: number[], n: number): Series {
  const out = nulls(values.length);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA): alpha 1/n, seeded with an SMA. */
export function rma(values: number[], n: number): Series {
  const out = nulls(values.length);
  if (values.length < n) return out;
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = (prev * (n - 1) + values[i]!) / n;
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], n: number): Series {
  const out = nulls(values.length);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < values.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += values[i - j]! * (n - j);
    out[i] = s / denom;
  }
  return out;
}

export function vwma(c: Candle[], n: number): Series {
  const out = nulls(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let pv = 0;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) { pv += c[j]!.close * c[j]!.volume; v += c[j]!.volume; }
    out[i] = v > 0 ? pv / v : null;
  }
  return out;
}

/** Hull MA: WMA(2·WMA(n/2) − WMA(n), √n). */
export function hma(values: number[], n: number): Series {
  const half = wma(values, Math.max(1, Math.floor(n / 2)));
  const full = wma(values, n);
  const diff: Series = values.map((_, i) => (half[i] != null && full[i] != null ? 2 * half[i]! - full[i]! : null));
  return onDefined(diff, (d) => wma(d, Math.max(1, Math.floor(Math.sqrt(n)))));
}

export function dema(values: number[], n: number): Series {
  const e1 = ema(values, n);
  const e2 = onDefined(e1, (d) => ema(d, n));
  return values.map((_, i) => (e1[i] != null && e2[i] != null ? 2 * e1[i]! - e2[i]! : null));
}

export function tema(values: number[], n: number): Series {
  const e1 = ema(values, n);
  const e2 = onDefined(e1, (d) => ema(d, n));
  const e3 = onDefined(e2, (d) => ema(d, n));
  return values.map((_, i) => (e1[i] != null && e2[i] != null && e3[i] != null ? 3 * e1[i]! - 3 * e2[i]! + e3[i]! : null));
}

// ── Helpers over windows ─────────────────────────────────────────────────────

export function highest(values: number[], n: number): Series {
  const out = nulls(values.length);
  for (let i = n - 1; i < values.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.max(m, values[j]!); out[i] = m; }
  return out;
}
export function lowest(values: number[], n: number): Series {
  const out = nulls(values.length);
  for (let i = n - 1; i < values.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) m = Math.min(m, values[j]!); out[i] = m; }
  return out;
}
/** Population standard deviation over n bars (TradingView ta.stdev). */
export function stdev(values: number[], n: number): Series {
  const out = nulls(values.length);
  const mean = sma(values, n);
  for (let i = n - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (values[j]! - mean[i]!) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}

const closes = (c: Candle[]) => c.map((x) => x.close);
const typical = (c: Candle[]) => c.map((x) => (x.high + x.low + x.close) / 3);
const hl2 = (c: Candle[]) => c.map((x) => (x.high + x.low) / 2);

export function trueRange(c: Candle[]): number[] {
  return c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1]!.close), Math.abs(x.low - c[i - 1]!.close))));
}

// ── Trend ────────────────────────────────────────────────────────────────────

export function macd(values: number[], fast = 12, slow = 26, signal = 9): { macd: Series; signal: Series; hist: Series } {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const sig = onDefined(line, (d) => ema(d, signal));
  return { macd: line, signal: sig, hist: line.map((m, i) => (m != null && sig[i] != null ? m - sig[i]! : null)) };
}

export function atr(c: Candle[], n = 14): Series {
  return rma(trueRange(c), n);
}

/** Wilder's ADX with +DI and −DI. */
export function adx(c: Candle[], n = 14): { adx: Series; plusDi: Series; minusDi: Series } {
  const len = c.length;
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  for (let i = 1; i < len; i++) {
    const up = c[i]!.high - c[i - 1]!.high;
    const down = c[i - 1]!.low - c[i]!.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }
  const tr = rma(trueRange(c), n);
  const pdm = rma(plusDm, n);
  const mdm = rma(minusDm, n);
  const plusDi: Series = c.map((_, i) => (tr[i] ? (100 * pdm[i]!) / tr[i]! : null));
  const minusDi: Series = c.map((_, i) => (tr[i] ? (100 * mdm[i]!) / tr[i]! : null));
  const dx: Series = c.map((_, i) => {
    const p = plusDi[i];
    const m = minusDi[i];
    if (p == null || m == null) return null;
    return p + m === 0 ? 0 : (100 * Math.abs(p - m)) / (p + m);
  });
  return { adx: onDefined(dx, (d) => rma(d, n)), plusDi, minusDi };
}

/** Supertrend: an ATR band that flips sides when the close crosses it. direction 1 = up, −1 = down. */
export function supertrend(c: Candle[], n = 10, mult = 3): { line: Series; direction: Series } {
  const a = atr(c, n);
  const line = nulls(c.length);
  const direction = nulls(c.length);
  let upper = 0;
  let lower = 0;
  let dir = 1;
  let started = false;
  for (let i = 0; i < c.length; i++) {
    if (a[i] == null) continue;
    const mid = (c[i]!.high + c[i]!.low) / 2;
    const bu = mid + mult * a[i]!;
    const bl = mid - mult * a[i]!;
    if (!started) {
      upper = bu; lower = bl; dir = 1; started = true;
    } else {
      const prevClose = c[i - 1]!.close;
      upper = bu < upper || prevClose > upper ? bu : upper;
      lower = bl > lower || prevClose < lower ? bl : lower;
      if (dir === -1 && c[i]!.close > upper) dir = 1;
      else if (dir === 1 && c[i]!.close < lower) dir = -1;
    }
    line[i] = dir === 1 ? lower : upper;
    direction[i] = dir;
  }
  return { line, direction };
}

/** Parabolic SAR (Wilder). */
export function psar(c: Candle[], step = 0.02, max = 0.2): Series {
  const out = nulls(c.length);
  if (c.length < 2) return out;
  let long = c[1]!.close >= c[0]!.close;
  let sar = long ? c[0]!.low : c[0]!.high;
  let ep = long ? c[0]!.high : c[0]!.low;
  let af = step;
  for (let i = 1; i < c.length; i++) {
    sar = sar + af * (ep - sar);
    // The SAR may not move inside the previous two bars' range.
    if (long) sar = Math.min(sar, c[i - 1]!.low, i > 1 ? c[i - 2]!.low : c[i - 1]!.low);
    else sar = Math.max(sar, c[i - 1]!.high, i > 1 ? c[i - 2]!.high : c[i - 1]!.high);
    if (long && c[i]!.low < sar) {
      long = false; sar = ep; ep = c[i]!.low; af = step;
    } else if (!long && c[i]!.high > sar) {
      long = true; sar = ep; ep = c[i]!.high; af = step;
    } else if (long && c[i]!.high > ep) {
      ep = c[i]!.high; af = Math.min(max, af + step);
    } else if (!long && c[i]!.low < ep) {
      ep = c[i]!.low; af = Math.min(max, af + step);
    }
    out[i] = sar;
  }
  return out;
}

export function donchian(c: Candle[], n = 20): { upper: Series; lower: Series; middle: Series } {
  const upper = highest(c.map((x) => x.high), n);
  const lower = lowest(c.map((x) => x.low), n);
  return { upper, lower, middle: upper.map((u, i) => (u != null && lower[i] != null ? (u + lower[i]!) / 2 : null)) };
}

/**
 * Ichimoku, as it applies to each bar: tenkan and kijun at the bar; span A and
 * B are the cloud over this bar (computed `displacement` bars earlier); chikou
 * is the close `displacement` bars ahead, so it's known only for older bars.
 */
export function ichimoku(c: Candle[], conv = 9, base = 26, spanB = 52, displacement = 26): { tenkan: Series; kijun: Series; spanA: Series; spanB: Series; chikou: Series } {
  const mid = (n: number) => {
    const h = highest(c.map((x) => x.high), n);
    const l = lowest(c.map((x) => x.low), n);
    return h.map((v, i) => (v != null && l[i] != null ? (v + l[i]!) / 2 : null));
  };
  const tenkan = mid(conv);
  const kijun = mid(base);
  const b = mid(spanB);
  const a: Series = tenkan.map((t, i) => (t != null && kijun[i] != null ? (t + kijun[i]!) / 2 : null));
  const shift = (s: Series, k: number): Series => s.map((_, i) => (i - k >= 0 ? s[i - k]! : null));
  return {
    tenkan,
    kijun,
    spanA: shift(a, displacement),
    spanB: shift(b, displacement),
    chikou: c.map((_, i) => (i + displacement < c.length ? c[i + displacement]!.close : null)),
  };
}

// ── Oscillators ──────────────────────────────────────────────────────────────

export function rsi(values: number[], n = 14): Series {
  const out = nulls(values.length);
  if (values.length <= n) return out;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = rma(gains, n);
  const l = rma(losses, n);
  for (let i = 0; i < gains.length; i++) {
    if (g[i] == null || l[i] == null) continue;
    out[i + 1] = l[i] === 0 ? (g[i] === 0 ? 50 : 100) : 100 - 100 / (1 + g[i]! / l[i]!);
  }
  return out;
}

/** Stochastic of any series over n bars, 0–100; null where the range is flat. */
function stochOf(values: Series, hi: Series, lo: Series): Series {
  return values.map((v, i) => (v != null && hi[i] != null && lo[i] != null ? (hi[i] === lo[i] ? null : (100 * (v - lo[i]!)) / (hi[i]! - lo[i]!)) : null));
}

/** Keep a 0–100 series in range: rolling sums can drift a hair past the bounds (100.00000000000007). */
const clamp100 = (xs: Series): Series => xs.map((v) => (v == null ? null : Math.min(100, Math.max(0, v))));

export function stochastic(c: Candle[], n = 14, smoothK = 3, smoothD = 3): { k: Series; d: Series } {
  const raw = stochOf(closes(c), highest(c.map((x) => x.high), n), lowest(c.map((x) => x.low), n));
  const k = clamp100(onDefined(raw, (d) => sma(d, smoothK)));
  return { k, d: clamp100(onDefined(k, (d) => sma(d, smoothD))) };
}

export function stochRsi(values: number[], rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3): { k: Series; d: Series } {
  const r = rsi(values, rsiLen);
  const hi = onDefined(r, (d) => highest(d, stochLen));
  const lo = onDefined(r, (d) => lowest(d, stochLen));
  const raw = stochOf(r, hi, lo);
  const k = clamp100(onDefined(raw, (d) => sma(d, smoothK)));
  return { k, d: clamp100(onDefined(k, (d) => sma(d, smoothD))) };
}

export function cci(c: Candle[], n = 20): Series {
  const tp = typical(c);
  const m = sma(tp, n);
  return tp.map((v, i) => {
    if (m[i] == null) return null;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j]! - m[i]!);
    dev /= n;
    return dev === 0 ? 0 : (v - m[i]!) / (0.015 * dev);
  });
}

export function williamsR(c: Candle[], n = 14): Series {
  const hi = highest(c.map((x) => x.high), n);
  const lo = lowest(c.map((x) => x.low), n);
  return c.map((x, i) => (hi[i] != null && lo[i] != null ? (hi[i] === lo[i] ? null : (-100 * (hi[i]! - x.close)) / (hi[i]! - lo[i]!)) : null));
}

export function mfi(c: Candle[], n = 14): Series {
  const tp = typical(c);
  const out = nulls(c.length);
  for (let i = n; i < c.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const flow = tp[j]! * c[j]!.volume;
      if (tp[j]! > tp[j - 1]!) pos += flow;
      else if (tp[j]! < tp[j - 1]!) neg += flow;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function roc(values: number[], n = 9): Series {
  return values.map((v, i) => (i >= n && values[i - n] !== 0 ? (100 * (v - values[i - n]!)) / values[i - n]! : null));
}

export function momentum(values: number[], n = 10): Series {
  return values.map((v, i) => (i >= n ? v - values[i - n]! : null));
}

export function awesome(c: Candle[], fast = 5, slow = 34): Series {
  const m = hl2(c);
  const f = sma(m, fast);
  const s = sma(m, slow);
  return m.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
}

export function ultimate(c: Candle[], s1 = 7, s2 = 14, s3 = 28): Series {
  const bp: number[] = [];
  const tr: number[] = [];
  for (let i = 0; i < c.length; i++) {
    const prevClose = i > 0 ? c[i - 1]!.close : c[i]!.close;
    const lo = Math.min(c[i]!.low, prevClose);
    const hi = Math.max(c[i]!.high, prevClose);
    bp.push(c[i]!.close - lo);
    tr.push(hi - lo);
  }
  const avg = (n: number, i: number) => {
    let b = 0;
    let t = 0;
    for (let j = i - n + 1; j <= i; j++) { b += bp[j]!; t += tr[j]!; }
    return t === 0 ? null : b / t;
  };
  return c.map((_, i) => {
    if (i < s3) return null; // needs a previous close for the first bar of the longest window
    const a1 = avg(s1, i);
    const a2 = avg(s2, i);
    const a3 = avg(s3, i);
    return a1 == null || a2 == null || a3 == null ? null : (100 * (4 * a1 + 2 * a2 + a3)) / 7;
  });
}

// ── Volatility ───────────────────────────────────────────────────────────────

export function bollinger(values: number[], n = 20, mult = 2): { upper: Series; middle: Series; lower: Series; width: Series } {
  const middle = sma(values, n);
  const sd = stdev(values, n);
  const upper = middle.map((m, i) => (m != null ? m + mult * sd[i]! : null));
  const lower = middle.map((m, i) => (m != null ? m - mult * sd[i]! : null));
  return { upper, middle, lower, width: middle.map((m, i) => (m ? (upper[i]! - lower[i]!) / m : null)) };
}

export function keltner(c: Candle[], n = 20, mult = 2, atrLen = 10): { upper: Series; middle: Series; lower: Series } {
  const middle = ema(closes(c), n);
  const a = atr(c, atrLen);
  return {
    upper: middle.map((m, i) => (m != null && a[i] != null ? m + mult * a[i]! : null)),
    middle,
    lower: middle.map((m, i) => (m != null && a[i] != null ? m - mult * a[i]! : null)),
  };
}

// ── Volume ───────────────────────────────────────────────────────────────────

/** VWAP that restarts each UTC day. */
export function vwap(c: Candle[]): Series {
  let day = -1;
  let pv = 0;
  let v = 0;
  return c.map((x) => {
    const d = Math.floor(x.openTime / 86_400_000);
    if (d !== day) { day = d; pv = 0; v = 0; }
    const tp = (x.high + x.low + x.close) / 3;
    pv += tp * x.volume;
    v += x.volume;
    return v > 0 ? pv / v : null;
  });
}

export function obv(c: Candle[]): Series {
  let acc = 0;
  return c.map((x, i) => {
    if (i > 0) acc += x.close > c[i - 1]!.close ? x.volume : x.close < c[i - 1]!.close ? -x.volume : 0;
    return acc;
  });
}

function moneyFlowMultiplier(x: Candle): number {
  return x.high === x.low ? 0 : (x.close - x.low - (x.high - x.close)) / (x.high - x.low);
}

export function cmf(c: Candle[], n = 20): Series {
  const out = nulls(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let mfv = 0;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) { mfv += moneyFlowMultiplier(c[j]!) * c[j]!.volume; v += c[j]!.volume; }
    out[i] = v === 0 ? null : mfv / v;
  }
  return out;
}

export function accDist(c: Candle[]): Series {
  let acc = 0;
  return c.map((x) => (acc += moneyFlowMultiplier(x) * x.volume));
}
