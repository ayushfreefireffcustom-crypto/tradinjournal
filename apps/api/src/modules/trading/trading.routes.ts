// Trading desk routes (/api/trading). Mounted only when TRADING_ENABLED.
import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { closeManySchema, closePositionSchema, deskOrderFiltersSchema, deskOrdersQuerySchema, type CloseManyInput, type ClosePositionInput, type DeskOrderFilters, type DeskOrdersQuery } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { closeMany, closePosition, deskOrders, deskOrdersCsv, deskOrdersSummary, deskOverview } from './trading.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// Every overview reads each exchange account; closes send real orders.
const readLimit = perUserRateLimit({ name: 'desk-read', max: 60, windowSeconds: 60, message: 'Too many refreshes. Give it a moment.' });
const exportLimit = perUserRateLimit({ name: 'desk-export', max: 10, windowSeconds: 60, message: 'Too many exports. Wait a minute.' });
const closeLimit = perUserRateLimit({ name: 'desk-close', max: 20, windowSeconds: 60, message: 'Too many orders in a short time. Wait a minute and try again.' });

export const tradingRouter: ExpressRouter = Router();
tradingRouter.use(requireAuth, requirePlatformAccess);
tradingRouter.get('/overview', readLimit, wrap(async (_req, res) => res.json({ data: await deskOverview(uid(res)) })));
tradingRouter.get('/orders', validateQuery(deskOrdersQuerySchema), wrap(async (req, res) => res.json({ data: await deskOrders(uid(res), req.query as unknown as DeskOrdersQuery) })));
tradingRouter.get('/orders/summary', validateQuery(deskOrderFiltersSchema), wrap(async (req, res) => res.json({ data: await deskOrdersSummary(uid(res), req.query as unknown as DeskOrderFilters) })));
tradingRouter.get('/orders/export.csv', exportLimit, validateQuery(deskOrderFiltersSchema), wrap(async (req, res) => {
  const out = await deskOrdersCsv(uid(res), req.query as unknown as DeskOrderFilters);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tradelogs-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('X-Rows', String(out.rows));
  res.setHeader('X-Truncated', String(out.truncated));
  res.setHeader('Cache-Control', 'no-store');
  res.send(out.csv);
}));
tradingRouter.post('/positions/close-many', closeLimit, validateBody(closeManySchema), wrap(async (req, res) => res.json({ data: await closeMany(uid(res), req.body as CloseManyInput) })));
tradingRouter.post('/positions/close', closeLimit, validateBody(closePositionSchema), wrap(async (req, res) => res.json({ data: await closePosition(uid(res), req.body as ClosePositionInput) })));
