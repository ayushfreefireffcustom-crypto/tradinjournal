import { describe, expect, it } from 'vitest';
import {
  buildLiquidationMap, liquidationPrice, liquidationStep, realisedVol24h, touchProbability,
  type LiqBar, type LiqOiPoint,
} from '../../index.js';

const M = 15 * 60_000;
const T0 = Date.UTC(2026, 10, 1);
/** Bars around a close path, ±1 % wick, even taker split. */
const barsFrom = (closes: number[], over: (i: number) => Partial<LiqBar> = () => ({})): LiqBar[] =>
  closes.map((c, i) => ({ t: T0 + i * M, o: closes[i - 1] ?? c, h: c * 1.01, l: c * 0.99, c, volume: 100, takerBuy: 50, ...over(i) }));
/** OI snapshots at every bar open plus one at the end, from per-bar deltas. */
const oiFrom = (start: number, deltas: number[]): LiqOiPoint[] => {
  const out: LiqOiPoint[] = [{ t: T0, oi: start }];
  deltas.forEach((d, i) => out.push({ t: T0 + (i + 1) * M, oi: out[i]!.oi + d }));
  return out;
};
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('liquidation maths', () => {
  it('prices isolated liquidations with maintenance margin', () => {
    expect(liquidationPrice('long', 100, 10, 0.005)).toBeCloseTo(90.5, 9);
    expect(liquidationPrice('short', 100, 10, 0.005)).toBeCloseTo(109.5, 9);
    expect(liquidationPrice('long', 100, 100, 0.005)).toBeCloseTo(99.5, 9);
  });
  it('rounds band steps to 1 / 2 / 2.5 / 5 × 10^k', () => {
    expect(liquidationStep(0.0123)).toBe(0.02);
    expect(liquidationStep(37)).toBe(50);
    expect(liquidationStep(250)).toBe(250);
    expect(liquidationStep(0.00021)).toBe(0.00025);
    expect(liquidationStep(800)).toBe(1000);
  });
  it('gives barrier-touch odds from realised vol', () => {
    expect(touchProbability(100, 100, 0.05)).toBe(100);
    // one sigma away: 2 × (1 − Φ(1)) ≈ 31.7 %
    expect(touchProbability(100, 100 * Math.exp(0.05), 0.05)).toBeCloseTo(31.7, 1);
    expect(touchProbability(100, 50, 0.02)).toBe(0);
    expect(touchProbability(100, 90, null)).toBeNull();
  });
  it('needs ten returns and some movement for a volatility', () => {
    expect(realisedVol24h([1, 2, 3], M)).toBeNull();
    expect(realisedVol24h(Array(20).fill(100), M)).toBeNull();
    const zig = Array.from({ length: 21 }, (_, i) => (i % 2 ? 101 : 100));
    // 96 fifteen-minute bars a day
    expect(realisedVol24h(zig, M)!).toBeCloseTo(Math.log(1.01) * Math.sqrt(20 / 19) * Math.sqrt(96), 6);
  });
});

