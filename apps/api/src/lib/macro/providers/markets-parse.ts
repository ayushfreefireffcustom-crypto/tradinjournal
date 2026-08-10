// Pure parsers for macro market providers (no env / fetch). Kept separate so
// unit tests don't pull in @tradinjournal/config.
import type { NormalizedMacroQuote } from '../types.js';

interface BinanceTicker24h {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
}

/** Parse a Binance 24hr ticker into a macro symbol. */
export function parseBinanceTicker(
  json: BinanceTicker24h,
  symbol: string,
  asOf = new Date(),
): NormalizedMacroQuote | null {
  const price = Number(json.lastPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(json.priceChangePercent);
  return {
    symbol,
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
    source: 'binance',
    asOf,
  };
}

/** @deprecated Prefer parseBinanceTicker(json, 'BTC') */
export function parseBinanceBtc(json: BinanceTicker24h, asOf = new Date()): NormalizedMacroQuote | null {
  return parseBinanceTicker(json, 'BTC', asOf);
}

interface GoldApiPrice {
  price?: number;
}

/** Parse gold-api.com /price/{metal}. */
export function parseGoldApi(
  json: GoldApiPrice,
  symbol: 'XAU' | 'XAG',
  asOf = new Date(),
): NormalizedMacroQuote | null {
  const price = Number(json.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    symbol,
    price,
    changePct: null,
    source: 'gold-api',
    asOf,
  };
}

/** @deprecated Prefer parseGoldApi(json, 'XAU') */
export function parseGoldXau(json: GoldApiPrice, asOf = new Date()): NormalizedMacroQuote | null {
  return parseGoldApi(json, 'XAU', asOf);
}

interface FinnhubQuote {
  c?: number;
  dp?: number;
}

/** Parse Finnhub /quote into a macro symbol (ETF proxies for indices). */
export function parseFinnhubQuote(
  json: FinnhubQuote,
  symbol: string,
  asOf = new Date(),
): NormalizedMacroQuote | null {
  const price = Number(json.c);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(json.dp);
  return {
    symbol,
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
    source: 'finnhub',
    asOf,
  };
}

/** @deprecated Prefer parseFinnhubQuote(json, 'SPX') */
export function parseFinnhubSpy(json: FinnhubQuote, asOf = new Date()): NormalizedMacroQuote | null {
  return parseFinnhubQuote(json, 'SPX', asOf);
}

interface ErApiResponse {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
}

/**
 * Compute the ICE U.S. Dollar Index (DXY) from er-api `/latest/USD` rates.
 */
export function parseErApiDxy(json: ErApiResponse, asOf = new Date()): NormalizedMacroQuote | null {
  const rates = json.rates;
  if (!rates || json.result !== 'success') return null;
  const EUR = rates.EUR;
  const JPY = rates.JPY;
  const GBP = rates.GBP;
  const CAD = rates.CAD;
  const SEK = rates.SEK;
  const CHF = rates.CHF;
  if (
    typeof EUR !== 'number' || typeof JPY !== 'number' || typeof GBP !== 'number' ||
    typeof CAD !== 'number' || typeof SEK !== 'number' || typeof CHF !== 'number'
  ) {
    return null;
  }
  if (EUR <= 0 || JPY <= 0 || GBP <= 0 || CAD <= 0 || SEK <= 0 || CHF <= 0) return null;

  const dxy =
    50.14348112 *
    EUR ** 0.576 *
    JPY ** 0.136 *
    GBP ** 0.119 *
    CAD ** 0.091 *
    SEK ** 0.042 *
    CHF ** 0.036;
  if (!Number.isFinite(dxy) || dxy <= 0) return null;

  const asOfDate =
    typeof json.time_last_update_unix === 'number'
      ? new Date(json.time_last_update_unix * 1000)
      : asOf;
  return {
    symbol: 'DXY',
    price: dxy,
    changePct: null,
    source: 'er-api',
    asOf: asOfDate,
  };
}

/** Extract a flat FX basket (foreign units per 1 USD) for the strength matrix. */
export function parseErApiFxBasket(
  json: ErApiResponse,
  codes: readonly string[],
  asOf = new Date(),
): { code: string; rate: number; asOf: Date }[] {
  const rates = json.rates;
  if (!rates || json.result !== 'success') return [];
  const asOfDate =
    typeof json.time_last_update_unix === 'number'
      ? new Date(json.time_last_update_unix * 1000)
      : asOf;
  const out: { code: string; rate: number; asOf: Date }[] = [];
  for (const code of codes) {
    const rate = rates[code];
    if (typeof rate === 'number' && rate > 0) out.push({ code, rate, asOf: asOfDate });
  }
  return out;
}
