// Economic-calendar history backfill: the last 13 months of releases (actual /
// forecast / previous), so the macro surprise map has a year of US prints.
//
// Provider: TradingView's widget calendar is the only configured source with
// keyless date-range history (it backs the always-on baseline). FMP and
// Finnhub take date ranges too but are keyed and quota'd, and the Forex
// Factory feed is this week only, so they are left out of the backfill.
//
// Writes go through ingestWindow, which inserts new events and updates only
// rows whose values changed, keyed by the existing dedupKey — re-running is
// harmless. It never hammers the provider: one 10-day window per request, one
// request at a time with a pause between, and it stops after three empty
// windows in a row (provider down or changed).
//
// Runs once per API boot on the scheduler leader, at most once per day across
// every replica and restart: a row in system_setting ("calendar:backfill") is
// claimed atomically (only if its last run is older than a day) before any
// request. After the first full pass, later runs only fetch from where the last
// one ended (minus two days), up to a week ago — the regular ingest keeps the
// last 7 days and the month ahead fresh.
// Script: apps/api/scripts/backfill-calendar.ts.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { createTradingViewProvider } from '../../lib/calendar/providers/tradingview.js';
import type { CalendarProvider } from '../../lib/calendar/types.js';
import { ingestWindow } from './calendar.service.js';

export const BACKFILL_KEY = 'calendar:backfill';
const DAY = 86_400_000;

export interface BackfillState {
  /** Start of the range already covered, ISO. */
  doneFrom: string | null;
  /** End of the range already covered, ISO. */
  doneTo: string | null;
  lastRunAt: string | null;
  lastResult?: { chunks: number; fetched: number; upserted: number; stopped: string | null };
}

export interface BackfillDeps {
  /** History-capable providers (empty = nothing to do). */
  providers: () => CalendarProvider[];
  ingest: (from: Date, to: Date, providers: CalendarProvider[]) => Promise<{ upserted: number; fetched: number }>;
  /** Atomically claim today's run; false when another run happened in the last `minGapMs`. */
  claim: (minGapMs: number) => Promise<boolean>;
  read: () => Promise<BackfillState | null>;
  write: (s: BackfillState) => Promise<void>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface BackfillOptions {
  months?: number;
  chunkDays?: number;
  pauseMs?: number;
  /** Skip the once-a-day guard (the script). */
  force?: boolean;
  /** Plan only: no provider calls, no writes. */
  dryRun?: boolean;
  onChunk?: (i: number, total: number, from: Date, to: Date, r: { upserted: number; fetched: number }) => void;
}

export interface BackfillResult {
  status: 'done' | 'skipped' | 'planned' | 'stopped';
  reason?: string;
  windows: { from: string; to: string }[];
  fetched: number;
  upserted: number;
}

/** UTC midnight `months` calendar months before `now`. */
function monthsBack(now: number, months: number): Date {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()));
}

/**
 * The range to fetch: the full target (13 months back → a week ago) on the
 * first pass, or only what's new since the last pass. Pure; exported for tests.
 */
export function backfillRange(now: number, state: BackfillState | null, months = 13): { from: Date; to: Date } | null {
  const target = monthsBack(now, months);
  const to = new Date(Math.floor((now - 7 * DAY) / DAY) * DAY);
  let from = target;
  const doneFrom = state?.doneFrom ? Date.parse(state.doneFrom) : NaN;
  const doneTo = state?.doneTo ? Date.parse(state.doneTo) : NaN;
  if (Number.isFinite(doneFrom) && Number.isFinite(doneTo) && doneFrom <= target.getTime()) {
    from = new Date(Math.max(target.getTime(), doneTo - 2 * DAY));
  }
  return from < to ? { from, to } : null;
}

/** [from, to) in windows of `chunkDays`. Pure; exported for tests. */
export function backfillWindows(from: Date, to: Date, chunkDays = 10): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += chunkDays * DAY) {
    out.push({ from: new Date(t), to: new Date(Math.min(t + chunkDays * DAY, to.getTime())) });
  }
  return out;
}

const EMPTY_STOP = 3;

