import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { saveScreenSchema, screenDefinitionSchema, updateScreenSchema, type SaveScreenInput, type ScreenDefinition, type UpdateScreenInput } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok, created } from '../../http/response.js';
import { deleteScreen, listScreens, runScreen, saveScreen, updateScreen } from './screener.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Screener (E5/E6): run a screen, and the user's saved screens.
export const screenerRouter: IRouter = Router();
screenerRouter.use(requireAuth, requirePlatformAccess);
screenerRouter.post('/run', validateBody(screenDefinitionSchema), wrap(async (req, res) => ok(res, await runScreen(req.body as ScreenDefinition))));
screenerRouter.get('/screens', wrap(async (_req, res) => ok(res, await listScreens(uid(res)))));
screenerRouter.post('/screens', validateBody(saveScreenSchema), wrap(async (req, res) => created(res, await saveScreen(uid(res), req.body as SaveScreenInput))));
screenerRouter.patch('/screens/:id', validateBody(updateScreenSchema), wrap(async (req, res) => ok(res, await updateScreen(uid(res), req.params.id as string, req.body as UpdateScreenInput))));
screenerRouter.delete('/screens/:id', wrap(async (req, res) => ok(res, await deleteScreen(uid(res), req.params.id as string))));
