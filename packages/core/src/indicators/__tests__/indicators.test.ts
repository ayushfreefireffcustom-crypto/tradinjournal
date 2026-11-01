import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import * as s from '../series.js';
import { INDICATORS, computeIndicator, indicatorById, resolveParams, warmup } from '../registry.js';

const H = 3_600_000;
const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): Candle => ({ openTime: Date.UTC(2026, 0, 1) + i * H, open: o, high: h, low: l, close: c, volume: v });
const fromCloses = (cs: number[], spread = 1): Candle[] => cs.map((c, i) => bar(i, i ? cs[i - 1]! : c, c + spread, c - spread, c));
const round = (xs: Array<number | null>, d = 4) => xs.map((x) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d));
const last = (xs: Array<number | null>) => xs[xs.length - 1];

// A deterministic random walk for the catalogue sweep.
function walk(n: number, seed = 7): Candle[] {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p = Math.max(1, p * (1 + (rnd() - 0.5) * 0.04));
    const h = Math.max(o, p) * (1 + rnd() * 0.01);
    const l = Math.min(o, p) * (1 - rnd() * 0.01);
    return bar(i, o, h, l, p, 50 + rnd() * 100);
  });
}

describe('moving averages', () => {
  it('SMA, EMA (SMA-seeded), RMA and WMA match hand-worked values', () => {
    expect(round(s.sma([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 3, 4]);
    expect(round(s.ema([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 3, 4]);
    expect(round(s.rma([1, 2, 3, 4, 5], 3))).toEqual([null, null, 2, 2.6667, 3.4444]);
    expect(round(s.wma([1, 2, 3], 3))).toEqual([null, null, 2.3333]);
    expect(s.ema([1, 2], 3)).toEqual([null, null]);
  });
  it('VWMA weights by volume', () => {
    const c = [bar(0, 10, 10, 10, 10, 1), bar(1, 20, 20, 20, 20, 3)];
    expect(round(s.vwma(c, 2))).toEqual([null, 17.5]);
  });
  it('DEMA, TEMA and Hull hold a constant price and start once warmed up', () => {
    const k = new Array(60).fill(50);
    for (const f of [s.dema, s.tema, s.hma]) {
      const r = f(k, 10);
      expect(last(r)).toBeCloseTo(50, 9);
      expect(r[0]).toBeNull();
    }
    expect(s.dema(k, 10).findIndex((v) => v != null)).toBe(18); // 2n−2
    expect(s.tema(k, 10).findIndex((v) => v != null)).toBe(27); // 3n−3
  });
  it('Hull reacts faster than a plain WMA', () => {
    const up = Array.from({ length: 60 }, (_, i) => i);
    expect(last(s.hma(up, 20))!).toBeGreaterThan(last(s.wma(up, 20))!);
    // On a straight line the Hull lags by exactly ⅔ of a bar (WMA lags (n−1)/3).
    expect(last(s.hma(up, 20))!).toBeCloseTo(59 - 2 / 3, 9);
  });
});

describe('oscillators', () => {
  it('RSI: Wilder smoothing, 100 on a straight rise, 50 on balanced moves', () => {
    expect(round(s.rsi([1, 2, 1, 2], 2))).toEqual([null, null, 50, 75]);
    expect(last(s.rsi(Array.from({ length: 30 }, (_, i) => i), 14))).toBe(100);
    expect(last(s.rsi(Array.from({ length: 30 }, (_, i) => 100 - i), 14))).toBe(0);
    expect(last(s.rsi(new Array(30).fill(5), 14))).toBe(50);
  });
  it('Stochastic and Williams %R sit at the extremes when closing at the high', () => {
    const c = Array.from({ length: 30 }, (_, i) => bar(i, i, i + 1, i - 1, i + 1));
    expect(last(s.stochastic(c, 14, 3, 3).k)).toBe(100);
    expect(last(s.stochastic(c, 14, 3, 3).d)).toBe(100);
    expect(last(s.williamsR(c, 14))).toBeCloseTo(0, 9);
  });
  it('flat ranges are unknown, not 0', () => {
    const flat = Array.from({ length: 30 }, (_, i) => bar(i, 5, 5, 5, 5));
    expect(last(s.stochastic(flat, 14).k)).toBeNull();
    expect(last(s.williamsR(flat, 14))).toBeNull();
    expect(last(s.cci(flat, 20))).toBe(0);
  });
  it('CCI, MFI, ROC and momentum', () => {
    const up = Array.from({ length: 30 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100 + i));
    expect(last(s.mfi(up, 14))).toBe(100);
    expect(last(s.cci(up, 20))!).toBeGreaterThan(100);
    expect(round(s.roc([100, 110], 1))).toEqual([null, 10]);
    expect(round(s.momentum([100, 110], 1))).toEqual([null, 10]);
  });
  it('Awesome and Ultimate oscillators', () => {
    const k = Array.from({ length: 60 }, (_, i) => bar(i, 10, 11, 9, 10));
    expect(last(s.awesome(k))).toBeCloseTo(0, 9);
    const atHigh = Array.from({ length: 40 }, (_, i) => bar(i, 10 + i, 11 + i, 9 + i, 11 + i));
    expect(last(s.ultimate(atHigh))).toBeCloseTo(100, 9);
    expect(s.ultimate(atHigh)[27]).toBeNull();
  });
  it('Stoch RSI is defined after warm-up and stays in 0–100', () => {
    const r = s.stochRsi(walk(200).map((x) => x.close));
    const defined = r.k.filter((v) => v != null) as number[];
    expect(defined.length).toBeGreaterThan(150);
    expect(defined.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});

describe('trend systems', () => {
  it('MACD is flat on a constant price and positive in a rise', () => {
    const k = s.macd(new Array(60).fill(10));
    expect(last(k.macd)).toBeCloseTo(0, 9);
    expect(last(k.hist)).toBeCloseTo(0, 9);
    const up = s.macd(Array.from({ length: 60 }, (_, i) => i));
    expect(last(up.macd)!).toBeGreaterThan(0);
    expect(up.signal.findIndex((v) => v != null)).toBe(33); // 26 − 1 + 9 − 1
  });
  it('ADX reaches 100 in a one-way trend, with +DI over −DI', () => {
    const up = Array.from({ length: 60 }, (_, i) => bar(i, 10 + i, 11 + i, 9 + i, 10.5 + i));
    const r = s.adx(up, 14);
    expect(last(r.adx)).toBeCloseTo(100, 6);
    expect(last(r.plusDi)!).toBeGreaterThan(0);
    expect(last(r.minusDi)).toBe(0);
  });
  it('ATR equals a constant range', () => {
    const c = Array.from({ length: 30 }, (_, i) => bar(i, 10, 11, 9, 10));
    expect(last(s.atr(c, 14))).toBeCloseTo(2, 9);
  });
  it('Supertrend and PSAR flip when the trend turns', () => {
    const up = Array.from({ length: 40 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const down = Array.from({ length: 20 }, (_, i) => bar(40 + i, 139 - 4 * i, 140 - 4 * i, 134 - 4 * i, 135 - 4 * i));
    const c = [...up, ...down];
    const st = s.supertrend(c, 10, 3);
    expect(st.direction[39]).toBe(1);
    expect(st.line[39]!).toBeLessThan(c[39]!.close);
    expect(last(st.direction)).toBe(-1);
    expect(last(st.line)!).toBeGreaterThan(c[c.length - 1]!.close);
    const sar = s.psar(c);
    expect(sar[39]!).toBeLessThan(c[39]!.low);
    expect(last(sar)!).toBeGreaterThan(c[c.length - 1]!.high);
  });
  it('Donchian and Ichimoku', () => {
    const c = Array.from({ length: 80 }, (_, i) => bar(i, i, i + 2, i - 2, i));
    const d = s.donchian(c, 20);
    expect(last(d.upper)).toBe(81);
    expect(last(d.lower)).toBe(58);
    const ich = s.ichimoku(c);
    expect(ich.tenkan[79]).toBe((81 + 69) / 2);
    expect(ich.kijun[79]).toBe((81 + 52) / 2);
    // Span A over bar 79 was computed 26 bars earlier.
    expect(ich.spanA[79]).toBe(((55 + 43) / 2 + (55 + 26) / 2) / 2);
    expect(ich.chikou[0]).toBe(26);
    expect(last(ich.chikou)).toBeNull();
  });
});

describe('volatility and volume', () => {
  it('Bollinger collapses on a constant price; Keltner wraps an EMA', () => {
    const b = s.bollinger(new Array(30).fill(7), 20, 2);
    expect([last(b.upper), last(b.middle), last(b.lower), last(b.width)]).toEqual([7, 7, 7, 0]);
    const c = Array.from({ length: 40 }, (_, i) => bar(i, 10, 11, 9, 10));
    const k = s.keltner(c, 20, 2, 10);
    expect(last(k.upper)).toBeCloseTo(14, 9);
    expect(last(k.lower)).toBeCloseTo(6, 9);
    expect(round(s.stdev([2, 4, 4, 4, 5, 5, 7, 9], 8))).toEqual([null, null, null, null, null, null, null, 2]);
  });
  it('OBV, A/D and CMF', () => {
    const c = [bar(0, 10, 11, 9, 10, 5), bar(1, 10, 12, 10, 12, 10), bar(2, 12, 12, 9, 9, 4)];
    expect(s.obv(c)).toEqual([0, 10, 6]);
    // Bar 1 closes at its high (+10), bar 2 at its low (−4), bar 0 mid-range (0).
    expect(s.accDist(c)).toEqual([0, 10, 6]);
    expect(round(s.cmf(c, 3))).toEqual([null, null, round([6 / 19])[0]]);
  });
  it('VWAP restarts each UTC day', () => {
    const d0 = Date.UTC(2026, 0, 1, 22);
    const c: Candle[] = [
      { openTime: d0, open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { openTime: d0 + H, open: 20, high: 20, low: 20, close: 20, volume: 1 },
      { openTime: d0 + 2 * H, open: 30, high: 30, low: 30, close: 30, volume: 1 }, // new day
    ];
    expect(s.vwap(c)).toEqual([10, 15, 30]);
  });
});

describe('the catalogue', () => {
  const data = walk(400);
  it('every indicator computes every output, aligned, with no NaN or Infinity', () => {
    for (const ind of INDICATORS) {
      const out = ind.compute(data, resolveParams(ind));
      expect(Object.keys(out).sort(), ind.id).toEqual(ind.outputs.map((o) => o.key).sort());
      for (const o of ind.outputs) {
        const ser = out[o.key]!;
        expect(ser.length, `${ind.id}.${o.key}`).toBe(data.length);
        expect(ser.every((v) => v == null || Number.isFinite(v)), `${ind.id}.${o.key}`).toBe(true);
        if (o.key === 'chikou') {
          // The lagging span is the close 26 bars ahead: unknown for the last 26 bars only.
          expect(ser[data.length - 27], 'chikou known 27 bars back').not.toBeNull();
          expect(ser[data.length - 26], 'chikou unknown for the last 26').toBeNull();
        } else expect(ser.slice(-50).some((v) => v != null), `${ind.id}.${o.key} defined by the end`).toBe(true);
        if (o.scale === 'percent') expect(ser.every((v) => v == null || (v >= 0 && v <= 100)), `${ind.id}.${o.key} 0–100`).toBe(true);
      }
    }
    expect(INDICATORS.length).toBe(36);
    expect(new Set(INDICATORS.map((i) => i.id)).size).toBe(INDICATORS.length);
  });
  it('validates params with readable reasons', () => {
    const rsi = indicatorById('rsi')!;
    expect(resolveParams(rsi)).toEqual({ length: 14 });
    expect(() => resolveParams(rsi, { length: 0 })).toThrow(/between 1 and 500/);
    expect(() => resolveParams(rsi, { length: 2.5 })).toThrow(/whole number/);
    expect(() => resolveParams(rsi, { len: 3 })).toThrow(/no "len" setting/);
    expect(() => resolveParams(indicatorById('macd')!, { fast: 30, slow: 26 })).toThrow(/fast length must be shorter/);
    expect(resolveParams(indicatorById('bb')!, { mult: 2.5 })).toEqual({ length: 20, mult: 2.5 });
    expect(() => computeIndicator('nope', 'value', data)).toThrow(/Unknown indicator/);
    expect(() => computeIndicator('rsi', 'k', data)).toThrow(/no "k" output/);
    expect(computeIndicator('rsi', 'value', data, { length: 7 }).length).toBe(400);
  });
  it('warm-up covers chained smoothings', () => {
    for (const id of ['tema', 'macd', 'adx', 'stochrsi']) {
      const w = warmup(id);
      const spec = indicatorById(id)!;
      const out = spec.compute(data.slice(0, w + 1), resolveParams(spec));
      const firstOut = spec.outputs[0]!.key;
      expect(last(out[firstOut]!), `${id} defined within warm-up`).not.toBeNull();
    }
  });
});
