// Picks the adapter for a connection's venue and environment. LIVE needs
// EXCHANGE_LIVE_ENABLED; until then users can only connect testnet accounts.
import { env } from '@tradinjournal/config';
import { adapterFor as sharedAdapterFor, ExchangeConfigError, type Exchange } from '@tradinjournal/exchange';
import type { ExchangeEnvironment, ExchangeVenue } from '@tradinjournal/db';
import { ForbiddenError } from '../../http/errors.js';

export function adapterFor(exchange: ExchangeVenue, environment: ExchangeEnvironment): Exchange {
  try {
    return sharedAdapterFor(exchange, environment, { liveEnabled: env.EXCHANGE_LIVE_ENABLED });
  } catch (err) {
    if (err instanceof ExchangeConfigError) {
      throw new ForbiddenError(environment === 'LIVE' ? 'Live exchange accounts are not enabled yet. Connect a testnet account for now.' : err.message);
    }
    throw err;
  }
}
