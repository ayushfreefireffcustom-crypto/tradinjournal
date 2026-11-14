// Estimated liquidation map + max pain for USDT perpetuals (CoinGlass-style).
//
// No exchange publishes where resting liquidations sit, so this is a MODEL. It
// rebuilds the positions opened over a look-back window from public data and
// works out where each would be force-closed. Every number it returns is an
// estimate and must be labelled as one.
//
// Assumptions (each one is a knob in LiquidationModelOptions):
//  1. New positions per bar = the rise in open interest over that bar (base
//     units, converted to USD at the entry price). A fall in open interest
//     closes positions pro rata across every cohort opened earlier in the
//     window. Positions opened before the window are not modelled.
//     With no open-interest history at all, a fixed share of each bar's volume
//     (fallbackOpenShare) stands in for the new positions.
//  2. Entries inside a bar are spread over five prices from low to high,
//     centred on the typical price (h+l+c)/3, weighted 1:2:3:2:1.
//  3. The leveraged (liquidatable) side of the new interest is split long/short
//     with a blend of the bar's taker-buy share and the global long/short
//     account ratio (takerWeight on the taker share). With only one of the two,
//     that one is used; with neither, the candle's colour tilts it 55/45.
//  4. Leverage mix: 5x 15 %, 10x 30 %, 25x 25 %, 50x 20 %, 100x 10 %, one
//     maintenance-margin rate (0.5 %) for all tiers. Isolated-margin maths:
//       long liq  = entry × (1 − 1/lev + mmr)
//       short liq = entry × (1 + 1/lev − mmr)
//  5. A cohort is gone once price has traded through its liquidation price in
//     any later bar (the bar it was opened in is not checked), and longs above
//     / shorts below the current price are gone by definition.
//  6. Surviving notional is bucketed into evenly spaced bands across
//     ±rangePct of the price, with a "nice" step (1/2/2.5/5 × 10^k).
//  7. Max pain = the biggest long cluster below and the biggest short cluster
//     above price within ±maxPainRangePct, a cluster being a band plus its two
//     neighbours (smooths single-bucket noise); ties go to the nearer band.
//  8. Touch chance in 24 h = barrier-hit probability for a driftless random
//     walk in log price: P = 2 × (1 − Φ(|ln(target/price)| / (σ√T))), σ the
//     realised volatility of the window's bar closes scaled to a day.
import { normCdf } from '../options/bs.js';

const DAY_MS = 86_400_000;

export interface LiqBar {
  /** Bar open time, ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Traded volume, base units. */
  volume: number;
  /** Taker-buy volume, base units; null when the venue doesn't give it. */
  takerBuy: number | null;
}
/** Open-interest snapshot in base units. */
export interface LiqOiPoint { t: number; oi: number }
/** Share of accounts long, 0..1. */
export interface LiqRatioPoint { t: number; longShare: number }
export interface LeverageTier { lev: number; weight: number }

export const LIQ_LEVERAGE_TIERS: readonly LeverageTier[] = [
  { lev: 5, weight: 0.15 },
  { lev: 10, weight: 0.3 },
  { lev: 25, weight: 0.25 },
  { lev: 50, weight: 0.2 },
  { lev: 100, weight: 0.1 },
];

export interface LiquidationModelOptions {
  /** Bar length in ms (used for the last bar's end and to scale volatility). */
  barMs: number;
  tiers?: readonly LeverageTier[];
  /** Maintenance-margin rate, fraction. */
  mmr?: number;
  /** Half-width of the band ladder around price, fraction. */
  rangePct?: number;
  /** Rough number of bands across the ladder. */
  targetBands?: number;
  /** Half-width of the max-pain search, fraction. */
  maxPainRangePct?: number;
  /** Weight on taker-buy share vs the account ratio when both are known. */
  takerWeight?: number;
  /** Share of volume treated as new positions when there's no OI history. */
  fallbackOpenShare?: number;
  /** Current price; defaults to the last close. */
  price?: number;
  /** "Now", ms; defaults to the end of the last bar. */
  now?: number;
}

export interface LiquidationModelBand { price: number; longUsd: number; shortUsd: number }
export interface LiquidationMaxPain {
  longPrice: number;
  longUsd: number;
  /** Signed distance from price, % (negative: below). */
  longPct: number;
  shortPrice: number;
  shortUsd: number;
  /** Signed distance from price, % (positive: above). */
  shortPct: number;
  touchDownPct: number | null;
  touchUpPct: number | null;
}
export interface LiquidationModelResult {
  price: number;
  step: number;
  /** Ascending by price, contiguous across the ladder. */
  bands: LiquidationModelBand[];
  maxPain: LiquidationMaxPain;
  /** Realised volatility scaled to one day, fraction; null if too few bars. */
  sigma24h: number | null;
  /** Notional the model thinks was opened over the window, USD. */
  openedUsd: number;
  /** Notional still sitting on the ladder, USD. */
  restingUsd: number;
}

