// Symbol deep-dive stats (E12) for the charts page: returns, realised
// volatility, drawdown, up-day ratio, beta and correlation against BTC, 24 h
// liquidity and, for crypto with a perpetual, funding and its countdown.
import { env } from '@tradinjournal/config';
import { symbolStats, type SymbolStats, type TraderCandle as Candle } from '@tradinjournal/core';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { fetchJson } from '../../lib/market/http.js';
import { isBinanceSymbol } from '../../lib/market/providers/binance.js';
import { ValidationError } from '../../http/errors.js';
import { loadPublicCandles } from '../market/market.service.js';
import { perpFor } from '../derivatives/derivatives.service.js';

const DAY = 86_400_000;
export interface StatsDeps {
  daily: (symbol: string, limit: number) => Promise<Candle[]>;
  isCrypto: (symbol: string) => Promise<boolean>;
  volume24h: (symbol: string) => Promise<number | null>;
  perp: (symbol: string) => ReturnType<typeof perpFor>;
  now: () => number;
  cache: boolean;
}
export const defaultStatsDeps: StatsDeps = {
  daily: (s, limit) => loadPublicCandles(s, '1d', limit),
  isCrypto: isBinanceSymbol,
  volume24h: async (s) => {
    try {
      const t = await fetchJson<{ quoteVolume: string }>(`${env.BINANCE_REST_URL}/api/v3/ticker/24hr?symbol=${encodeURIComponent(s)}`);
      const v = Number(t.quoteVolume);
      return Number.isFinite(v) ? v : null;
    } catch { return null; }
  },
  perp: (s) => perpFor(s),
  now: () => Date.now(),
  cache: true,
};

export interface SymbolStatsDto extends SymbolStats {
  symbol: string;
  crypto: boolean;
  bars: number;
  asOf: string;
  volume24h: number | null;
  funding: Awaited<ReturnType<typeof perpFor>>;
  benchmark: string;
}

export async function statsFor(raw: string, deps = defaultStatsDeps): Promise<SymbolStatsDto> {
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,30}$/.test(symbol)) throw new ValidationError('That isn’t a market symbol.');
  const key = `stats:${symbol}:${Math.floor(deps.now() / (10 * 60_000))}`;
  if (deps.cache) { const hit = await cacheGet<SymbolStatsDto>(key); if (hit) return hit; }
  const now = deps.now();
  const crypto = await deps.isCrypto(symbol);
  const closed = (c: Candle[]) => (crypto ? c.filter((b) => b.openTime + DAY <= now) : c);
  const [own, btc, vol, perp] = await Promise.all([
    deps.daily(symbol, 400).then(closed),
    symbol === 'BTCUSDT' ? Promise.resolve(null) : deps.daily('BTCUSDT', 120).then((c) => c.filter((b) => b.openTime + DAY <= now)).catch(() => null),
    crypto ? deps.volume24h(symbol) : Promise.resolve(null),
    crypto ? deps.perp(symbol).catch(() => null) : Promise.resolve(null),
  ]);
  if (!own.length) throw new ValidationError(`No daily data for ${symbol}.`);
  const s = symbolStats(own, btc ?? undefined, crypto ? 365 : 252);
  const out: SymbolStatsDto = {
    symbol, crypto, bars: own.length, asOf: new Date(own.at(-1)!.openTime).toISOString(),
    ...s, ...(symbol === 'BTCUSDT' ? { beta90: 1, corr90: 1 } : {}),
    volume24h: vol, funding: perp, benchmark: 'BTC',
  };
  if (deps.cache) await cacheSet(key, out, 600);
  return out;
}
