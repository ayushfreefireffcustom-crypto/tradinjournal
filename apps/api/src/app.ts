import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { toNodeHandler } from 'better-auth/node';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { auth } from './lib/auth.js';
import { errorHandler } from './http/middleware/error-handler.js';

export function createApp(): Express {
  const app = express();

  // --- security ---
  app.use(helmet());

  // CORS must allow credentials so auth cookies work across origins
  app.use(
    cors({
      origin: env.AUTH_URL,
      credentials: true,
    }),
  );

  app.use(express.json());

  // --- HTTP request logging (morgan -> winston) ---
  app.use(
    morgan('tiny', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // --- auth: better-auth owns every /api/auth/* route ---
  // Must be registered BEFORE express.json() body parsing on those routes
  app.all('/api/auth/*', toNodeHandler(auth));

  // --- health ---
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok', service: 'api', time: new Date().toISOString() } });
  });

  // TODO: mount feature modules here (accounts, sync, trades, ...)

  // --- 404 ---
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // --- centralised error handler (must be last) ---
  app.use(errorHandler);

  return app;
}
