// 30-day Fed funds futures (CBOT ZQ) from Yahoo's keyless chart endpoint, for
// FedWatch-style odds per FOMC meeting (maths: @tradinjournal/core fedWatch).
// Yahoo lists each contract month as e.g. ZQZ26.CBT (probed 14 Nov 2026: every
// month from the front through Nov 2027 answered with daily bars). One daily
// call per contract gives the latest price and the prior session's close, so
// "yesterday" needs no stored history.
// Thin far contracts can skip a session, so only quotes from the newest
// session are used ("fresh"); a month without one drops its meeting and every
// later one (the chain needs each month). One meeting past the eight shown is
// priced so the last shown one can solve back from it instead of a noisy
// forward solve.
// Cached 30 minutes and shared; null whenever the first meeting can't be priced
// (Yahoo down, renamed or stale contracts) so the caller falls back to the
// Treasury proxy. Never throws.
import { contractMonths, fedWatch, upcomingMeetings, zqSymbol, type FedWatchResult } from '@tradinjournal/core';
import type { MacroFedWatch } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../cache.js';
import { fetchJson } from '../http.js';

const CACHE_KEY = 'macro:fedwatch:v1';
const TTL_SECONDS = 30 * 60;
/** A contract whose last trade is older than this is treated as missing. */
const STALE_MS = 6 * 86_400_000;
const MEETINGS = 8;
const CONCURRENCY = 4;
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; TradinJournal/1.0)' };

interface YahooDaily {
  chart?: { result?: { meta?: { regularMarketTime?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}

export interface ContractQuote {
  last: number; prev: number | null; time: number;
  /** Session (UTC day) of the last and previous closes. */
  day: string; prevDay: string | null;
}

const ok = (c: number | null | undefined): c is number => c != null && Number.isFinite(c) && c > 50 && c <= 100;
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** Daily chart body → last and previous close with their sessions, or null. */
export function parseZq(body: YahooDaily, now: number): ContractQuote | null {
  const r = body.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const raw = r?.indicators?.quote?.[0]?.close ?? [];
  // Bars with a real close, oldest first. Without timestamps fall back to the meta time.
  const bars = raw.map((c, i) => ({ c, t: ts[i] })).filter((b): b is { c: number; t: number | undefined } => ok(b.c));
  if (!bars.length) return null;
  const lastBar = bars.at(-1)!;
  const time = (lastBar.t ?? r?.meta?.regularMarketTime ?? 0) * 1000;
  if (!(time > 0) || now - time > STALE_MS) return null;
  const prevBar = bars.length > 1 ? bars.at(-2)! : null;
  return {
    last: lastBar.c, prev: prevBar?.c ?? null, time,
    day: isoDay(time / 1000), prevDay: prevBar?.t != null ? isoDay(prevBar.t) : null,
  };
}

/** Quotes from the newest session only (by month), and the prior session's closes where they line up. */
export function freshQuotes(months: string[], quotes: Array<ContractQuote | null>): { last: Map<string, number>; prev: Map<string, number> } {
  const got = quotes.filter((q): q is ContractQuote => q != null);
  const newest = got.reduce((a, q) => (q.day > a ? q.day : a), '');
  const prevDays = got.filter((q) => q.day === newest && q.prevDay).map((q) => q.prevDay!);
  const prevDay = prevDays.reduce((a, d) => (d > a ? d : a), '');
  const last = new Map<string, number>();
  const prev = new Map<string, number>();
  months.forEach((m, i) => {
    const q = quotes[i];
    if (!q || q.day !== newest) return;
    last.set(m, q.last);
    if (q.prev != null && (q.prevDay == null || q.prevDay === prevDay)) prev.set(m, q.prev);
  });
  return { last, prev };
}

export interface FedFundsDeps {
  get: <T>(url: string) => Promise<T>;
  now: () => number;
  cache: boolean;
}
const defaultDeps: FedFundsDeps = {
  // 5 s per contract: the macro state waits on this when its cache is cold.
  get: <T>(url: string) => fetchJson<T>(url, AbortSignal.timeout(5_000), UA),
  now: () => Date.now(),
  cache: true,
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  }));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Odds today + yesterday's cumulative cuts → the overview DTO block. Pure; exported for tests. */
export function toFedWatchDto(today: FedWatchResult, yesterday: FedWatchResult | null, asOf: string): MacroFedWatch {
  const prior = new Map((yesterday?.meetings ?? []).map((m) => [m.decision, m]));
  return {
    basis: 'fed-funds-futures',
    asOf,
    impliedNow: today.impliedNow,
    rows: today.meetings.map((m) => ({
      meeting: m.decision,
      label: label(m.decision),
      cutPct: m.cutPct,
      holdPct: m.holdPct,
      hikePct: m.hikePct,
      bigMovePct: m.bigMovePct,
      expectedBp: m.expectedBp,
      rateAfter: Math.round(m.end * 1000) / 1000,
      cumulativeCuts: m.cumulativeCuts,
      cumulativeCutsYesterday: prior.get(m.decision)?.cumulativeCuts ?? null,
    })),
  };
}

let inflight: Promise<MacroFedWatch | null> | null = null;

/**
 * Per-meeting cut / hold / hike odds from Fed funds futures, or null.
 * `effr` (latest effective Fed funds, %) anchors the first meeting when the
 * month before it held a decision of its own.
 */
export async function getFedWatch(effr: number | null, deps: FedFundsDeps = defaultDeps): Promise<MacroFedWatch | null> {
  if (deps.cache) {
    const hit = await cacheGet<{ v: MacroFedWatch | null }>(CACHE_KEY);
    if (hit) return hit.v;
    if (inflight) return inflight;
  }
  const run = (async () => {
    const now = deps.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const meetings = upcomingMeetings(today, MEETINGS + 1);
    const months = contractMonths(meetings);
    const quotes = await pool(months, CONCURRENCY, async (m) => {
      try {
        const body = await deps.get<YahooDaily>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(zqSymbol(m))}?interval=1d&range=5d`);
        return parseZq(body, now);
      } catch {
        return null;
      }
    });
    const { last, prev } = freshQuotes(months, quotes);
    const now0 = fedWatch(meetings, last, { effr });
    if (!now0) {
      logger.warn(`[macro] Fed funds futures unavailable (${last.size}/${months.length} contracts priced); using the Treasury proxy`);
      return null;
    }
    const asOf = new Date(Math.max(...quotes.filter((q): q is ContractQuote => q != null).map((q) => q.time))).toISOString();
    const shown = (r: FedWatchResult): FedWatchResult => ({ ...r, meetings: r.meetings.slice(0, MEETINGS) });
    const before = fedWatch(meetings, prev, { effr });
    return toFedWatchDto(shown(now0), before && shown(before), asOf);
  })();
  if (!deps.cache) return run;
  inflight = run.then(async (v) => {
    // A miss is cached for 5 minutes only, so a Yahoo blip doesn't stick for half an hour.
    await cacheSet(CACHE_KEY, { v }, v ? TTL_SECONDS : 300);
    return v;
  }).catch(() => null).finally(() => { inflight = null; });
  return inflight;
}
