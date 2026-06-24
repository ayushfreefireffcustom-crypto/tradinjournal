import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { toNodeHandler } from 'better-auth/node';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { auth } from './lib/auth.js';
import { errorHandler } from './http/middleware/error-handler.js';
import { accountsRouter } from './modules/accounts/accounts.routes.js';
import { tradesRouter } from './modules/trades/trades.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  app.use(
    morgan('tiny', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // better-auth handles all /api/auth/* — must come before express.json()
  app.all('/api/auth/*', toNodeHandler(auth));

  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ data: { status: 'ok', service: 'api', time: new Date().toISOString() } });
  });

  app.use('/api/accounts', accountsRouter);
  app.use('/api/trades', tradesRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}
