// Builds the active market providers and routes each symbol to the right one.
// Binance (crypto) + MT5 (broker) are always built; Twelve Data (stock/forex)
// only when its key is present. Resolution: an explicit broker request → MT5;
// a symbol in Binance's catalog → Binance; otherwise → Twelve Data.
import { env } from '@tradinjournal/config';
import type { MarketProvider, SymbolInfo } from '../types.js';
import { createBinanceProvider, isBinanceSymbol } from './binance.js';
import { createMt5Provider } from './mt5.js';
import { createTwelveDataProvider } from './twelvedata.js';

interface Registry {
  binance: MarketProvider;
  mt5: MarketProvider;
  twelvedata: MarketProvider | null;
}
let registry: Registry | null = null;

function build(): Registry {
  if (registry) return registry;
  registry = {
    binance: createBinanceProvider(),
    mt5: createMt5Provider(),
    twelvedata: env.TWELVEDATA_ENABLED ? createTwelveDataProvider() : null,
  };
  return registry;
}

export function getMarketProviders(): MarketProvider[] {
  const r = build();
  return [r.binance, r.mt5, ...(r.twelvedata ? [r.twelvedata] : [])];
}

/** Route a symbol to its provider. `broker=true` forces the MT5 (broker) path. */
export async function resolveProvider(symbol: string, broker = false): Promise<MarketProvider | null> {
  const r = build();
  if (broker) return r.mt5;
  if (await isBinanceSymbol(symbol)) return r.binance;
  return r.twelvedata; // stock/forex — null when Twelve Data isn't configured
}

/** Fan a search across every provider that supports it, newest-registered last. */
export async function searchAllSymbols(q: string): Promise<SymbolInfo[]> {
  const results = await Promise.all(
    getMarketProviders().map(p => (p.searchSymbols ? p.searchSymbols(q) : Promise.resolve([]))),
  );
  return results.flat();
}
