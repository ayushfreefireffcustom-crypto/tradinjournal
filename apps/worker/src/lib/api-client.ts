// Thin client for the API's /internal routes.
//
// The worker deliberately owns no database access and no MT5 bridge access. The
// bridge serialises on a single terminal, so a second process reading deals
// concurrently would break both it and the API. The worker's job is scheduling,
// retries and backpressure; the API remains the only thing that touches trader
// data.
import { env } from '@tradinjournal/config';

const TIMEOUT_MS = 120_000; // a digest generates several LLM reports serially

export class InternalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'InternalApiError';
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const token = env.INTERNAL_API_TOKEN;
  if (!token) throw new InternalApiError('INTERNAL_API_TOKEN is not configured', 0);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.API_INTERNAL_URL_RESOLVED}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-internal-token': token, ...init.headers },
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (!res.ok) {
      throw new InternalApiError(json?.error?.message ?? `Internal API ${res.status}`, res.status);
    }
    return json?.data as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface RecipientPage {
  recipients: { userId: string }[];
  nextCursor?: string;
}

export function fetchWeeklyReviewRecipients(params: {
  sentAfter: string;
  cursor?: string;
  limit: number;
}): Promise<RecipientPage> {
  const query = new URLSearchParams({ sentAfter: params.sentAfter, limit: String(params.limit) });
  if (params.cursor) query.set('cursor', params.cursor);
  return request<RecipientPage>(`/internal/ai/weekly-review/recipients?${query}`, { method: 'GET' });
}

export type SendOutcome = { sent: true; accounts: number } | { sent: false; reason: string };

export function runWeeklyReview(params: { userId: string; sentAfter: string }): Promise<SendOutcome> {
  return request<SendOutcome>('/internal/ai/weekly-review', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Phase 2: calendar / news / notifications ingest triggers ──────────────────

export function ingestCalendar(params: { from: string; to: string }): Promise<{ upserted: number; providers: number }> {
  return request('/internal/calendar/ingest', { method: 'POST', body: JSON.stringify(params) });
}

export function ingestNews(params: { bucket: string }): Promise<{ fetched: number; inserted: number }> {
  return request('/internal/news/ingest', { method: 'POST', body: JSON.stringify(params) });
}

export function enrichNews(params: { bucket: string }): Promise<{ enriched: number }> {
  return request('/internal/news/enrich', { method: 'POST', body: JSON.stringify(params) });
}

export function dispatchNotifications(params: { bucket: string }): Promise<{ events: number; delivered: number }> {
  return request('/internal/notifications/dispatch', { method: 'POST', body: JSON.stringify(params) });
}

export function dispatchDigest(params: { bucket: string }): Promise<{ users: number; sent: number }> {
  return request('/internal/notifications/digest', { method: 'POST', body: JSON.stringify(params) });
}