const ENTRY_WEIGHTS = [1, 2, 3, 2, 1].map((w) => w / 9);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Liquidation price of an isolated position. */
export function liquidationPrice(side: 'long' | 'short', entry: number, lev: number, mmr: number): number {
  return side === 'long' ? entry * (1 - 1 / lev + mmr) : entry * (1 + 1 / lev - mmr);
}

/** Smallest 1/2/2.5/5 × 10^k at or above raw. */
export function liquidationStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const m = [1, 2, 2.5, 5, 10].find((x) => x >= f - 1e-12) ?? 10;
  return roundTo(m * exp, decimalsFor(m * exp) + 2);
}

function decimalsFor(step: number): number {
  return Math.max(0, 1 - Math.floor(Math.log10(step)));
}
function roundTo(x: number, d: number): number {
  return Number(x.toFixed(Math.min(20, Math.max(0, d))));
}

/** Realised volatility of closes scaled to one day (fraction), or null with fewer than 10 returns. */
export function realisedVol24h(closes: readonly number[], barMs: number): number | null {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!;
    const b = closes[i]!;
    if (a > 0 && b > 0) r.push(Math.log(b / a));
  }
  if (r.length < 10) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  const sd = Math.sqrt(v);
  if (!(sd > 0)) return null;
  return sd * Math.sqrt(DAY_MS / barMs);
}

/** Chance (0..100) a driftless random walk in log price touches target within horizonDays. */
export function touchProbability(price: number, target: number, sigma24h: number | null, horizonDays = 1): number | null {
  if (sigma24h == null || !(sigma24h > 0) || !(price > 0) || !(target > 0)) return null;
  const d = Math.abs(Math.log(target / price));
  const p = 2 * (1 - normCdf(d / (sigma24h * Math.sqrt(horizonDays))));
  return roundTo(clamp(p, 0, 1) * 100, 1);
}

