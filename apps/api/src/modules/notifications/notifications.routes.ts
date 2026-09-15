import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
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
  handleDispatchDigest,
} from './notifications.controller.js';

// All notification routes require a signed-in user.
export const notificationsRouter: IRouter = Router();
notificationsRouter.use(requireAuth, requirePlatformAccess);
notificationsRouter.get('/preferences', handleGetPrefs);
notificationsRouter.patch('/preferences', validateBody(notificationPrefsSchema), handleSetPrefs);
notificationsRouter.get('/', handleListNotifications);
notificationsRouter.post('/read', handleMarkRead);

// Web Push subscribe/unsubscribe (mounted under /api/push).
export const pushRouter: IRouter = Router();
pushRouter.use(requireAuth, requirePlatformAccess);
pushRouter.post('/subscribe', validateBody(pushSubscribeSchema), handlePushSubscribe);
pushRouter.post('/unsubscribe', handlePushUnsubscribe);

// Internal (worker → API) reminder dispatch, token-guarded.
export const notificationsInternalRouter: IRouter = Router();
notificationsInternalRouter.use(requireInternalToken);
notificationsInternalRouter.post('/dispatch', validateBody(notificationsDispatchSchema), handleDispatch);
notificationsInternalRouter.post('/digest', validateBody(notificationsDispatchSchema), handleDispatchDigest);
