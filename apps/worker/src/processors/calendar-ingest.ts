// Calendar ingestion worker. On each cron tick it asks the API to (re)fetch a UTC
// window and reconcile it. The window spans yesterday → +7 days so upcoming
// events are populated and today's `actual` values get back-filled as they
// release. The API does all the real work (providers, reconcile, DB); the worker
// just schedules and forwards.
import { Worker, type Job, type Queue, type ConnectionOptions } from 'bullmq';
import { logger } from '@tradinjournal/logger';
import { QUEUE_CALENDAR_INGEST, type CalendarIngestJob, type QueueConnection } from '@tradinjournal/queue';
import { ingestCalendar, InternalApiError } from '../lib/api-client.js';

/** Window fetched each tick: yesterday 00:00 → +8 days, in UTC. */
function window(): { from: string; to: string } {
  const now = Date.now();
  // Fetch a wide window so the calendar can show recent past days and browse
  // ahead by weeks/month. Providers may cap forward coverage; extra range is
  // harmless (upserts dedupe).
  return {
    from: new Date(now - 7 * 24 * 3600_000).toISOString(),
    to: new Date(now + 30 * 24 * 3600_000).toISOString(),
  };
}

export function createCalendarWorker(
  connection: QueueConnection,
  _queue: Queue<CalendarIngestJob>,
): Worker<CalendarIngestJob> {
  return new Worker<CalendarIngestJob>(
    QUEUE_CALENDAR_INGEST,
    async (job: Job<CalendarIngestJob>) => {
      const { from, to } = window();
      const res = await ingestCalendar({ from, to });
      logger.info(`Calendar ingest ${job.data.bucket}: ${res.upserted} events from ${res.providers} provider(s)`);
      return res;
    },
    {
      connection: connection as unknown as ConnectionOptions,
      concurrency: 1, // single flight — providers are rate-limited upstream
    },
  );
}

/** A 401/403 from the API is unrecoverable (bad token) — surface, don't retry. */
export function isUnrecoverable(err: unknown): boolean {
  return err instanceof InternalApiError && (err.status === 401 || err.status === 403);
}
