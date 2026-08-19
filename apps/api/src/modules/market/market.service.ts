// Market data service: fetch-once-serve-many. Candles are served from the Redis
// cache; on a miss the resolved provider is called, the result is cached, and
// (for public symbols) persisted to the durable Candle table for backfill.
// Broker candles are cache-only — they're broker-specific and must not collide
// with another broker's series in the shared table.
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { CandlesQuery, MarketTimeframe } from '@tradinjournal/contracts';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { resolveProvider, searchAllSymbols } from '../../lib/market/providers/index.js';
import { findAccountById } from '../accounts/accounts.repository.js';
import type { BridgeCreds, GetCandlesOpts, NormalizedCandle, SymbolInfo } from '../../lib/market/types.js';

// Timeframes the warm cron keeps hot for the configured symbol set.
const WARM_TFS: MarketTimeframe[] = ['1h', '1d'];
const SEARCH_TTL = 300;

function candleKey(symbol: string, tf: string, opts: GetCandlesOpts, scope: string): string {
  return `market:candles:${scope}:${symbol}:${tf}:${opts.from ?? ''}:${opts.to ?? ''}:${opts.limit ?? ''}`;
}

/** Persist immutable bars for backfill; upsert only the latest (forming) bar. */
async function persistCandles(symbol: string, tf: string, candles: NormalizedCandle[], source: string): Promise<void> {
  if (candles.length === 0) return;
  const row = (c: NormalizedCandle) => ({
    symbol, timeframe: tf, openTime: new Date(c.openTime),
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, source,
  });
  try {
    const historical = candles.slice(0, -1);
    const last = candles[candles.length - 1]!;
    if (historical.length) {
      await prisma.candle.createMany({ data: historical.map(row), skipDuplicates: true });
    }
    await prisma.candle.upsert({
      where: { symbol_timeframe_openTime: { symbol, timeframe: tf, openTime: new Date(last.openTime) } },
      create: row(last),
      update: { open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume },
    });
  } catch {
    /* the durable store is best-effort — never fails the request */
  }
}

/** Core cache→provider→persist path, shared by the public endpoint and the warmer. */
async function loadCandles(symbol: string, tf: MarketTimeframe, opts: GetCandlesOpts, scope: string): Promise<NormalizedCandle[]> {
  const key = candleKey(symbol, tf, opts, scope);
  const cached = await cacheGet<NormalizedCandle[]>(key);
  if (cached) return cached;

  const provider = await resolveProvider(symbol, !!opts.broker);
  if (!provider) return [];
  const candles = await provider.getCandles(symbol, tf, opts);
  await cacheSet(key, candles, env.MARKET_CANDLE_CACHE_TTL);
  if (!opts.broker && candles.length) void persistCandles(symbol, tf, candles, provider.name);
  return candles;
}

/** Resolve broker credentials for a candles request, if it targets an account. */
export async function brokerCredsFor(accountId: string | undefined, userId: string): Promise<{ creds?: BridgeCreds; scope: string }> {
  if (!accountId) return { scope: 'public' };
  const acc = await findAccountById(accountId, userId);
  if (!acc?.password) return { scope: 'public' };
  return {
    creds: { login: Number(acc.mt5Login), password: acc.password, server: acc.server },
    scope: `mt5:${acc.server}`,
  };
}

export async function getCandles(q: CandlesQuery, userId: string): Promise<{ candles: NormalizedCandle[] }> {
  const { creds, scope } = await brokerCredsFor(q.accountId, userId);
  const opts: GetCandlesOpts = { from: q.from, to: q.to, limit: q.limit, broker: creds };
  return { candles: await loadCandles(q.symbol, q.tf, opts, scope) };
}

/**
 * Latest-N public candles for a symbol+timeframe via the shared
 * cache→provider→persist path. Used by server-side analysis (Trader Master)
 * that only ever needs public (non-broker) data.
 */
export async function loadPublicCandles(
  symbol: string,
  tf: MarketTimeframe,
  limit = 300,
): Promise<NormalizedCandle[]> {
  return loadCandles(symbol, tf, { limit }, 'public');
}

// Latest price is stale-guarded: a bar older than this is treated as a dead feed
// and yields null (price alerts then skip that symbol rather than false-fire).
const STALE_PRICE_MS = 10 * 60_000;

/**
 * Latest price for a symbol = the last 1m bar's close, via the cached candle
 * path (broker symbols use the account's creds). Returns null when no provider
 * covers the symbol or the latest bar is stale — callers skip, never crash.
 */
export async function getLatestPrice(symbol: string, accountId?: string, userId = ''): Promise<number | null> {
  const { creds, scope } = await brokerCredsFor(accountId, userId);
  const bars = await loadCandles(symbol, '1m', { limit: 2, broker: creds }, scope);
  const last = bars[bars.length - 1];
  if (!last) return null;
  if (Date.now() - last.openTime > STALE_PRICE_MS) return null;
  return last.close;
}

export async function searchSymbols(query: string): Promise<{ symbols: SymbolInfo[] }> {
  const key = `market:search:${query.toLowerCase()}`;
  const cached = await cacheGet<SymbolInfo[]>(key);
  if (cached) return { symbols: cached };
  const symbols = await searchAllSymbols(query);
  await cacheSet(key, symbols, SEARCH_TTL);
  return { symbols };
}

/** Refresh the configured warm symbol set so popular symbols stay a cache hit. */
export async function warmSymbols(): Promise<{ warmed: number }> {
  let warmed = 0;
  for (const symbol of env.MARKET_WARM_SYMBOLS_LIST) {
    for (const tf of WARM_TFS) {
      try {
        await loadCandles(symbol, tf, { limit: 500 }, 'public');
        warmed += 1;
      } catch {
        /* skip a bad symbol, keep warming the rest */
      }
    }
  }
  return { warmed };
}

// Watchlist reads/writes degrade gracefully: if the `watchlist` table is missing
// (a migration lagging behind a deploy), we return empty / echo the input rather
// than 500 the chart page. Persistence resumes automatically once migrated.
export async function getWatchlist(userId: string): Promise<{ symbols: string[] }> {
  try {
    const row = await prisma.watchlist.findUnique({ where: { userId } });
    return { symbols: row?.symbols ?? [] };
  } catch (err) {
    logger.warn(`Watchlist read failed (migration applied?): ${(err as Error).message}`);
    return { symbols: [] };
  }
}

export async function setWatchlist(userId: string, symbols: string[]): Promise<{ symbols: string[] }> {
  try {
    const row = await prisma.watchlist.upsert({
      where: { userId },
      create: { userId, symbols },
      update: { symbols },
    });
    return { symbols: row.symbols };
  } catch (err) {
    logger.warn(`Watchlist write failed (migration applied?): ${(err as Error).message}`);
    return { symbols }; // optimistic — session-only until the table exists
  }
}