describe('buildLiquidationMap', () => {
  const flat = Array(40).fill(100);

  it('puts longs below and shorts above price, on a contiguous ascending ladder', () => {
    const r = buildLiquidationMap({ bars: barsFrom(flat), oi: oiFrom(1000, Array(40).fill(10)) }, { barMs: M });
    expect(r.price).toBe(100);
    expect(r.step).toBe(0.25); // 30 / 120
    expect(r.bands.length).toBeGreaterThan(100);
    for (let i = 1; i < r.bands.length; i++) expect(r.bands[i]!.price - r.bands[i - 1]!.price).toBeCloseTo(r.step, 9);
    expect(r.bands.filter((b) => b.price > 100).every((b) => b.longUsd === 0)).toBe(true);
    expect(r.bands.filter((b) => b.price < 100).every((b) => b.shortUsd === 0)).toBe(true);
    // Even taker split → longs and shorts about equal.
    const longs = sum(r.bands.map((b) => b.longUsd));
    const shorts = sum(r.bands.map((b) => b.shortUsd));
    expect(longs / shorts).toBeCloseTo(1, 1); // wicks cut a little more on one side (multiplicative maths)
  });

  it('keeps every opened dollar on the ladder except the 5x tier that sits off it', () => {
    // No wicks, so nothing gets run through.
    const r = buildLiquidationMap({ bars: barsFrom(flat, () => ({ h: 100, l: 100 })), oi: oiFrom(1000, Array(40).fill(10)) }, { barMs: M });
    // 40 bars × 10 coins × ~$100
    expect(r.openedUsd).toBe(40_000);
    // 5x liquidations are ~19.5 % away, outside ±15 %.
    expect(r.restingUsd / r.openedUsd).toBeCloseTo(0.85, 2);
  });

  it('drops cohorts once price trades through their liquidation price', () => {
    // Positions open in bar 0 at ~100; bar 5 wicks to 95; price recovers. No new OI after bar 0.
    const closes = Array(20).fill(100);
    const bars = barsFrom(closes, (i) => (i === 5 ? { l: 95 } : {}));
    const r = buildLiquidationMap({ bars, oi: oiFrom(1000, [10, ...Array(19).fill(0)]) }, { barMs: M });
    const longBands = r.bands.filter((b) => b.longUsd > 0);
    // Only the 10x tier (liq ≈ 89.6–91.4) survives the wick; 25x/50x/100x (≥ ~95.6) are gone.
    expect(longBands.length).toBeGreaterThan(0);
    expect(longBands.every((b) => b.price >= 89.5 && b.price <= 91.5)).toBe(true);
    // Shorts were untouched by the wick down.
    expect(r.bands.filter((b) => b.shortUsd > 0).length).toBeGreaterThan(longBands.length);
  });

  it('closes positions pro rata when open interest falls', () => {
    const closes = Array(20).fill(100);
    const kept = buildLiquidationMap({ bars: barsFrom(closes), oi: oiFrom(1000, [100, ...Array(19).fill(0)]) }, { barMs: M });
    // OI 1100 → 550 in bar 3: half of everything opened earlier is closed.
    const halved = buildLiquidationMap({ bars: barsFrom(closes), oi: oiFrom(1000, [100, 0, 0, -550, ...Array(16).fill(0)]) }, { barMs: M });
    expect(halved.restingUsd / kept.restingUsd).toBeCloseTo(0.5, 3);
  });

  it('tilts the split toward the taker side and the account ratio', () => {
    const allBuy = barsFrom(flat, () => ({ h: 100, l: 100, takerBuy: 100 }));
    const oi = oiFrom(1000, Array(40).fill(10));
    const r = buildLiquidationMap({ bars: allBuy, oi }, { barMs: M, takerWeight: 1 });
    const longs = sum(r.bands.map((b) => b.longUsd));
    const shorts = sum(r.bands.map((b) => b.shortUsd));
    expect(shorts / (longs + shorts)).toBeCloseTo(0.05, 2); // clamped at 5 %
    const ratio = [{ t: T0, longShare: 0.7 }];
    const viaRatio = buildLiquidationMap({ bars: barsFrom(flat, () => ({ h: 100, l: 100, takerBuy: null })), oi, ratio }, { barMs: M });
    const l2 = sum(viaRatio.bands.map((b) => b.longUsd));
    const s2 = sum(viaRatio.bands.map((b) => b.shortUsd));
    expect(l2 / (l2 + s2)).toBeCloseTo(0.7, 4);
  });

  it('falls back to a share of volume without open-interest history', () => {
    const r = buildLiquidationMap({ bars: barsFrom(flat) }, { barMs: M });
    // 40 bars × 100 volume × 5 % × ~$100
    expect(r.openedUsd).toBeGreaterThan(19_000);
    expect(r.openedUsd).toBeLessThan(21_000);
  });

  it('finds max pain on each side within ±10 % with signed distances and touch odds', () => {
    // Zig-zag so there's realised vol; heavy OI build in bar 0.
    const closes = Array.from({ length: 40 }, (_, i) => (i % 2 ? 100.4 : 100));
    const r = buildLiquidationMap({ bars: barsFrom(closes), oi: oiFrom(1000, [500, ...Array(39).fill(1)]) }, { barMs: M, price: 100 });
    const mp = r.maxPain;
    expect(mp.longPrice).toBeLessThan(100);
    expect(mp.longPrice).toBeGreaterThanOrEqual(90);
    expect(mp.shortPrice).toBeGreaterThan(100);
    expect(mp.shortPrice).toBeLessThanOrEqual(110);
    expect(mp.longPct).toBeLessThan(0);
    expect(mp.shortPct).toBeGreaterThan(0);
    expect(mp.longUsd).toBeGreaterThan(0);
    expect(mp.touchDownPct).not.toBeNull();
    expect(mp.touchDownPct!).toBeGreaterThan(0);
    expect(mp.touchDownPct!).toBeLessThanOrEqual(100);
    // The cluster is the band with its neighbours, so it's at least the biggest single long band in range.
    const inRange = r.bands.filter((b) => b.price < 100 && b.price >= 90);
    expect(mp.longUsd).toBeGreaterThanOrEqual(Math.max(...inRange.map((b) => b.longUsd)));
  });

  it('reports an empty side as zero at price with no touch odds', () => {
    const r = buildLiquidationMap({ bars: barsFrom(flat), oi: oiFrom(1000, Array(40).fill(0)) }, { barMs: M });
    expect(r.restingUsd).toBe(0);
    expect(r.maxPain).toMatchObject({ longPrice: 100, longUsd: 0, longPct: 0, shortUsd: 0, touchDownPct: null, touchUpPct: null });
  });

  it('is deterministic and independent of input order', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 2);
    const bars = barsFrom(closes, (i) => ({ takerBuy: 30 + (i % 5) * 10 }));
    const oi = oiFrom(1000, Array.from({ length: 30 }, (_, i) => (i % 4 === 3 ? -20 : 15)));
    const a = buildLiquidationMap({ bars, oi }, { barMs: M });
    const b = buildLiquidationMap({ bars: [...bars].reverse(), oi: [...oi].reverse() }, { barMs: M });
    expect(b).toEqual(a);
  });

  it('handles small-priced coins with fine steps', () => {
    const closes = Array(30).fill(0.2);
    const r = buildLiquidationMap({ bars: barsFrom(closes), oi: oiFrom(1e6, Array(30).fill(1e4)) }, { barMs: M });
    expect(r.step).toBe(0.0005);
    expect(r.bands[0]!.price).toBeCloseTo(0.17, 9);
    expect(String(r.bands[1]!.price).length).toBeLessThanOrEqual(7);
  });
});
