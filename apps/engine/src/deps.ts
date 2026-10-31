// What the engine needs from the outside world. Production wiring is in
// main.ts; tests pass fakes (an in-memory exchange, a fixed clock).
import { env } from '@tradinjournal/config';
import type { ExchangeConnection } from '@tradinjournal/db';
import { adapterFor, type ApiCredentials, type Exchange } from '@tradinjournal/exchange';
import { decryptWithKey, requireEncryptionKey } from '@tradinjournal/secrets';

export interface EngineDeps {
  exchangeFor(conn: Pick<ExchangeConnection, 'exchange' | 'environment'>): Exchange;
  credsFor(conn: Pick<ExchangeConnection, 'apiKeyEnc' | 'apiSecretEnc' | 'passphraseEnc'>): ApiCredentials;
  now(): Date;
  /** Wait between order-status polls. */
  sleep(ms: number): Promise<void>;
}

export function productionDeps(): EngineDeps {
  const key = requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY);
  return {
    exchangeFor: (c) => adapterFor(c.exchange, c.environment, { liveEnabled: env.EXCHANGE_LIVE_ENABLED }),
    credsFor: (c) => ({
      apiKey: decryptWithKey(c.apiKeyEnc, key),
      apiSecret: decryptWithKey(c.apiSecretEnc, key),
      passphrase: c.passphraseEnc ? decryptWithKey(c.passphraseEnc, key) : undefined,
    }),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
