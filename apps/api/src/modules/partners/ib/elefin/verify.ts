// Verifying referred traders with the partner's Elefin key. Elefin shares no email and no
// MT5 login in its client data, so the only join is its lookup: "is this email one of my
// clients?" (GET /clients/lookup?email=, exact match). We ask with the trader's own
// TRADElogs email, and only once they have confirmed it.
//
// The answer is kept as a trader-level ClientVerification row (no account attached):
//   broker "elefin", method "elefin_api", status VERIFIED / NOT_FOUND,
//   signal elefin-active | elefin-suspended | elefin-inactive | elefin-none,
//   ibAccountId "elefin-client:<client_id>" (the Elefin record that proved it),
//   brokerEmail = the email we asked about, checkedAt = when.
// Package access already counts any VERIFIED row of the partner (access.service), and
// verifyAccount marks the trader's Elefin accounts VERIFIED from it (method
// "elefin_email"). Other sources are untouched: list/postback matches are recomputed
// from IbAccount on every check, and admin decisions (method "manual") always stick —
// so "Elefin says no" never revokes a verification Elefin didn't give.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { decryptSecret } from '../../../../lib/secrets.js';
import { verifyUser } from '../ib.service.js';
import { recomputeUser } from '../access.service.js';
import { logEvent } from '../events.js';
import { getProgramSettings } from '../settings.js';
import { firstName } from '../../partner.logic.js';
import { baseUrlAllowed, ELEFIN_LIMITS, ELEFIN_PATHS } from './config.js';
import { ElefinClient, ElefinError } from './client.js';
import { lookupData, type ElefinClientStatus } from './schema.js';
import { elefinConfigOf, isElefinConnected, statusOf, type RosterEntry } from './store.js';

export const ELEFIN_BROKER = 'elefin';
export const ELEFIN_METHOD = 'elefin_api';
const REF_PREFIX = 'elefin-client:';
export const clientRef = (id: number | string) => `${REF_PREFIX}${id}`;
export const clientIdOfRef = (ref: string | null | undefined): string | null => (ref?.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) : null);
export const HELD_SIGNALS = ['elefin-suspended', 'elefin-inactive'] as const;

/** Where the trader-level row lives: no account attached. */
const personWhere = (userId: string, partnerId: string) =>
  ({ userId, partnerId, broker: ELEFIN_BROKER, brokerAccountId: null, externalAccountId: null });

export type ElefinFact =
  | { affiliated: false }
  | { affiliated: true; clientId: number | string; status: ElefinClientStatus };

/** What Elefin's answer means for the trader. Pure. */
export function decideElefin(fact: ElefinFact, partnerName: string): { status: 'VERIFIED' | 'NOT_FOUND'; signal: string; reason: string | null; ibAccountId: string | null } {
  if (!fact.affiliated) {
    return {
      status: 'NOT_FOUND', signal: 'elefin-none', ibAccountId: null,
      reason: `Elefin doesn’t list your email under ${partnerName}. Open your Elefin account through ${partnerName}’s link, with the same email you use here.`,
    };
  }
  if (fact.status === 'active') return { status: 'VERIFIED', signal: 'elefin-active', reason: null, ibAccountId: clientRef(fact.clientId) };
  return {
    status: 'NOT_FOUND', signal: `elefin-${fact.status}`, ibAccountId: clientRef(fact.clientId),
    reason: `You’re ${partnerName}’s Elefin client, but Elefin shows your account as ${fact.status}. Perks return once it’s active again.`,
  };
}

/** The trader-level row (oldest wins; a duplicate from a race is removed). */
export async function personRow(userId: string, partnerId: string) {
  const rows = await prisma.clientVerification.findMany({ where: personWhere(userId, partnerId), orderBy: { createdAt: 'asc' } });
  if (rows.length > 1) await prisma.clientVerification.deleteMany({ where: { id: { in: rows.slice(1).map(r => r.id) } } });
  return rows[0] ?? null;
}

export type Change = 'verified' | 'unverified' | null;

/**
 * Records Elefin's answer for one trader and, when it changed, re-checks their accounts
 * and access. Admin decisions on the row are left alone.
 */
