// One private fill stream per VERIFIED leader that has at least one ACTIVE or
// PAUSED follow (paused follows still copy exits). Ported from MirrorPip-X: fast reconnect after a drop, longer backoff
// after a hard failure, backfill on every (re)connect so fills placed while we
// were away are still copied (copy-from-now keeps that safe). Backfill pages
// back to the last fill we stored instead of a fixed 50 (gap G9).

import { prisma, type CopyLeader, type ExchangeConnection } from '@tradinjournal/db';
import { ExchangeError, type StreamHandle } from '@tradinjournal/exchange';
import { logger } from '@tradinjournal/logger';
import { ingestLeaderFill } from './copy.js';
import type { EngineDeps } from './deps.js';
import { markConnectionInvalid } from './guards.js';

type LeaderRow = CopyLeader & { connection: ExchangeConnection };

interface Watcher {
  stream: StreamHandle | null;
  starting: boolean;
  retryAt: number;
  connectionId: string;
}

const watchers = new Map<string, Watcher>();
const RECONNECT_MS = 1_500;
const BACKOFF_MS = 15_000;
const BACKFILL_MAX_AGE_MS = 24 * 3600_000;

export async function syncWatchers(deps: EngineDeps): Promise<void> {
  const leaders = (await prisma.copyLeader.findMany({
    where: { status: 'VERIFIED', connection: { status: 'ACTIVE' }, follows: { some: { status: { in: ['ACTIVE', 'PAUSED'] } } } },
    include: { connection: true },
  })) as LeaderRow[];
  const wanted = new Map(leaders.map((l) => [l.id, l]));

  for (const [id, w] of watchers) {
    const l = wanted.get(id);
    if (!l || l.connectionId !== w.connectionId) {
      w.stream?.close();
      watchers.delete(id);
      logger.info('[engine] stopped leader watcher', { leaderId: id });
    }
  }
  for (const leader of leaders) {
    const w = watchers.get(leader.id);
    if (w && (w.stream || w.starting || deps.now().getTime() < w.retryAt)) continue;
    await startWatcher(leader, deps);
  }
}

async function startWatcher(leader: LeaderRow, deps: EngineDeps): Promise<void> {
  const state: Watcher = watchers.get(leader.id) ?? { stream: null, starting: false, retryAt: 0, connectionId: leader.connectionId };
  state.starting = true;
  watchers.set(leader.id, state);
  const exchange = deps.exchangeFor(leader.connection);
  const creds = deps.credsFor(leader.connection);

  try {
    state.stream = await exchange.streamFills(creds, {
      onEvent: (fill) => void ingestLeaderFill(leader, fill, deps),
      onError: (err) => {
        logger.warn('[engine] leader stream dropped; reconnecting', { leaderId: leader.id, err: err.message });
        const cur = watchers.get(leader.id);
        if (!cur) return;
        cur.stream?.close();
        cur.stream = null;
        cur.starting = false;
        cur.retryAt = deps.now().getTime() + RECONNECT_MS;
        setTimeout(() => {
          const again = watchers.get(leader.id);
          if (again && !again.stream && !again.starting) void startWatcher(leader, deps);
        }, RECONNECT_MS).unref?.();
      },
    });
    state.starting = false;
    state.retryAt = 0;
    logger.info('[engine] started leader watcher', { leaderId: leader.id });
    void backfill(leader, deps);
  } catch (err) {
    state.stream = null;
    state.starting = false;
    state.retryAt = deps.now().getTime() + BACKOFF_MS;
    if (err instanceof ExchangeError && err.isCredentialProblem) await markConnectionInvalid(leader.connectionId, err.message);
    logger.error('[engine] could not start leader watcher', { leaderId: leader.id, err: String(err) });
  }
}

/** Replay fills since the last one stored (at most 24 h back), oldest first. */
export async function backfill(leader: LeaderRow, deps: EngineDeps): Promise<void> {
  try {
    const last = await prisma.leaderFill.findFirst({ where: { leaderId: leader.id }, orderBy: { exchTs: 'desc' }, select: { exchTs: true } });
    const floor = deps.now().getTime() - BACKFILL_MAX_AGE_MS;
    const since = new Date(Math.max(floor, last?.exchTs.getTime() ?? floor));
    const fills = await deps.exchangeFor(leader.connection).getFills(deps.credsFor(leader.connection), { since, limit: 500 });
    for (const f of fills.reverse()) await ingestLeaderFill(leader, f, deps);
  } catch (err) {
    logger.warn('[engine] backfill failed', { leaderId: leader.id, err: String(err) });
  }
}

export function stopAllWatchers(): void {
  for (const w of watchers.values()) w.stream?.close();
  watchers.clear();
}

export function liveWatcherCount(): number {
  let n = 0;
  for (const w of watchers.values()) if (w.stream) n++;
  return n;
}
