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
import { syncQueue, requestSyncWithin } from '../sync/sync.queue.js';
import { prisma } from '@tradinjournal/db';
import { assertWithinLimit } from '../../lib/plans.js';
import { registerSecret } from '@tradinjournal/logger';
import { env } from '@tradinjournal/config';
import { onAccountsChanged } from '../partners/ib/cycle.js';
import { assertAccountUsable, ElefinOnlyError, isElefinServer, elefinOnlyFor, splitUsable } from '../../lib/broker-policy.js';


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
  registerSecret(input.password); // masked in logs from here on, bridge errors included
  // Enforce the per-user account cap. Re-connecting an account the user already
  // has (same login+server) is always allowed — it just refreshes credentials —
  // so only brand-new accounts count against the limit.
  const existing = await findAccountsByUser(userId);
  const alreadyHave = existing.some(
    a => a.mt5Login === BigInt(input.mt5Login) && a.server === input.server,
  );
  // How many MT5 accounts a user may connect comes from their plan (H15).
  if (!alreadyHave) await assertWithinLimit(userId, 'brokerAccounts', existing.length, 'Remove one first.');

  // Elefin only: refuse other brokers before touching the bridge, then check again on
  // the server the bridge actually logged in to (the typed one could differ).
  const onlyElefin = await elefinOnlyFor(userId);
  if (onlyElefin && !isElefinServer(input.server)) throw new ElefinOnlyError();

  const info = await verifyAccount({
    login: input.mt5Login,
    password: input.password,
    server: input.server,
  });
  if (onlyElefin && !isElefinServer(info.server)) throw new ElefinOnlyError();

  const account = await upsertAccount({
    userId,
    broker: input.broker?.trim() || brokerNameFromServer(info.server),
    mt5Login: BigInt(info.login),
    server: info.server,
    password: input.password,
    baseCurrency: info.currency,
    marginMode: info.marginMode === 'HEDGING' ? 'HEDGING' : 'NETTING',
  });
  // Start importing history now so the first dashboard visit finds it ready.
  void syncQueue().request(account.id, 'high');
  // Referred clients: check the account against their partner's IB list.
  if (env.PARTNER_PROGRAM_ENABLED) onAccountsChanged(userId, null);
  return account;
}

/** Accounts the user may use. Under Elefin only, other brokers' accounts are left out (see lockedAccounts). */
export async function listAccounts(userId: string): Promise<BrokerAccount[]> {
  return (await splitUsable(userId, await findAccountsByUser(userId))).usable;
}

/** Accounts kept but not usable under Elefin only, so the user can see and remove them. */
export async function lockedAccounts(userId: string): Promise<BrokerAccount[]> {
  return (await splitUsable(userId, await findAccountsByUser(userId))).locked;
}

// Update the stored MT5 password after the trader changes it at their broker.
// We re-verify the new password against the same login+server first — so a wrong
// password fails fast with a clear BrokerAuthError and nothing is persisted.
export async function updateAccountCredentials(
  userId: string,
  id: string,
  password: string,
): Promise<BrokerAccount> {
  registerSecret(password);
  const account = await findAccountById(id, userId);
  if (!account) throw new NotFoundError('Broker account not found');
  await assertAccountUsable(userId, account);

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
  void syncQueue().request(updated.id, 'high');
  return updated;
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const account = await findAccountById(id, userId);
  if (!account) throw new NotFoundError('Broker account not found');
  await deleteAccountById(id, userId);
  if (env.PARTNER_PROGRAM_ENABLED) onAccountsChanged(userId, null);
}

/** Status of a manual sync as the client sees it. */
export type SyncNowResult = 'synced' | 'running' | 'failed';

/**
 * "Sync now": clears any back-off (the user is asking explicitly), jumps the queue
 * and waits up to 25s. Bad credentials come back as the usual BrokerAuthError.
 */
export async function syncNow(userId: string, id: string): Promise<{ account: BrokerAccount; result: SyncNowResult }> {
  const account = await findAccountById(id, userId);
  if (!account) throw new NotFoundError('Broker account not found');
  await assertAccountUsable(userId, account);
  await prisma.brokerAccount.update({ where: { id }, data: { syncRetryAt: null } });
  const r = await requestSyncWithin(id, 'high', 25_000);
  if (r !== 'timeout' && r.status === 'failed') throw r.error;
  const fresh = (await findAccountById(id, userId)) ?? account;
  return { account: fresh, result: r === 'timeout' || r.status === 'locked' ? 'running' : 'synced' };
}
