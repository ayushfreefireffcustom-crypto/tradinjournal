import { describe, expect, it } from 'vitest';
import { buildLiquidationMap, combineLiquidationMaps, maxPainOf, type LiqBar, type LiqOiPoint } from '../../index.js';

const M = 15 * 60_000;
const T0 = Date.UTC(2026, 10, 1);
const closes = Array.from({ length: 96 }, (_, i) => 100 * (1 + 0.01 * Math.sin(i / 5)));
const bars = (taker: number): LiqBar[] =>
  closes.map((c, i) => ({ t: T0 + i * M, o: closes[i - 1] ?? c, h: c * 1.004, l: c * 0.996, c, volume: 100, takerBuy: taker }));
const oi = (start: number, step: number): LiqOiPoint[] => Array.from({ length: 97 }, (_, i) => ({ t: T0 + i * M, oi: start + i * step }));
const price = closes.at(-1)!;
const total = (bs: { longUsd: number; shortUsd: number }[]) => bs.reduce((s, b) => s + b.longUsd + b.shortUsd, 0);

describe('combineLiquidationMaps', () => {
  const a = buildLiquidationMap({ bars: bars(70), oi: oi(1000, 4) }, { barMs: M, price });
  const b = buildLiquidationMap({ bars: bars(30), oi: oi(500, 1) }, { barMs: M, price });

  it('builds venues on one grid when given the same price', () => {
    expect(a.step).toBe(b.step);
    expect(a.bands.map((x) => x.price)).toEqual(b.bands.map((x) => x.price));
  });

  it('weights each ladder shape by its share of open interest', () => {
    const c = combineLiquidationMaps(
      [{ venue: 'binance', result: a, oiUsd: 3e6, fromOi: true }, { venue: 'bybit', result: b, oiUsd: 1e6, fromOi: true }],
      { price, sigma24h: a.sigma24h },
    );
    expect(c.weights).toEqual([{ venue: 'binance', weight: 0.75 }, { venue: 'bybit', weight: 0.25 }]);
    // Total resting = the venues' modelled totals added (within band rounding).
    expect(Math.abs(c.restingUsd - (a.restingUsd + b.restingUsd))).toBeLessThan(c.bands.length * 2);
    // Each band = 0.75 × A-shape + 0.25 × B-shape, scaled to that total.
    const T = a.restingUsd + b.restingUsd;
    const i = a.bands.findIndex((x) => x.longUsd > 0);
    const want = (0.75 * a.bands[i]!.longUsd) / a.restingUsd * T + (0.25 * b.bands[i]!.longUsd) / b.restingUsd * T;
    expect(c.bands[i]!.longUsd).toBeCloseTo(want, -1);
    expect(c.maxPain).toEqual(maxPainOf(c.bands, price, a.sigma24h));
    expect(c.maxPain.longPrice).toBeLessThan(price);
    expect(c.maxPain.shortPrice).toBeGreaterThan(price);
  });

  it('a venue on the volume stand-in keeps its shape but not its size', () => {
    const vol = buildLiquidationMap({ bars: bars(30) }, { barMs: M, price });
    const c = combineLiquidationMaps(
      [{ venue: 'binance', result: a, oiUsd: 1e6, fromOi: true }, { venue: 'bybit', result: vol, oiUsd: 1e6, fromOi: false }],
      { price, sigma24h: null },
    );
    expect(Math.abs(total(c.bands) - a.restingUsd)).toBeLessThan(c.bands.length * 2);
    expect(c.weights.map((w) => w.weight)).toEqual([0.5, 0.5]);
    expect(c.maxPain.touchDownPct).toBeNull();
  });

  it('adds the ladders when open interest is missing for a venue', () => {
    const c = combineLiquidationMaps(
      [{ venue: 'binance', result: a, oiUsd: 2e6, fromOi: true }, { venue: 'bybit', result: b, oiUsd: null, fromOi: true }],
      { price, sigma24h: a.sigma24h },
    );
    c.bands.forEach((band, i) => {
      expect(band.longUsd).toBe(a.bands[i]!.longUsd + b.bands[i]!.longUsd);
      expect(band.shortUsd).toBe(a.bands[i]!.shortUsd + b.bands[i]!.shortUsd);
    });
    expect(c.weights[0]!.weight + c.weights[1]!.weight).toBeCloseTo(1, 6);
  });

  it('a single venue passes through unchanged', () => {
    const c = combineLiquidationMaps([{ venue: 'binance', result: a, oiUsd: 5e6, fromOi: true }], { price, sigma24h: a.sigma24h });
    expect(c.bands).toEqual(a.bands);
    expect(c.maxPain).toEqual(a.maxPain);
    expect(c.weights).toEqual([{ venue: 'binance', weight: 1 }]);
  });

  it('an empty ladder gets no weight', () => {
    const empty = { ...b, bands: b.bands.map((x) => ({ ...x, longUsd: 0, shortUsd: 0 })), restingUsd: 0 };
    const c = combineLiquidationMaps(
      [{ venue: 'binance', result: a, oiUsd: 1e6, fromOi: true }, { venue: 'bybit', result: empty, oiUsd: 9e6, fromOi: true }],
      { price, sigma24h: a.sigma24h },
    );
    expect(c.weights).toEqual([{ venue: 'binance', weight: 1 }, { venue: 'bybit', weight: 0 }]);
    expect(c.bands).toEqual(a.bands);
  });
});
