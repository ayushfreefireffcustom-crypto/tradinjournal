// Chart-pattern detection (E8). Pure: pass closed candles, oldest first.
//
// Everything starts from ZigZag pivots: a swing high or low counts once price
// has moved back from it by `swing` × ATR(14), so the pattern finder adapts to
// each market's volatility instead of using fixed percentages. From the pivots:
//   • support / resistance: pivot prices that cluster within half an ATR
//   • channels, ranges, triangles, wedges: lines through the latest highs and
//     lows, classified by slope and by whether they run parallel or converge
//   • double tops / bottoms: two peaks (troughs) at about the same price with a
//     meaningful dip (rally) between them; the neckline is that dip
//   • flags / pennants: a steep pole, then a short, shallow pause against it
// Each pattern carries the lines to draw, its breakout and invalidation
// levels and the classic measured-move target. Shapes are what they are:
// they describe the chart, they don't predict it.
import type { Candle } from '../trader/types.js';
import { atr as atrSeries } from '../indicators/series.js';

export interface Pivot { i: number; time: number; price: number; high: boolean; confirmed: boolean }
export interface PatternPoint { time: number; price: number; label?: string }
export type LineRole = 'support' | 'resistance' | 'upper' | 'lower' | 'neckline' | 'pole';
export interface PatternLine { a: PatternPoint; b: PatternPoint; role: LineRole }
export type PatternKind =
  | 'support' | 'resistance' | 'range'
  | 'ascending_channel' | 'descending_channel'
  | 'ascending_triangle' | 'descending_triangle' | 'symmetrical_triangle'
  | 'rising_wedge' | 'falling_wedge'
  | 'double_top' | 'double_bottom'
  | 'bull_flag' | 'bear_flag' | 'bull_pennant' | 'bear_pennant';
export type PatternFamily = 'level' | 'channel' | 'triangle' | 'wedge' | 'double' | 'flag';
export type PatternStatus = 'forming' | 'broke_up' | 'broke_down' | 'confirmed' | 'target_hit';

export interface Pattern {
  id: string;
  kind: PatternKind;
  family: PatternFamily;
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  status: PatternStatus;
  startTime: number;
  endTime: number;
  lines: PatternLine[];
  points: PatternPoint[];
  /** Price that confirms the pattern when closed beyond. */
  breakout: number | null;
  /** Price that says the read was wrong. */
  invalidation: number | null;
  /** Classic measured-move target. */
  target: number | null;
  /** 0–1: how cleanly price respects the lines. */
  quality: number;
  /** Times price touched the level (levels only). */
  touches?: number;
}

export const PATTERN_LABELS: Record<PatternKind, string> = {
  support: 'Support', resistance: 'Resistance', range: 'Range',
  ascending_channel: 'Ascending channel', descending_channel: 'Descending channel',
  ascending_triangle: 'Ascending triangle', descending_triangle: 'Descending triangle', symmetrical_triangle: 'Symmetrical triangle',
  rising_wedge: 'Rising wedge', falling_wedge: 'Falling wedge',
  double_top: 'Double top', double_bottom: 'Double bottom',
  bull_flag: 'Bull flag', bear_flag: 'Bear flag', bull_pennant: 'Bull pennant', bear_pennant: 'Bear pennant',
};

export interface DetectOptions {
  /** ZigZag swing size in ATRs (default 2). Lower finds more, noisier patterns. */
  swing?: number;
  /** Only patterns whose last pivot is within this many bars (default 120). */
  lookback?: number;
}

// ── Pivots ────────────────────────────────────────────────────────────────────

function atrAt(c: Candle[]): (i: number) => number {
  const a = atrSeries(c, 14);
  const firstReal = a.find((x): x is number => x != null);
  const fallback = firstReal ?? c.reduce((s, x) => s + (x.high - x.low), 0) / Math.max(1, c.length);
  return (i: number) => a[i] ?? fallback;
}

