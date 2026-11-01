import { describe, expect, it } from 'vitest';
import type { Candle } from '@/lib/market-api';
import { atr, heikinAshi, heikinBar, kagi, pointFigure, renko, resolveSize } from './chart-types';

const c = (close: number, i: number, o = close, h = Math.max(o, close), l = Math.min(o, close)): Candle => ({ openTime: i * 1000, open: o, high: h, low: l, close, volume: 1 });
const closes = (xs: number[]) => xs.map((x, i) => c(x, i));

describe('Heikin-Ashi', () => {
  it('averages each bar and carries the open from the previous one', () => {
    const raw = [c(12, 0, 10, 13, 9), c(14, 1, 12, 15, 11)];
    const ha = heikinAshi(raw);
    expect(ha[0]).toMatchObject({ open: 11, close: 11, high: 13, low: 9 });
    expect(ha[1]).toMatchObject({ open: 11, close: 13, high: 15, low: 11 });
    expect(heikinBar(raw[1]!, ha[0]!)).toEqual(ha[1]);
    expect(heikinAshi([])).toEqual([]);
  });
  it('turns a choppy rise into a run of rising bars', () => {
    const raw = [100, 103, 101, 104, 102, 105, 103, 106].map((x, i) => c(x, i, i ? [100, 103, 101, 104, 102, 105, 103, 106][i - 1]! : x));
    const ha = heikinAshi(raw);
    expect(ha.slice(2).every((b) => b.close > b.open)).toBe(true);
  });
});

describe('sizes', () => {
  it('works out ATR, percent and fixed sizes', () => {
    const bars = Array.from({ length: 30 }, (_, i) => c(100, i, 100, 101, 99));
    expect(atr(bars, 14)).toBeCloseTo(2);
    expect(resolveSize(bars, { mode: 'atr', value: 14 })).toBeCloseTo(2);
    expect(resolveSize(bars, { mode: 'percent', value: 1.5 })).toBeCloseTo(1.5);
    expect(resolveSize(bars, { mode: 'fixed', value: 5 })).toBe(5);
    expect(resolveSize(bars.slice(0, 5), { mode: 'atr', value: 14 })).toBeNull();
    expect(resolveSize(bars, { mode: 'fixed', value: 0 })).toBeNull();
    expect(resolveSize([], { mode: 'percent', value: 1 })).toBeNull();
  });
});

describe('Renko', () => {
  it('adds a brick per full box and needs two boxes to turn', () => {
    const b = renko(closes([100, 101.5, 102, 103.9, 103, 102.5, 101.9, 99.5]), 1);
    expect(b.map((x) => `${x.up ? '+' : '-'}${x.open}>${x.close}`)).toEqual([
      '+100>101', '+101>102', '+102>103', // 103.9: three up bricks so far
      // Turning needs a close at or below 101 (two boxes under 103): 103, 102.5
      // and 101.9 don't do it; 99.5 does, for two bricks (not three: 99.5 > 99).
      '-102>101', '-101>100',
    ]);
    expect(b[3]!.time).toBe(7000);
  });
  it('makes several bricks from one big move', () => {
    expect(renko(closes([100, 105]), 1)).toHaveLength(5);
    expect(renko(closes([100, 95.5]), 1).every((x) => !x.up)).toBe(true);
    expect(renko(closes([100, 100.9, 99.2]), 1)).toEqual([]);
    expect(renko([], 1)).toEqual([]);
  });
});

describe('Kagi', () => {
  it('starts a new line when price turns back by the reversal', () => {
    const k = kagi(closes([100, 104, 108, 106, 103, 105, 110, 107, 101]), 4);
    expect(k.map((l) => `${l.up ? 'up' : 'dn'} ${l.from}>${l.to}`)).toEqual(['up 100>108', 'dn 108>103', 'up 103>110', 'dn 110>101']);
  });
  it('thickens above the last peak and thins below the last trough', () => {
    const k = kagi(closes([100, 104, 108, 106, 103, 105, 110, 107, 101]), 4);
    expect(k[0]!.pieces).toEqual([{ from: 100, to: 108, yang: true }]);
    expect(k[1]!.pieces).toEqual([{ from: 108, to: 103, yang: true }]); // no earlier trough yet
    expect(k[2]!.pieces).toEqual([{ from: 103, to: 110, yang: true }]);
    expect(k[3]!.pieces).toEqual([{ from: 110, to: 103, yang: true }, { from: 103, to: 101, yang: false }]); // broke the 103 trough
    const back = kagi(closes([100, 104, 108, 106, 103, 105, 110, 107, 101, 106, 112]), 4);
    expect(back.at(-1)!.pieces).toEqual([{ from: 101, to: 110, yang: false }, { from: 110, to: 112, yang: true }]); // above the 110 peak
  });
  it('draws nothing until price has moved a full reversal', () => {
    expect(kagi(closes([100, 102, 99, 101]), 4)).toEqual([]);
  });
});

describe('Point & Figure', () => {
  it('stacks Xs up, Os down, and needs three boxes to switch', () => {
    const p = pointFigure(closes([100, 103.2, 105.5, 104.1, 103.5, 102.6, 101.9, 104.5, 105.2]), 1, 3);
    expect(p.map((x) => `${x.x ? 'X' : 'O'}${x.low}-${x.high}`)).toEqual(['X101-105', 'O102-104', 'X103-105']);
  });
  it('ignores moves smaller than the reversal', () => {
    const p = pointFigure(closes([100, 104, 102.5, 103.8]), 1, 3);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ x: true, low: 101, high: 104 });
    expect(pointFigure(closes([100, 97.4]), 1, 3)[0]).toMatchObject({ x: false, low: 98, high: 99 });
  });
});
