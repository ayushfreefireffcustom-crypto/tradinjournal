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
import { warmSymbols } from './modules/market/market.service.js';
import { dispatchPriceAlerts } from './modules/alerts/alerts.service.js';
import { gradePendingAnalyses } from './modules/trader/trader.grade.service.js';
import { trainMetaModelFromDb } from './modules/trader/trader.meta.service.js';
import { trainLgbmChallenger } from './modules/trader/trader.lgbm.service.js';
import { tickPaperBook } from './modules/trader/trader.paper.service.js';

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
  // Keep the configured warm symbol set a cache hit for everyone (no-op when unset).
  if (env.MARKET_ENABLED && env.MARKET_WARM_SYMBOLS_LIST.length > 0) {
    every(1 * MIN, 'market-warm', warmSymbols);
  }
  // Price alerts — check every minute; cheap no-op when no alerts are active.
  if (env.PRICE_ALERTS_ENABLED) {
    every(1 * MIN, 'price-alerts', dispatchPriceAlerts);
  }

  // Trader Master grading — every 15 min; no-ops when nothing pending.
  every(15 * MIN, 'trader-grade', () => gradePendingAnalyses(env.TRADER_GRADE_BATCH));
  // Meta-model retrain — every 6h; no-ops until enough graded samples.
  every(6 * 60 * MIN, 'trader-meta', () => trainMetaModelFromDb());
  every(6 * 60 * MIN, 'trader-lgbm', () => trainLgbmChallenger());
  every(5 * MIN, 'trader-paper', () => tickPaperBook());

  // Warm the data shortly after boot so it's fresh without waiting a full interval.
  setTimeout(() => void dispatchReminders().catch(() => {}), 4_000);
  if (env.CALENDAR_ENABLED) setTimeout(() => { const w = calWindow(); void ingestWindow(w.from, w.to).catch(() => {}); }, 6_000);
  if (env.NEWS_ENABLED) setTimeout(() => void ingestNews().catch(() => {}), 9_000);
  setTimeout(() => void gradePendingAnalyses(env.TRADER_GRADE_BATCH).catch(() => {}), 12_000);
  setTimeout(() => void trainMetaModelFromDb().catch(() => {}), 20_000);
  setTimeout(() => void tickPaperBook().catch(() => {}), 16_000);
}

export function stopInProcessScheduler(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
}
