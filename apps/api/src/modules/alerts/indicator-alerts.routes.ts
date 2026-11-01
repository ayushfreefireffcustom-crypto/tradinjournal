import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { createIndicatorAlertSchema, updateIndicatorAlertSchema, type CreateIndicatorAlertInput, type UpdateIndicatorAlertInput } from '@tradinjournal/contracts';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { validateBody } from '../../http/middleware/validate.js';
import { ok, created } from '../../http/response.js';
import {
  createIndicatorAlert,
  deleteIndicatorAlert,
  indicatorCatalogue,
  listIndicatorAlerts,
  previewIndicatorAlert,
  recentFirings,
  updateIndicatorAlert,
} from './indicator-alerts.service.js';

const uid = (res: Response) => res.locals.user.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

// Indicator alerts (E3): the rule builder's catalogue, a live preview, CRUD and recent firings.
export const indicatorAlertsRouter: IRouter = Router();
indicatorAlertsRouter.use(requireAuth, requirePlatformAccess);
indicatorAlertsRouter.get('/catalogue', (_req, res) => ok(res, indicatorCatalogue()));
indicatorAlertsRouter.get('/', wrap(async (_req, res) => ok(res, await listIndicatorAlerts(uid(res)))));
indicatorAlertsRouter.get('/firings', wrap(async (req, res) => ok(res, await recentFirings(uid(res), Number(req.query.limit) || 50))));
indicatorAlertsRouter.post('/preview', validateBody(createIndicatorAlertSchema), wrap(async (req, res) => ok(res, await previewIndicatorAlert(req.body as CreateIndicatorAlertInput))));
indicatorAlertsRouter.post('/', validateBody(createIndicatorAlertSchema), wrap(async (req, res) => created(res, await createIndicatorAlert(uid(res), req.body as CreateIndicatorAlertInput))));
indicatorAlertsRouter.patch('/:id', validateBody(updateIndicatorAlertSchema), wrap(async (req, res) => ok(res, await updateIndicatorAlert(uid(res), req.params.id as string, req.body as UpdateIndicatorAlertInput))));
indicatorAlertsRouter.delete('/:id', wrap(async (req, res) => ok(res, await deleteIndicatorAlert(uid(res), req.params.id as string))));
