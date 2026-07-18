import type { BrokerAccount } from '@tradinjournal/db';
import type { ConnectAccountInput } from '@tradinjournal/contracts';
import { verifyAccount } from '../../lib/broker-connector.js';
import {
  upsertAccount,
  findAccountsByUser,
  findAccountById,
  deleteAccountById,
  updateAccountCredentials as updateCredentialsRepo,
} from './accounts.repository.js';
import { ConflictError, NotFoundError } from '../../http/errors.js';

// Each user may connect at most this many broker accounts.
const MAX_ACCOUNTS_PER_USER = 2;

// Prettify a broker name from an MT5 server string, e.g.
//   "XMGlobal-MT5 10" → "XM Global", "Xellion-Live" → "Xellion".
// Used as a fallback when the UI does not send an explicit broker name.
const SERVER_PREFIX_NAMES: Record<string, string> = {
  XMGlobal: 'XM Global',
  XMGlobalMU: 'XM International',
};

function brokerNameFromServer(server: string): string {
  const prefix = server.split('-')[0]?.trim() || server;
  return SERVER_PREFIX_NAMES[prefix] ?? prefix;
}

export async function connectAccount(userId: string, input: ConnectAccountInput): Promise<BrokerAccount> {
  // Enforce the per-user account cap. Re-connecting an account the user already
  // has (same login+server) is always allowed — it just refreshes credentials —
  // so only brand-new accounts count against the limit.
  const existing = await findAccountsByUser(userId);
  const alreadyHave = existing.some(
    a => a.mt5Login === BigInt(input.mt5Login) && a.server === input.server,
  );
  if (!alreadyHave && existing.length >= MAX_ACCOUNTS_PER_USER) {
    throw new ConflictError(
      `Account limit reached — you can connect up to ${MAX_ACCOUNTS_PER_USER} accounts. Remove one first.`,
    );
  }

  const info = await verifyAccount({
    login: input.mt5Login,
    password: input.password,
    server: input.server,
  });

  return upsertAccount({
    userId,
    broker: input.broker?.trim() || brokerNameFromServer(info.server),
    mt5Login: BigInt(info.login),
    server: info.server,
    password: input.password,
    baseCurrency: info.currency,
    marginMode: info.marginMode === 'HEDGING' ? 'HEDGING' : 'NETTING',
  });
}

export async function listAccounts(userId: string): Promise<BrokerAccount[]> {
  return findAccountsByUser(userId);
}

// Update the stored MT5 password after the trader changes it at their broker.
// We re-verify the new password against the same login+server first — so a wrong
// password fails fast with a clear BrokerAuthError and nothing is persisted.
export async function updateAccountCredentials(
  userId: string,
  id: string,
  password: string,
): Promise<BrokerAccount> {
  const account = await findAccountById(id, userId);
  if (!account) throw new NotFoundError('Broker account not found');

  const info = await verifyAccount({
    login: Number(account.mt5Login),
    password,
    server: account.server,
  });

  const updated = await updateCredentialsRepo(id, userId, {
    password,
    baseCurrency: info.currency,
    marginMode: info.marginMode === 'HEDGING' ? 'HEDGING' : 'NETTING',
  });
  if (!updated) throw new NotFoundError('Broker account not found');
  return updated;
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const account = await findAccountById(id, userId);
  if (!account) throw new NotFoundError('Broker account not found');
  await deleteAccountById(id, userId);
}
