// Elefin Partner API v1, as Elefin documents it (integration guide, document v2):
//  - base https://partnersapi.elefin.com/api/v1, read-only, every endpoint a GET;
//  - auth `Authorization: Bearer {key}.{secret}`; the key is bound to one partner server-side;
//  - envelope { success, message, data }; lists nest a paginator: data.data = rows,
//    data.meta = { current_page, per_page, last_page, total }; per_page 1–200;
//  - endpoints: /me (no ability), /clients, /clients/lookup?email=, /clients/{id} (clients.read);
//  - one client object, 13 fields — no email and no MT5 login anywhere;
//  - 60 requests a minute per key, 429 + Retry-After (seconds); retry only 429 and 5xx.
import { env } from '@tradinjournal/config';

export const ELEFIN_HOST = 'partnersapi.elefin.com';
export const ELEFIN_DEFAULT_URL = `https://${ELEFIN_HOST}/api/v1`;

export const ELEFIN_PATHS = {
  me: '/me',
  clients: '/clients',
  lookup: '/clients/lookup',
  client: (id: number) => `/clients/${id}`,
} as const;

/** The ability every client endpoint needs. */
export const CLIENTS_READ = 'clients.read';

/**
 * Whether a key's abilities look like they cover reading clients. Elefin's docs say
 * "clients.read", but a live key can spell it differently ("clients:read", "read:clients",
 * "clients.*", "*"). This is only a hint: the client list itself is always tried, and
 * Elefin's own answer to it decides.
 */
export function abilitiesCoverClients(abilities: readonly string[]): boolean {
  return abilities.some(a => a === '*' || /^(read[:._/-])?clients?([:._/-](read|list|index|view|show|all|\*))?$/i.test(a.trim()));
}

export const ELEFIN_LIMITS = {
  /** Elefin's maximum page size; one page of 200 beats 200 single reads. */
  perPage: 200,
  probePerPage: 1,
  maxPages: 500,
  timeoutMs: 20_000,
  /** Our own budget per key; Elefin allows 60/min. */
  perMinute: env.ELEFIN_REQ_PER_MIN,
  /** Gap between lookups in a batch (Elefin: "one request every 1.1 seconds"). */
  lookupGapMs: 1_100,
  /** Lookups one sync run may make (scheduled or "Sync now"); the rest wait for the next run. */
  lookupsPerRun: 40,
  /** Longest we wait on a 429 inside one run before giving up until the next one. */
  maxRetryAfterS: 65,
  retries429: 3,
  retries5xx: 3,
  retriesNetwork: 2,
  syncEveryMs: env.ELEFIN_SYNC_MINUTES * 60_000,
  /** Re-read the whole roster at least this often (otherwise `updated_from` increments). */
  fullEveryMs: 24 * 3_600_000,
  /** Overlap for `updated_from` so a client that changed mid-run isn't missed. */
  overlapMs: 60_000,
  /** Above this many clients we keep aggregates only (no per-client rows). */
  rosterMax: 20_000,
  /** "Sync now" at most this often per partner. */
  manualSyncGapMs: 2 * 60_000,
  /** 401/403 in a row before the connection pauses and the partner is asked for a new key. */
  authFailuresToPause: 3,
  /** Partners synced per scheduler tick (at most). */
  perTick: 25,
  /** A client with no closed trade for this long counts as gone quiet. */
  quietDays: 30,
  /** Re-ask about a trader Elefin didn't know: soon after signup, then weekly. */
  recheckNewMs: 12 * 3_600_000,
  recheckOldMs: 7 * 86_400_000,
  newTraderDays: 14,
  /** Re-ask about verified traders (the roster already reflects suspensions in between). */
  recheckVerifiedMs: 7 * 86_400_000,
};

/** The configured default base URL (ELEFIN_PARTNER_API_URL), without a trailing slash. */
export const defaultBaseUrl = (): string => (env.ELEFIN_PARTNER_API_URL || ELEFIN_DEFAULT_URL).replace(/\/+$/, '');

/**
 * The fixed addresses our API calls Elefin from (Railway static egress IPs of
 * Tradinjournal-API, `railway outbound-network static-ip`). Every partner key needs them on
 * its IP allow-list. ELEFIN_OUTBOUND_IPS overrides them; they're the default so partners
 * always see what to ask for, even when the variable isn't set.
 */
export const ELEFIN_STATIC_IPS = ['152.55.180.240', '162.220.234.242', '152.55.180.242'] as const;

export const outboundIps = (): string[] => {
  const set = (env.ELEFIN_OUTBOUND_IPS ?? '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  return set.length ? set : [...ELEFIN_STATIC_IPS];
};

/**
 * May the server call this base URL with a partner's key? The configured default,
 * https://partnersapi.elefin.com, or an https host an admin approved in programme
 * settings. Anything else is refused: the server would otherwise fetch any URL a
 * partner types.
 */
export function baseUrlAllowed(raw: string, approvedHosts: string[] = []): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.username || u.password) return false;
  const def = new URL(defaultBaseUrl());
  if (u.origin === def.origin) return true;
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return h === ELEFIN_HOST || approvedHosts.some(a => h === a || h.endsWith(`.${a}`));
}
