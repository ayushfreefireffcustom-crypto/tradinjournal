// Market quote providers for the macro ticker.
// Keys stay server-side; browsers never call these. Individual provider failures
// are skipped so a gold-api blip doesn't kill the whole ingest.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import type { NormalizedMacroQuote } from '../types.js';
import {
  parseBinanceTicker,
  parseGoldApi,
  parseFinnhubQuote,
  parseErApiDxy,
  parseErApiFxBasket,
} from './markets-parse.js';

export {
  parseBinanceBtc,
  parseBinanceTicker,
  parseGoldXau,
  parseGoldApi,
  parseFinnhubSpy,
  parseFinnhubQuote,
  parseErApiDxy,
  parseErApiFxBasket,
} from './markets-parse.js';

const FX_CODES = ['EUR', 'JPY', 'GBP', 'CAD', 'CHF', 'AUD', 'NZD', 'CNY', 'INR', 'SEK'] as const;

async function fetchBinance(
  pair: string,
  symbol: string,
  signal?: AbortSignal,
): Promise<NormalizedMacroQuote | null> {
  try {
    const json = await fetchJson<{ lastPrice?: string; priceChangePercent?: string }>(
      `${env.BINANCE_REST_URL}/api/v3/ticker/24hr?symbol=${pair}`,
      signal,
    );
    return parseBinanceTicker(json, symbol);
  } catch (err) {
    logger.warn(`[macro/markets] binance ${symbol} failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchMetal(
  metal: 'XAU' | 'XAG',
  signal?: AbortSignal,
): Promise<NormalizedMacroQuote | null> {
  try {
    const json = await fetchJson<{ price?: number }>(`https://api.gold-api.com/price/${metal}`, signal);
    return parseGoldApi(json, metal);
  } catch (err) {
    logger.warn(`[macro/markets] gold-api ${metal} failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchFinnhub(
  apiKey: string,
  ticker: string,
  symbol: string,
  signal?: AbortSignal,
): Promise<NormalizedMacroQuote | null> {
  try {
    const url =
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
    const json = await fetchJson<{ c?: number; dp?: number }>(url, signal);
    return parseFinnhubQuote(json, symbol);
  } catch (err) {
    logger.warn(`[macro/markets] finnhub ${symbol} failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchErApiDxy(signal?: AbortSignal): Promise<NormalizedMacroQuote | null> {
  try {
    const json = await fetchJson<{
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    }>('https://open.er-api.com/v6/latest/USD', signal);
    return parseErApiDxy(json);
  } catch (err) {
    logger.warn(`[macro/markets] er-api DXY failed: ${(err as Error).message}`);
    return null;
  }
}

/** Fetch FX basket for the strength matrix (same er-api call as DXY). */
export async function fetchFxBasket(signal?: AbortSignal): Promise<{ code: string; rate: number; asOf: Date }[]> {
  try {
    const json = await fetchJson<{
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
    }>('https://open.er-api.com/v6/latest/USD', signal);
    return parseErApiFxBasket(json, FX_CODES);
  } catch (err) {
    logger.warn(`[macro/markets] er-api FX basket failed: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Fetch all market quotes in parallel. Finnhub is optional (index/oil proxies
 * skipped when FINNHUB_API_KEY is unset).
 */
export async function fetchMarketQuotes(signal?: AbortSignal): Promise<NormalizedMacroQuote[]> {
  const jobs: Promise<NormalizedMacroQuote | null>[] = [
    fetchBinance('BTCUSDT', 'BTC', signal),
    fetchBinance('ETHUSDT', 'ETH', signal),
    fetchBinance('SOLUSDT', 'SOL', signal),
    fetchMetal('XAU', signal),
    fetchMetal('XAG', signal),
    fetchErApiDxy(signal),
  ];
  if (env.FINNHUB_API_KEY) {
    const key = env.FINNHUB_API_KEY;
    jobs.push(
      fetchFinnhub(key, 'SPY', 'SPX', signal),
      fetchFinnhub(key, 'QQQ', 'NDX', signal),
      fetchFinnhub(key, 'USO', 'OIL', signal),
      fetchFinnhub(key, 'TLT', 'UST', signal),
    );
  }

  const settled = await Promise.all(jobs);
  return settled.filter((q): q is NormalizedMacroQuote => q != null);
}