/** ZigZag on highs and lows. The final pivot is unconfirmed: price hasn't turned back far enough yet. */
export function zigzag(c: Candle[], swing = 2): Pivot[] {
  if (c.length < 3) return [];
  const atr = atrAt(c);
  const out: Pivot[] = [];
  const pv = (i: number, high: boolean, confirmed = true): Pivot => ({ i, time: c[i]!.openTime, price: high ? c[i]!.high : c[i]!.low, high, confirmed });
  let dir = 0;
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < c.length; i++) {
    const t = swing * atr(i);
    const b = c[i]!;
    if (dir === 0) {
      if (b.high > c[hi]!.high) hi = i;
      if (b.low < c[lo]!.low) lo = i;
      if (c[hi]!.high - c[lo]!.low >= t) {
        if (hi > lo) { out.push(pv(lo, false)); dir = 1; } else { out.push(pv(hi, true)); dir = -1; }
      }
    } else if (dir === 1) {
      if (b.high >= c[hi]!.high) hi = i;
      else if (c[hi]!.high - b.low >= t) { out.push(pv(hi, true)); dir = -1; lo = i; }
    } else {
      if (b.low <= c[lo]!.low) lo = i;
      else if (b.high - c[lo]!.low >= t) { out.push(pv(lo, false)); dir = 1; hi = i; }
    }
  }
  if (dir === 1) out.push(pv(hi, true, false));
  else if (dir === -1) out.push(pv(lo, false, false));
  return out;
}

// ── Lines ─────────────────────────────────────────────────────────────────────

interface Line { slope: number; icpt: number; at: (i: number) => number }
function fit(pts: Array<{ i: number; price: number }>): Line {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.i, 0) / n;
  const my = pts.reduce((s, p) => s + p.price, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.i - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, p) => s + (p.i - mx) * (p.price - my), 0) / sxx : 0;
  const icpt = my - slope * mx;
  return { slope, icpt, at: (i) => icpt + slope * i };
}
const maxResidual = (l: Line, pts: Array<{ i: number; price: number }>) => Math.max(...pts.map((p) => Math.abs(p.price - l.at(p.i))));

// ── Detectors ─────────────────────────────────────────────────────────────────

interface Ctx { c: Candle[]; piv: Pivot[]; atr: (i: number) => number; last: number; lookback: number }
const P = (c: Candle[], i: number, price: number, label?: string): PatternPoint => ({ time: c[Math.min(i, c.length - 1)]!.openTime, price, ...(label ? { label } : {}) });

/** First close beyond a line after bar `from`: 'up', 'down' or null. */
function breakoutAfter(ctx: Ctx, from: number, upper: (i: number) => number, lower: (i: number) => number): { dir: 'up' | 'down' | null; at: number } {
  for (let i = from + 1; i <= ctx.last; i++) {
    const cl = ctx.c[i]!.close;
    const pad = 0.1 * ctx.atr(i);
    if (cl > upper(i) + pad) return { dir: 'up', at: i };
    if (cl < lower(i) - pad) return { dir: 'down', at: i };
  }
  return { dir: null, at: -1 };
}

function levels(ctx: Ctx): Pattern[] {
  const { c, piv, last } = ctx;
  const tol = 0.5 * ctx.atr(last);
  const confirmed = piv.filter((p) => p.confirmed && p.i >= last - 4 * ctx.lookback);
  const sorted = [...confirmed].sort((a, b) => a.price - b.price);
  const groups: Pivot[][] = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g && p.price - g[0]!.price <= tol * 2 && Math.abs(p.price - g.reduce((s, x) => s + x.price, 0) / g.length) <= tol) g.push(p);
    else groups.push([p]);
  }
  const price = c[last]!.close;
  const out: Pattern[] = [];
  for (const g of groups.filter((x) => x.length >= 2)) {
    const lvl = g.reduce((s, x) => s + x.price, 0) / g.length;
    const first = Math.min(...g.map((x) => x.i));
    const kind: PatternKind = lvl > price ? 'resistance' : 'support';
    const spread = Math.max(...g.map((x) => x.price)) - Math.min(...g.map((x) => x.price));
    out.push({
      id: `${kind}:${c[first]!.openTime}:${lvl.toPrecision(6)}`, kind, family: 'level', label: PATTERN_LABELS[kind],
      bias: 'neutral', status: 'forming', startTime: c[first]!.openTime, endTime: c[last]!.openTime,
      lines: [{ a: P(c, first, lvl), b: P(c, last, lvl), role: kind }],
      points: g.sort((a, b) => a.i - b.i).map((x) => P(c, x.i, x.price)),
      breakout: lvl, invalidation: null, target: null,
      quality: Math.max(0, Math.min(1, 1 - spread / (2 * tol))), touches: g.length,
    });
  }
  // Nearest two each side, strongest first among equals.
  const pick = (k: PatternKind) => out.filter((p) => p.kind === k).sort((a, b) => Math.abs(a.breakout! - price) - Math.abs(b.breakout! - price) || b.touches! - a.touches!).slice(0, 2);
  return [...pick('resistance'), ...pick('support')];
}

