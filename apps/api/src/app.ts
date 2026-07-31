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
import { journalRouter } from './modules/journal/journal.routes.js';
import { aiRouter, aiInternalRouter } from './modules/ai/ai.routes.js';
import { calendarRouter, calendarInternalRouter } from './modules/calendar/calendar.routes.js';
import { newsRouter, newsInternalRouter } from './modules/news/news.routes.js';
import { notificationsRouter, pushRouter, notificationsInternalRouter } from './modules/notifications/notifications.routes.js';
import { marketRouter, marketInternalRouter } from './modules/market/market.routes.js';
import { alertsRouter, alertsInternalRouter } from './modules/alerts/alerts.routes.js';

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
  app.use('/api/journal', journalRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/alerts', alertsRouter);
  // Worker-to-API routes. Not under /api: no session, no CORS use case — the
  // shared-token guard on the router is the only way in.
  app.use('/internal/ai', aiInternalRouter);
  app.use('/internal/calendar', calendarInternalRouter);
  app.use('/internal/news', newsInternalRouter);
  app.use('/internal/notifications', notificationsInternalRouter);
  app.use('/internal/market', marketInternalRouter);
  app.use('/internal/alerts', alertsInternalRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}