export async function backfillCalendar(opts: BackfillOptions = {}, deps: BackfillDeps = defaultBackfillDeps()): Promise<BackfillResult> {
  const months = opts.months ?? 13;
  const providers = deps.providers();
  const empty = (status: BackfillResult['status'], reason: string): BackfillResult => ({ status, reason, windows: [], fetched: 0, upserted: 0 });
  if (!providers.length) return empty('skipped', 'no provider with calendar history (TradingView calendar is off)');

  const state = await deps.read();
  const range = backfillRange(deps.now(), opts.force ? null : state, months);
  if (!range) return empty('skipped', 'already up to date');
  const windows = backfillWindows(range.from, range.to, opts.chunkDays ?? 10);
  const plan = windows.map((w) => ({ from: w.from.toISOString(), to: w.to.toISOString() }));
  if (opts.dryRun) return { status: 'planned', windows: plan, fetched: 0, upserted: 0 };

  if (!opts.force && !(await deps.claim(DAY - 60_000))) return empty('skipped', 'ran in the last day');

  let fetched = 0;
  let upserted = 0;
  let emptyRun = 0;
  let stopped: string | null = null;
  let coveredTo: Date | null = null;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]!;
    if (i > 0) await deps.sleep(opts.pauseMs ?? 1_500);
    let r = { upserted: 0, fetched: 0 };
    try {
      r = await deps.ingest(w.from, w.to, providers);
    } catch (err) {
      logger.warn(`[calendar-backfill] ${w.from.toISOString().slice(0, 10)} failed: ${(err as Error).message}`);
    }
    opts.onChunk?.(i, windows.length, w.from, w.to, r);
    fetched += r.fetched;
    upserted += r.upserted;
    emptyRun = r.fetched > 0 ? 0 : emptyRun + 1;
    if (r.fetched > 0) coveredTo = w.to;
    if (emptyRun >= EMPTY_STOP) { stopped = `${EMPTY_STOP} empty windows in a row`; break; }
  }

  // Only a pass that reached the end moves the covered range; a stopped one retries tomorrow.
  const complete = stopped == null && coveredTo != null;
  const prevFrom = state?.doneFrom ? Date.parse(state.doneFrom) : NaN;
  const next: BackfillState = {
    doneFrom: complete ? new Date(Math.min(range.from.getTime(), Number.isFinite(prevFrom) ? prevFrom : Infinity)).toISOString() : state?.doneFrom ?? null,
    doneTo: complete ? range.to.toISOString() : state?.doneTo ?? null,
    lastRunAt: new Date(deps.now()).toISOString(),
    lastResult: { chunks: windows.length, fetched, upserted, stopped },
  };
  await deps.write(next);
  logger.info(`[calendar-backfill] ${plan[0]!.from.slice(0, 10)} → ${plan.at(-1)!.to.slice(0, 10)}: ${windows.length} windows, ${fetched} events read, ${upserted} written${stopped ? `, stopped: ${stopped}` : ''}`);
  return { status: stopped ? 'stopped' : 'done', ...(stopped ? { reason: stopped } : {}), windows: plan, fetched, upserted };
}

export function defaultBackfillDeps(): BackfillDeps {
  return {
    providers: () => (env.TRADINGVIEW_CALENDAR_ENABLED ? [createTradingViewProvider()] : []),
    ingest: (from, to, providers) => ingestWindow(from, to, { providers }),
    async claim(minGapMs) {
      // Same atomic upsert as the scheduler lease: only one caller per day wins.
      const rows = await prisma.$queryRaw<{ key: string }[]>`
        INSERT INTO "system_setting" ("key", "value", "updatedAt", "updatedBy")
        VALUES (${BACKFILL_KEY}, ${JSON.stringify({ doneFrom: null, doneTo: null, lastRunAt: null })}::jsonb, now(), 'calendar-backfill')
        ON CONFLICT ("key") DO UPDATE
          SET "updatedAt" = now(), "updatedBy" = 'calendar-backfill'
          WHERE "system_setting"."updatedAt" < now() - (${minGapMs} * interval '1 millisecond')
        RETURNING "key"`;
      return rows.length === 1;
    },
    async read() {
      const row = await prisma.systemSetting.findUnique({ where: { key: BACKFILL_KEY } });
      return (row?.value as BackfillState | undefined) ?? null;
    },
    async write(s) {
      await prisma.systemSetting.upsert({
        where: { key: BACKFILL_KEY },
        create: { key: BACKFILL_KEY, value: s as object, updatedBy: 'calendar-backfill' },
        update: { value: s as object, updatedBy: 'calendar-backfill' },
      });
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
