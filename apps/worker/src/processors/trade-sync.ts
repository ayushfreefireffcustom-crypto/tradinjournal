// Trade-sync tick: asks the API to queue syncs for accounts whose stored deals are
// due a refresh. The API does the bridge work behind its own queue + leases, so
// this is safe to run alongside the in-process scheduler.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_TRADE_SYNC, type TradeSyncJob, type QueueConnection } from '@tradinjournal/queue';
import { runTradeSync, InternalApiError } from '../lib/api-client.js';

export function createTradeSyncWorker(connection: QueueConnection, _queue: Queue<TradeSyncJob>): Worker<TradeSyncJob> {
  return new Worker<TradeSyncJob>(
    QUEUE_TRADE_SYNC,
    async (_job: Job<TradeSyncJob>) => {
      const res = await runTradeSync();
      if (res.queued > 0) logger.info(`Trade sync: queued ${res.queued} (waiting ${res.waiting}, active ${res.active})`);
      return res;
    },
    { connection: connection as unknown as ConnectionOptions, concurrency: 1 },
  );
}

export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
