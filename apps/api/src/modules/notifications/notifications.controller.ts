import type { Request, Response, NextFunction } from 'express';
import type { InboxActionInput, InboxQuery, NotificationPrefsInput, PushSubscribeInput } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';
import { ok } from '../../http/response.js';
import {
  getPreferences,
  setPreferences,
  listNotifications,
  markAllRead,
  listInbox,
  inboxAction,
  savePushSubscription,
  removePushSubscription,
} from './notifications.service.js';
import { dispatchReminders } from './dispatch.service.js';
import { createTelegramLink, handleTelegramUpdate, telegramStatus, unlinkTelegram, webhookSecretOk } from './telegram.service.js';
import { logger } from '@tradinjournal/logger';
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

// GET /api/notifications/inbox — group tabs, unread/archived filter, cursor paging.
export async function handleInbox(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await listInbox(res.locals.user.id as string, req.query as unknown as InboxQuery));
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications/inbox — read / archive / unarchive.
export async function handleInboxAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await inboxAction(res.locals.user.id as string, req.body as InboxActionInput));
  } catch (err) {
    next(err);
  }
}

// GET /api/notifications/telegram — is a bot configured, and is this user linked?
export async function handleTelegramStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, await telegramStatus(res.locals.user.id as string));
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications/telegram/link — a one-time t.me link (404 when no bot is configured).
export async function handleTelegramLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const link = await createTelegramLink(res.locals.user.id as string);
    if (!link) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Telegram alerts aren’t available.' } });
      return;
    }
    ok(res, link);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/notifications/telegram
export async function handleTelegramUnlink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await unlinkTelegram(res.locals.user.id as string);
    ok(res, { ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/telegram/webhook — Telegram's calls, checked by the secret header.
// Always 200 once the secret matches, so Telegram doesn't retry a bad update forever.
export async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  if (!webhookSecretOk(req.get('x-telegram-bot-api-secret-token'))) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bad secret' } });
    return;
  }
  try {
    await handleTelegramUpdate(req.body ?? {});
  } catch (err) {
    logger.warn('[telegram] update failed', { err: String(err) });
  }
  res.json({ ok: true });
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
