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
import { macroRouter, macroInternalRouter } from './modules/macro/macro.routes.js';
import { newsRouter, newsInternalRouter } from './modules/news/news.routes.js';
import { notificationsRouter, pushRouter, notificationsInternalRouter } from './modules/notifications/notifications.routes.js';
import { marketRouter, marketInternalRouter } from './modules/market/market.routes.js';
import { traderRouter, traderInternalRouter } from './modules/trader/trader.routes.js';
import { alertsRouter, alertsInternalRouter } from './modules/alerts/alerts.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { accessRouter } from './modules/admin/access.routes.js';
import { usageRouter } from './modules/usage/usage.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { adminPartnersRouter, partnerRouter, partnersInternalRouter, referralPublicRouter } from './modules/partners/partners.routes.js';

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

  app.get('/health', async (_req: Request, res: Response) => {
    let maintenance: Awaited<ReturnType<typeof import('./modules/admin/settings.service.js').getMaintenanceMode>> = {
      enabled: false,
      message: null,
      toggledBy: null,
      toggledAt: null,
    };
    try {
      const { getMaintenanceMode } = await import('./modules/admin/settings.service.js');
      maintenance = await getMaintenanceMode();
    } catch (err) {
      logger.warn('[health] maintenance check failed', { err });
    }
    res.json({
      data: {
        status: 'ok',
        service: 'api',
        time: new Date().toISOString(),
        maintenance,
      },
    });
  });

  // Partner programme: public referral link + code check, partner portal, admin.
  app.use('/api', referralPublicRouter);
  app.use('/api/partner', partnerRouter);
  app.use('/api/admin', adminPartnersRouter);
  app.use('/api/access', accessRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/me', meRouter);

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
  app.use('/api/macro', macroRouter);
  app.use('/api/trader', traderRouter);
  // Worker-to-API routes. Not under /api: no session, no CORS use case — the
  // shared-token guard on the router is the only way in.
  app.use('/internal/ai', aiInternalRouter);
  app.use('/internal/calendar', calendarInternalRouter);
  app.use('/internal/news', newsInternalRouter);
  app.use('/internal/notifications', notificationsInternalRouter);
  app.use('/internal/market', marketInternalRouter);
  app.use('/internal/alerts', alertsInternalRouter);
  app.use('/internal/macro', macroInternalRouter);
  app.use('/internal/trader', traderInternalRouter);
  app.use('/internal/partners', partnersInternalRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}
