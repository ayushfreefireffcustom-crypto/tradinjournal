import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import { toNodeHandler } from 'better-auth/node';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { auth } from './lib/auth.js';
import { errorHandler } from './http/middleware/error-handler.js';
import { requireSameOrigin } from './http/middleware/require-same-origin.js';
import { exchangesRouter } from './modules/exchanges/exchanges.routes.js';
import { followsRouter, leadersRouter } from './modules/copy/copy.routes.js';
import { tradingRouter } from './modules/trading/trading.routes.js';
import { tvHooksRouter } from './modules/trading/hooks.routes.js';
import { v1Router } from './modules/trading/v1.routes.js';
import { adminCopyRouter } from './modules/copy/admin-copy.routes.js';
import { accountsRouter } from './modules/accounts/accounts.routes.js';
import { tradesRouter } from './modules/trades/trades.routes.js';
import { journalRouter } from './modules/journal/journal.routes.js';
import { aiRouter, aiInternalRouter } from './modules/ai/ai.routes.js';
import { calendarRouter, calendarInternalRouter } from './modules/calendar/calendar.routes.js';
import { macroRouter, macroInternalRouter } from './modules/macro/macro.routes.js';
import { newsRouter, newsInternalRouter } from './modules/news/news.routes.js';
import { notificationsRouter, pushRouter, notificationsInternalRouter, telegramWebhookRouter } from './modules/notifications/notifications.routes.js';
import { marketRouter, marketInternalRouter } from './modules/market/market.routes.js';
import { traderRouter, traderInternalRouter } from './modules/trader/trader.routes.js';
import { alertsRouter, alertsInternalRouter } from './modules/alerts/alerts.routes.js';
import { indicatorAlertsRouter } from './modules/alerts/indicator-alerts.routes.js';
import { screenerRouter } from './modules/screener/screener.routes.js';
import { signalsRouter } from './modules/signals/signals.routes.js';
import { patternsRouter } from './modules/patterns/patterns.routes.js';
import { overviewRouter } from './modules/overview/overview.routes.js';
import { derivativesRouter } from './modules/derivatives/derivatives.routes.js';
import { optionsOrdersRouter, optionsRouter } from './modules/options/options.routes.js';
import { adminFeedbackRouter, feedbackRouter } from './modules/feedback/feedback.routes.js';
import { adminMarketplaceRouter, marketplaceRouter } from './modules/marketplace/marketplace.routes.js';
import { strategiesRouter } from './modules/strategies/strategies.routes.js';
import { deploymentsInternalRouter, deploymentsRouter } from './modules/strategies/deployments.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { accessRouter } from './modules/admin/access.routes.js';
import { usageRouter } from './modules/usage/usage.routes.js';
import { meRouter } from './modules/me/me.routes.js';
import { syncInternalRouter } from './modules/sync/sync.jobs.js';
import { adminPartnersRouter, ibPublicRouter, partnerAccessRouter, partnerRouter, partnersInternalRouter, referralPublicRouter } from './modules/partners/partners.routes.js';
import { perkGates } from './modules/partners/ib/perk-gate.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
      // The order-log CSV download reads its file name and row count from these.
      exposedHeaders: ['Content-Disposition', 'X-Rows', 'X-Truncated'],
    }),
  );

  // gzip compression for JSON (a 1.5k-trade history is ~1.2 MB raw,
  // ~10x smaller compressed). Never for SSE — it would buffer the stream.
  app.use(compression({
    threshold: 1024,
    filter: (req, res) => !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') && compression.filter(req, res),
  }));

  // API JSON is per-user: browsers may keep it but must revalidate (Express sends a
  // weak ETag, so an unchanged response comes back as a bodyless 304); shared
  // caches must never store it. Handlers can override (e.g. public market data).
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });

  app.use(
    morgan('tiny', {
      stream: { write: (message: string) => logger.info(message.trim()) },
    }),
  );

  // better-auth handles all /api/auth/* — must come before express.json()
  app.all('/api/auth/*', toNodeHandler(auth));

  // Bigger bodies only where they're expected: partner list / report / file uploads (≤2 MB
  // decoded, base64 inflates ~33%). Broker postbacks may arrive form-encoded.
  const bigJson = express.json({ limit: '4mb' }), smallJson = express.json();
  app.use('/api/ib/postback', express.urlencoded({ extended: false, limit: '64kb' }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const big = req.method !== 'GET' && /^\/api\/partner\/(brokers\/[^/]+\/(accounts|earnings)|products(\/[^/]+\/file)?)$/.test(req.path);
    return (big ? bigJson : smallJson)(req, res, next);
  });

  // Cookie-authenticated writes must come from the web app (see the middleware).
  app.use('/api', requireSameOrigin);

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
  // Switched off by PARTNER_PROGRAM_ENABLED — the routes then don't exist (404).
  if (env.PARTNER_PROGRAM_ENABLED) {
    app.use('/api', referralPublicRouter);
    app.use('/api/partner', partnerRouter);
    app.use('/api/partner-access', partnerAccessRouter);
    app.use('/api', ibPublicRouter);
    app.use('/api/admin', adminPartnersRouter);
    // Features the admin locked to partner-package holders. No-op until something is locked.
    for (const [prefix, gate] of perkGates()) app.use(prefix, gate);
  }
  app.use('/api/access', accessRouter);
  // Copy-trading admin first: the general admin router 404s anything it doesn't know.
  if (env.TRADING_ENABLED) app.use('/api/admin/copy', adminCopyRouter);
  app.use('/api/admin/feedback', adminFeedbackRouter);
  app.use('/api/admin/marketplace', adminMarketplaceRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/me', meRouter);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/marketplace', marketplaceRouter);

  app.use('/api/accounts', accountsRouter);
  // Trading platform: exchange connections and copy trading. Off until TRADING_ENABLED (404).
  if (env.TRADING_ENABLED) {
    app.use('/api/exchanges', exchangesRouter);
    app.use('/api/leaders', leadersRouter);
    app.use('/api/follows', followsRouter);
    app.use('/api/trading', tradingRouter);
    app.use('/api/hooks/tv', tvHooksRouter);
    app.use('/api/v1', v1Router);
    app.use('/api/options/orders', optionsOrdersRouter);
  }
  app.use('/api/trades', tradesRouter);
  app.use('/api/journal', journalRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/calendar', calendarRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/push', pushRouter);
  if (env.TELEGRAM_ENABLED) app.use('/api/telegram', telegramWebhookRouter);
  app.use('/api/market', marketRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/indicator-alerts', indicatorAlertsRouter);
  app.use('/api/screener', screenerRouter);
  app.use('/api/signals', signalsRouter);
  app.use('/api/patterns', patternsRouter);
  app.use('/api/overview', overviewRouter);
  app.use('/api/derivatives', derivativesRouter);
  app.use('/api/options', optionsRouter);
  app.use('/api/strategies', strategiesRouter);
  app.use('/api/deployments', deploymentsRouter);
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
  app.use('/internal/deployments', deploymentsInternalRouter);
  app.use('/internal/macro', macroInternalRouter);
  app.use('/internal/trader', traderInternalRouter);
  if (env.PARTNER_PROGRAM_ENABLED) app.use('/internal/partners', partnersInternalRouter);
  app.use('/internal/sync', syncInternalRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}
