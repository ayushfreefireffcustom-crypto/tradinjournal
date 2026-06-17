/**
 * Worker entrypoint.
 *
 * Will register BullMQ workers for the ingestion pipeline:
 * ingest-account -> reconstruct-trades -> compute-metrics / fetch-candles, plus
 * scheduled re-sync. Processors are added as the pipeline is built.
 */
import { logger } from '@tradinjournal/logger';

logger.info('Worker process started (no processors registered yet)');

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down worker`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
