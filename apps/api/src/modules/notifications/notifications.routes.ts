import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody } from '../../http/middleware/validate.js';
import { notificationPrefsSchema, pushSubscribeSchema, notificationsDispatchSchema } from '@tradinjournal/contracts';
import {
  handleGetPrefs,
  handleSetPrefs,
  handleListNotifications,
  handleMarkRead,
  handlePushSubscribe,
  handlePushUnsubscribe,
  handleDispatch,
} from './notifications.controller.js';

// All notification routes require a signed-in user.
export const notificationsRouter: IRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get('/preferences', handleGetPrefs);
notificationsRouter.patch('/preferences', validateBody(notificationPrefsSchema), handleSetPrefs);
notificationsRouter.get('/', handleListNotifications);
notificationsRouter.post('/read', handleMarkRead);

// Web Push subscribe/unsubscribe (mounted under /api/push).
export const pushRouter: IRouter = Router();
pushRouter.use(requireAuth);
pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), handlePushSubscribe);
pushRouter.post('/unsubscribe', handlePushUnsubscribe);

// Internal (worker → API) reminder dispatch, token-guarded.
export const notificationsInternalRouter: IRouter = Router();
notificationsInternalRouter.use(requireInternalToken);
notificationsInternalRouter.post('/dispatch', validateBody(notificationsDispatchSchema), handleDispatch);