function lines(ctx: Ctx): Pattern | null {
  const { c, last } = ctx;
  const conf = ctx.piv.filter((p) => p.confirmed);
  for (const take of [6, 5, 4]) {
    const win = conf.slice(-take);
    if (win.length < 4 || win[win.length - 1]!.i < last - ctx.lookback) continue;
    const highs = win.filter((p) => p.high);
    const lows = win.filter((p) => !p.high);
    if (highs.length < 2 || lows.length < 2) continue;
    const U = fit(highs);
    const L = fit(lows);
    const atrNow = ctx.atr(last);
    if (maxResidual(U, highs) > 0.6 * atrNow || maxResidual(L, lows) > 0.6 * atrNow) continue;
    const s = win[0]!.i;
    const e = win[win.length - 1]!.i;
    if (e - s < 8) continue;
    const h0 = U.at(s) - L.at(s);
    const h1 = U.at(e) - L.at(e);
    if (h0 <= 0 || h1 <= 0) continue; // converging lines already met: no pattern left
    const dU = U.at(e) - U.at(s);
    const dL = L.at(e) - L.at(s);
    const flat = (d: number) => Math.abs(d) <= 0.25 * h0;
    const ratio = h1 / h0;
    let kind: PatternKind | null = null;
    if (Math.abs(ratio - 1) <= 0.3) {
      if (flat(dU) && flat(dL)) kind = 'range';
      else if (dU > 0 && dL > 0) kind = 'ascending_channel';
      else if (dU < 0 && dL < 0) kind = 'descending_channel';
    } else if (ratio < 0.7) {
      if (flat(dU) && dL > 0) kind = 'ascending_triangle';
      else if (flat(dL) && dU < 0) kind = 'descending_triangle';
      else if (dU < 0 && dL > 0) kind = 'symmetrical_triangle';
      else if (dU > 0 && dL > 0) kind = 'rising_wedge';
      else if (dU < 0 && dL < 0) kind = 'falling_wedge';
    }
    if (!kind) continue;
    const family: PatternFamily = kind === 'range' || kind.endsWith('channel') ? 'channel' : kind.endsWith('triangle') ? 'triangle' : 'wedge';
    const bo = breakoutAfter(ctx, e, U.at, L.at);
    // A breakout that reverses through the far line has failed: not a pattern any more.
    if (bo.dir && c.slice(bo.at + 1, last + 1).some((x, j) => (bo.dir === 'up' ? x.close < L.at(bo.at + 1 + j) : x.close > U.at(bo.at + 1 + j)))) continue;
    const endI = bo.dir ? bo.at : last;
    const bias: Pattern['bias'] =
      kind === 'ascending_triangle' || kind === 'falling_wedge' ? 'bullish'
      : kind === 'descending_triangle' || kind === 'rising_wedge' ? 'bearish'
      : kind === 'ascending_channel' ? 'bullish' : kind === 'descending_channel' ? 'bearish' : 'neutral';
    const up = U.at(endI);
    const lo = L.at(endI);
    // Measured moves: the pattern's height (widest point for triangles), from the side it breaks.
    const height = family === 'triangle' ? h0 : h1;
    const wedgeBack = kind === 'rising_wedge' ? L.at(s) : kind === 'falling_wedge' ? U.at(s) : null;
    const target = bo.dir === 'up' ? (wedgeBack != null && kind === 'falling_wedge' ? wedgeBack : up + height)
      : bo.dir === 'down' ? (wedgeBack != null && kind === 'rising_wedge' ? wedgeBack : lo - height)
      : family === 'channel' ? null // a channel projects nothing until price leaves it
      : bias === 'bullish' ? (kind === 'falling_wedge' ? wedgeBack : up + height)
      : bias === 'bearish' ? (kind === 'rising_wedge' ? wedgeBack : lo - height)
      : null;
    const residual = Math.max(maxResidual(U, highs), maxResidual(L, lows));
    let status: PatternStatus = bo.dir === 'up' ? 'broke_up' : bo.dir === 'down' ? 'broke_down' : 'forming';
    if (bo.dir && target != null) {
      const hit = c.slice(bo.at, last + 1).some((b) => (bo.dir === 'up' ? b.high >= target : b.low <= target));
      if (hit) status = 'target_hit';
    }
    return {
      id: `${kind}:${c[s]!.openTime}`, kind, family, label: PATTERN_LABELS[kind], bias, status,
      startTime: c[s]!.openTime, endTime: c[endI]!.openTime,
      lines: [
        { a: P(c, s, U.at(s)), b: P(c, endI, up), role: 'upper' },
        { a: P(c, s, L.at(s)), b: P(c, endI, lo), role: 'lower' },
      ],
      points: win.map((p) => P(c, p.i, p.price)),
      breakout: bias === 'bearish' ? lo : bias === 'bullish' ? up : null,
      invalidation: bias === 'bearish' ? up : bias === 'bullish' ? lo : null,
      target: target ?? null,
      quality: Math.max(0, Math.min(1, 1 - residual / (0.6 * atrNow))),
    };
  }
  return null;
}

