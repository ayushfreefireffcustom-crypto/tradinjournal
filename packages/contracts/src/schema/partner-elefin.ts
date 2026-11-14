// Elefin Partner API connection: a partner pastes the read-only key Elefin issued them
// ("{key}.{secret}"); TRADElogs reads their clients and MT5 accounts with it and verifies
// referred traders automatically. The key itself is never sent back.
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

export type ElefinResource = 'profile' | 'clients' | 'accounts';
/** ok: readable · forbidden: the key lacks that ability · missing: no such endpoint · error: failed. */
export type ElefinAbilityState = 'ok' | 'forbidden' | 'missing' | 'error' | 'skipped';
export type ElefinProbeOutcome = 'ok' | 'invalid_key' | 'missing_permission' | 'no_logins' | 'rate_limited' | 'unreachable' | 'bad_response' | 'host_not_allowed';

export interface ElefinProbeDto {
  ok: boolean;
  outcome: ElefinProbeOutcome;
  /** One plain sentence for the partner. */
  message: string;
  abilities: Record<ElefinResource, ElefinAbilityState>;
  /** Field names (never values) the key returned, per resource. */
  fields: { clients: string[]; accounts: string[] };
  /** Totals Elefin reports; null when the resource can't be read. */
  counts: { clients: number | null; accounts: number | null };
  /** Can we read MT5 logins (needed) and emails (optional)? */
  hasLogin: boolean;
  hasEmail: boolean;
  /** What to ask Elefin for, in plain words. Empty when nothing is missing. */
  missing: string[];
  /** Non-blocking notes, e.g. "Emails aren't shared". */
  notes: string[];
  /** Seconds to wait when Elefin rate-limited the test. */
  retryAfter: number | null;
}

export type ElefinState = 'NOT_CONNECTED' | 'SYNCING' | 'OK' | 'ERROR' | 'PAUSED';

export interface ElefinSyncEventDto { at: string; status: string; message: string }

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
  abilities: Record<ElefinResource, ElefinAbilityState> | null;
  fields: { clients: string[]; accounts: string[] } | null;
  counts: { clients: number | null; accounts: number; verified: number; clientAccounts: number };
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
  accounts: number;
  added: number;
  removed: number;
  changed: number;
  rechecked: number;
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
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  accounts: number;
  verified: number;
  clientAccounts: number;
}
