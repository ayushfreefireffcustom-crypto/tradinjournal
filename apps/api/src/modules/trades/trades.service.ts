import type { Deal } from '@tradinjournal/types';
import { getDeals } from '../../lib/broker-connector.js';
import { findAccountById } from '../accounts/accounts.repository.js';

export async function fetchDealsWithPassword(
  userId: string,
  accountId: string,
  password: string,
): Promise<Deal[]> {
  const account = await findAccountById(accountId, userId);
  if (!account) {
    throw Object.assign(new Error('Broker account not found'), { statusCode: 404 });
  }

  const pass = password || account.password;
  if (!pass) {
    throw Object.assign(new Error('No password available for this account'), { statusCode: 400 });
  }

  return getDeals({
    login: Number(account.mt5Login),
    password: pass,
    server: account.server,
  });
}
