// GET/PUT /api/me/trading-prefs: rules, risk cap and dashboard layouts.
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { tradingPrefsUpdateSchema, type TradingPrefsUpdate } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { perUserRateLimit } from '../../lib/rate-limit.js';
import { getPrefs, updatePrefs } from './prefs.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const uid = (res: Response) => res.locals.user.id as string;
const writeLimit = perUserRateLimit({ name: 'trading-prefs-write', max: 60, windowSeconds: 60, message: 'Too many changes in a minute.' });

export const tradingPrefsRouter: IRouter = Router();
tradingPrefsRouter.use(requireAuth);
tradingPrefsRouter.get('/', wrap(async (_req, res) => ok(res, await getPrefs(uid(res)))));
tradingPrefsRouter.put('/', writeLimit, validateBody(tradingPrefsUpdateSchema), wrap(async (req, res) => ok(res, await updatePrefs(uid(res), req.body as TradingPrefsUpdate))));
