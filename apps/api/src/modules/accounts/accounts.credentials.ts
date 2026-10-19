// The one place stored broker passwords are turned back into bridge credentials.
import type { BrokerAccount } from '@tradinjournal/db';
import { decryptSecret } from '../../lib/secrets.js';

export interface BridgeCreds { login: number; password: string; server: string }

/** Bridge credentials for an account, or null when no password is stored. */
export function credsOf(account: Pick<BrokerAccount, 'mt5Login' | 'server' | 'password'>): BridgeCreds | null {
  if (!account.password) return null;
  return { login: Number(account.mt5Login), password: decryptSecret(account.password), server: account.server };
}