function doubles(ctx: Ctx): Pattern | null {
  const { c, last } = ctx;
  const conf = ctx.piv.filter((p) => p.confirmed);
  for (let k = conf.length - 1; k >= 2; k--) {
    const [a, m, b] = [conf[k - 2]!, conf[k - 1]!, conf[k]!];
    if (a.high !== b.high || m.high === a.high || b.i < last - ctx.lookback) continue;
    const top = a.high;
    const depth = top ? Math.min(a.price, b.price) - m.price : m.price - Math.max(a.price, b.price);
    const atrB = ctx.atr(b.i);
    if (depth < 2.5 * atrB) continue;
    if (Math.abs(a.price - b.price) > Math.max(0.12 * depth, 0.4 * atrB)) continue;
    // It needs a trend to reverse: a lower low before a top's first peak (higher high before a bottom's).
    const before = conf[k - 3];
    if (before && (top ? before.price >= m.price : before.price <= m.price)) continue;
    const extreme = top ? Math.max(a.price, b.price) : Math.min(a.price, b.price);
    const neck = m.price;
    // Price closing back through the peaks (troughs) at any point means the read failed.
    if (c.slice(b.i + 1, last + 1).some((x, j) => (top ? x.close > extreme + 0.25 * ctx.atr(b.i + 1 + j) : x.close < extreme - 0.25 * ctx.atr(b.i + 1 + j)))) continue;
    let status: PatternStatus = 'forming';
    let brokeAt = -1;
    for (let i = b.i + 1; i <= last; i++) {
      const cl = c[i]!.close;
      if (top ? cl < neck : cl > neck) { status = 'confirmed'; brokeAt = i; break; }
    }
    const height = Math.abs(extreme - neck);
    const target = top ? neck - height : neck + height;
    if (status === 'confirmed' && c.slice(brokeAt, last + 1).some((x) => (top ? x.low <= target : x.high >= target))) status = 'target_hit';
    const kind: PatternKind = top ? 'double_top' : 'double_bottom';
    const endI = brokeAt > 0 ? brokeAt : last;
    return {
      id: `${kind}:${c[a.i]!.openTime}`, kind, family: 'double', label: PATTERN_LABELS[kind], bias: top ? 'bearish' : 'bullish', status,
      startTime: c[a.i]!.openTime, endTime: c[endI]!.openTime,
      lines: [{ a: P(c, a.i, neck), b: P(c, endI, neck), role: 'neckline' }],
      points: [P(c, a.i, a.price, top ? 'Peak 1' : 'Trough 1'), P(c, m.i, m.price, 'Neckline'), P(c, b.i, b.price, top ? 'Peak 2' : 'Trough 2')],
      breakout: neck, invalidation: extreme, target,
      quality: Math.max(0, Math.min(1, 1 - Math.abs(a.price - b.price) / Math.max(0.12 * depth, 0.4 * atrB))),
    };
  }
  return null;
}

