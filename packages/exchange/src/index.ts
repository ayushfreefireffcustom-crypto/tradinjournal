export * from './types.js';
export * from './errors.js';
export * from './units.js';
export * from './fingerprint.js';
export * from './registry.js';
export { TokenBucket } from './rate-limit.js';
export { deltaConfigFromEnv, type DeltaConfig } from './delta/config.js';
export { DeltaIndiaExchange, type DeltaDeps } from './delta/adapter.js';

import type { Exchange, ExchangeId } from './types.js';
import { deltaConfigFromEnv } from './delta/config.js';
import { DeltaIndiaExchange } from './delta/adapter.js';

const adapters = new Map<ExchangeId, Exchange>();

/** Adapter for a venue, configured from process.env on first use (fails fast on bad config). */
export function getExchange(id: string): Exchange {
  const cached = adapters.get(id as ExchangeId);
  if (cached) return cached;
  let adapter: Exchange;
  switch (id) {
    case 'DELTA_INDIA':
      adapter = new DeltaIndiaExchange(deltaConfigFromEnv());
      break;
    default:
      throw new Error(`No exchange adapter for "${id}"`);
  }
  adapters.set(id as ExchangeId, adapter);
  return adapter;
}
