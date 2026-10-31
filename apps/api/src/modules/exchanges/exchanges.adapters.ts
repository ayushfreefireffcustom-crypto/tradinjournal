// One adapter per (venue, environment). Testnet and live are separate hosts with
// separate keys, so a connection's environment picks the adapter, never a
// process-wide setting. LIVE needs EXCHANGE_LIVE_ENABLED on top.
import { env } from '@tradinjournal/config';
import { DeltaIndiaExchange, deltaConfigFromEnv, type Exchange } from '@tradinjournal/exchange';
import type { ExchangeEnvironment, ExchangeVenue } from '@tradinjournal/db';
import { ForbiddenError } from '../../http/errors.js';

const cache = new Map<string, Exchange>();

export function adapterFor(exchange: ExchangeVenue, environment: ExchangeEnvironment): Exchange {
  if (environment === 'LIVE' && !env.EXCHANGE_LIVE_ENABLED) {
    throw new ForbiddenError('Live exchange accounts are not enabled yet. Connect a testnet account for now.');
  }
  const key = `${exchange}:${environment}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let adapter: Exchange;
  switch (exchange) {
    case 'DELTA_INDIA':
      adapter = new DeltaIndiaExchange(
        deltaConfigFromEnv({ DELTA_ENV: environment === 'LIVE' ? 'live' : 'testnet', DELTA_LIVE_ENABLED: env.EXCHANGE_LIVE_ENABLED ? 'true' : 'false' }),
      );
      break;
    default:
      throw new ForbiddenError(`${String(exchange)} is not supported yet.`);
  }
  cache.set(key, adapter);
  return adapter;
}
