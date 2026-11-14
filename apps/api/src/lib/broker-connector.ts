import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import type { Deal, MarginMode, VerifyResult } from '@tradinjournal/types';
import { BrokerAuthError, BrokerConnectionError, describeBridgeFailure, type BridgeFailure } from '../http/errors.js';
import type { ServerClock } from './server-time.js';

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
  /** Seconds since epoch in the trade SERVER's wall clock, not UTC. */
  deal_time: number;
  comment: string;
}

interface BridgeDealsResponse {
  deals: BridgeDeal[];
  total: number;
  /** Newest live quote time (server wall clock) and the bridge's UTC clock; absent on older bridges. */
  server_time?: number | null;
  utc_now?: number | null;
}

export interface DealsWithClock {
  /** dealTime is the server's wall clock written as if it were UTC — convert before treating it as UTC. */
  deals: Deal[];
  clock: ServerClock | null;
}

const DEAL_TYPE_MAP: Record<number, Deal['type']> = { 0: 'BUY', 1: 'SELL', 2: 'BALANCE' };
const DEAL_ENTRY_MAP: Record<number, Deal['entry']> = { 0: 'IN', 1: 'OUT', 2: 'INOUT', 3: 'OUT_BY' };

/** Per-call ceilings. The bridge serialises on one terminal, so a hung call would
 *  otherwise hold the request (and the caller's socket) for minutes. */
export const BRIDGE_TIMEOUT_MS = { verify: 45_000, deals: 120_000, diagnose: 90_000 } as const;

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
    const failure: BridgeFailure = timedOut
      ? { code: 'TIMEOUT', message: `no answer from the bridge within ${timeoutMs / 1000}s` }
      : { code: 'BRIDGE_UNREACHABLE', message: (err as Error)?.message ?? 'fetch failed' };
    throw new BrokerConnectionError(timedOut
      ? 'The broker bridge took too long to answer. Please try again in a moment.'
      : 'We can\'t reach MT5 right now. This is on our side; please try again in a few minutes.', failure);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);

    // The bridge maps an MT5 authorization failure (terminal error -6) to 401,
    // and older bridges surface it as a 503 whose body mentions "Authorization
    // failed". Either way it means the stored password no longer works — turn it
    // into a clear, user-actionable error instead of a generic 500.
    // Keep the bridge's own reason in the logs (it can name the MT5 login, never the password).
    const detail = bridgeDetail(text);
    const failure = bridgeFailure(res.status, detail, text);
    logger.warn('[bridge] request failed', { path, status: res.status, failure: describeBridgeFailure(failure).slice(0, 500) });

    // The terminal answered but this login couldn't sign in (422 LOGIN_REJECTED,
    // or 401 from an older bridge): a wrong server name, login or password.
    if (res.status === 401 || res.status === 422 || detail?.code === 'LOGIN_REJECTED' || /authoriz|invalid account|invalid password|\(-6,/i.test(text)) {
      const server = typeof detail?.server === 'string' ? detail.server : (body as { server?: string }).server;
      throw new BrokerAuthError(path === '/verify'
        ? `MT5 couldn't log in to ${server ?? 'that server'}. Check the server name matches MT5 exactly (for example "XMGlobal-MT5 10"), the login number, and the investor password.`
        : undefined, failure);
    }

    // The terminal itself is down or busy: our problem, not the user's.
    throw new BrokerConnectionError('We can\'t reach MT5 right now. This is on our side; please try again in a few minutes.', failure);
  }

  return res.json() as Promise<T>;
}

interface BridgeDetail {
  code?: string;
  reason?: string;
  server?: unknown;
  message?: string;
  mt5?: { code?: number | null; message?: string | null; meaning?: string };
}

/** The bridge's structured `detail` ({ code, reason, mt5, message, … }) when it sends one. */
function bridgeDetail(text: string): BridgeDetail | null {
  try {
    const d = (JSON.parse(text) as { detail?: unknown }).detail;
    return d && typeof d === 'object' ? (d as BridgeDetail) : null;
  } catch {
    return null;
  }
}

