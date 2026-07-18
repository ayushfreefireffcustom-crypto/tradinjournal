import { env } from '@tradinjournal/config';
import type { Deal, MarginMode, VerifyResult } from '@tradinjournal/types';
import { BrokerAuthError, BrokerConnectionError } from '../http/errors.js';

interface BridgeCreds {
  login: number;
  password: string;
  server: string;
}

interface BridgeVerifyResponse {
  login: number;
  name: string;
  server: string;
  currency: string;
  balance: string;
  margin_mode: string;
}

interface BridgeDeal {
  deal_ticket: number;
  order_ticket: number;
  position_id: number;
  symbol: string;
  type: number;
  entry: number;
  volume: string;
  price: string;
  profit: string;
  commission: string;
  swap: string;
  fee: string;
  deal_time: number;
  comment: string;
}

interface BridgeDealsResponse {
  deals: BridgeDeal[];
  total: number;
}

const DEAL_TYPE_MAP: Record<number, Deal['type']> = { 0: 'BUY', 1: 'SELL', 2: 'BALANCE' };
const DEAL_ENTRY_MAP: Record<number, Deal['entry']> = { 0: 'IN', 1: 'OUT', 2: 'INOUT', 3: 'OUT_BY' };

async function bridgePost<T>(path: string, body: object): Promise<T> {
  const url = `${env.MT5_BRIDGE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bridge-Secret': env.MT5_BRIDGE_SHARED_SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);

    // The bridge maps an MT5 authorization failure (terminal error -6) to 401,
    // and older bridges surface it as a 503 whose body mentions "Authorization
    // failed". Either way it means the stored password no longer works — turn it
    // into a clear, user-actionable error instead of a generic 500.
    if (res.status === 401 || /authoriz|invalid account|invalid password|-6/i.test(text)) {
      throw new BrokerAuthError();
    }

    // Any other bridge failure (offline, timeout, 5xx) is an upstream problem.
    throw new BrokerConnectionError(`Broker bridge is unavailable right now. Please try again in a moment.`);
  }

  return res.json() as Promise<T>;
}

export async function verifyAccount(creds: BridgeCreds): Promise<VerifyResult> {
  const data = await bridgePost<BridgeVerifyResponse>('/verify', creds);
  return {
    login: data.login,
    name: data.name,
    server: data.server,
    currency: data.currency,
    balance: data.balance,
    marginMode: data.margin_mode === 'HEDGING' ? 'HEDGING' : 'NETTING',
  };
}

export async function getDeals(creds: BridgeCreds): Promise<Deal[]> {
  const data = await bridgePost<BridgeDealsResponse>('/deals', {
    ...creds,
    from_time: '2020-01-01T00:00:00',
    to_time: '2035-01-01T00:00:00',
  });

  return data.deals.map((d) => ({
    dealTicket: String(d.deal_ticket),
    orderTicket: String(d.order_ticket),
    positionId: String(d.position_id),
    symbol: d.symbol,
    type: DEAL_TYPE_MAP[d.type] ?? 'BUY',
    entry: DEAL_ENTRY_MAP[d.entry] ?? 'IN',
    volume: d.volume,
    price: d.price,
    profit: d.profit,
    commission: d.commission,
    swap: d.swap,
    fee: d.fee,
    dealTime: new Date(d.deal_time * 1000).toISOString(),
    comment: d.comment,
  }));
}
