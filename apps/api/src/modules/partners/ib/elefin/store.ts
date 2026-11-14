// What an Elefin connection keeps (no new tables):
//  - PartnerBroker (broker "elefin", method API): the encrypted key in `apiKey`, everything
//    else (never secret, never a client name or email) in `apiConfig` with provider "elefin";
//  - the book as compact per-client tuples keyed by Elefin client_id, so `updated_from`
//    increments can keep the aggregates right; above ELEFIN_LIMITS.rosterMax only aggregates;
//  - verification of referred traders in ClientVerification (see verify.ts).
import { prisma, Prisma } from '@tradinjournal/db';
import type { ElefinKeyInfoDto, ElefinRosterDto } from '@tradinjournal/contracts';
import type { ElefinClientRow, ElefinClientStatus } from './schema.js';

/** [deposits USD, lots, last trade (unix s) | null, funded 0|1, status, attributed (unix s) | null]. */
export type RosterEntry = [number, number, number | null, 0 | 1, 'a' | 's' | 'i', number | null];

export interface ElefinRoster {
  /** Start of the last successful roster read; the next run asks for `updated_from` = this − 1 min. */
  syncStartedAt: string | null;
  fullAt: string | null;
  /** Null when the book is too big to keep per client (aggregates only, full reads). */
  clients: Record<string, RosterEntry> | null;
}

export interface ElefinConfig {
  provider: 'elefin';
  /** 2: the published API (/me, /clients, /clients/lookup). 1 was the pre-spec guesswork. */
  v: 2;
  baseUrl: string;
  /** "••••a1b2". */
  keyHint: string;
  connectedAt: string;
  /** From /me at connect and on every sync. */
  key: ElefinKeyInfoDto | null;
  lastSuccessAt: string | null;
  /** 401/403 in a row. */
  authFailures: number;
  /** Set after repeated 401/403: no automatic syncs until the partner adds a key again. */
  pausedAt: string | null;
  manualSyncAt: string | null;
  roster: ElefinRoster;
  snapshot: ElefinRosterDto | null;
  lastLookupAt: string | null;
}

type WithConfig = { apiConfig: unknown; apiKey?: string | null; method?: string };

const emptyRoster = (): ElefinRoster => ({ syncStartedAt: null, fullAt: null, clients: {} });

export function elefinConfigOf(b: WithConfig | null | undefined): ElefinConfig | null {
  const c = b?.apiConfig as (Partial<ElefinConfig> & { v?: number }) | null | undefined;
  if (!c || typeof c !== 'object' || c.provider !== 'elefin' || typeof c.baseUrl !== 'string') return null;
  // A v1 connection (guessed endpoints) keeps its key; the next sync re-reads everything.
  const v2 = c.v === 2;
  return {
    provider: 'elefin', v: 2, baseUrl: c.baseUrl, keyHint: c.keyHint ?? '••••', connectedAt: c.connectedAt ?? new Date(0).toISOString(),
    key: v2 ? c.key ?? null : null, lastSuccessAt: c.lastSuccessAt ?? null, authFailures: c.authFailures ?? 0,
    pausedAt: c.pausedAt ?? null, manualSyncAt: c.manualSyncAt ?? null,
    roster: v2 && c.roster ? { syncStartedAt: c.roster.syncStartedAt ?? null, fullAt: c.roster.fullAt ?? null, clients: c.roster.clients === undefined ? {} : c.roster.clients } : emptyRoster(),
    snapshot: v2 ? c.snapshot ?? null : null, lastLookupAt: v2 ? c.lastLookupAt ?? null : null,
  };
}

/** An Elefin API connection that can sync: method API, Elefin config and a stored key. */
export function isElefinConnected(b: WithConfig | null | undefined): boolean {
  return !!b && b.method === 'API' && !!b.apiKey && !!elefinConfigOf(b);
}