function flags(ctx: Ctx): Pattern | null {
  // Every candidate, then the biggest pole: a wiggle inside a flag's pause can
  // look like a small flag of its own.
  let best: { pole: number; p: Pattern } | null = null;
  const { c, last } = ctx;
  // The pause is shallow, so the pole's tip is usually still the unconfirmed last pivot.
  const piv = ctx.piv;
  for (let k = piv.length - 1; k >= 1 && k >= piv.length - 3; k--) {
    const [base, tip] = [piv[k - 1]!, piv[k]!];
    if (!base.confirmed) continue;
    const bull = tip.high;
    const pole = Math.abs(tip.price - base.price);
    // The pole starts where the steep move does: the last bar still near the base
    // (the ZigZag low can sit at the start of a long flat stretch before it).
    let start = base.i;
    for (let j = tip.i - 1; j >= base.i; j--) {
      if (bull ? c[j]!.low <= base.price + 0.1 * pole : c[j]!.high >= base.price - 0.1 * pole) { start = j; break; }
    }
    const bars = tip.i - start;
    const atrT = ctx.atr(tip.i);
    if (pole < 4 * atrT || bars > 15 || bars < 2) continue;
    const pause = c.slice(tip.i + 1, last + 1);
    if (pause.length < 4 || pause.length > 30) continue;
    // The pause gives back at most half the pole.
    const giveBack = bull ? tip.price - Math.min(...pause.map((x) => x.low)) : Math.max(...pause.map((x) => x.high)) - tip.price;
    if (giveBack > 0.5 * pole) continue;
    // The pole must dwarf the pause, or a wiggle inside a bigger flag passes for a pole.
    if (pole < 2.5 * (Math.max(...pause.map((x) => x.high)) - Math.min(...pause.map((x) => x.low)))) continue;
    const idx = pause.map((_, j) => tip.i + 1 + j);
    const U0 = fit(idx.map((i) => ({ i, price: c[i]!.high })));
    const L0 = fit(idx.map((i) => ({ i, price: c[i]!.low })));
    // Shift the fitted lines out so they wrap the pause.
    const uOff = Math.max(...idx.map((i) => c[i]!.high - U0.at(i)));
    const lOff = Math.min(...idx.map((i) => c[i]!.low - L0.at(i)));
    const U: Line = { slope: U0.slope, icpt: U0.icpt + uOff, at: (i) => U0.at(i) + uOff };
    const L: Line = { slope: L0.slope, icpt: L0.icpt + lOff, at: (i) => L0.at(i) + lOff };
    const s = tip.i + 1;
    const h0 = U.at(s) - L.at(s);
    const h1 = U.at(last) - L.at(last);
    // A flag drifts against the pole; a pennant narrows. Neither may run with it.
    const mid = (U.slope + L.slope) / 2;
    if (bull ? mid > 0.15 * atrT : mid < -0.15 * atrT) continue;
    const pennant = h1 < 0.6 * h0;
    const kind: PatternKind = bull ? (pennant ? 'bull_pennant' : 'bull_flag') : (pennant ? 'bear_pennant' : 'bear_flag');
    const lastBar = c[last]!;
    const brokeUp = lastBar.close > U.at(last - 1) && bull;
    const brokeDown = lastBar.close < L.at(last - 1) && !bull;
    const breakout = bull ? U.at(last) : L.at(last);
    // Measured move: the drawn pole's height, added to the breakout.
    const poleH = Math.abs(tip.price - (bull ? c[start]!.low : c[start]!.high));
    const target = bull ? breakout + poleH : breakout - poleH;
    const found: Pattern = {
      id: `${kind}:${c[start]!.openTime}`, kind, family: 'flag', label: PATTERN_LABELS[kind], bias: bull ? 'bullish' : 'bearish',
      status: brokeUp ? 'broke_up' : brokeDown ? 'broke_down' : 'forming',
      startTime: c[start]!.openTime, endTime: lastBar.openTime,
      lines: [
        { a: P(c, start, bull ? c[start]!.low : c[start]!.high), b: P(c, tip.i, tip.price), role: 'pole' },
        { a: P(c, s, U.at(s)), b: P(c, last, U.at(last)), role: 'upper' },
        { a: P(c, s, L.at(s)), b: P(c, last, L.at(last)), role: 'lower' },
      ],
      points: [P(c, start, bull ? c[start]!.low : c[start]!.high, 'Pole start'), P(c, tip.i, tip.price, 'Pole end')],
      breakout, invalidation: bull ? L.at(last) : U.at(last), target,
      quality: Math.max(0, Math.min(1, 1 - giveBack / (0.5 * pole))),
    };
    if (!best || pole > best.pole) best = { pole, p: found };
  }
  return best?.p ?? null;
}

/** Every pattern on the chart right now: nearest levels, plus the latest of each shape. */
export function detectPatterns(candles: Candle[], opts: DetectOptions = {}): { pivots: Pivot[]; patterns: Pattern[] } {
  if (candles.length < 30) return { pivots: [], patterns: [] };
  const piv = zigzag(candles, opts.swing ?? 2);
  const ctx: Ctx = { c: candles, piv, atr: atrAt(candles), last: candles.length - 1, lookback: opts.lookback ?? 120 };
  // Shapes price barely respects aren't worth drawing.
  const shapes = [lines(ctx), doubles(ctx), flags(ctx)].filter((p): p is Pattern => p != null && p.quality >= 0.15);
  return { pivots: piv, patterns: [...shapes, ...levels(ctx)] };
}
