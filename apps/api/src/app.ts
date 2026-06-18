/**
 * Express application factory.
 *
 * Builds the middleware chain and mounts routes. Kept deliberately thin —
 * feature modules (accounts, trades, sync, ...) are mounted here as they are built.
 */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { toNodeHandler } from 'better-auth/node';
import { logger } from '@tradinjournal/logger';
import { auth } from './lib/auth.js';

export function createApp(): Express {
  const app = express();

  // --- security & parsing ---
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // --- HTTP request logging (morgan -> winston) ---
  app.use(
    morgan('tiny', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // --- auth (better-auth handles all /api/auth/* routes) ---
  app.all('/api/auth/*', toNodeHandler(auth));

  // --- health check ---
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok', service: 'api', time: new Date().toISOString() } });
  });

  // TODO: mount feature modules here (accounts, sync, trades, ...)

  // --- 404 ---
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // --- centralised error handler ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err.message, { stack: err.stack });
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return app;
}
