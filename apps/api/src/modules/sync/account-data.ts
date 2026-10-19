// Read path for an account's trading data: Postgres, not the MT5 bridge.
//
//   interactive — user-facing pages. The very first load waits for the initial
//                 backfill; after that it always answers from the database and
//                 refreshes in the background when the data is older than
//                 SYNC_STALE_MIN (stale-while-revalidate).
//   background  — never waits; nudges a low-priority refresh if stale.
//   readonly    — database only, never touches the sync queue (batch jobs).
//
// Rebuilt trades/stats are memoised per (account, dataVersion): dataVersion only
// changes when a sync stores new deals, so the cache is exact across instances.
import { prisma, type BrokerAccount } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import type { AccountStats, Deal, Trade } from '@tradinjournal/types';
import { AppError, BrokerAuthError, BrokerConnectionError, NotFoundError } from '../../http/errors.js';
import { executionSelect, executionToDeal } from './sync.mapping.js';
import { requestSyncWithin, syncQueue } from './sync.queue.js';
import { computeStats, reconstructTrades } from '../trades/trades.service.js';

export type ReadMode = 'interactive' | 'background' | 'readonly';

interface Snapshot { deals: Deal[]; balance: number; trades?: Trade[]; stats?: AccountStats }
const MAX_CACHED = 200;
const cache = new Map<string, Snapshot>();

function remember(key: string, snap: Snapshot): Snapshot {
  cache.delete(key);
  cache.set(key, snap);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return snap;
}

const isStale = (a: BrokerAccount, now = Date.now()) => !a.lastSyncAt || now - a.lastSyncAt.getTime() > env.SYNC_STALE_MIN * 60_000;
const inBackoff = (a: BrokerAccount, now = Date.now()) => !!a.syncRetryAt && a.syncRetryAt.getTime() > now;

/** The stored failure as the same error type the bridge would have thrown. */
function storedFailure(a: BrokerAccount): Error {
  return a.status === 'ERROR'
    ? new BrokerAuthError()
    : new BrokerConnectionError(a.lastSyncError ?? 'Broker bridge is unavailable right now. Please try again in a moment.');
}

/** First load: wait for the backfill (or for another instance that holds the lease). */
async function awaitFirstSync(a: BrokerAccount): Promise<BrokerAccount> {
  if (inBackoff(a) && a.lastSyncError) throw storedFailure(a);
  const deadline = Date.now() + env.SYNC_FIRST_WAIT_MS;
  const r = await requestSyncWithin(a.id, 'high', env.SYNC_FIRST_WAIT_MS);
  if (r !== 'timeout' && r.status === 'failed') throw r.error;
  // 'locked' = another instance is importing it; 'timeout' = still running. Poll.
  for (;;) {
    const fresh = await prisma.brokerAccount.findUnique({ where: { id: a.id } });
    if (!fresh) throw new NotFoundError('Broker account not found');
    if (fresh.lastSyncAt) return fresh;
    if (fresh.lastSyncError && inBackoff(fresh)) throw storedFailure(fresh);
    if (Date.now() >= deadline) {
      throw new AppError(503, 'SYNC_PENDING', 'Your trade history is still importing — large accounts can take a minute. Refresh shortly.');
    }
    await new Promise(r2 => setTimeout(r2, 1000));
  }
}

async function snapshot(account: BrokerAccount): Promise<Snapshot> {
  const key = `${account.id}:${account.dataVersion}`;
  const hit = cache.get(key);
  if (hit) return remember(key, hit);
  const rows = await prisma.execution.findMany({
    where: { brokerAccountId: account.id },
    orderBy: [{ dealTime: 'asc' }, { dealTicket: 'asc' }],
    select: executionSelect,
  });
  const deals = rows.map(executionToDeal);
  const balance = deals.filter(d => d.type === 'BALANCE').reduce((s, d) => s + parseFloat(d.profit), 0);
  return remember(key, { deals, balance });
}

export async function loadAccountData(userId: string, accountId: string, mode: ReadMode = 'interactive') {
  let account = await prisma.brokerAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new NotFoundError('Broker account not found');

  if (mode === 'interactive' && !account.lastSyncAt) {
    account = await awaitFirstSync(account);
  } else if (mode !== 'readonly' && isStale(account) && !inBackoff(account)) {
    void syncQueue().request(account.id, mode === 'interactive' ? 'high' : 'low');
  }

  const snap = await snapshot(account);
  return {
    account,
    // Copies: the memoised arrays are shared across requests, and callers sort/filter.
    deals: [...snap.deals],
    balance: snap.balance,
    trades: () => [...(snap.trades ??= reconstructTrades(snap.deals))],
    stats: () => structuredClone(snap.stats ??= computeStats(snap.trades ??= reconstructTrades(snap.deals), snap.balance)),
  };
}

/** Test hook. */
export function clearAccountDataCache(): void { cache.clear(); }
