// One Redis subscriber connection per process, shared by every SSE stream.
//
// A subscribed Redis connection can't run other commands, so the old code opened
// a dedicated connection per open stream — 10k open news feeds meant 10k Redis
// connections. Here every handler hangs off one connection; channels are
// ref-counted (SUBSCRIBE on the first handler, UNSUBSCRIBE after the last).
//
// Without REDIS_URL, subscribe() is a no-op (callers keep their local bus).
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

type Handler = (message: string) => void;

export interface SharedSubscriber {
  subscribe(channel: string, handler: Handler): () => void;
  channelCount(): number;
  handlerCount(channel: string): number;
}

/** Minimal surface we need from ioredis — lets tests inject a fake. */
export interface SubscriberConnection {
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  on(event: 'message', cb: (channel: string, message: string) => void): unknown;
}

export function createSharedSubscriber(connect: () => SubscriberConnection): SharedSubscriber {
  let conn: SubscriberConnection | null = null;
  const handlers = new Map<string, Set<Handler>>();

  const connection = () => {
    if (conn) return conn;
    conn = connect();
    conn.on('message', (channel, message) => {
      for (const h of handlers.get(channel) ?? []) {
        try { h(message); } catch (err) { logger.warn('[pubsub] handler threw', { channel, err }); }
      }
    });
    return conn;
  };

  return {
    subscribe(channel, handler) {
      let set = handlers.get(channel);
      if (!set) {
        set = new Set();
        handlers.set(channel, set);
        void connection().subscribe(channel).catch(() => {});
      }
      set.add(handler);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const s = handlers.get(channel);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) {
          handlers.delete(channel);
          void conn?.unsubscribe(channel).catch(() => {});
        }
      };
    },
    channelCount: () => handlers.size,
    handlerCount: channel => handlers.get(channel)?.size ?? 0,
  };
}

let shared: SharedSubscriber | null = null;

/** The process-wide subscriber, or null when Redis isn't configured. */
export function sharedSubscriber(): SharedSubscriber | null {
  if (!env.REDIS_URL) return null;
  return (shared ??= createSharedSubscriber(() => {
    const r = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
    r.on('error', () => {}); // no live fan-out just means clients fall back to polling
    return r;
  }));
}
