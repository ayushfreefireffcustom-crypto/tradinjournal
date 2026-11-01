// What the engine needs from the outside world. Production wiring is in
// main.ts; tests pass fakes (an in-memory exchange, a fixed clock).
import { env } from '@tradinjournal/config';
import type { ExchangeConnection } from '@tradinjournal/db';
import { adapterFor, type ApiCredentials, type Exchange } from '@tradinjournal/exchange';
import { decryptWithKey, requireEncryptionKey } from '@tradinjournal/secrets';
import { registerSecret } from '@tradinjournal/logger';

export interface EngineDeps {
  exchangeFor(conn: Pick<ExchangeConnection, 'exchange' | 'environment'>): Exchange;
  credsFor(conn: Pick<ExchangeConnection, 'apiKeyEnc' | 'apiSecretEnc' | 'passphraseEnc'>): ApiCredentials;
  now(): Date;
  /** Wait between order-status polls. */
  sleep(ms: number): Promise<void>;
  /**
   * Tests only: limit the periodic loops (reconcile, watchers) to these users'
   * leaders and accounts, so a shared test database's other rows stay untouched.
   * Unset in production: the loops cover everyone.
   */
  scopeUserIds?: string[];
}

/** Prisma filter on a user id column for the optional test scope. */
export const inScope = (deps: EngineDeps) => (deps.scopeUserIds ? { in: deps.scopeUserIds } : undefined);

export function productionDeps(): EngineDeps {
  const key = requireEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY);
  return {
    exchangeFor: (c) => adapterFor(c.exchange, c.environment, { liveEnabled: env.EXCHANGE_LIVE_ENABLED }),
    credsFor: (c) => {
      const creds = {
        apiKey: decryptWithKey(c.apiKeyEnc, key),
        apiSecret: decryptWithKey(c.apiSecretEnc, key),
        passphrase: c.passphraseEnc ? decryptWithKey(c.passphraseEnc, key) : undefined,
      };
      // In memory only; the logger masks them if one ever turns up in a line.
      registerSecret(creds.apiKey, creds.apiSecret, creds.passphrase);
      return creds;
    },
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
