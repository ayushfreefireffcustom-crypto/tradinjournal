// ATR / vol helpers for macro signal levels. BTC uses Binance daily klines;
// other assets fall back to a % of spot when no series is available.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { computeAtr, type MacroAsset, type OhlcBar } from '@tradinjournal/core';
import { fetchJson } from './http.js';
import { proxyAtr } from './atr-util.js';

export { proxyAtr } from './atr-util.js';

type KlineRow = [number, string, string, string, string, string, ...unknown[]];

function klinesToBars(rows: KlineRow[]): OhlcBar[] {
  return rows.map(r => ({
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
  }));
}

/** Fetch Binance daily klines and compute ATR(14). */
export async function fetchBinanceAtr(
  symbol: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      interval: '1d',
      limit: '60',
    });
    const rows = await fetchJson<KlineRow[]>(
      `${env.BINANCE_REST_URL}/api/v3/klines?${params}`,
      signal,
    );
    if (!Array.isArray(rows) || rows.length < 3) return null;
    return computeAtr(klinesToBars(rows), 14);
  } catch (err) {
    logger.warn(`[macro/atr] binance ${symbol} failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Resolve ATR per MVP asset. BTC → Binance; others → price proxy
 * (Finnhub candle upgrade can land later without changing the engine).
 */
export async function resolveAtrMap(
  prices: Partial<Record<MacroAsset, number>>,
  signal?: AbortSignal,
): Promise<Partial<Record<MacroAsset, number>>> {
  const out: Partial<Record<MacroAsset, number>> = {};
  const btcAtr = await fetchBinanceAtr('BTCUSDT', signal);
  if (btcAtr != null) out.BTC = btcAtr;
  else if (prices.BTC != null) out.BTC = proxyAtr(prices.BTC) ?? undefined;

  for (const asset of ['ETH', 'SOL', 'XAU', 'XAG', 'SPX', 'NDX', 'OIL', 'DXY', 'UST'] as const) {
    const px = prices[asset];
    if (px == null) continue;
    const frac =
      asset === 'XAU' || asset === 'XAG' ? 0.012
      : asset === 'SPX' || asset === 'NDX' ? 0.01
      : asset === 'OIL' ? 0.018
      : asset === 'UST' ? 0.006
      : asset === 'ETH' || asset === 'SOL' ? 0.025
      : 0.008;
    const atr = proxyAtr(px, frac);
    if (atr != null) out[asset] = atr;
  }
  // Prefer live ATR for liquid crypto pairs when available.
  for (const [pair, asset] of [['ETHUSDT', 'ETH'], ['SOLUSDT', 'SOL']] as const) {
    const atr = await fetchBinanceAtr(pair, signal);
    if (atr != null) out[asset] = atr;
  }
  return out;
}
