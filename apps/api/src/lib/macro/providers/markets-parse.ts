// Pure parsers for macro market providers (no env / fetch). Kept separate so
// unit tests don't pull in @tradinjournal/config.
import type { NormalizedMacroQuote } from '../types.js';

interface BinanceTicker24h {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
}

/** Parse a Binance 24hr ticker payload. */
export function parseBinanceBtc(json: BinanceTicker24h, asOf = new Date()): NormalizedMacroQuote | null {
  const price = Number(json.lastPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(json.priceChangePercent);
  return {
    symbol: 'BTC',
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
    source: 'binance',
    asOf,
  };
}

interface GoldApiPrice {
  price?: number;
}

/** Parse gold-api.com /price/XAU. */
export function parseGoldXau(json: GoldApiPrice, asOf = new Date()): NormalizedMacroQuote | null {
  const price = Number(json.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    symbol: 'XAU',
    price,
    changePct: null,
    source: 'gold-api',
    asOf,
  };
}

interface FinnhubQuote {
  c?: number;
  dp?: number;
}

/** Parse Finnhub /quote for SPY → SPX proxy. */
export function parseFinnhubSpy(json: FinnhubQuote, asOf = new Date()): NormalizedMacroQuote | null {
  const price = Number(json.c);
  if (!Number.isFinite(price) || price <= 0) return null;
  const changePct = Number(json.dp);
  return {
    symbol: 'SPX',
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
    source: 'finnhub',
    asOf,
  };
}

interface ErApiResponse {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
}

/**
 * Compute the ICE U.S. Dollar Index (DXY) from er-api `/latest/USD` rates.
 * er-api quotes foreign units per 1 USD, so USDJPY/USDCAD/USDSEK/USDCHF are the
 * rates directly, and EURUSD/GBPUSD are their reciprocals. The official ICE
 * formula uses fixed weights:
 *   DXY = 50.14348112 · EURUSD^-0.576 · USDJPY^0.136 · GBPUSD^-0.119
 *                     · USDCAD^0.091 · USDSEK^0.042 · USDCHF^0.036
 * With USD-base rates (rates.EUR = 1/EURUSD, rates.GBP = 1/GBPUSD) this becomes:
 *   50.14348112 · rates.EUR^0.576 · rates.JPY^0.136 · rates.GBP^0.119
 *              · rates.CAD^0.091 · rates.SEK^0.042 · rates.CHF^0.036
 * (Earlier this was a plain geometric mean of mixed-scale rates → ~3.2 nonsense.)
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
