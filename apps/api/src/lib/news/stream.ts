// Real-time fan-out for the news feed over Redis pub/sub. Ingestion PUBLISHes
// each newly-inserted item to `news:new`; every open SSE connection SUBSCRIBEs
// and forwards it. Redis pub/sub also fans out across multiple API instances.
//
// Fully optional: with no REDIS_URL, publish is a no-op and subscribe returns an
// immediate no-op cleanup — the SSE endpoint then just heartbeats and the client
// falls back to polling. All streams share one subscriber connection per process
// (lib/pubsub.ts).
import { Redis } from 'ioredis';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { sharedSubscriber } from '../pubsub.js';

const CHANNEL = 'news:new';

let publisher: Redis | null = null;
let pubDown = false;

function pub(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (publisher) return publisher;
  publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  publisher.on('error', () => {
    if (!pubDown) logger.warn('News stream publisher Redis unavailable');
    pubDown = true;
  });
  publisher.on('ready', () => { pubDown = false; });
  return publisher;
}

/** Publish newly-inserted items to every connected stream. Best-effort. */
export async function publishNews(items: unknown[]): Promise<void> {
  if (items.length === 0) return;
  const c = pub();
  if (!c || pubDown) return;
  try {
    await c.publish(CHANNEL, JSON.stringify(items));
  } catch {
    /* best-effort — a missed publish just means the client sees it on next poll */
  }
}

/**
 * Subscribe to new-item batches. `onItems` is called with each published array.
 * Returns a cleanup that unsubscribes and closes the dedicated connection.
 * Returns a no-op cleanup when Redis isn't configured.
 */
export function subscribeNews(onItems: (items: unknown[]) => void): () => void {
  const shared = sharedSubscriber();
  if (!shared) return () => {};
  return shared.subscribe(CHANNEL, message => {
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed)) onItems(parsed);
    } catch {
      /* ignore malformed */
    }
  });
}
