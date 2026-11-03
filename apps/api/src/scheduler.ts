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
import { dispatchCopyNotifications } from './modules/copy/copy-notify.service.js';
import { dispatchTelegram } from './modules/notifications/telegram.service.js';
import { importDue as importExchangeHistory } from './modules/trading/history.service.js';
import { sendDailyDigests } from './modules/notifications/digest.service.js';
import { ingestNews, enrichPendingNews } from './modules/news/news.service.js';
import { ingestWindow } from './modules/calendar/calendar.service.js';
import { warmSymbols } from './modules/market/market.service.js';
import { dispatchPriceAlerts } from './modules/alerts/alerts.service.js';
import { dispatchIndicatorAlerts } from './modules/alerts/indicator-alerts.service.js';
import { tickDeployments } from './modules/strategies/deployments.service.js';
import { gradePendingAnalyses } from './modules/trader/trader.grade.service.js';
import { trainMetaModelFromDb } from './modules/trader/trader.meta.service.js';
import { trainLgbmChallenger } from './modules/trader/trader.lgbm.service.js';
import { tickPaperBook } from './modules/trader/trader.paper.service.js';
import { refreshReferralStats } from './modules/partners/stats.service.js';
import { queueDueSyncs } from './modules/sync/sync.jobs.js';
import { ingestMacro } from './modules/macro/macro.service.js';
import { createElector } from './lib/leader.js';

const MIN = 60_000;
const timers: NodeJS.Timeout[] = [];
// With several API replicas only the lease holder runs jobs (see lib/leader.ts).
const elector = createElector();

function every(ms: number, label: string, fn: () => Promise<unknown>): void {
  const run = () => {
    if (!elector.isLeader()) return;
    void fn().catch(e => logger.warn(`[scheduler] ${label} failed: ${(e as Error).message}`));
  };
  timers.push(setInterval(run, ms));
}

/** One-off boot warm-up, skipped on non-leaders. */
function soon(ms: number, fn: () => Promise<unknown>): void {
  timers.push(setTimeout(() => { if (elector.isLeader()) void fn().catch(() => {}); }, ms));
}

/**
 * Run once as soon as this instance holds the lease. A new deploy can't take the
 * lease until the old instance's expires (up to LEASE_MS), so a fixed boot delay
 * would usually be skipped.
 */
function onceLeader(label: string, fn: () => Promise<unknown>): void {
  const t = setInterval(() => {
    if (!elector.isLeader()) return;
    clearInterval(t);
    void fn().catch(e => logger.warn(`[scheduler] ${label} failed: ${(e as Error).message}`));
  }, 15_000);
  timers.push(t);
}

/** Recent-past → month-ahead window for calendar ingestion. */
function calWindow(): { from: Date; to: Date } {
  const n = Date.now();
  return { from: new Date(n - 7 * 864e5), to: new Date(n + 30 * 864e5) };
}

export function startInProcessScheduler(): void {
  if (!env.IN_PROCESS_SCHEDULER) return;
  logger.info('[scheduler] in-process scheduler ON — the lease holder runs background jobs');
  elector.start();

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
    // Indicator alerts: each rule once per closed bar; fetches only when a bar closed.
    every(1 * MIN, 'indicator-alerts', () => dispatchIndicatorAlerts());
  }

  // Strategy deployments: paper replays and live runners act once per closed bar.
  if (env.MARKET_ENABLED) every(1 * MIN, 'strategy-deployments', () => tickDeployments());

  // Trader Master grading — every 15 min; no-ops when nothing pending.
  every(15 * MIN, 'trader-grade', () => gradePendingAnalyses(env.TRADER_GRADE_BATCH));
  // Meta-model retrain — every 6h; no-ops until enough graded samples.
  every(6 * 60 * MIN, 'trader-meta', () => trainMetaModelFromDb());
  every(6 * 60 * MIN, 'trader-lgbm', () => trainLgbmChallenger());
  every(5 * MIN, 'trader-paper', () => tickPaperBook());
  // Macro data (FRED, COT, quotes, FX): every 30 min plus once at boot. The separate
  // worker used to own this; without it the Macro page froze on its last ingest.
  // No-ops when the macro segment is off (no FRED key).
  every(30 * MIN, 'macro-ingest', () => ingestMacro({ reason: 'in-process' }));
  onceLeader('macro-ingest:boot', () => ingestMacro({ reason: 'in-process:boot' }));
  // Trade sync: keep every account's stored deals at most SYNC_BACKGROUND_MIN old.
  every(5 * MIN, 'trade-sync', () => queueDueSyncs());
  // Copy-trading events to push and email (the in-app notification is written by the engine).
  if (env.TRADING_ENABLED) every(MIN / 2, 'copy-notify', () => dispatchCopyNotifications());
  // Exchange trade history for the journal: each active account at most 15 minutes behind.
  if (env.TRADING_ENABLED) every(5 * MIN, 'exchange-history', () => importExchangeHistory());
  // Telegram alerts: every notification type, to linked chats.
  if (env.TELEGRAM_ENABLED) every(MIN / 2, 'telegram', () => dispatchTelegram());
  // Partner dashboards: refresh referred clients' activity snapshots in small batches.
  if (env.PARTNER_PROGRAM_ENABLED) every(15 * MIN, 'partner-stats', () => refreshReferralStats({ limit: 25 }));

  // Warm the data shortly after boot so it's fresh without waiting a full interval.
  soon(4_000, dispatchReminders);
  if (env.CALENDAR_ENABLED) soon(6_000, () => { const w = calWindow(); return ingestWindow(w.from, w.to); });
  if (env.NEWS_ENABLED) soon(9_000, ingestNews);
  soon(12_000, () => gradePendingAnalyses(env.TRADER_GRADE_BATCH));
  soon(20_000, () => trainMetaModelFromDb());
  soon(16_000, () => tickPaperBook());
}

export function stopInProcessScheduler(): void {
  timers.forEach(clearInterval);
  timers.length = 0;
  void elector.stop();
}
