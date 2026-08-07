// Market quote providers for the macro ticker (BTC / XAU / SPX / DXY).
// Keys stay server-side; browsers never call these. Individual provider failures
// are skipped so a gold-api blip doesn't kill the whole ingest.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import type { NormalizedMacroQuote } from '../types.js';
import {
  parseBinanceBtc,
  parseGoldXau,
  parseFinnhubSpy,
  parseErApiDxy,
} from './markets-parse.js';

export {
  parseBinanceBtc,
  parseGoldXau,
  parseFinnhubSpy,
  parseErApiDxy,
} from './markets-parse.js';

async function fetchBinanceBtc(signal?: AbortSignal): Promise<NormalizedMacroQuote | null> {
  try {
    const json = await fetchJson<{ lastPrice?: string; priceChangePercent?: string }>(
      `${env.BINANCE_REST_URL}/api/v3/ticker/24hr?symbol=BTCUSDT`,
      signal,
    );
    return parseBinanceBtc(json);
  } catch (err) {
    logger.warn(`[macro/markets] binance BTC failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchGoldXau(signal?: AbortSignal): Promise<NormalizedMacroQuote | null> {
  try {
    const json = await fetchJson<{ price?: number }>('https://api.gold-api.com/price/XAU', signal);
    return parseGoldXau(json);
  } catch (err) {
    logger.warn(`[macro/markets] gold-api XAU failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchFinnhubSpx(apiKey: string, signal?: AbortSignal): Promise<NormalizedMacroQuote | null> {
  try {
    // Free Finnhub tier doesn't serve ^GSPC cleanly; SPY is the liquid proxy.
    const url =
      `https://finnhub.io/api/v1/quote?symbol=SPY&token=${encodeURIComponent(apiKey)}`;
    const json = await fetchJson<{ c?: number; dp?: number }>(url, signal);
    return parseFinnhubSpy(json);
  } catch (err) {
    logger.warn(`[macro/markets] finnhub SPX failed: ${(err as Error).message}`);
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

/**
 * Fetch all MVP market quotes in parallel. Finnhub is optional (SPX skipped
 * when FINNHUB_API_KEY is unset).
 */
export async function fetchMarketQuotes(signal?: AbortSignal): Promise<NormalizedMacroQuote[]> {
  const jobs: Promise<NormalizedMacroQuote | null>[] = [
    fetchBinanceBtc(signal),
    fetchGoldXau(signal),
    fetchErApiDxy(signal),
  ];
  if (env.FINNHUB_API_KEY) {
    jobs.push(fetchFinnhubSpx(env.FINNHUB_API_KEY, signal));
  }

  const settled = await Promise.all(jobs);
  return settled.filter((q): q is NormalizedMacroQuote => q != null);
}
