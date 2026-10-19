import { describe, it, expect } from 'vitest';
import { publishCandle, subscribeCandle } from '../stream.js';
import type { NormalizedCandle } from '../types.js';

const bar = (close: number): NormalizedCandle => ({ openTime: close, open: 1, high: 2, low: 0.5, close, volume: 10 });

describe('candle pub/sub — same-process delivery (works without Redis)', () => {
  it('delivers published bars to subscribers and stops after unsubscribe', async () => {
    const got: NormalizedCandle[] = [];
    const unsub = subscribeCandle('BTCUSDT', '1m', c => got.push(c));

    await publishCandle('BTCUSDT', '1m', bar(1.5));
    expect(got).toHaveLength(1);
    expect(got[0]!.close).toBe(1.5);

    unsub();
    await publishCandle('BTCUSDT', '1m', bar(2));
    expect(got).toHaveLength(1); // no delivery after unsubscribe
  });

  it('scopes delivery to the exact (symbol, timeframe)', async () => {
    const got: NormalizedCandle[] = [];
    const unsub = subscribeCandle('ETHUSDT', '5m', c => got.push(c));

    await publishCandle('BTCUSDT', '1m', bar(1)); // different channel
    expect(got).toHaveLength(0);

    await publishCandle('ETHUSDT', '5m', bar(3)); // matching channel
    expect(got).toHaveLength(1);
    expect(got[0]!.close).toBe(3);

    unsub();
  });

  it('keeps broker-scoped bars off the public channel and off other brokers', async () => {
    const pub: number[] = [], xm: number[] = [];
    const u1 = subscribeCandle('EURUSD', '1m', c => pub.push(c.close));
    const u2 = subscribeCandle('EURUSD', '1m', c => xm.push(c.close), 'mt5:XM');
    await publishCandle('EURUSD', '1m', bar(1.1), 'mt5:XM');
    await publishCandle('EURUSD', '1m', bar(1.2), 'mt5:Exness');
    await publishCandle('EURUSD', '1m', bar(1.3));
    u1(); u2();
    expect(xm).toEqual([1.1]);
    expect(pub).toEqual([1.3]);
  });
});
