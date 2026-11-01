import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { ok } from '../../http/response.js';
import { derivatives } from './derivatives.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Derivatives and market insights (E11, E17).
export const derivativesRouter: IRouter = Router();
derivativesRouter.use(requireAuth, requirePlatformAccess);
derivativesRouter.get('/', wrap(async (_req, res) => ok(res, await derivatives())));
