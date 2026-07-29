/**
 * API entrypoint: load config, build the app, listen, and shut down gracefully.
 */
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { createApp } from './app.js';
import { startInProcessScheduler, stopInProcessScheduler } from './scheduler.js';

const app = createApp();

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  logger.info(`API listening on http://${env.API_HOST}:${env.API_PORT} [${env.NODE_ENV}]`);
  startInProcessScheduler();
});

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`);
  stopInProcessScheduler();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
