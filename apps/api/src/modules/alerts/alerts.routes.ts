import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { createAlertSchema, updateAlertSchema, alertsDispatchSchema } from '@tradinjournal/contracts';
import {
  handleListAlerts,
  handleCreateAlert,
  handleUpdateAlert,
  handleDeleteAlert,
  handleDispatchAlerts,
} from './alerts.controller.js';

// Public (signed-in) price-alert routes.
export const alertsRouter: IRouter = Router();
alertsRouter.use(requireAuth);
alertsRouter.get('/', handleListAlerts);
alertsRouter.post('/', validateBody(createAlertSchema), handleCreateAlert);
alertsRouter.patch('/:id', validateBody(updateAlertSchema), handleUpdateAlert);
alertsRouter.delete('/:id', handleDeleteAlert);

// Internal (worker → API) dispatch, token-guarded.
export const alertsInternalRouter: IRouter = Router();
alertsInternalRouter.use(requireInternalToken);
alertsInternalRouter.post('/dispatch', validateBody(alertsDispatchSchema), handleDispatchAlerts);
