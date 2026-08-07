// Macro segment service — fetch-once-serve-many data spine.
// Worker cron → POST /internal/macro/ingest → FRED + market providers → PG
// snapshots → confluence engine → BiasScore → invalidate cache.
// Authenticated GET /api/macro/state serves the cached dashboard JSON.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import {
  ENGINE_VER,
  scoreAll,
  classifyRegime,
} from '@tradinjournal/core';
import type { MacroState, MacroIngestInput } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet, cacheDel } from '../../lib/cache.js';
import { fetchFredIndicators } from '../../lib/macro/providers/fred.js';
import { fetchMarketQuotes } from '../../lib/macro/providers/markets.js';
import { toEngineInput } from '../../lib/macro/engine-input.js';
import { computeAndPersistSignals } from './macro-signals.service.js';

export { toEngineInput } from '../../lib/macro/engine-input.js';
export const MACRO_STATE_CACHE_KEY = 'macro:state:v1';

const EVENTS_LIMIT = 40;
const HEADLINES_LIMIT = 20;

function dec(n: { toNumber(): number } | number): number {
  return typeof n === 'number' ? n : n.toNumber();
}

/** Latest row per `key` / `symbol` from a desc-sorted list. */
function latestBy<T, K extends string>(rows: T[], keyOf: (r: T) => K): T[] {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Pull FRED + markets, upsert snapshots, run confluence engine, persist
 * BiasScore rows, bust the state cache. No-ops when MACRO_ENABLED is false.
 */
export async function ingestMacro(input: MacroIngestInput): Promise<{ ingested: number }> {
  if (!env.MACRO_ENABLED || !env.FRED_API_KEY) {
    logger.info('[macro] ingest skipped — MACRO_ENABLED off (no FRED_API_KEY)', {
      reason: input.reason,
    });
    return { ingested: 0 };
  }

  const [indicators, quotes] = await Promise.all([
    fetchFredIndicators(env.FRED_API_KEY),
    fetchMarketQuotes(),
  ]);

  let ingested = 0;

  for (const row of indicators) {
    try {
      await prisma.macroIndicator.upsert({
        where: { key_asOf: { key: row.key, asOf: row.asOf } },
        create: {
          key: row.key,
          label: row.label,
          value: row.value,
          prev: row.prev,
          unit: row.unit,
          source: row.source,
          asOf: row.asOf,
        },
        update: {
          label: row.label,
          value: row.value,
          prev: row.prev,
          unit: row.unit,
          source: row.source,
        },
      });
      ingested += 1;
    } catch (err) {
      logger.warn(`[macro] indicator upsert failed ${row.key}: ${(err as Error).message}`);
    }
  }

  // Bucket market asOf to the minute so a 30-min cron doesn't explode row counts.
  const quoteAsOfList: { symbol: string; price: number; changePct: number | null; source: string; asOf: Date }[] = [];
  for (const q of quotes) {
    const asOf = new Date(q.asOf);
    asOf.setUTCSeconds(0, 0);
    quoteAsOfList.push({
      symbol: q.symbol,
      price: q.price,
      changePct: q.changePct,
      source: q.source,
      asOf,
    });
    try {
      await prisma.macroMarketQuote.upsert({
        where: { symbol_asOf: { symbol: q.symbol, asOf } },
        create: {
          symbol: q.symbol,
          price: q.price,
          changePct: q.changePct,
          source: q.source,
          asOf,
        },
        update: {
          price: q.price,
          changePct: q.changePct,
          source: q.source,
        },
      });
      ingested += 1;
    } catch (err) {
      logger.warn(`[macro] quote upsert failed ${q.symbol}: ${(err as Error).message}`);
    }
  }

  // Run confluence over the just-fetched snapshot and historize BiasScore.
  const engineInput = toEngineInput(
    indicators.map(i => ({ key: i.key, value: i.value, prev: i.prev })),
    quoteAsOfList.map(q => ({ symbol: q.symbol, price: q.price, changePct: q.changePct })),
  );
  const biasAsOf = new Date();
  biasAsOf.setUTCSeconds(0, 0);
  const scores = scoreAll(engineInput);
  for (const b of scores) {
    try {
      await prisma.biasScore.create({
        data: {
          asset: b.asset,
          score: b.score,
          label: b.label,
          evidence: { supporting: b.supporting, opposing: b.opposing },
          engineVer: ENGINE_VER,
          asOf: biasAsOf,
        },
      });
      ingested += 1;
    } catch (err) {
      logger.warn(`[macro] BiasScore persist failed ${b.asset}: ${(err as Error).message}`);
    }
  }

  const { written: signalsWritten } = await computeAndPersistSignals({
    indicators: indicators.map(i => ({ key: i.key, value: i.value, prev: i.prev })),
    quotes: quoteAsOfList.map(q => ({
      symbol: q.symbol,
      price: q.price,
      changePct: q.changePct,
    })),
    asOf: biasAsOf,
  });
  ingested += signalsWritten;

  await cacheDel(MACRO_STATE_CACHE_KEY);
  logger.info('[macro] ingest complete', {
    reason: input.reason,
    indicators: indicators.length,
    quotes: quotes.length,
    bias: scores.length,
    signals: signalsWritten,
    engineVer: ENGINE_VER,
    ingested,
  });
  return { ingested };
}

/**
 * The single dashboard JSON the terminal (+ later Claude) consume.
 * Serves Redis/mem cache → Postgres snapshots + confluence over latest prints.
 */
export async function getMacroState(): Promise<MacroState> {
  const cached = await cacheGet<MacroState>(MACRO_STATE_CACHE_KEY);
  if (cached) return cached;

  const state = await buildMacroState();
  await cacheSet(MACRO_STATE_CACHE_KEY, state, env.MACRO_STATE_CACHE_TTL);
  return state;
}

function emptyState(asOf = new Date().toISOString()): MacroState {
  const empty = toEngineInput([], []);
  const bias = scoreAll(empty).map(b => ({
    asset: b.asset,
    score: b.score,
    label: b.label,
    supporting: b.supporting,
    opposing: b.opposing,
  }));
  return {
    asOf,
    regime: null,
    macro: [],
    markets: [],
    bias,
    events: [],
    headlines: [],
    engineVer: ENGINE_VER,
  };
}

/** Build state from DB (no provider calls). Exported for tests. */
export async function buildMacroState(): Promise<MacroState> {
  const now = new Date();
  const eventFrom = new Date(now.getTime() - 2 * 24 * 3600_000);
  const eventTo = new Date(now.getTime() + 14 * 24 * 3600_000);

  let indicatorRows: Awaited<ReturnType<typeof prisma.macroIndicator.findMany>>;
  let quoteRows: Awaited<ReturnType<typeof prisma.macroMarketQuote.findMany>>;
  let eventRows: {
    title: string;
    country: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    eventTime: Date;
    actual: string | null;
    forecast: string | null;
    previous: string | null;
  }[];
  let newsRows: {
    title: string;
    source: string;
    url: string;
    publishedAt: Date;
  }[];

  try {
    [indicatorRows, quoteRows, eventRows, newsRows] = await Promise.all([
      // DISTINCT ON (key) ORDER BY key, asOf desc → exactly the latest row per key,
      // independent of how much history has accumulated. (A plain take+dedup would
      // drop later keys once any single key's history exceeded the take limit.)
      prisma.macroIndicator.findMany({
        distinct: ['key'],
        orderBy: [{ key: 'asc' }, { asOf: 'desc' }],
        take: 500,
      }),
      prisma.macroMarketQuote.findMany({
        distinct: ['symbol'],
        orderBy: [{ symbol: 'asc' }, { asOf: 'desc' }],
        take: 200,
      }),
      prisma.economicEvent.findMany({
        where: { eventTime: { gte: eventFrom, lte: eventTo } },
        orderBy: { eventTime: 'asc' },
        take: EVENTS_LIMIT,
        select: {
          title: true,
          country: true,
          impact: true,
          eventTime: true,
          actual: true,
          forecast: true,
          previous: true,
        },
      }),
      prisma.newsItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: HEADLINES_LIMIT,
        select: { title: true, source: true, url: true, publishedAt: true },
      }),
    ]);
  } catch (err) {
    logger.warn(`[macro] state build failed (serving empty): ${(err as Error).message}`);
    return emptyState();
  }

  const latestIndicators = latestBy(indicatorRows, r => r.key);
  const latestQuotes = latestBy(quoteRows, r => r.symbol);

  const macro = latestIndicators.map(r => ({
    key: r.key,
    label: r.label,
    value: dec(r.value),
    prev: r.prev != null ? dec(r.prev) : null,
    forecast: r.forecast != null ? dec(r.forecast) : null,
    unit: r.unit,
    source: r.source,
    asOf: r.asOf.toISOString(),
  }));

  const markets = latestQuotes.map(r => ({
    symbol: r.symbol,
    price: dec(r.price),
    changePct: r.changePct != null ? dec(r.changePct) : null,
    asOf: r.asOf.toISOString(),
  }));

  // Fallback: expose FRED DTWEXBGS as DXY when er-api quote is missing.
  if (!markets.some(m => m.symbol === 'DXY')) {
    const dtw = latestIndicators.find(i => i.key === 'DTWEXBGS');
    if (dtw) {
      const value = dec(dtw.value);
      const prev = dtw.prev != null ? dec(dtw.prev) : null;
      markets.push({
        symbol: 'DXY',
        price: value,
        changePct: prev != null && prev !== 0 ? ((value - prev) / prev) * 100 : null,
        asOf: dtw.asOf.toISOString(),
      });
    }
  }

  const engineInput = toEngineInput(macro, markets);
  const hasMacro = macro.length > 0;
  const regime = hasMacro ? classifyRegime(engineInput) : null;
  const bias = scoreAll(engineInput).map(b => ({
    asset: b.asset,
    score: b.score,
    label: b.label,
    supporting: b.supporting,
    opposing: b.opposing,
  }));

  const events = eventRows.map(e => ({
    title: e.title,
    country: e.country,
    impact: e.impact,
    at: e.eventTime.toISOString(),
    actual: e.actual,
    forecast: e.forecast,
    prev: e.previous,
  }));

  const headlines = newsRows.map(n => ({
    title: n.title,
    source: n.source,
    url: n.url,
    at: n.publishedAt.toISOString(),
  }));

  const newest = [
    ...latestIndicators.map(r => r.asOf.getTime()),
    ...latestQuotes.map(r => r.asOf.getTime()),
  ];
  const asOf = newest.length > 0 ? new Date(Math.max(...newest)).toISOString() : now.toISOString();

  return {
    asOf,
    regime,
    macro,
    markets,
    bias,
    events,
    headlines,
    engineVer: ENGINE_VER,
  };
}
