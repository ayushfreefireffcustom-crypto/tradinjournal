import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { ok } from '../../http/response.js';
import { ValidationError } from '../../http/errors.js';
import { listSignals, symbolSignals } from './signals.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Signals (E7): technical ratings for the top pairs, and the votes behind one symbol.
export const signalsRouter: IRouter = Router();
signalsRouter.use(requireAuth, requirePlatformAccess);
signalsRouter.get('/', wrap(async (req, res) => {
  const size = Number(req.query.universe ?? 50);
  if (![25, 50, 100].includes(size)) throw new ValidationError('universe must be 25, 50 or 100.');
  ok(res, await listSignals(size));
}));
signalsRouter.get('/:symbol', wrap(async (req, res) => ok(res, await symbolSignals(String(req.params.symbol)))));
