// Trading engine: watches leader accounts and copies their fills to followers.
// One instance does the work: it holds a Postgres advisory lock, and a second
// instance idles until the lock frees (gap G15). Off unless TRADING_ENABLED.
import { env } from '@tradinjournal/config';
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { productionDeps } from './deps.js';
import { reconcile } from './reconcile.js';
import { liveWatcherCount, stopAllWatchers, syncWatchers } from './watchers.js';

const SYNC_MS = 5_000;
const RECONCILE_MS = 30_000;
const LOCK_KEY = 74_221_031; // arbitrary, fixed: "copy engine"
export const HEARTBEAT_KEY = 'copy.engineHeartbeat';

async function tryLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok`;
  return rows[0]?.ok === true;
}

async function safely(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`[engine] ${name} failed`, { err: String(err) });
  }
}

async function main(): Promise<void> {
  if (!env.TRADING_ENABLED) {
    logger.info('[engine] TRADING_ENABLED is off; idling');
    setInterval(() => undefined, 3600_000);
    return;
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const deps = productionDeps(); // throws without CREDENTIAL_ENCRYPTION_KEY

  while (!(await tryLock())) {
    logger.info('[engine] another engine holds the lock; standing by');
    await new Promise((r) => setTimeout(r, 15_000));
  }
  logger.info('[engine] started', { liveEnabled: env.EXCHANGE_LIVE_ENABLED });
  const startedAt = new Date().toISOString();
  // The admin health panel reads this row; the engine is a separate process.
  const beat = async () => {
    const value = { at: new Date().toISOString(), startedAt, liveWatchers: liveWatcherCount(), pid: process.pid };
    logger.info('[engine] heartbeat', { liveWatchers: value.liveWatchers });
    await prisma.systemSetting.upsert({ where: { key: HEARTBEAT_KEY }, update: { value }, create: { key: HEARTBEAT_KEY, value } });
  };

  await safely('sync', () => syncWatchers(deps));
  await safely('heartbeat', beat);
  const timers = [
    setInterval(() => void safely('sync', () => syncWatchers(deps)), SYNC_MS),
    setInterval(() => void safely('reconcile', () => reconcile(deps)), RECONCILE_MS),
    setInterval(() => void safely('heartbeat', beat), 60_000),
  ];

  const shutdown = async (signal: string) => {
    logger.info('[engine] shutting down', { signal });
    timers.forEach(clearInterval);
    stopAllWatchers();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[engine] fatal', { err: String(err) });
  process.exit(1);
});
