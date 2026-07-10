import type { BrokerAccount } from '@tradinjournal/db';
import type { ConnectAccountInput } from '@tradinjournal/contracts';
import { verifyAccount } from '../../lib/broker-connector.js';
import { upsertAccount, findAccountsByUser } from './accounts.repository.js';

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
