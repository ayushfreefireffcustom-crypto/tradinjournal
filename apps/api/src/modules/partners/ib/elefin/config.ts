// Everything we assume about Elefin's Partner API, in one place. Confirming the real
// API (once a partner key is available) should only mean editing this file.
//
// Known from Elefin's own developer docs page ("Partner API · Version 1"):
//  - read-only, every endpoint is a GET, scoped by the key that calls it;
//  - auth: `Authorization: Bearer {key}.{secret}` (older header pair X-API-Key / X-API-Secret);
//  - lists come back as { success, data: { data: [...], meta: { current_page, per_page, last_page, total } } },
//    single records as { success, data: {...} };
//  - amounts are USD, times UTC, volume in lots; unticked fields are left out entirely
//    (PII fields such as email are off unless the admin ticks them);
//  - 401 bad/expired key · 403 missing ability or partner gone · 404 missing or out of scope ·
//    429 rate limit with Retry-After (default limit 60 requests a minute per key).
// Guessed (confirm with a real key): the exact paths below and the field names.
import { env } from '@tradinjournal/config';

export interface ElefinPaths {
  /** Tried in order; the first that isn't a 404 wins. */
  profile: string[];
  clients: string[];
  accounts: string[];
}

export const ELEFIN_PATHS: ElefinPaths = {
  profile: ['/me', '/partner', '/profile'],
  clients: ['/clients'],
  accounts: ['/accounts', '/trading-accounts', '/client-accounts'],
};

/** Field names we look for, most likely first. Dot paths reach one level in. */
export const ELEFIN_FIELDS = {
  /** MT5 login on an account row (required). */
  login: ['login', 'mt5_login', 'mt5', 'account_login', 'account_number', 'account_no', 'trading_account', 'account', 'account_id', 'number'],
  email: ['email', 'email_address', 'client_email', 'client.email', 'user.email', 'contact.email'],
  /** The client a trading-account row belongs to. */
  accountClientId: ['client_id', 'clientId', 'client.id', 'user_id', 'customer_id', 'client_uid'],
  /** A client row's own id. */
  clientId: ['id', 'client_id', 'uid', 'client_uid', 'reference'],
  /** Trading accounts nested inside a client row. */
  nestedAccounts: ['accounts', 'trading_accounts', 'mt5_accounts', 'logins'],
  createdAt: ['created_at', 'registered_at', 'registration_date', 'signup_date', 'opened_at', 'created'],
  deposits: ['total_deposits', 'deposits_total', 'deposit_total', 'total_deposit', 'net_deposits', 'deposits', 'deposit'],
  lots: ['volume_lots', 'total_lots', 'lots', 'traded_lots', 'volume', 'total_volume'],
  lastTradeAt: ['last_trade_at', 'last_trade_time', 'last_trade_date', 'last_trade', 'last_activity_at'],
  platform: ['platform', 'server_type'],
} as const;

/** Partner profile fields, used only to label the connection. */
export const ELEFIN_PROFILE_FIELDS = { id: ['id', 'partner_id', 'ib_id', 'code'], name: ['name', 'company', 'display_name'] } as const;

/** Account ids we accept as an MT5 login (same rule as uploaded lists). */
export const LOGIN_RE = /^[A-Za-z0-9_-]{3,30}$/;

export const ELEFIN_LIMITS = {
  perPage: 100,
  probePerPage: 25,
  maxPages: 200,
  timeoutMs: 20_000,
  /** Our own budget per key; Elefin's default limit is 60/min. */
  perMinute: env.ELEFIN_REQ_PER_MIN,
  /** Longest we wait on a 429 inside one run before giving up until the next one. */
  maxRetryAfterS: 65,
  retries429: 3,
  retriesNetwork: 2,
  syncEveryMs: env.ELEFIN_SYNC_MINUTES * 60_000,
  /** "Sync now" at most this often per partner. */
  manualSyncGapMs: 2 * 60_000,
  /** 401/403 in a row before the connection pauses and the partner is asked for a new key. */
  authFailuresToPause: 3,
  /** Partners synced per scheduler tick (at most). */
  perTick: 25,
};

export const defaultBaseUrl = (): string => env.ELEFIN_PARTNER_API_URL.replace(/\/+$/, '');

export const outboundIps = (): string[] =>
  (env.ELEFIN_OUTBOUND_IPS ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

/**
 * May the server call this base URL with a partner's key? The configured default, any
 * https host under elefin.com, or an https host an admin approved in programme settings.
 * Anything else is refused: the server would otherwise fetch any URL a partner types.
 */
export function baseUrlAllowed(raw: string, approvedHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password) return false;
  const def = new URL(defaultBaseUrl());
  if (u.origin === def.origin) return true;
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return h === 'elefin.com' || h.endsWith('.elefin.com') || approvedHosts.some(a => h === a || h.endsWith(`.${a}`));
}
