// In-process scheduler — runs the background jobs (event reminders, calendar +
// news ingestion, daily digest) INSIDE the API process on plain setInterval.
//
// The normal architecture is "worker schedules, API executes" over Redis/BullMQ.
// But that needs a separate worker service + Redis. This is the fallback for
// local dev and single-service deploys with no Redis: flip IN_PROCESS_SCHEDULER
// on and everything just runs here. The API owns the idempotency ledgers, so
// reminders/digests never double-send even if a real worker also runs.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { dispatchReminders } from './modules/notifications/dispatch.service.js';
import { sendDailyDigests } from './modules/notifications/digest.service.js';
import { ingestNews, enrichPendingNews } from './modules/news/news.service.js';
import { ingestWindow } from './modules/calendar/calendar.service.js';

const MIN = 60_000;
const timers: NodeJS.Timeout[] = [];

function every(ms: number, label: string, fn: () => Promise<unknown>): void {
  const run = () => void fn().catch(e => logger.warn(`[scheduler] ${label} failed: ${(e as Error).message}`));
  timers.push(setInterval(run, ms));
}

/** Recent-past → month-ahead window for calendar ingestion. */
function calWindow(): { from: Date; to: Date } {
  const n = Date.now();
  return { from: new Date(n - 7 * 864e5), to: new Date(n + 30 * 864e5) };
}

export function startInProcessScheduler(): void {
  if (!env.IN_PROCESS_SCHEDULER) return;
  logger.info('[scheduler] in-process scheduler ON — running background jobs here (no external worker)');

  // Event reminders — every minute (in-app + push; the ledger dedups).
  every(1 * MIN, 'reminders', dispatchReminders);
  // Daily email digest — checked hourly; the ledger caps it to once per user per day.
  every(60 * MIN, 'digest', sendDailyDigests);

  if (env.NEWS_ENABLED) {
    every(2 * MIN, 'news-ingest', ingestNews);
    if (env.NEWS_ENRICH_ENABLED) every(3 * MIN, 'news-enrich', () => enrichPendingNews(env.NEWS_ENRICH_MAX_PER_TICK));
  }
  if (env.CALENDAR_ENABLED) {
    every(15 * MIN, 'calendar-ingest', () => { const w = calWindow(); return ingestWindow(w.from, w.to); });
  }

  // Warm the data shortly after boot so it's fresh without waiting a full interval.
  setTimeout(() => void dispatchReminders().catch(() => {}), 4_000);
  if (env.CALENDAR_ENABLED) setTimeout(() => { const w = calWindow(); void ingestWindow(w.from, w.to).catch(() => {}); }, 6_000);
  if (env.NEWS_ENABLED) setTimeout(() => void ingestNews().catch(() => {}), 9_000);
}

export function stopInProcessScheduler(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
}
