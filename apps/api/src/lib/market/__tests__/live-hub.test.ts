import { describe, it, expect, beforeEach, vi } from 'vitest';

// A fake provider whose subscribe() returns a stop spy, so we can assert exactly
// one upstream feed is opened per (symbol,tf) and closed on the last release.
const { stop, subscribe } = vi.hoisted(() => {
  const stop = vi.fn();
  const subscribe = vi.fn(() => stop);
  return { stop, subscribe };
});

vi.mock('../providers/index.js', () => ({
  resolveProvider: vi.fn(async () => ({ name: 'fake', getCandles: async () => [], subscribe })),
}));

import { acquireLive, releaseLive, liveFeedCount } from '../stream.js';

describe('LiveHub ref-counting', () => {
  beforeEach(() => {
    stop.mockClear();
    subscribe.mockClear();
  });

  it('opens ONE upstream for many subscribers, closes on the last release', async () => {
    await acquireLive('BTCUSDT', '1m');
    await acquireLive('BTCUSDT', '1m');
    await acquireLive('BTCUSDT', '1m');

    expect(liveFeedCount()).toBe(1);
    expect(subscribe).toHaveBeenCalledTimes(1); // 3 subscribers → 1 upstream feed

    releaseLive('BTCUSDT', '1m');
    releaseLive('BTCUSDT', '1m');
    expect(liveFeedCount()).toBe(1); // still one subscriber left
    expect(stop).not.toHaveBeenCalled();

    releaseLive('BTCUSDT', '1m'); // last one leaves
    expect(liveFeedCount()).toBe(0);
    expect(stop).toHaveBeenCalledTimes(1); // upstream closed
  });

  it('tracks a separate feed per (symbol,tf)', async () => {
    await acquireLive('ETHUSDT', '1m');
    await acquireLive('ETHUSDT', '5m');
    expect(liveFeedCount()).toBe(2);

    releaseLive('ETHUSDT', '1m');
    releaseLive('ETHUSDT', '5m');
    expect(liveFeedCount()).toBe(0);
  });

  it('release on an unknown feed is a no-op', () => {
    expect(() => releaseLive('NOPE', '1h')).not.toThrow();
    expect(liveFeedCount()).toBe(0);
  });

  it('never shares a feed between data sources (public vs each broker server)', async () => {
    const before = liveFeedCount();
    await acquireLive('EURUSD', '1m');
    await acquireLive('EURUSD', '1m', { scope: 'mt5:XMGlobal-MT5 10' });
    await acquireLive('EURUSD', '1m', { scope: 'mt5:Exness-Real' });
    await acquireLive('EURUSD', '1m', { scope: 'mt5:Exness-Real' }); // same broker → shared
    expect(liveFeedCount()).toBe(before + 3);
    releaseLive('EURUSD', '1m', 'mt5:Exness-Real');
    expect(liveFeedCount()).toBe(before + 3);
    releaseLive('EURUSD', '1m', 'mt5:Exness-Real');
    releaseLive('EURUSD', '1m', 'mt5:XMGlobal-MT5 10');
    releaseLive('EURUSD', '1m');
    expect(liveFeedCount()).toBe(before);
  });
});
