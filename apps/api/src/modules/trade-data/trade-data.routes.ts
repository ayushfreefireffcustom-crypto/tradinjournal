// POST / DELETE /api/trade-data/levels — the trader's stop and target for a
// position (account ownership is checked in the service).
import { Router, type IRouter, type NextFunction, type Request, type Response } from 'express';
import { addLevelSchema, deleteLevelSchema, type AddLevelInput, type DeleteLevelInput } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok } from '../../http/response.js';
import { addLevel, deleteLevel } from './trade-data.service.js';

const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const tradeDataRouter: IRouter = Router();
tradeDataRouter.use(requireAuth, requirePlatformAccess);
tradeDataRouter.post('/levels', validateBody(addLevelSchema), wrap(async (req, res) => {
  ok(res, await addLevel(res.locals.user.id as string, req.body as AddLevelInput));
}));
tradeDataRouter.delete('/levels', validateBody(deleteLevelSchema), wrap(async (req, res) => {
  ok(res, await deleteLevel(res.locals.user.id as string, req.body as DeleteLevelInput));
}));
