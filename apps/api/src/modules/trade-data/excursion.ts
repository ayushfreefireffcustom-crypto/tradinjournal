// Max adverse / favourable excursion (MAE / MFE) of a closed position from
// candles, as price distances from the entry (≥ 0). Pure; the job in
// excursion.job.ts fetches the candles and stores the result.
//
//   • Timeframe: the finest that covers open → close in ≤ MAX_BARS bars
//     (1m for short trades, 5m/15m for longer ones, up to 1d).
//   • Only bars fully inside the trade count, plus the entry and exit fills
//     themselves, so prices from before the entry or after the exit never
//     inflate the numbers. A trade shorter than one bar uses its fills only.
//   • Same-instrument check (as the trade log's mini paths): when the entry or
//     exit is far outside the bars' range, the feed is a different instrument
//     (a broker CFD priced unlike the public feed) and nothing is stored.

export const EXC_TFS: Array<[string, number]> = [
  ['1m', 60_000], ['5m', 300_000], ['15m', 900_000], ['1h', 3_600_000], ['4h', 14_400_000], ['1d', 86_400_000],
];
export const MAX_BARS = 480;

export function excursionTf(openMs: number, closeMs: number): { tf: string; ms: number } {
  const span = Math.max(0, closeMs - openMs);
  const hit = EXC_TFS.find(([, ms]) => span / ms <= MAX_BARS) ?? EXC_TFS[EXC_TFS.length - 1]!;
  return { tf: hit[0], ms: hit[1] };
}

export interface ExcCandle { openTime: number; high: number; low: number; close: number }
export interface ExcTrade { side: 'LONG' | 'SHORT'; entry: number; exit: number; open: number; close: number }
export interface Excursion { maePrice: number; mfePrice: number; bars: number }

/** Null when the candles don't cover the trade or look like another instrument. */
export function computeExcursion(t: ExcTrade, candles: ExcCandle[], tfMs: number): Excursion | null {
  if (!(t.entry > 0) || !(t.exit > 0) || !(t.close >= t.open)) return null;
  const near = candles.filter(c => c.openTime + tfMs > t.open && c.openTime <= t.close && c.high >= c.low && c.low > 0);
  if (!near.length) return null;
  // The feed must cover the trade's span: a bar at (or right after) the open and one at the close.
  const first = Math.min(...near.map(c => c.openTime)), last = Math.max(...near.map(c => c.openTime));
  if (first > t.open + tfMs || last + tfMs < t.close - tfMs) return null;
  const lo = Math.min(...near.map(c => c.low)), hi = Math.max(...near.map(c => c.high));
  const tol = Math.max((hi - lo) * 0.5, Math.abs(t.entry) * 0.002);
  const off = (p: number) => p < lo - tol || p > hi + tol;
  if (off(t.entry) || off(t.exit)) return null;
  const inside = near.filter(c => c.openTime >= t.open && c.openTime + tfMs <= t.close);
  const highs = [t.entry, t.exit, ...inside.map(c => c.high)];
  const lows = [t.entry, t.exit, ...inside.map(c => c.low)];
  const max = Math.max(...highs), min = Math.min(...lows);
  const long = t.side === 'LONG';
  const r = (v: number) => Math.round(Math.max(0, v) * 1e8) / 1e8;
  return {
    maePrice: r(long ? t.entry - min : max - t.entry),
    mfePrice: r(long ? max - t.entry : t.entry - min),
    bars: inside.length,
  };
}

/** Money value of a price distance; null without a value per point. */
export function excursionMoney(distance: number, volume: number, pointValue: number | null): number | null {
  if (pointValue == null || !(volume > 0) || !Number.isFinite(distance)) return null;
  return Math.round(distance * volume * pointValue * 100) / 100;
}
