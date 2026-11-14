// Trade sync: pulls MT5 deals from the bridge into Postgres so every read is a
// database read. Incremental — after the first backfill only deals since a little
// before the newest stored one are fetched. One sync per account at a time,
// across every API instance (a lease on the broker_account row).
//
// MT5 deal times arrive in the trade server's wall clock. Each sync also reads
// the server clock from the bridge, keeps the account's clock model current and,
// with MT5_SERVER_TIME_TO_UTC on, stores deals as real UTC and converts any of
// the account's older rows that are still in server time.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { Deal } from '@tradinjournal/types';
import { getDealsWithClock, HISTORY_START, type DealsWithClock } from '../../lib/broker-connector.js';
import { formatTz, observeOffset, tzOf, updateServerTz } from '../../lib/server-time.js';
import { normalizeExecutionTimes } from './server-time.sync.js';
import { AppError, BrokerAuthError } from '../../http/errors.js';
import { credsOf, type BridgeCreds } from '../accounts/accounts.credentials.js';
import { dealToExecution } from './sync.mapping.js';
import { usableAccountsWhere } from '../../lib/broker-policy.js';

const DAY_MS = 86_400_000;
/** Longer than the slowest bridge call, so a crashed sync frees the account. */
const LEASE_MS = 4 * 60_000;
const INSERT_CHUNK = 1000;
/** Back-off after a failure: a rejected password needs the user, so wait longer. */
export const RETRY_AFTER_MS = { transient: 15 * 60_000, auth: DAY_MS } as const;

export type FetchDeals = (creds: BridgeCreds, range: { from: Date }) => Promise<Deal[] | DealsWithClock>;

/** Covers any server offset (−12h…+14h) when a UTC bound is read as server wall clock. */
const WALL_CLOCK_MARGIN_MS = 14 * 3_600_000;

export type SyncResult =
  | { status: 'synced'; added: number; pulled: number; full: boolean; normalized?: number }
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
export async function syncAccount(
  accountId: string,
  opts: { fetch?: FetchDeals; now?: () => Date; toUtc?: boolean } = {},
): Promise<SyncResult> {
  const now = opts.now ?? (() => new Date());
  const fetch: FetchDeals = opts.fetch ?? ((creds, range) => getDealsWithClock(creds, range));
  const toUtc = opts.toUtc ?? env.MT5_SERVER_TIME_TO_UTC;
  if (!(await acquireLease(accountId, now()))) return { status: 'locked' };

  const run = await prisma.syncRun.create({ data: { brokerAccountId: accountId } }).catch(() => null);
  try {
    const account = await prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Broker account not found');
    const creds = credsOf(account);
    if (!creds) throw new AppError(400, 'NO_PASSWORD', 'No investor password is stored for this account.');

    const full = !account.lastDealAt;
    // The bridge reads the range in server wall clock; widen it so no server
    // offset can push the start past deals we haven't stored (duplicates are skipped).
    const from = syncFrom(account.lastDealAt);
    const fetched = await fetch(creds, { from: toUtc && !full ? new Date(Math.max(from.getTime() - WALL_CLOCK_MARGIN_MS, HISTORY_START.getTime())) : from });
    const { deals, clock } = Array.isArray(fetched) ? { deals: fetched, clock: null } : fetched;

    // Keep the server clock model current (detected even while conversion is off).
    const observed = observeOffset(clock);
    const clockAt = clock ? clock.utcNow * 1000 : now().getTime();
    const model = updateServerTz({ tz: tzOf(account), lastObservedMin: account.serverOffsetMin }, observed, clockAt);
    if (model.changed) logger.info('[sync] server clock model', { accountId, server: account.server, tz: formatTz(model.tz!), observedMin: observed, was: account.serverTimeZone });
    const tz = toUtc ? model.tz : null;

    let added = 0;
    for (let i = 0; i < deals.length; i += INSERT_CHUNK) {
      const rows = deals.slice(i, i + INSERT_CHUNK).map(d => dealToExecution(accountId, d, tz));
      added += (await prisma.execution.createMany({ data: rows, skipDuplicates: true })).count;
    }
    // Older rows still in server time (or converted under a model since replaced).
    const normalized = tz ? await normalizeExecutionTimes(accountId, tz, { all: model.changed }) : 0;

    let newest: Date | null;
    if (tz) {
      newest = (await prisma.execution.aggregate({ where: { brokerAccountId: accountId }, _max: { dealTime: true } }))._max.dealTime;
    } else {
      newest = deals.reduce<Date | null>((m, d) => {
        const t = new Date(d.dealTime);
        return !m || t > m ? t : m;
      }, account.lastDealAt);
    }

    await prisma.brokerAccount.update({
      where: { id: accountId },
      data: {
        lastSyncAt: now(), lastSyncError: null, status: 'ACTIVE', syncLockedUntil: null, syncRetryAt: null, lastDealAt: newest,
        ...(model.tz ? { serverTimeZone: model.tz.zone, serverTimeShiftMin: model.tz.shiftMin } : {}),
        ...(observed != null ? { serverOffsetMin: observed, serverOffsetAt: new Date(clockAt) } : {}),
        ...(added > 0 || normalized > 0 ? { dataVersion: { increment: 1 } } : {}),
      },
    });
    if (run) await prisma.syncRun.update({ where: { id: run.id }, data: { status: 'DONE', dealsPulled: deals.length, tradesBuilt: added, finishedAt: now() } }).catch(() => {});
    if (added) logger.info('[sync] stored new deals', { accountId, added, pulled: deals.length, full });
    if (normalized) logger.info('[sync] converted stored deal times to UTC', { accountId, normalized, tz: formatTz(tz!) });
    return { status: 'synced', added, pulled: deals.length, full, normalized };
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
  // Elefin only: other brokers' accounts aren't usable, so don't spend bridge time on them.
  const usable = await usableAccountsWhere();
  const rows = await prisma.brokerAccount.findMany({
    where: {
      password: { not: null },
      AND: [
        { OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] },
        { OR: [{ syncRetryAt: null }, { syncRetryAt: { lt: now } }] },
        ...(usable ? [usable] : []),
      ],
    },
    orderBy: [{ lastSyncAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
    select: { id: true },
  });
  return rows.map(r => r.id);
}
