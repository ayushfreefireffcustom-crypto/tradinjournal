// Live updates for the copy-trading pages (C3.4) without polling per client:
// one shared check per API process every 2 s finds which connected users had
// copy activity (orders, follows, positions — the engine writes all three)
// and pings their open streams. Clients refetch on a ping. One query per tick
// however many streams are open; nothing new for the engine to run.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';

type Handler = () => void;
const handlers = new Map<string, Set<Handler>>();
let timer: NodeJS.Timeout | null = null;
let since = new Date();
let running = false;
export const TICK_MS = 2_000;

/** Users with copy activity after `after`. */
export async function changedUsers(userIds: string[], after: Date): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const [orders, follows, positions] = await Promise.all([
    prisma.exchangeOrder.findMany({ where: { userId: { in: userIds }, updatedAt: { gt: after } }, select: { userId: true }, distinct: ['userId'] }),
    prisma.copyFollow.findMany({ where: { userId: { in: userIds }, updatedAt: { gt: after } }, select: { userId: true }, distinct: ['userId'] }),
    prisma.exchangePosition.findMany({ where: { connection: { userId: { in: userIds } }, updatedAt: { gt: after } }, select: { connection: { select: { userId: true } } } }),
  ]);
  return new Set([...orders.map((o) => o.userId), ...follows.map((f) => f.userId), ...positions.map((p) => p.connection.userId)]);
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  // Overlap a little so a write committed mid-query isn't missed; duplicates only cost a refetch.
  const from = new Date(since.getTime() - 500);
  const started = new Date();
  try {
    const changed = await changedUsers([...handlers.keys()], from);
    since = started;
    for (const id of changed) for (const h of handlers.get(id) ?? []) h();
  } catch (err) {
    logger.warn('[copy-stream] change check failed', { err: String(err) });
  } finally {
    running = false;
  }
}

/** Call `onChange` whenever this user's copy trading changes. Returns an unsubscribe. */
export function subscribeCopy(userId: string, onChange: Handler): () => void {
  let set = handlers.get(userId);
  if (!set) handlers.set(userId, (set = new Set()));
  set.add(onChange);
  if (!timer) {
    since = new Date();
    timer = setInterval(() => void tick(), TICK_MS);
    timer.unref?.();
  }
  return () => {
    const s = handlers.get(userId);
    s?.delete(onChange);
    if (s && !s.size) handlers.delete(userId);
    if (!handlers.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export const streamStats = () => ({ users: handlers.size, streams: [...handlers.values()].reduce((n, s) => n + s.size, 0), ticking: !!timer });
