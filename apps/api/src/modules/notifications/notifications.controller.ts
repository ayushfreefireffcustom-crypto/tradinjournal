import type { Request, Response, NextFunction } from 'express';
import type { NotificationPrefsInput, PushSubscribeInput } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { ok } from '../../http/response.js';
import {
  getPreferences,
  setPreferences,
  listNotifications,
  markAllRead,
  savePushSubscription,
  removePushSubscription,
} from './notifications.service.js';
import { dispatchReminders } from './dispatch.service.js';
import { sendDailyDigests } from './digest.service.js';

// GET /api/notifications/preferences — includes whether push is even available.
export async function handleGetPrefs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const prefs = await getPreferences(userId);
    ok(res, { ...prefs, pushAvailable: env.PUSH_ENABLED, vapidPublicKey: env.PUSH_ENABLED ? env.VAPID_PUBLIC_KEY : null });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/preferences
export async function handleSetPrefs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    ok(res, await setPreferences(userId, req.body as NotificationPrefsInput));
  } catch (err) {
    next(err);
  }
}

// GET /api/notifications — the in-app inbox + unread count.
export async function handleListNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    ok(res, await listNotifications(userId));
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications/read — mark all read.
export async function handleMarkRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    await markAllRead(userId);
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /internal/notifications/dispatch — worker-only reminder sweep.
export async function handleDispatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await dispatchReminders());
  } catch (err) {
    next(err);
  }
}

// POST /internal/notifications/digest — worker-only daily email digest.
export async function handleDispatchDigest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await sendDailyDigests());
  } catch (err) {
    next(err);
  }
}

// POST /api/push/subscribe
export async function handlePushSubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    await savePushSubscription(userId, req.body as PushSubscribeInput);
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/push/unsubscribe
export async function handlePushUnsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = res.locals.user.id as string;
    const endpoint = (req.body as { endpoint?: string }).endpoint;
    if (endpoint) await removePushSubscription(userId, endpoint);
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}
