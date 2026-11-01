// Trading desk routes (/api/trading). Mounted only when TRADING_ENABLED.
import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { protectionQuerySchema, setProtectionSchema, type SetProtectionInput, cancelOrderSchema, type CancelOrderInput, closeManySchema, closePositionSchema, deskOrderFiltersSchema, deskOrdersQuerySchema, orderTicketSchema, ticketQuoteQuerySchema, type OrderTicketInput, type CloseManyInput, type ClosePositionInput, type DeskOrderFilters, type DeskOrdersQuery } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { placeTicket, previewTicket, ticketQuote } from './ticket.service.js';
import { getProtection, setProtection } from './protection.service.js';
import { cancelOrder, closeMany, closePosition, deskOrders, deskOrdersCsv, deskOrdersSummary, deskOverview } from './trading.service.js';

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
// Order ticket (D10, D11, D13). Quote and preview read the exchange; place sends a real order.
tradingRouter.get('/quote', readLimit, validateQuery(ticketQuoteQuerySchema), wrap(async (req, res) => {
  const q = req.query as unknown as { connectionId: string; symbol: string };
  res.json({ data: await ticketQuote(uid(res), q.connectionId, q.symbol) });
}));
tradingRouter.post('/orders/preview', readLimit, validateBody(orderTicketSchema), wrap(async (req, res) => res.json({ data: await previewTicket(uid(res), req.body as OrderTicketInput) })));
tradingRouter.post('/orders', closeLimit, validateBody(orderTicketSchema), wrap(async (req, res) => res.json({ data: await placeTicket(uid(res), req.body as OrderTicketInput) })));
// Take-profit / stop-loss on an open position (D5).
tradingRouter.get('/protection', readLimit, validateQuery(protectionQuerySchema), wrap(async (req, res) => {
  const q = req.query as unknown as { connectionId: string; symbol: string };
  res.json({ data: await getProtection(uid(res), q.connectionId, q.symbol) });
}));
tradingRouter.post('/protection', closeLimit, validateBody(setProtectionSchema), wrap(async (req, res) => res.json({ data: await setProtection(uid(res), req.body as SetProtectionInput) })));
tradingRouter.post('/orders/cancel', closeLimit, validateBody(cancelOrderSchema), wrap(async (req, res) => res.json({ data: await cancelOrder(uid(res), req.body as CancelOrderInput) })));
tradingRouter.post('/positions/close-many', closeLimit, validateBody(closeManySchema), wrap(async (req, res) => res.json({ data: await closeMany(uid(res), req.body as CloseManyInput) })));
tradingRouter.post('/positions/close', closeLimit, validateBody(closePositionSchema), wrap(async (req, res) => res.json({ data: await closePosition(uid(res), req.body as ClosePositionInput) })));
