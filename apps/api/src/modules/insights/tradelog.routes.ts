// Trade log v2 routes, mounted under /api/insights/tradelog (auth + platform
// access come from the insights router).
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import {
  tradelogExportSchema, tradelogPathsSchema, tradelogQuerySchema, tradelogTagSchema, tradelogTradeQuerySchema,
  type TradelogExportQuery, type TradelogPathsInput, type TradelogQuery, type TradelogTagInput, type TradelogTradeQuery,
} from '@tradinjournal/contracts';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { tradelog, tradelogExport, tradelogPaths, tradelogTag, tradelogTrade } from './tradelog.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const uid = (res: Response) => res.locals.user.id as string;

export const tradelogRouter: IRouter = Router();
tradelogRouter.get('/', validateQuery(tradelogQuerySchema), wrap(async (req, res) => {
  ok(res, await tradelog(uid(res), req.query as unknown as TradelogQuery));
}));
tradelogRouter.get('/export', validateQuery(tradelogExportSchema), wrap(async (req, res) => {
  ok(res, await tradelogExport(uid(res), req.query as unknown as TradelogExportQuery));
}));
tradelogRouter.get('/trade', validateQuery(tradelogTradeQuerySchema), wrap(async (req, res) => {
  const q = req.query as unknown as TradelogTradeQuery;
  ok(res, await tradelogTrade(uid(res), q.accountId, q.id, q.tz));
}));
tradelogRouter.post('/paths', validateBody(tradelogPathsSchema), wrap(async (req, res) => {
  ok(res, await tradelogPaths(uid(res), req.body as TradelogPathsInput));
}));
tradelogRouter.post('/tag', validateBody(tradelogTagSchema), wrap(async (req, res) => {
  ok(res, await tradelogTag(uid(res), req.body as TradelogTagInput));
}));
