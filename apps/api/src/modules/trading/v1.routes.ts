// Public trading API (/api/v1, D16), signed with a personal API key:
//   Authorization: Bearer tl_<prefix>_<secret>
// The same services as the app, so every order runs through the same checks.
// Read keys can list; trade keys can also place, close and cancel.
import { Router, type NextFunction, type Request, type Response, type Router as ExpressRouter } from 'express';
import { cancelOrderSchema, closePositionSchema, deskOrdersQuerySchema, orderTicketSchema, type DeskOrdersQuery } from '@tradinjournal/contracts';
import { prisma } from '@tradinjournal/db';
import { AppError, ForbiddenError, UnauthorizedError } from '../../http/errors.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { cacheIncr } from '../../lib/cache.js';
import { markRateLimit } from '../../lib/rate-limit.js';
import { authenticateApiKey } from './api-keys.service.js';
import { cancelOrderAudited, closePositionAudited, placeTicketAudited } from './trade-audit.js';
import { deskOrders, deskOverview } from './trading.service.js';

const PER_MINUTE = 120;

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = await authenticateApiKey(req.get('authorization'));
    if (!auth) return next(new UnauthorizedError('Send a valid API key: Authorization: Bearer tl_…'));
    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) return next(new UnauthorizedError('Send a valid API key: Authorization: Bearer tl_…'));
    let n = 0;
    try { n = await cacheIncr(`rl:apikey:${auth.keyId}`, 60); } catch { /* fail open */ }
    if (n > PER_MINUTE) {
      res.setHeader('Retry-After', '60');
      return next(new AppError(429, 'RATE_LIMITED', `At most ${PER_MINUTE} requests a minute per key.`));
    }
    res.locals.user = user;
    res.locals.apiKey = auth;
    next();
  } catch (err) {
    next(err);
  }
}

markRateLimit(requireApiKey, 'apikey');

const needTrade = (_req: Request, res: Response, next: NextFunction) =>
  (res.locals.apiKey as { scope: string }).scope === 'trade' ? next() : next(new ForbiddenError('This key is read-only. Create a key with trade access to place or close orders.'));

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try { await fn(req, res); } catch (err) { next(err); }
};

export const v1Router: ExpressRouter = Router();
v1Router.use(requireApiKey, requirePlatformAccess);
v1Router.get('/accounts', wrap(async (_req, res) => {
  const rows = await prisma.exchangeConnection.findMany({ where: { userId: uid(res) }, orderBy: { createdAt: 'asc' }, select: { id: true, exchange: true, environment: true, label: true, status: true, canTrade: true } });
  res.json({ data: rows });
}));
v1Router.get('/positions', wrap(async (_req, res) => {
  const d = await deskOverview(uid(res));
  res.json({ data: { positions: d.positions, pending: d.pending, errors: d.errors } });
}));
v1Router.get('/orders', validateQuery(deskOrdersQuerySchema), wrap(async (req, res) => res.json({ data: await deskOrders(uid(res), req.query as unknown as DeskOrdersQuery) })));
v1Router.post('/orders', needTrade, validateBody(orderTicketSchema), wrap(async (req, res) => res.json({ data: await placeTicketAudited(req, res) })));
v1Router.post('/orders/cancel', needTrade, validateBody(cancelOrderSchema), wrap(async (req, res) => res.json({ data: await cancelOrderAudited(req, res) })));
v1Router.post('/positions/close', needTrade, validateBody(closePositionSchema), wrap(async (req, res) => res.json({ data: await closePositionAudited(req, res) })));