/** Latest point at or before t (points sorted ascending), or undefined. */
function at<T extends { t: number }>(points: readonly T[], t: number): T | undefined {
  let lo = 0;
  let hi = points.length - 1;
  let found: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = points[mid]!;
    if (p.t <= t) { found = p; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Biggest cluster (band ± 1 neighbour) among the bands at idx, ties to the one nearest price. */
function biggestCluster(bands: LiquidationModelBand[], idx: number[], key: 'longUsd' | 'shortUsd', price: number): { price: number; usd: number } | null {
  let best: { price: number; usd: number } | null = null;
  for (const i of idx) {
    const usd = (bands[i - 1]?.[key] ?? 0) + bands[i]![key] + (bands[i + 1]?.[key] ?? 0);
    if (usd <= 0) continue;
    const p = bands[i]!.price;
    if (!best || usd > best.usd || (usd === best.usd && Math.abs(p - price) < Math.abs(best.price - price))) best = { price: p, usd };
  }
  return best;
}

export function buildLiquidationMap(
  input: { bars: readonly LiqBar[]; oi?: readonly LiqOiPoint[]; ratio?: readonly LiqRatioPoint[] },
  opts: LiquidationModelOptions,
): LiquidationModelResult {
  const tiers = opts.tiers ?? LIQ_LEVERAGE_TIERS;
  const mmr = opts.mmr ?? 0.005;
  const rangePct = opts.rangePct ?? 0.15;
  const targetBands = opts.targetBands ?? 120;
  const mpRange = opts.maxPainRangePct ?? 0.1;
  const takerWeight = opts.takerWeight ?? 0.6;
  const fallbackShare = opts.fallbackOpenShare ?? 0.05;

  const bars = [...input.bars].filter((b) => b.h > 0 && b.l > 0 && b.h >= b.l).sort((a, b) => a.t - b.t);
  const oi = [...(input.oi ?? [])].filter((p) => Number.isFinite(p.oi) && p.oi >= 0).sort((a, b) => a.t - b.t);
  const ratio = [...(input.ratio ?? [])].filter((p) => p.longShare >= 0 && p.longShare <= 1).sort((a, b) => a.t - b.t);
  const n = bars.length;
  const last = bars[n - 1];
  const price = opts.price ?? last?.c ?? 0;
  const now = opts.now ?? (last ? last.t + opts.barMs : 0);

  const tierSum = tiers.reduce((s, t) => s + t.weight, 0) || 1;
  const step = price > 0 ? liquidationStep((price * 2 * rangePct) / targetBands) : 1;
  const dec = decimalsFor(step);
  const k0 = Math.floor((price * (1 - rangePct)) / step);
  const k1 = Math.ceil((price * (1 + rangePct)) / step);
  const longs = new Float64Array(Math.max(0, k1 - k0 + 1));
  const shorts = new Float64Array(longs.length);

  // Per bar: new base opened and share of earlier positions closed.
  const opened = new Float64Array(n);
  const closeFrac = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    if (oi.length === 0) { opened[i] = b.volume * fallbackShare; continue; }
    const end = Math.min(bars[i + 1]?.t ?? b.t + opts.barMs, Math.max(now, b.t));
    const a = at(oi, b.t);
    const z = at(oi, end);
    if (!a || !z || z.t <= a.t) continue;
    const d = z.oi - a.oi;
    if (d > 0) opened[i] = d;
    else if (a.oi > 0) closeFrac[i] = clamp(-d / a.oi, 0, 1);
  }

  // Suffix helpers: survival after pro-rata closes, and the extremes traded later.
  const surv = new Float64Array(n);
  const minLowAfter = new Float64Array(n);
  const maxHighAfter = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (i === n - 1) { surv[i] = 1; minLowAfter[i] = Infinity; maxHighAfter[i] = -Infinity; continue; }
    const nx = bars[i + 1]!;
    surv[i] = surv[i + 1]! * (1 - closeFrac[i + 1]!);
    minLowAfter[i] = Math.min(minLowAfter[i + 1]!, nx.l);
    maxHighAfter[i] = Math.max(maxHighAfter[i + 1]!, nx.h);
  }

  let openedUsd = 0;
  let restingUsd = 0;
  const add = (arr: Float64Array, liq: number, usd: number) => {
    const k = Math.round(liq / step) - k0;
    if (k < 0 || k >= arr.length || usd <= 0) return;
    arr[k] = arr[k]! + usd;
    restingUsd += usd;
  };

  for (let i = 0; i < n; i++) {
    const base = opened[i]!;
    if (!(base > 0)) continue;
    const b = bars[i]!;
    const taker = b.takerBuy != null && b.volume > 0 ? clamp(b.takerBuy / b.volume, 0, 1) : null;
    const acct = at(ratio, Math.min(bars[i + 1]?.t ?? now, now))?.longShare ?? null;
    const longShare = clamp(
      taker != null && acct != null ? takerWeight * taker + (1 - takerWeight) * acct : taker ?? acct ?? (b.c >= b.o ? 0.55 : 0.45),
      0.05,
      0.95,
    );
    const tp = (b.h + b.l + b.c) / 3;
    const entries = [b.l, (b.l + tp) / 2, tp, (tp + b.h) / 2, b.h];
    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e]!;
      const usd = base * ENTRY_WEIGHTS[e]! * entry;
      openedUsd += usd;
      const live = usd * surv[i]!;
      for (const tier of tiers) {
        const w = tier.weight / tierSum;
        const ll = liquidationPrice('long', entry, tier.lev, mmr);
        if (ll < minLowAfter[i]! && ll < price) add(longs, ll, live * longShare * w);
        const sl = liquidationPrice('short', entry, tier.lev, mmr);
        if (sl > maxHighAfter[i]! && sl > price) add(shorts, sl, live * (1 - longShare) * w);
      }
    }
  }

  const bands: LiquidationModelBand[] = Array.from(longs, (_, j) => ({
    price: roundTo((k0 + j) * step, dec),
    longUsd: Math.round(longs[j]!),
    shortUsd: Math.round(shorts[j]!),
  }));

  const sigma24h = realisedVol24h(bars.map((b) => b.c), opts.barMs);
  const below: number[] = [];
  const above: number[] = [];
  bands.forEach((band, i) => {
    if (band.price < price && band.price >= price * (1 - mpRange)) below.push(i);
    if (band.price > price && band.price <= price * (1 + mpRange)) above.push(i);
  });
  const lc = biggestCluster(bands, below, 'longUsd', price);
  const sc = biggestCluster(bands, above, 'shortUsd', price);
  const pct = (p: number) => (price > 0 ? roundTo((p / price - 1) * 100, 2) : 0);
  const maxPain: LiquidationMaxPain = {
    longPrice: lc?.price ?? price,
    longUsd: lc?.usd ?? 0,
    longPct: lc ? pct(lc.price) : 0,
    shortPrice: sc?.price ?? price,
    shortUsd: sc?.usd ?? 0,
    shortPct: sc ? pct(sc.price) : 0,
    touchDownPct: lc ? touchProbability(price, lc.price, sigma24h) : null,
    touchUpPct: sc ? touchProbability(price, sc.price, sigma24h) : null,
  };

  return { price, step, bands, maxPain, sigma24h, openedUsd: Math.round(openedUsd), restingUsd: Math.round(restingUsd) };
}
