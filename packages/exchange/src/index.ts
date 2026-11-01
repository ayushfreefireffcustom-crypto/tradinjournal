export * from './types.js';
export * from './errors.js';
export * from './units.js';
export * from './fingerprint.js';
export * from './registry.js';
export { TokenBucket } from './rate-limit.js';
export { deltaConfigFromEnv, type DeltaConfig } from './delta/config.js';
export { DeltaIndiaExchange, type DeltaDeps } from './delta/adapter.js';

import type { Exchange } from './types.js';
import { ExchangeConfigError } from './errors.js';
import { deltaConfigFromEnv } from './delta/config.js';
import { DeltaIndiaExchange } from './delta/adapter.js';

const adapters = new Map<string, Exchange>();

/**
 * Adapter for one venue and environment (matching the DB enums). Testnet and
 * live are separate hosts with separate keys, so the connection's environment
 * picks the adapter. LIVE throws unless `liveEnabled`.
 */
export function adapterFor(venue: string, environment: 'TESTNET' | 'LIVE', opts: { liveEnabled: boolean }): Exchange {
  if (environment === 'LIVE' && !opts.liveEnabled) throw new ExchangeConfigError('Live exchange accounts are not enabled.');
  const key = `${venue}:${environment}`;
  const hit = adapters.get(key);
  if (hit) return hit;
  let adapter: Exchange;
  switch (venue) {
    case 'DELTA_INDIA':
      adapter = new DeltaIndiaExchange(deltaConfigFromEnv({ DELTA_ENV: environment === 'LIVE' ? 'live' : 'testnet', DELTA_LIVE_ENABLED: opts.liveEnabled ? 'true' : 'false' }));
      break;
    default:
      throw new ExchangeConfigError(`No exchange adapter for "${venue}".`);
  }
  adapters.set(key, adapter);
  return adapter;
}
export * from './positions.js';
export * from './round-trips.js';
