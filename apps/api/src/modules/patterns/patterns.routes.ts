import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { ok } from '../../http/response.js';
import { ValidationError } from '../../http/errors.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { explainPattern, findPatterns } from './patterns.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const explainLimit = perUserRateLimit({ name: 'pattern-explain', max: 20, windowSeconds: 3600, message: 'That’s a lot of explanations for one hour. Try again a bit later.' });

// Chart patterns (E8) and explanations (E9).
export const patternsRouter: IRouter = Router();
patternsRouter.use(requireAuth, requirePlatformAccess);
patternsRouter.get('/', wrap(async (req, res) => ok(res, await findPatterns(String(req.query.symbol ?? ''), String(req.query.tf ?? '')))));
patternsRouter.post('/explain', explainLimit, wrap(async (req, res) => {
  const b = (req.body ?? {}) as { symbol?: unknown; tf?: unknown; id?: unknown };
  if (typeof b.symbol !== 'string' || typeof b.tf !== 'string' || typeof b.id !== 'string' || b.id.length > 200) throw new ValidationError('symbol, tf and id are required.');
  ok(res, await explainPattern(b.symbol, b.tf, b.id));
}));
