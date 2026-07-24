// Builds the active news providers. RSS is always on (no key); keyed aggregators
// are added when their env keys are present. (Finnhub/Marketaux/CryptoPanic
// adapters can slot in here later behind the same interface — RSS alone gives a
// full working feed today.)
import type { NewsProvider } from '../types.js';
import { createRssProvider } from './rss.js';

let cached: NewsProvider[] | null = null;

export function getNewsProviders(): NewsProvider[] {
  if (cached) return cached;
  const providers: NewsProvider[] = [createRssProvider()];
  cached = providers;
  return providers;
}