export async function applyFact(
  t: { userId: string; partnerId: string; partnerName: string; email: string | null },
  fact: ElefinFact, now = new Date(),
): Promise<Change> {
  const prev = await personRow(t.userId, t.partnerId);
  if (prev?.method === 'manual') return null;
  const d = decideElefin(fact, t.partnerName);
  const was = prev ? { status: prev.status, signal: prev.signal } : null;
  const data = {
    status: d.status, method: ELEFIN_METHOD, signal: d.signal, reason: d.reason, ibAccountId: d.ibAccountId,
    brokerEmail: t.email ?? prev?.brokerEmail ?? null, checkedAt: now,
  };
  if (prev) await prisma.clientVerification.update({ where: { id: prev.id }, data });
  else await prisma.clientVerification.create({ data: { ...personWhere(t.userId, t.partnerId), ...data } });
  const changed = was?.status !== d.status || was?.signal !== d.signal;
  if (!changed) return null;
  const what = fact.affiliated ? `client #${fact.clientId} (${fact.status})` : 'not in the partner’s book';
  await logEvent({
    kind: `verify.elefin_${d.status === 'VERIFIED' ? 'verified' : fact.affiliated ? 'held' : 'not_found'}`, partnerId: t.partnerId, userId: t.userId,
    message: `Elefin lookup: ${what}; ${was?.status ?? 'new'} → ${d.status}`,
  });
  // Their Elefin accounts follow, then package access.
  await verifyUser(t.userId);
  await recomputeUser(t.userId);
  return d.status === 'VERIFIED' && was?.status !== 'VERIFIED' ? 'verified' : d.status !== 'VERIFIED' && was?.status === 'VERIFIED' ? 'unverified' : null;
}

/** GET /clients/lookup?email=. Exact match; the email is never logged or put in an error. */
export async function lookupEmail(client: ElefinClient, email: string): Promise<ElefinFact> {
  const data = await client.get(ELEFIN_PATHS.lookup, { email });
  const p = lookupData.safeParse(data);
  if (!p.success) throw new ElefinError('bad_response', 'Elefin’s lookup answer came back in a shape we don’t recognise.', 200, null, ELEFIN_PATHS.lookup);
  return p.data.affiliated ? { affiliated: true, clientId: p.data.client_id, status: p.data.status } : { affiliated: false };
}

// ── Who to ask about ─────────────────────────────────────────────────────────

export interface Candidate { userId: string; email: string; why: 'new' | 'email' | 'gone' | 'retry' | 'recheck' }

/**
 * Referred traders of this partner due a lookup, most useful first: never asked, changed
 * email, verified but missing from a full read of the book, not found (again after a
 * while), verified (now and then). Traders with an unconfirmed email wait.
 */
export async function lookupCandidates(partnerId: string, now: Date, limit: number, gone: Set<string> = new Set()): Promise<Candidate[]> {
  const [refs, rows] = await Promise.all([
    prisma.referral.findMany({ where: { partnerId }, select: { userId: true, attributedAt: true, user: { select: { email: true, emailVerified: true } } } }),
    prisma.clientVerification.findMany({
      where: { partnerId, broker: ELEFIN_BROKER, brokerAccountId: null, externalAccountId: null },
      select: { userId: true, status: true, method: true, checkedAt: true, brokerEmail: true },
    }),
  ]);
  const byUser = new Map(rows.map(r => [r.userId, r]));
  const t = now.getTime();
  const out: (Candidate & { rank: number; at: number })[] = [];
  for (const r of refs) {
    if (!r.user.emailVerified || !r.user.email) continue;
    const email = r.user.email.trim().toLowerCase();
    const row = byUser.get(r.userId);
    if (row?.method === 'manual') continue;
    const at = row?.checkedAt?.getTime() ?? 0;
    if (!row) out.push({ userId: r.userId, email, why: 'new', rank: 0, at });
    else if (row.brokerEmail !== email) out.push({ userId: r.userId, email, why: 'email', rank: 1, at });
    else if (gone.has(r.userId)) out.push({ userId: r.userId, email, why: 'gone', rank: 2, at });
    else if (row.status !== 'VERIFIED') {
      const fresh = t - r.attributedAt.getTime() < ELEFIN_LIMITS.newTraderDays * 86_400_000;
      if (t - at >= (fresh ? ELEFIN_LIMITS.recheckNewMs : ELEFIN_LIMITS.recheckOldMs)) out.push({ userId: r.userId, email, why: 'retry', rank: 3, at });
    } else if (t - at >= ELEFIN_LIMITS.recheckVerifiedMs) out.push({ userId: r.userId, email, why: 'recheck', rank: 4, at });
  }
  return out.sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, limit).map(({ rank: _r, at: _a, ...c }) => c);
}

