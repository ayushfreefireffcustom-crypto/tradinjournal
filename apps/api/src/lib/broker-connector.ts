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

/** Per-call ceilings. The bridge serialises on one terminal, so a hung call would
 *  otherwise hold the request (and the caller's socket) for minutes. */
export const BRIDGE_TIMEOUT_MS = { verify: 45_000, deals: 120_000 } as const;

// Identical calls already in flight share one bridge request (e.g. two tabs opening
// the dashboard at once). Keyed by path + full body, so different credentials or
// ranges never share.
const inflight = new Map<string, Promise<unknown>>();

async function bridgePost<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const key = `${path}:${JSON.stringify(body)}`;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = bridgePostOnce<T>(path, body, timeoutMs).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function bridgePostOnce<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const url = `${env.MT5_BRIDGE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Secret': env.MT5_BRIDGE_SHARED_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
    throw new BrokerConnectionError(timedOut
      ? 'The broker bridge took too long to answer. Please try again in a moment.'
      : 'Broker bridge is unavailable right now. Please try again in a moment.');
  }

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
  const data = await bridgePost<BridgeVerifyResponse>('/verify', creds, BRIDGE_TIMEOUT_MS.verify);
  return {
    login: data.login,
    name: data.name,
    server: data.server,
    currency: data.currency,
    balance: data.balance,
    marginMode: data.margin_mode === 'HEDGING' ? 'HEDGING' : 'NETTING',
  };
}

/** MT5 wants naive "YYYY-MM-DDTHH:MM:SS" (UTC). */
const bridgeTime = (d: Date) => d.toISOString().slice(0, 19);
export const HISTORY_START = new Date('2020-01-01T00:00:00Z');

/**
 * Deals in [from, to]. Defaults to the whole history; incremental syncs pass a
 * `from` shortly before the newest stored deal.
 */
export async function getDeals(creds: BridgeCreds, range: { from?: Date; to?: Date } = {}): Promise<Deal[]> {
  const data = await bridgePost<BridgeDealsResponse>('/deals', {
    ...creds,
    from_time: bridgeTime(range.from ?? HISTORY_START),
    to_time: bridgeTime(range.to ?? new Date('2035-01-01T00:00:00Z')),
  }, BRIDGE_TIMEOUT_MS.deals);

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
