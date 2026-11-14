// Elefin Partner API connection: a partner pastes the read-only key Elefin issued them
// ("{key}.{secret}"). TRADElogs reads their client book with it (counts, funding, volume)
// and verifies referred traders by asking Elefin whether their email is one of the
// partner's clients (/clients/lookup). The key itself is never sent back.
import { z } from 'zod';

/** "{key}.{secret}" as Elefin shows it once, when the key is created. */
const tokenField = z.string().trim()
  .min(12, 'Paste the whole key, in the form key.secret')
  .max(600, 'That is longer than an Elefin key')
  .regex(/^[A-Za-z0-9_\-|~]+\.[A-Za-z0-9_\-|~.=+/]+$/, 'Paste the key as Elefin shows it: key.secret, with the dot in the middle');

export const elefinConnectSchema = z.object({
  key: tokenField,
  /** Only when Elefin gave a different API address. Must be an approved host. */
  baseUrl: z.string().trim().url().max(300).optional(),
});
export type ElefinConnectInput = z.infer<typeof elefinConnectSchema>;

/** Test a pasted key (not saved), or the saved one when `key` is left out. */
export const elefinTestSchema = z.object({
  key: tokenField.optional(),
  baseUrl: z.string().trim().url().max(300).optional(),
});
export type ElefinTestInput = z.infer<typeof elefinTestSchema>;

export type ElefinProbeOutcome = 'ok' | 'invalid_key' | 'missing_permission' | 'rate_limited' | 'unreachable' | 'bad_response' | 'host_not_allowed';
/** ok: the client list answered · forbidden: the key lacks clients.read · error / skipped. */
export type ElefinReadState = 'ok' | 'forbidden' | 'error' | 'skipped';

/** What /me says about the key. Never the key itself. */
export interface ElefinKeyInfoDto {
  /** The partner the key is bound to at Elefin. */
  partnerId: number | null;
  partnerName: string | null;
  /** The key's label at Elefin, e.g. "TRADElogs". */
  keyName: string | null;
  abilities: string[];
  /** Has `clients.read` (needed for everything except /me). */
  canReadClients: boolean;
  rateLimitPerMinute: number | null;
  expiresAt: string | null;
  /** Trade history before this date isn't in Elefin's CRM (lots / last trade count from here). */
  tradesFrom: string | null;
}

export interface ElefinProbeDto {
  ok: boolean;
  outcome: ElefinProbeOutcome;
  /** One plain sentence for the partner. */
  message: string;
  key: ElefinKeyInfoDto | null;
  /** Clients in the partner's book (from /me, confirmed by one /clients page). */
  clients: number | null;
  clientsRead: ElefinReadState;
  /** Field names (never values) of the first client row. */
  fields: string[];
  /** What to ask Elefin for, in plain words. Empty when nothing is missing. */
  missing: string[];
  /** Non-blocking notes, e.g. "Key expires in 9 days". */
  notes: string[];
  /** Seconds to wait when Elefin rate-limited the test. */
  retryAfter: number | null;
}

export type ElefinState = 'NOT_CONNECTED' | 'SYNCING' | 'OK' | 'ERROR' | 'PAUSED';

export interface ElefinSyncEventDto { at: string; status: string; message: string }

/** The partner's book at Elefin, aggregated at the last sync. No client names. */
export interface ElefinRosterDto {
  at: string;
  /** Last time the whole book was re-read (otherwise only changes since the last run). */
  fullAt: string | null;
  total: number;
  active: number;
  suspended: number;
  inactive: number;
  funded: number;
  /** Lifetime successful deposits, USD (gross). */
  depositsUsd: number;
  /** Lifetime closed volume, lots. */
  lots: number;
  /** Funded clients with no closed trade in `quietDays` (or never, after funding). */
  quiet: number;
  quietDays: number;
  /** Clients who have never closed a trade (since Elefin's trade history starts). */
  neverTraded: number;
  new7d: number;
  new30d: number;
  /** Newest attribution to this partner (referred_at, or registered_at). */
  newestAt: string | null;
  /** Referrals per week, oldest first, the last 8 weeks (this week last). */
  weekly: number[];
}

/** Referred TRADElogs traders checked against the partner's Elefin book by email. */
export interface ElefinVerificationDto {
  /** Traders referred to this partner on TRADElogs. */
  referred: number;
  /** Confirmed as this partner's Elefin client, account active. */
  verified: number;
  /** Elefin knows them, but the account is suspended or inactive (no perks). */
  held: number;
  /** Elefin says they aren't this partner's client (yet). */
  notFound: number;
  /** Not asked yet (new, or their email isn't confirmed). */
  waiting: number;
  /** Of the verified: funded at Elefin. */
  verifiedFunded: number;
  lastCheckAt: string | null;
}

export interface ElefinConnectionDto {
  state: ElefinState;
  /** PartnerBroker id once connected. */
  brokerId: string | null;
  /** "••••a1b2": the last four characters of the key. */
  keyHint: string | null;
  baseUrl: string;
  defaultBaseUrl: string;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  pausedAt: string | null;
  key: ElefinKeyInfoDto | null;
  roster: ElefinRosterDto | null;
  verification: ElefinVerificationDto;
  /** Earliest time "Sync now" works again (manual syncs are spaced out). */
  canSyncAt: string | null;
  syncEveryMinutes: number;
  /** For the key's IP access setting. Empty: "Any". */
  outboundIps: string[];
  events: ElefinSyncEventDto[];
}

export interface ElefinSyncResultDto {
  ok: boolean;
  skipped?: 'paused' | 'busy' | 'not_connected';
  /** The whole book was re-read (vs. changes since the last run). */
  full: boolean;
  /** Clients in the book after this sync. */
  clients: number | null;
  /** Client rows Elefin returned this run. */
  changed: number;
  /** Email lookups made this run. */
  lookups: number;
  /** Traders whose verification changed this run. */
  verified: number;
  unverified: number;
  error: string | null;
}

export interface ElefinConnectResultDto {
  probe: ElefinProbeDto;
  connection: ElefinConnectionDto;
  sync: ElefinSyncResultDto | null;
}

export interface AdminElefinRowDto {
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  partnerStatus: string;
  state: ElefinState;
  keyHint: string | null;
  /** The partner name the key is bound to at Elefin. */
  elefinPartner: string | null;
  keyExpiresAt: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  clients: number | null;
  funded: number | null;
  referred: number;
  verified: number;
}
