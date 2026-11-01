import { describe, expect, it } from 'vitest';
import type { Candle } from '../../trader/types.js';
import { rateCandles, ratingLabel } from '../rating.js';

const bars = (cs: number[]): Candle[] => cs.map((c, i) => ({ openTime: i * 3_600_000, open: i ? cs[i - 1]! : c, high: c * 1.002, low: c * 0.998, close: c, volume: 100 + (i % 7) }));
const accel = (n: number, dir: 1 | -1) => Array.from({ length: n }, (_, i) => 1000 * Math.exp(dir * (i * 0.0005 + i * i * 0.00001)));

describe('technical rating', () => {
  it('labels scores with strong beyond ±0.5 and neutral within ±0.1', () => {
    expect([1, 0.51, 0.5, 0.11, 0.1, 0, -0.1, -0.11, -0.5, -0.51, -1].map(ratingLabel)).toEqual(
      ['strong_buy', 'strong_buy', 'buy', 'buy', 'neutral', 'neutral', 'neutral', 'sell', 'sell', 'strong_sell', 'strong_sell']);
  });

  it('an accelerating rise is a buy, with every moving average voting buy', () => {
    const r = rateCandles(bars(accel(260, 1)));
    expect(r.ma.score).toBe(1);
    expect(r.ma.buy).toBe(16);
    expect(r.ma.components.find((c) => c.name === 'SignalX trend (EMA 20/50)')).toMatchObject({ vote: 1, reason: 'Uptrend' });
    expect(r.osc.components.find((c) => c.name === 'MACD (12, 26, 9)')!.vote).toBe(1);
    expect(r.osc.components.find((c) => c.name === 'Momentum (10)')!.vote).toBe(1);
    expect(['buy', 'strong_buy']).toContain(r.label);
    expect(r.score!).toBeGreaterThan(0.1);
  });

  it('an accelerating fall mirrors it', () => {
    const r = rateCandles(bars(accel(260, -1)));
    // Every SMA and EMA says sell; Hull is built to lead, so it may sit just under price.
    expect(r.ma.components.filter((c) => /^[SE]MA/.test(c.name)).every((c) => c.vote === -1)).toBe(true);
    expect(r.ma.score!).toBeLessThan(-0.8);
    expect(['sell', 'strong_sell']).toContain(r.label);
  });

  it('only extremes that turn count for oscillators', () => {
    // Long slide, then one bounce bar: RSI is oversold and turning up.
    const cs = [...accel(80, -1), accel(80, -1).at(-1)! * 1.004];
    const r = rateCandles(bars(cs));
    const rsi = r.osc.components.find((c) => c.name === 'RSI (14)')!;
    expect(rsi.value!).toBeLessThan(30);
    expect(rsi).toMatchObject({ vote: 1, reason: 'Oversold, turning up' });
    // Same slide without the bounce: oversold but still falling, so neutral.
    const still = rateCandles(bars(accel(80, -1))).osc.components.find((c) => c.name === 'RSI (14)')!;
    expect(still).toMatchObject({ vote: 0, reason: 'Oversold, still falling' });
  });

  it('indicators without enough history sit out instead of voting neutral', () => {
    const r = rateCandles(bars(accel(60, 1)));
    const sma200 = r.ma.components.find((c) => c.name === 'SMA (200)')!;
    expect(sma200).toMatchObject({ value: null, reason: 'Not enough history' });
    expect(r.ma.buy + r.ma.sell + r.ma.neutral).toBe(r.ma.components.filter((c) => c.value != null).length);
    expect(r.ma.score).toBe(1); // every average that could vote says buy
  });

  it('says nothing without data', () => {
    expect(rateCandles([])).toMatchObject({ score: null, label: null, price: null });
    const one = rateCandles(bars([100]));
    expect(one.score).toBeNull();
  });
});
