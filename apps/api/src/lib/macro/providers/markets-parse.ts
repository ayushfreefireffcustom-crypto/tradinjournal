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
 * Build a simple USD-strength proxy from er-api major rates (DXY-like basket).
 * er-api `/latest/USD` quotes foreign units per 1 USD — all six rise when the
 * dollar strengthens, so the geometric mean tracks USD strength.
 */
export function parseErApiDxy(json: ErApiResponse, asOf = new Date()): NormalizedMacroQuote | null {
  const rates = json.rates;
  if (!rates || json.result !== 'success') return null;
  const basket = ['EUR', 'JPY', 'GBP', 'CAD', 'SEK', 'CHF'] as const;
  const values: number[] = [];
  for (const pair of basket) {
    const r = rates[pair];
    if (typeof r !== 'number' || !(r > 0)) return null;
    values.push(r);
  }
  const geo = Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / values.length);
  const asOfDate =
    typeof json.time_last_update_unix === 'number'
      ? new Date(json.time_last_update_unix * 1000)
      : asOf;
  return {
    symbol: 'DXY',
    price: geo,
    changePct: null,
    source: 'er-api',
    asOf: asOfDate,
  };
}
