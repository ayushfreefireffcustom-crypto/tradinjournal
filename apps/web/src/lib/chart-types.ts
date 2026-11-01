// Chart types (E2): Heikin-Ashi bars, and the price-only charts Renko, Kagi and
// Point & Figure, built from ordinary candles. Pure functions, oldest first.
// Renko, Kagi and P&F use closing prices and ignore time: a new brick, line or
// column appears only when price moves far enough.
import type { Candle } from '@/lib/market-api';

export type ChartType = 'candles' | 'heikin' | 'renko' | 'kagi' | 'pnf';
export const CHART_TYPES: Array<{ id: ChartType; label: string; timeBased: boolean }> = [
  { id: 'candles', label: 'Candles', timeBased: true },
  { id: 'heikin', label: 'Heikin-Ashi', timeBased: true },
  { id: 'renko', label: 'Renko', timeBased: false },
  { id: 'kagi', label: 'Kagi', timeBased: false },
  { id: 'pnf', label: 'Point & figure', timeBased: false },
];

/** How big a box (Renko, P&F) or a reversal (Kagi) is. */
export type SizeMode = 'atr' | 'percent' | 'fixed';
export interface SizeSetting { mode: SizeMode; value: number }
export const DEFAULT_SIZE: Record<'renko' | 'kagi' | 'pnf', SizeSetting> = {
  renko: { mode: 'atr', value: 14 },
  kagi: { mode: 'percent', value: 2 },
  pnf: { mode: 'percent', value: 1 },
};

// ── Heikin-Ashi ───────────────────────────────────────────────────────────────

/** One Heikin-Ashi bar from a raw bar and the previous Heikin-Ashi bar. */
export function heikinBar(c: Candle, prev: Candle | null): Candle {
  const close = (c.open + c.high + c.low + c.close) / 4;
  const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
  return { openTime: c.openTime, open, close, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), volume: c.volume };
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) out.push(heikinBar(c, out[out.length - 1] ?? null));
  return out;
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

/** Average true range (Wilder) at the last bar; null without enough bars. */
export function atr(candles: Candle[], n = 14): number | null {
  if (candles.length < n + 1) return null;
  const tr = candles.map((c, i) => (i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1]!.close), Math.abs(c.low - candles[i - 1]!.close))));
  let a = tr.slice(1, n + 1).reduce((s, x) => s + x, 0) / n;
  for (let i = n + 1; i < tr.length; i++) a = (a * (n - 1) + tr[i]!) / n;
  return a;
}

/**
 * The box or reversal size in price. ATR uses `value` as its length, percent
 * is a share of the last close, fixed is the price amount itself. Null when it
 * can't be worked out (no data, not enough bars for ATR, or a non-positive size).
 */
export function resolveSize(candles: Candle[], s: SizeSetting): number | null {
  const last = candles[candles.length - 1]?.close;
  if (last == null || !(s.value > 0)) return null;
  const v = s.mode === 'atr' ? atr(candles, Math.round(s.value)) : s.mode === 'percent' ? (last * s.value) / 100 : s.value;
  return v != null && v > 0 && Number.isFinite(v) ? v : null;
}

// ── Renko ─────────────────────────────────────────────────────────────────────

export interface Brick { open: number; close: number; up: boolean; time: number }

/**
 * Close-based Renko. A brick is added each time the close moves a full box
 * beyond the last brick; turning around takes two boxes (past the far side of
 * the last brick), which is what filters out noise.
 */
export function renko(candles: Candle[], box: number): Brick[] {
  if (!candles.length || !(box > 0)) return [];
  const bricks: Brick[] = [];
  let hi = candles[0]!.close;
  let lo = hi;
  for (const c of candles) {
    while (c.close >= hi + box) { bricks.push({ open: hi, close: hi + box, up: true, time: c.openTime }); lo = hi; hi += box; }
    while (c.close <= lo - box) { bricks.push({ open: lo, close: lo - box, up: false, time: c.openTime }); hi = lo; lo -= box; }
  }
  return bricks;
}