/** Normalise any bridge error (new structured detail, older string detail, plain text) into a BridgeFailure. */
export function bridgeFailure(status: number, detail: BridgeDetail | null, text: string): BridgeFailure {
  if (detail?.code) {
    return {
      code: detail.code,
      reason: detail.reason,
      mt5: detail.mt5 ? { code: detail.mt5.code ?? null, message: detail.mt5.message ?? null, meaning: detail.mt5.meaning } : undefined,
      message: detail.message,
    };
  }
  // Older bridges: "(-10004, 'No IPC connection')" somewhere in the text.
  const m = /\((-?\d+),\s*'?([^)']*)'?\)/.exec(text);
  return {
    code: status === 401 || status === 422 ? 'LOGIN_REJECTED' : `HTTP_${status}`,
    mt5: m ? { code: Number(m[1]), message: m[2]!.trim() } : undefined,
    message: text.slice(0, 300),
  };
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

/** MT5 wants naive "YYYY-MM-DDTHH:MM:SS", read as the trade server's wall clock. */
const bridgeTime = (d: Date) => d.toISOString().slice(0, 19);
export const HISTORY_START = new Date('2020-01-01T00:00:00Z');

/**
 * Deals in [from, to] plus the server clock. Defaults to the whole history;
 * incremental syncs pass a `from` shortly before the newest stored deal. The
 * range and every returned dealTime are in the server's wall clock.
 */
export async function getDealsWithClock(creds: BridgeCreds, range: { from?: Date; to?: Date } = {}): Promise<DealsWithClock> {
  const data = await bridgePost<BridgeDealsResponse>('/deals', {
    ...creds,
    from_time: bridgeTime(range.from ?? HISTORY_START),
    to_time: bridgeTime(range.to ?? new Date('2035-01-01T00:00:00Z')),
  }, BRIDGE_TIMEOUT_MS.deals);

  const clock = data.utc_now != null ? { serverTime: data.server_time ?? null, utcNow: data.utc_now } : null;
  const deals = data.deals.map((d): Deal => ({
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
  return { deals, clock };
}

/** Deals only (dealTime in server wall clock — see getDealsWithClock). */
export async function getDeals(creds: BridgeCreds, range: { from?: Date; to?: Date } = {}): Promise<Deal[]> {
  return (await getDealsWithClock(creds, range)).deals;
}

/** What the bridge's /diagnose says about one login, tried live. Never contains the password. */
export interface BridgeDiagnosis {
  ok: boolean;
  /** OK | LOGIN_REJECTED | TERMINAL_DOWN | TERMINAL_UNAVAILABLE | BRIDGE_UNREACHABLE | BRIDGE_OUTDATED */
  verdict: string;
  reason?: string;
  explanation: string;
  login_attempts?: { code: number | null; message: string | null; meaning: string }[];
  terminal?: Record<string, unknown>;
  account?: Record<string, unknown> | null;
  history?: Record<string, unknown>;
  server_clock?: Record<string, unknown>;
  took_ms?: number;
}

/**
 * Ask the bridge to sign in with these credentials right now and report exactly
 * what happened. Bridge-side failures come back as a diagnosis, not a throw.
 */
export async function diagnoseLogin(creds: BridgeCreds): Promise<BridgeDiagnosis> {
  let res: Response;
  try {
    res = await fetch(`${env.MT5_BRIDGE_URL}/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': env.MT5_BRIDGE_SHARED_SECRET },
      body: JSON.stringify(creds),
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS.diagnose),
    });
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
    return {
      ok: false,
      verdict: 'BRIDGE_UNREACHABLE',
      reason: timedOut ? 'TIMEOUT' : 'NETWORK',
      explanation: timedOut
        ? `The bridge didn't answer within ${BRIDGE_TIMEOUT_MS.diagnose / 1000}s (it serves one request at a time; it may be busy with syncs).`
        : `Couldn't reach the bridge at all: ${(err as Error)?.message ?? 'fetch failed'}.`,
    };
  }
  if (res.status === 404) {
    return { ok: false, verdict: 'BRIDGE_OUTDATED', explanation: 'This bridge has no /diagnose endpoint yet — redeploy apps/mt5-bridge.' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    return { ok: false, verdict: `HTTP_${res.status}`, explanation: `The bridge answered ${res.status}: ${text.slice(0, 300)}` };
  }
  return (await res.json()) as BridgeDiagnosis;
}
