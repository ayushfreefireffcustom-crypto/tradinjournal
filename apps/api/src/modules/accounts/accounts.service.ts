import type { BrokerAccount } from '@prisma/client';
import type { ConnectAccountInput } from '@tradinjournal/contracts';
import { verifyAccount } from '../../lib/broker-connector.js';
import { upsertAccount, findAccountsByUser } from './accounts.repository.js';

export async function connectAccount(userId: string, input: ConnectAccountInput): Promise<BrokerAccount> {
  const info = await verifyAccount({
    login: input.mt5Login,
    password: input.password,
    server: input.server,
  });

  return upsertAccount({
    userId,
    broker: 'XM Global MT5',
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