/** Last four characters of the key, never more. */
export const keyHint = (token: string): string => `••••${token.trim().slice(-4)}`;

export function newConfig(baseUrl: string, token: string, key: ElefinKeyInfoDto | null): ElefinConfig {
  return {
    provider: 'elefin', v: 2, baseUrl, keyHint: keyHint(token), connectedAt: new Date().toISOString(), key,
    lastSuccessAt: null, authFailures: 0, pausedAt: null, manualSyncAt: null, roster: emptyRoster(), snapshot: null, lastLookupAt: null,
  };
}

/**
 * Merges top-level keys into the stored config in one statement, so a "Sync now" stamp
 * and a sync finishing at the same moment don't overwrite each other.
 */
export async function patchConfig(brokerId: string, patch: Partial<ElefinConfig>, extra: Prisma.PartnerBrokerUpdateInput = {}): Promise<void> {
  await prisma.$executeRaw`UPDATE "partner_broker" SET "apiConfig" = COALESCE("apiConfig", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb WHERE id = ${brokerId}`;
  if (Object.keys(extra).length) await prisma.partnerBroker.update({ where: { id: brokerId }, data: extra });
}

// ── Roster tuples ────────────────────────────────────────────────────────────

const sec = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};
const STATUS: Record<ElefinClientStatus, RosterEntry[4]> = { active: 'a', suspended: 's', inactive: 'i' };
export const statusOf = (s: RosterEntry[4]): ElefinClientStatus => (s === 'a' ? 'active' : s === 's' ? 'suspended' : 'inactive');

/** Only what the overview uses: no name, country or referral code. Money kept to the cent. */
export function toEntry(c: ElefinClientRow): RosterEntry {
  return [
    Math.round(c.funding.deposits * 100) / 100, Math.round(c.trading.lots * 100) / 100, sec(c.trading.last_trade_at),
    c.funding.is_funded ? 1 : 0, STATUS[c.status], sec(c.referred_at) ?? sec(c.registered_at),
  ];
}

const DAY_S = 86_400;

/** The overview numbers from the per-client tuples. Sums in integer cents (no float drift). */
export function snapshotOf(entries: Iterable<RosterEntry>, opts: { now: Date; fullAt: string | null; quietDays: number; total?: number }): ElefinRosterDto {
  const now = Math.floor(opts.now.getTime() / 1000);
  const quietCut = now - opts.quietDays * DAY_S;
  // Weeks end "now": bucket 7 is the last 7 days.
  const weekly = [0, 0, 0, 0, 0, 0, 0, 0];
  let total = 0, active = 0, suspended = 0, inactive = 0, funded = 0, cents = 0, lotCents = 0, quiet = 0, never = 0, new7 = 0, new30 = 0;
  let newest: number | null = null;
  for (const [dep, lots, last, isFunded, st, at] of entries) {
    total++;
    if (st === 'a') active++; else if (st === 's') suspended++; else inactive++;
    if (isFunded) funded++;
    cents += Math.round(dep * 100);
    lotCents += Math.round(lots * 100);
    if (last == null) never++;
    if (isFunded && st === 'a' && (last == null || last < quietCut)) quiet++;
    if (at != null) {
      if (newest == null || at > newest) newest = at;
      const age = now - at;
      if (age >= 0 && age < 7 * DAY_S) new7++;
      if (age >= 0 && age < 30 * DAY_S) new30++;
      const w = Math.floor(age / (7 * DAY_S));
      if (age >= 0 && w < 8) weekly[7 - w]!++;
    }
  }
  return {
    at: opts.now.toISOString(), fullAt: opts.fullAt, total: opts.total ?? total, active, suspended, inactive, funded,
    depositsUsd: cents / 100, lots: lotCents / 100, quiet, quietDays: opts.quietDays, neverTraded: never, new7d: new7, new30d: new30,
    newestAt: newest != null ? new Date(newest * 1000).toISOString() : null, weekly,
  };
}
