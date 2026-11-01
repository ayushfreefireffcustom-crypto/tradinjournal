import { Router, type IRouter } from 'express';
import { requireAuth } from '../../http/middleware/require-auth.js';
import { requirePlatformAccess } from '../../http/middleware/require-platform-access.js';
import { requireInternalToken } from '../../http/middleware/require-internal-token.js';
import { validateBody, validateQuery } from '../../http/middleware/validate.js';
import { inboxActionSchema, inboxQuerySchema, notificationPrefsSchema, pushSubscribeSchema, notificationsDispatchSchema } from '@tradinjournal/contracts';
import {
  handleGetPrefs,
  handleSetPrefs,
  handleListNotifications,
  handleMarkRead,
  handleInbox,
  handleInboxAction,
  handleTelegramStatus,
  handleTelegramLink,
  handleTelegramUnlink,
  handleTelegramWebhook,
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
notificationsRouter.get('/inbox', validateQuery(inboxQuerySchema), handleInbox);
notificationsRouter.post('/inbox', validateBody(inboxActionSchema), handleInboxAction);
notificationsRouter.get('/telegram', handleTelegramStatus);
notificationsRouter.post('/telegram/link', handleTelegramLink);
notificationsRouter.delete('/telegram', handleTelegramUnlink);

// Telegram's webhook (mounted under /api/telegram only when a bot is configured).
// No session: the secret header is the only way in.
export const telegramWebhookRouter: IRouter = Router();
telegramWebhookRouter.post('/webhook', handleTelegramWebhook);

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