// ── Kagi ──────────────────────────────────────────────────────────────────────

/** One vertical Kagi line; `pieces` split it where it turns thick (yang) or thin (yin). */
export interface KagiLeg { from: number; to: number; up: boolean; time: number; pieces: Array<{ from: number; to: number; yang: boolean }> }

/**
 * A line follows price while it keeps going; once price turns back by the
 * reversal amount a new line starts. A line turns thick (yang) when it rises
 * above the last peak and thin (yin) when it falls below the last trough.
 */
export function kagi(candles: Candle[], reversal: number): KagiLeg[] {
  if (!candles.length || !(reversal > 0)) return [];
  const raw: Array<{ from: number; to: number; up: boolean; time: number }> = [];
  const start = candles[0]!.close;
  let leg: { from: number; to: number; up: boolean; time: number } | null = null;
  for (const c of candles) {
    const p = c.close;
    if (!leg) {
      if (Math.abs(p - start) >= reversal) leg = { from: start, to: p, up: p > start, time: c.openTime };
      continue;
    }
    if (leg.up ? p > leg.to : p < leg.to) leg.to = p;
    else if (Math.abs(leg.to - p) >= reversal) {
      raw.push(leg);
      leg = { from: leg.to, to: p, up: !leg.up, time: c.openTime };
    }
  }
  if (leg) raw.push(leg);

  // Thickness: shoulders (peaks) and waists (troughs) of earlier lines.
  const out: KagiLeg[] = [];
  let yang = raw[0]?.up ?? true;
  let shoulder: number | null = null;
  let waist: number | null = null;
  for (const l of raw) {
    const pieces: KagiLeg['pieces'] = [];
    if (l.up && shoulder != null && l.to > shoulder && l.from < shoulder && !yang) {
      pieces.push({ from: l.from, to: shoulder, yang: false }, { from: shoulder, to: l.to, yang: true });
      yang = true;
    } else if (!l.up && waist != null && l.to < waist && l.from > waist && yang) {
      pieces.push({ from: l.from, to: waist, yang: true }, { from: waist, to: l.to, yang: false });
      yang = false;
    } else {
      if (l.up && shoulder != null && l.to > shoulder) yang = true;
      if (!l.up && waist != null && l.to < waist) yang = false;
      pieces.push({ from: l.from, to: l.to, yang });
    }
    if (l.up) shoulder = l.to; else waist = l.to;
    out.push({ ...l, pieces });
  }
  return out;
}

// ── Point & Figure ────────────────────────────────────────────────────────────

/** A column of Xs (rising) or Os (falling) covering boxes low..high (box index × size = price). */
export interface PnfColumn { x: boolean; low: number; high: number; time: number }

/**
 * Close-based Point & Figure. Xs are added while the close fills new boxes
 * upward, Os downward; switching columns takes `reversal` boxes (3 is classic).
 */
export function pointFigure(candles: Candle[], box: number, reversal = 3): PnfColumn[] {
  if (!candles.length || !(box > 0) || reversal < 1) return [];
  const cols: PnfColumn[] = [];
  const up = (p: number) => Math.floor(p / box + 1e-9);
  const down = (p: number) => Math.ceil(p / box - 1e-9);
  const ref = up(candles[0]!.close);
  for (const c of candles) {
    const p = c.close;
    const col = cols[cols.length - 1];
    if (!col) {
      if (up(p) > ref) cols.push({ x: true, low: ref + 1, high: up(p), time: c.openTime });
      else if (down(p) < ref) cols.push({ x: false, low: down(p), high: ref - 1, time: c.openTime });
      continue;
    }
    if (col.x) {
      if (up(p) > col.high) col.high = up(p);
      else if (down(p) <= col.high - reversal) cols.push({ x: false, low: down(p), high: col.high - 1, time: c.openTime });
    } else {
      if (down(p) < col.low) col.low = down(p);
      else if (up(p) >= col.low + reversal) cols.push({ x: true, low: col.low + 1, high: up(p), time: c.openTime });
    }
  }
  return cols;
}
