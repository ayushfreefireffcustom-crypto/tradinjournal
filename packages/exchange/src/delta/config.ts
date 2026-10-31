// Delta India endpoints. The environment is explicit and required: MirrorPip-X
// defaulted to production when an env var was missing, which risks real orders
// from a misconfigured test box. Here a missing DELTA_ENV is a startup error.

import { ExchangeConfigError } from '../errors.js';
import type { ExchangeEnv } from '../types.js';

export interface DeltaConfig {
  env: ExchangeEnv;
  restUrl: string;
  wsUrl: string;
  /** Sent on every request; Delta rejects requests without a User-Agent. */
  userAgent: string;
}

const DEFAULTS: Record<ExchangeEnv, { restUrl: string; wsUrl: string }> = {
  testnet: { restUrl: 'https://cdn-ind.testnet.deltaex.org', wsUrl: 'wss://socket-ind.testnet.deltaex.org' },
  live: { restUrl: 'https://api.india.delta.exchange', wsUrl: 'wss://socket.india.delta.exchange' },
};

/**
 * Read Delta settings from an env map. Throws unless DELTA_ENV is exactly
 * "testnet" or "live". Going live also requires DELTA_LIVE_ENABLED=true, so
 * flipping one variable can't start real trading by itself.
 */
export function deltaConfigFromEnv(env: Record<string, string | undefined> = process.env): DeltaConfig {
  const raw = env.DELTA_ENV?.trim();
  if (raw !== 'testnet' && raw !== 'live') {
    throw new ExchangeConfigError('DELTA_ENV must be set to "testnet" or "live".');
  }
  if (raw === 'live' && env.DELTA_LIVE_ENABLED !== 'true') {
    throw new ExchangeConfigError('DELTA_ENV=live also needs DELTA_LIVE_ENABLED=true.');
  }
  const d = DEFAULTS[raw];
  const restUrl = (env.DELTA_REST_URL?.trim() || d.restUrl).replace(/\/+$/, '');
  const wsUrl = env.DELTA_WS_URL?.trim() || d.wsUrl;
  // Guard against a testnet config pointed at production hosts (or the reverse).
  const looksTestnet = /testnet/.test(restUrl) && /testnet/.test(wsUrl);
  if ((raw === 'testnet') !== looksTestnet) {
    throw new ExchangeConfigError(`DELTA_ENV=${raw} but the Delta URLs point at ${looksTestnet ? 'testnet' : 'production'}.`);
  }
  return { env: raw, restUrl, wsUrl, userAgent: 'tradelogs/1.0' };
}
