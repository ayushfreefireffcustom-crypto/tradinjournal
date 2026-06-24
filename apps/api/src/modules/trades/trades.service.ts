import type { Deal } from '@tradinjournal/types';
import { getDeals } from '../../lib/broker-connector.js';
import { findAccountById } from '../accounts/accounts.repository.js';

export async function fetchDeals(userId: string, accountId: string): Promise<Deal[]> {
  const account = await findAccountById(accountId, userId);
  if (!account) throw Object.assign(new Error('Broker account not found'), { status: 404 });

  // For demo: investor password stored as null (we re-use password from request context).
  // TODO: Phase 2 — decrypt stored investor password from CredentialVault.
  // For now we rely on the session-cached password passed via query param (demo only).
  throw Object.assign(
    new Error('Use /accounts/:id/deals with password param (demo mode)'),
    { status: 501 },
  );
}

export async function fetchDealsWithPassword(
  userId: string,
  accountId: string,
  password: string,
): Promise<Deal[]> {
  const account = await findAccountById(accountId, userId);
  if (!account) throw Object.assign(new Error('Broker account not found'), { status: 404 });

  return getDeals({
    login: Number(account.mt5Login),
    password,
    server: account.server,
  });
}
