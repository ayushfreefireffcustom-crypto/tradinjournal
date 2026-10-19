import { describe, it, expect, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: {} }));
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn() } }));
const { createSharedSubscriber } = await import('../pubsub.js');

function fakeRedis() {
  let onMessage: (c: string, m: string) => void = () => {};
  const conn = {
    subscribe: vi.fn(async () => 1), unsubscribe: vi.fn(async () => 0),
    on: (_e: 'message', cb: (c: string, m: string) => void) => { onMessage = cb; },
  };
  return { conn, emit: (c: string, m: string) => onMessage(c, m) };
}

describe('shared Redis subscriber', () => {
  it('uses ONE connection for any number of streams and channels', () => {
    const f = fakeRedis();
    const connect = vi.fn(() => f.conn);
    const s = createSharedSubscriber(connect);
    const offs = Array.from({ length: 500 }, (_, i) => s.subscribe(i % 2 ? 'news:new' : 'market:candle:public:BTCUSDT:1m', () => {}));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(f.conn.subscribe).toHaveBeenCalledTimes(2); // once per channel
    expect(s.channelCount()).toBe(2);
    offs.forEach(o => o());
    expect(s.channelCount()).toBe(0);
    expect(f.conn.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('routes messages only to that channel’s handlers', () => {
    const f = fakeRedis();
    const s = createSharedSubscriber(() => f.conn);
    const a: string[] = [], b: string[] = [];
    s.subscribe('x', m => a.push(m));
    s.subscribe('y', m => b.push(m));
    f.emit('x', '1'); f.emit('y', '2'); f.emit('z', '3');
    expect(a).toEqual(['1']);
    expect(b).toEqual(['2']);
  });

  it('keeps the channel while other handlers remain; unsubscribe is idempotent', () => {
    const f = fakeRedis();
    const s = createSharedSubscriber(() => f.conn);
    const got: string[] = [];
    const off1 = s.subscribe('x', () => {});
    s.subscribe('x', m => got.push(m));
    off1(); off1();
    expect(f.conn.unsubscribe).not.toHaveBeenCalled();
    f.emit('x', 'still');
    expect(got).toEqual(['still']);
    expect(s.handlerCount('x')).toBe(1);
  });

  it('a throwing handler does not stop the others', () => {
    const f = fakeRedis();
    const s = createSharedSubscriber(() => f.conn);
    const got: string[] = [];
    s.subscribe('x', () => { throw new Error('boom'); });
    s.subscribe('x', m => got.push(m));
    f.emit('x', 'ok');
    expect(got).toEqual(['ok']);
  });
});
