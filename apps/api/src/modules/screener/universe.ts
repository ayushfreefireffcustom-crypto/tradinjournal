// The screener's universe: the most-traded Binance USDT pairs by 24h quote
// volume (one ticker call for every symbol), plus perpetual funding rates from
// Bybit, falling back to Binance futures. Both are public and keyless; when
// neither answers, funding is unknown rather than zero.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';
import { isBinanceSymbol } from '../../lib/market/providers/binance.js';

export interface UniverseRow {
  symbol: string;
  base: string;
  price: number;
  change24h: number; // %
  volume24h: number; // quote (USDT)
  high24h: number;
  low24h: number;
}
/** Funding (% per period) and, from Bybit, open interest in USDT, keyed by symbol. */
export interface FundingMap { source: 'bybit' | 'binance' | null; rates: Map<string, number>; oi?: Map<string, number> }

const TICKER_TTL = 60;
// Stablecoins and wrapped dollars, and leveraged tokens, aren't worth screening.
const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'DAI', 'USDE', 'USD1', 'EUR', 'EURI', 'AEUR', 'XUSD', 'BFUSD', 'PAXG', 'USDS', 'RLUSD', 'PYUSD']);
const LEVERAGED = /(UP|DOWN|BULL|BEAR)$/;

interface Ticker24 { symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string; highPrice: string; lowPrice: string; count: number }

/**
 * Pure: top N USDT pairs by quote volume. `trading` drops pairs Binance has
 * delisted, which its 24h ticker still reports with their last price.
 */
export function rankUniverse(tickers: Ticker24[], size: number, trading?: Set<string>): UniverseRow[] {
  const rows: UniverseRow[] = [];
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue;
    if (trading && !trading.has(t.symbol)) continue;
    const base = t.symbol.slice(0, -4);
    if (!base || STABLE.has(base) || LEVERAGED.test(base)) continue;
    const price = Number(t.lastPrice);
    const volume24h = Number(t.quoteVolume);
    if (!(price > 0) || !(volume24h > 0) || t.count === 0) continue; // delisted or halted
    // New dollar stablecoins appear all the time: anything pinned near $1 all day is one.
    const range = (Number(t.highPrice) - Number(t.lowPrice)) / price;
    if (Math.abs(price - 1) < 0.01 && range < 0.01) continue;
    rows.push({ symbol: t.symbol, base, price, change24h: Number(t.priceChangePercent), volume24h, high24h: Number(t.highPrice), low24h: Number(t.lowPrice) });
  }
  return rows.sort((a, b) => b.volume24h - a.volume24h).slice(0, size);
}

export async function loadUniverse(size: number): Promise<UniverseRow[]> {
  const key = 'screener:tickers';
  let tickers = await cacheGet<Ticker24[]>(key);
  if (!tickers) {
    tickers = await fetchJson<Ticker24[]>(`${env.BINANCE_REST_URL}/api/v3/ticker/24hr`);
    // Keep only what the screener reads: the full response is ~2 MB.
    tickers = tickers
      .filter((t) => t.symbol.endsWith('USDT'))
      .map(({ symbol, lastPrice, priceChangePercent, quoteVolume, highPrice, lowPrice, count }) => ({ symbol, lastPrice, priceChangePercent, quoteVolume, highPrice, lowPrice, count }));
    await cacheSet(key, tickers, TICKER_TTL);
  }
  // The candle layer only serves symbols Binance lists as trading, so screen those.
  const listed = await Promise.all(tickers.map(async (t) => [t.symbol, await isBinanceSymbol(t.symbol)] as const));
  const trading = new Set(listed.filter(([, ok]) => ok).map(([s]) => s));
  return rankUniverse(tickers, size, trading.size ? trading : undefined);
}

/** Funding as a percentage per funding period, keyed by Binance-style symbol (BTCUSDT). */
export async function loadFunding(): Promise<FundingMap> {
  const key = 'screener:funding';
  const cached = await cacheGet<{ source: FundingMap['source']; rates: Array<[string, number]>; oi?: Array<[string, number]> }>(key);
  if (cached) return { source: cached.source, rates: new Map(cached.rates), oi: new Map(cached.oi ?? []) };
  let out: FundingMap = { source: null, rates: new Map() };
  try {
    const r = await fetchJson<{ retCode: number; result?: { list?: Array<{ symbol: string; fundingRate: string; openInterestValue?: string }> } }>('https://api.bybit.com/v5/market/tickers?category=linear');
    const list = r.retCode === 0 ? r.result?.list ?? [] : [];
    const rates = new Map(list.filter((x) => x.fundingRate !== '' && Number.isFinite(Number(x.fundingRate))).map((x) => [x.symbol, Number(x.fundingRate) * 100] as [string, number]));
    const oi = new Map(list.filter((x) => x.openInterestValue && Number(x.openInterestValue) > 0).map((x) => [x.symbol, Number(x.openInterestValue)] as [string, number]));
    if (rates.size) out = { source: 'bybit', rates, oi };
  } catch (err) {
    logger.warn(`[screener] Bybit funding unavailable: ${(err as Error).message}`);
  }
  if (!out.source) {
    try {
      const list = await fetchJson<Array<{ symbol: string; lastFundingRate: string }>>(`${env.BINANCE_FUTURES_REST_URL}/fapi/v1/premiumIndex`);
      const rates = new Map(list.filter((x) => x.lastFundingRate !== '').map((x) => [x.symbol, Number(x.lastFundingRate) * 100] as [string, number]));
      if (rates.size) out = { source: 'binance', rates };
    } catch (err) {
      logger.warn(`[screener] Binance funding unavailable: ${(err as Error).message}`);
    }
  }
  // A failed lookup is cached briefly too, so a blocked host isn't hit on every run.
  await cacheSet(key, { source: out.source, rates: [...out.rates], oi: [...(out.oi ?? [])] }, out.source ? TICKER_TTL : 300);
  return out;
}
