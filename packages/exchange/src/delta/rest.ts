// Delta India REST transport: HMAC signing, the response envelope, error
// mapping and per-key throttling. No business logic.
//
// Signature: hex HMAC_SHA256(secret, METHOD + timestampSeconds + path + query + body),
// sent as `signature` with `api-key` and `timestamp` headers.

import { createHmac } from 'node:crypto';
import { ExchangeError, type ExchangeErrorCode } from '../errors.js';
import { bucketName } from '../fingerprint.js';
import { acquire } from '../rate-limit.js';
import type { ApiCredentials } from '../types.js';
import type { DeltaConfig } from './config.js';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

// Delta uses two error shapes: `{success:false, error:{code, context}}` and
// `{error:"SignatureExpired", message:"…"}`. Both fit this type.
export interface DeltaEnvelope<T> {
  success: boolean;
  result: T;
  meta?: Record<string, unknown>;
  error?: { code?: string; message?: string; context?: unknown } | string;
  message?: string;
}

export function deltaSignature(secret: string, method: string, timestamp: string, path: string, query: string, body: string): string {
  return createHmac('sha256', secret).update(method + timestamp + path + query + body).digest('hex');
}

export function encodeQuery(query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Venue code fragments → our taxonomy. Order matters: first match wins.
const CODE_MAP: Array<[RegExp, ExchangeErrorCode, string]> = [
  [/ip_not_whitelisted/i, 'IP_NOT_WHITELISTED', "This server's IP isn't on the API key's whitelist."],
  [/SignatureExpired|signature/i, 'AUTH', 'The exchange rejected the request signature. Check the API secret and the server clock.'],
  [/invalid_api_key|api_key_not_found/i, 'AUTH', 'The API key is invalid, deleted, or for the other environment (testnet vs live).'],
  [/UnauthorizedApiAccess|not authorised/i, 'PERMISSION', 'The API key lacks the permission for this action. Enable trading on the key.'],
  [/kyc_pending|trading_blocked/i, 'PERMISSION', 'The exchange account is not allowed to trade right now (KYC or a trading block).'],
  [/Request blocked by CDN|Forbidden/i, 'UNAVAILABLE', 'The exchange blocked the request at its CDN.'],
  [/rate.?limit|too_many/i, 'RATE_LIMIT', 'The exchange is rate-limiting this account. Retrying shortly.'],
  [/insufficient_margin|insufficient_balance/i, 'INSUFFICIENT_MARGIN', 'Not enough margin on the exchange account for this order.'],
  [/no_position_(left_)?for_reduce_only|offset_by_reduce_only/i, 'NO_POSITION', 'There is no open position left to reduce.'],
  [/less_than_order_min_size|order_max_size_exceeded/i, 'SIZE_TOO_SMALL', 'The order size is outside what the exchange allows for this contract.'],
  [/open_order_not_found|order_not_found|not_found/i, 'ORDER_NOT_FOUND', 'The exchange has no such order.'],
  [/invalid_contract|product|symbol/i, 'INSTRUMENT', 'The exchange does not list this contract.'],
  [/no_liquidity_for_market_order|order_size_exceed_available|immediate_execution_post_only|max_leverage_exceeded|leverage_limit_exceeded|risk_limits_breached|max_orders_count_exceeded|overlapping_buy_sell_orders|stale_order|reduce_only_orders_allowed/i, 'REJECTED', 'The exchange rejected the order.'],
];

export function mapDeltaError(status: number, body: DeltaEnvelope<unknown> | null): ExchangeError {
  const err = body?.error;
  const venueCode = typeof err === 'string' ? err : err?.code ?? '';
  const text = `${venueCode} ${typeof err === 'object' && err ? err.message ?? '' : ''} ${body?.message ?? ''}`;
  for (const [re, code, message] of CODE_MAP) {
    if (re.test(text)) return new ExchangeError(code, message, status, venueCode || undefined);
  }
  if (status === 401) return new ExchangeError('AUTH', 'The exchange rejected the API key.', status, venueCode || undefined);
  if (status === 403) return new ExchangeError('PERMISSION', 'The exchange refused this request for the API key.', status, venueCode || undefined);
  if (status === 429) return new ExchangeError('RATE_LIMIT', 'The exchange is rate-limiting this account. Retrying shortly.', status, venueCode || undefined);
  if (status === 404) return new ExchangeError('ORDER_NOT_FOUND', 'The exchange returned not found.', status, venueCode || undefined);
  if (status >= 500 || status === 0) return new ExchangeError('UNAVAILABLE', 'The exchange is unavailable right now.', status, venueCode || undefined);
  return new ExchangeError('REQUEST', `The exchange rejected the request${venueCode ? ` (${venueCode})` : ''}.`, status, venueCode || undefined);
}

// Delta allows 20,000 weight per 5-minute window per user; orders cost 5 and
// history reads 10. Ten requests a second stays well inside that.
const KEY_RATE = { capacity: 10, windowMs: 1000 };

export class DeltaRest {
  constructor(
    private readonly cfg: DeltaConfig,
    private readonly fetchImpl: FetchFn = (u, i) => fetch(u, i),
    private readonly nowMs: () => number = Date.now,
  ) {}

  async publicGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<DeltaEnvelope<T>> {
    const qs = encodeQuery(query);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.restUrl}${path}${qs}`, {
        headers: { 'User-Agent': this.cfg.userAgent, Accept: 'application/json' },
      });
    } catch {
      throw new ExchangeError('UNAVAILABLE', 'Could not reach the exchange.', 0);
    }
    const json = (await res.json().catch(() => null)) as DeltaEnvelope<T> | null;
    if (!res.ok || !json?.success) throw mapDeltaError(res.status, json);
    return json;
  }

  async signed<T>(
    creds: ApiCredentials,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {},
  ): Promise<DeltaEnvelope<T>> {
    await acquire(bucketName('DELTA_INDIA', creds.apiKey), KEY_RATE.capacity, KEY_RATE.windowMs);
    const qs = encodeQuery(opts.query);
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : '';
    const timestamp = Math.floor(this.nowMs() / 1000).toString();
    const signature = deltaSignature(creds.apiSecret, method, timestamp, path, qs, body);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.cfg.restUrl}${path}${qs}`, {
        method,
        headers: {
          'api-key': creds.apiKey,
          signature,
          timestamp,
          'User-Agent': this.cfg.userAgent,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: method === 'GET' ? undefined : body,
      });
    } catch {
      throw new ExchangeError('UNAVAILABLE', 'Could not reach the exchange.', 0);
    }
    const json = (await res.json().catch(() => null)) as DeltaEnvelope<T> | null;
    if (!res.ok || !json?.success) throw mapDeltaError(res.status, json);
    return json;
  }
}
