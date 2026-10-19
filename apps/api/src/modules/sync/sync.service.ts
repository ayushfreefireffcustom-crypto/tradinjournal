// Trade sync: pulls MT5 deals from the bridge into Postgres so every read is a
// database read. Incremental — after the first backfill only deals since a little
// before the newest stored one are fetched. One sync per account at a time,
// across every API instance (a lease on the broker_account row).
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { Deal } from '@tradinjournal/types';
import { getDeals, HISTORY_START } from '../../lib/broker-connector.js';
import { AppError, BrokerAuthError } from '../../http/errors.js';
import { credsOf, type BridgeCreds } from '../accounts/accounts.credentials.js';
import { dealToExecution } from './sync.mapping.js';

const DAY_MS = 86_400_000;
/** Longer than the slowest bridge call, so a crashed sync frees the account. */
const LEASE_MS = 4 * 60_000;
const INSERT_CHUNK = 1000;
/** Back-off after a failure: a rejected password needs the user, so wait longer. */
export const RETRY_AFTER_MS = { transient: 15 * 60_000, auth: DAY_MS } as const;

export type FetchDeals = (creds: BridgeCreds, range: { from: Date }) => Promise<Deal[]>;

export type SyncResult =
  | { status: 'synced'; added: number; pulled: number; full: boolean }
  | { status: 'locked' }
  | { status: 'failed'; error: Error };

/** Where the next fetch starts: whole history first time, else newest deal − overlap. */
export function syncFrom(lastDealAt: Date | null, overlapDays = env.SYNC_OVERLAP_DAYS): Date {
  if (!lastDealAt) return HISTORY_START;
  const from = new Date(lastDealAt.getTime() - overlapDays * DAY_MS);
  return from < HISTORY_START ? HISTORY_START : from;
}

async function acquireLease(accountId: string, now: Date): Promise<boolean> {
  const { count } = await prisma.brokerAccount.updateMany({
    where: { id: accountId, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
    data: { syncLockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  return count === 1;
}

/**
 * Sync one account. Never throws: failures are recorded on the account
 * (lastSyncError) and returned, so callers decide whether to surface them.
 */
export async function syncAccount(accountId: string, opts: { fetch?: FetchDeals; now?: () => Date } = {}): Promise<SyncResult> {
  const now = opts.now ?? (() => new Date());
  const fetch: FetchDeals = opts.fetch ?? ((creds, range) => getDeals(creds, range));
  if (!(await acquireLease(accountId, now()))) return { status: 'locked' };

  const run = await prisma.syncRun.create({ data: { brokerAccountId: accountId } }).catch(() => null);
  try {
    const account = await prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Broker account not found');
    const creds = credsOf(account);
    if (!creds) throw new AppError(400, 'NO_PASSWORD', 'No investor password is stored for this account.');

    const full = !account.lastDealAt;
    const deals = await fetch(creds, { from: syncFrom(account.lastDealAt) });

    let added = 0;
    for (let i = 0; i < deals.length; i += INSERT_CHUNK) {
      const rows = deals.slice(i, i + INSERT_CHUNK).map(d => dealToExecution(accountId, d));
      added += (await prisma.execution.createMany({ data: rows, skipDuplicates: true })).count;
    }
    const newest = deals.reduce<Date | null>((m, d) => {
      const t = new Date(d.dealTime);
      return !m || t > m ? t : m;
    }, account.lastDealAt);

    await prisma.brokerAccount.update({
      where: { id: accountId },
      data: {
        lastSyncAt: now(), lastSyncError: null, status: 'ACTIVE', syncLockedUntil: null, syncRetryAt: null, lastDealAt: newest,
        ...(added > 0 ? { dataVersion: { increment: 1 } } : {}),
      },
    });
    if (run) await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'DONE', dealsPulled: deals.length, tradesBuilt: added, finishedAt: now() } }).catch(() => {});
    if (added) logger.info('[sync] stored new deals', { accountId, added, pulled: deals.length, full });
    return { status: 'synced', added, pulled: deals.length, full };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const message = error.message.slice(0, 300);
    await prisma.brokerAccount.updateMany({
      where: { id: accountId },
      data: {
        lastSyncError: message, syncLockedUntil: null,
        syncRetryAt: new Date(now().getTime() + (error instanceof BrokerAuthError ? RETRY_AFTER_MS.auth : RETRY_AFTER_MS.transient)),
        // A rejected password needs the user; anything else is transient.
        ...(error instanceof BrokerAuthError ? { status: 'ERROR' as const } : {}),
      },
    }).catch(() => {});
    if (run) await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: message, finishedAt: now() } }).catch(() => {});
    logger.warn('[sync] failed', { accountId, err: message });
    return { status: 'failed', error };
  }
}

/** Accounts the scheduler should refresh: never synced, or older than the background interval. */
export async function dueAccounts(limit: number, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - env.SYNC_BACKGROUND_MIN * 60_000);
  const rows = await prisma.brokerAccount.findMany({
    where: {
      password: { not: null },
      AND: [
        { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] },
        { OR: [{ syncRetryAt: null }, { syncRetryAt: { lt: now } }] },
      ],
    },
    orderBy: [{ lastSyncAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
    select: { id: true },
  });
  return rows.map(r => r.id);
}
