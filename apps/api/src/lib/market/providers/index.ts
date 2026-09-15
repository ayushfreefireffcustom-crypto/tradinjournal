// Builds the active market providers and routes each symbol to the right one.
// Binance (crypto), MT5 (broker) and Yahoo (free forex/stock) are always built;
// Twelve Data (stock/forex) only when its key is present. Resolution: an explicit
// broker request → MT5; a symbol in Binance's catalog → Binance; otherwise the
// forex/stock path → Twelve Data when configured, else the free Yahoo provider.
import { env } from '@tradinjournal/config';
import type { MarketProvider, SymbolInfo } from '../types.js';
import { createBinanceProvider, isBinanceSymbol } from './binance.js';
import { createMt5Provider } from './mt5.js';
import { createTwelveDataProvider } from './twelvedata.js';
import { createYahooProvider } from './yahoo.js';

interface Registry {
  binance: MarketProvider;
  mt5: MarketProvider;
  twelvedata: MarketProvider | null;
  yahoo: MarketProvider;
}
let registry: Registry | null = null;

function build(): Registry {
  if (registry) return registry;
  registry = {
    binance: createBinanceProvider(),
    mt5: createMt5Provider(),
    twelvedata: env.TWELVEDATA_ENABLED ? createTwelveDataProvider() : null,
    yahoo: createYahooProvider(),
  };
  return registry;
}

export function getMarketProviders(): MarketProvider[] {
  const r = build();
  return [r.binance, r.mt5, ...(r.twelvedata ? [r.twelvedata] : []), r.yahoo];
}

/** Route a symbol to its provider. `broker=true` forces the MT5 (broker) path. */
export async function resolveProvider(symbol: string, broker = false): Promise<MarketProvider | null> {
  const r = build();
  if (broker) return r.mt5;
  if (await isBinanceSymbol(symbol)) return r.binance;
  // Forex/stock: prefer Twelve Data when configured, else the free Yahoo feed.
  return r.twelvedata ?? r.yahoo;
}

/** Fan a search across every provider that supports it, newest-registered last. */
export async function searchAllSymbols(q: string): Promise<SymbolInfo[]> {
  const results = await Promise.all(
    getMarketProviders().map(p => (p.searchSymbols ? p.searchSymbols(q) : Promise.resolve([]))),
  );
  return results.flat();
}
