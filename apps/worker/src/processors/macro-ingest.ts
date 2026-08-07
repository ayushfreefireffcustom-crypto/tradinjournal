// Macro ingestion worker. On each cron tick it asks the API to refresh the macro
// data spine — pull FRED + market snapshots, run the confluence engine, and cache
// the state JSON. The API does all the real work (P1); the worker just schedules
// and forwards. No-ops server-side when the macro segment is disabled (no FRED key).
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_MACRO_INGEST, type MacroIngestJob, type QueueConnection } from '@tradinjournal/queue';
import { ingestMacro, InternalApiError } from '../lib/api-client.js';

export function createMacroWorker(
  connection: QueueConnection,
  _queue: Queue<MacroIngestJob>,
): Worker<MacroIngestJob> {
  return new Worker<MacroIngestJob>(
    QUEUE_MACRO_INGEST,
    async (job: Job<MacroIngestJob>) => {
      const res = await ingestMacro({ reason: `cron:${job.data.bucket}` });
      logger.info(`Macro ingest ${job.data.bucket}: ${res.ingested} indicator(s)`);
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1, // single flight — FRED/market providers are rate-limited
    },
  );
}

/** A 401/403 from the API is unrecoverable (bad token) — surface, don't retry. */
export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
