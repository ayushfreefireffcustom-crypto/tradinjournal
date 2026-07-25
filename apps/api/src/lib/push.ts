// Web Push sender (VAPID). Optional: without both VAPID keys, isPushEnabled() is
// false and sendPush() is a no-op. Reports dead endpoints (404/410) so the caller
// can prune them, and never throws — a failed push must not fail a dispatch.
import webpush from 'web-push';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

let configured = false;

function ensureConfigured(): boolean {
  if (!env.PUSH_ENABLED) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export function isPushEnabled(): boolean {
  return env.PUSH_ENABLED;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export type PushResult = 'sent' | 'gone' | 'failed' | 'disabled';

/** Send one push. Returns 'gone' when the endpoint is dead (caller should prune). */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!ensureConfigured()) return 'disabled';
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
    return 'sent';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    logger.warn(`Push send failed (${status ?? '?'}): ${(err as Error).message}`);
    return 'failed';
  }
}