/**
 * Applies the book to traders already matched to an Elefin client: status changes
 * (suspended / inactive / active again) without a lookup. Returns the traders whose
 * client wasn't in a full read — no longer in the partner's book — to look up again.
 */
export async function applyRoster(
  partner: { id: string; name: string }, book: Record<string, RosterEntry>, full: boolean, touched: Set<string>, now = new Date(),
): Promise<{ gone: Set<string>; verified: number; unverified: number }> {
  const rows = await prisma.clientVerification.findMany({
    where: { partnerId: partner.id, broker: ELEFIN_BROKER, brokerAccountId: null, externalAccountId: null, method: ELEFIN_METHOD, ibAccountId: { startsWith: REF_PREFIX } },
    select: { userId: true, ibAccountId: true, status: true, signal: true, brokerEmail: true },
  });
  const gone = new Set<string>();
  let verified = 0, unverified = 0;
  for (const r of rows) {
    const id = clientIdOfRef(r.ibAccountId)!;
    const e = book[id];
    if (!e) { if (full) gone.add(r.userId); continue; }
    if (!touched.has(id) && r.signal === `elefin-${statusOf(e[4])}`) continue;
    const ch = await applyFact({ userId: r.userId, partnerId: partner.id, partnerName: partner.name, email: r.brokerEmail }, { affiliated: true, clientId: id, status: statusOf(e[4]) }, now);
    if (ch === 'verified') verified++; else if (ch === 'unverified') unverified++;
  }
  return { gone, verified, unverified };
}

// ── One trader, now (signup, email confirmed, late code, "retry") ───────────

const inflight = new Set<string>();
const recent = new Map<string, number>();
const COOLDOWN_MS = 10 * 60_000;
export function resetLookupCooldowns(): void { recent.clear(); }

/**
 * Looks one referred trader up with their partner's key, if the partner has a working
 * Elefin connection and the trader's email is confirmed. Never throws; at most once per
 * trader every 10 minutes. Returns what changed (null: nothing / not asked).
 */
export async function lookupTrader(userId: string, deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<Change | 'skipped'> {
  if (inflight.has(userId) || (recent.get(userId) ?? 0) > Date.now() - COOLDOWN_MS) return 'skipped';
  inflight.add(userId);
  try {
    const ref = await prisma.referral.findUnique({
      where: { userId },
      include: { user: { select: { email: true, emailVerified: true } }, partner: { select: { id: true, status: true, user: { select: { name: true } } } } },
    });
    if (!ref || ref.partner.status !== 'ACTIVE' || !ref.user.emailVerified || !ref.user.email) return 'skipped';
    const b = await prisma.partnerBroker.findUnique({ where: { partnerId_broker: { partnerId: ref.partnerId, broker: ELEFIN_BROKER } } });
    const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
    if (!b || !cfg || cfg.pausedAt) return 'skipped';
    const { ibApiHosts } = await getProgramSettings();
    if (!baseUrlAllowed(cfg.baseUrl, ibApiHosts)) return 'skipped';
    recent.set(userId, Date.now());
    const client = new ElefinClient({ baseUrl: cfg.baseUrl, token: decryptSecret(b.apiKey!), ...deps });
    const email = ref.user.email.trim().toLowerCase();
    const fact = await lookupEmail(client, email);
    return await applyFact({ userId, partnerId: ref.partnerId, partnerName: firstName(ref.partner.user.name), email }, fact);
  } catch (err) {
    // Only the kind: no email, no key. A refused key is noticed by the next sync (/me).
    logger.warn('[elefin] trader lookup failed', { userId, kind: err instanceof ElefinError ? err.kind : 'error' });
    return 'skipped';
  } finally {
    inflight.delete(userId);
  }
}

/** Fire-and-forget form for auth hooks and services. */
export function queueElefinLookup(userId: string): void {
  void lookupTrader(userId).catch(() => {});
}
