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
});
