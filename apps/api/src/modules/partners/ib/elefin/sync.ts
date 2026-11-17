// One Elefin sync for a partner:
//  1. /me — the key still works, still has clients.read; refresh expiry and totals;
//  2. the book — /clients 200 a page: everything once a day, otherwise only clients that
//     changed since the last run (`updated_from` = last run's start − 1 minute);
//  3. traders already matched to a client follow the book's status (suspended → no perks);
//  4. email lookups for referred traders not matched yet (and the odd re-check), spaced
//     1.1 s apart and capped per run so a big partner never blows Elefin's 60/min.
// Never throws: failures are written on the connection and pause it after repeated 401/403.
import { prisma, type Prisma } from '@tradinjournal/db';
import type { ElefinSyncResultDto } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { decryptSecret } from '../../../../lib/secrets.js';
import { getProgramSettings } from '../settings.js';
import { logEvent } from '../events.js';
import { firstName } from '../../partner.logic.js';
import { baseUrlAllowed, ELEFIN_LIMITS, ELEFIN_PATHS } from './config.js';
import { ElefinClient, ElefinError } from './client.js';
import { readMe } from './probe.js';
import { elefinClient } from './schema.js';
import { elefinConfigOf, patchConfig, snapshotOf, toEntry, type ElefinConfig, type RosterEntry } from './store.js';
import { applyFact, applyRoster, lookupCandidates, lookupEmail } from './verify.js';

type Actor = { id: string; email: string } | null;
export interface SyncDeps { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }

const inflight = new Set<string>();
export const isSyncing = (brokerId: string): boolean => inflight.has(brokerId);

const KEEP_OK_EVENTS_MS = 30 * 86_400_000;

export interface BookRead { clients: Record<string, RosterEntry>; full: boolean; changed: Set<string>; skippedRows: number; total: number | null }

/**
 * Reads the book: all of it (`full`) or the clients changed since `since`. Rows that don't
 * match the documented client object are skipped and counted, never stored.
 */
export async function readBook(client: ElefinClient, prev: Record<string, RosterEntry> | null, opts: { full: boolean; since: string | null }): Promise<BookRead> {
  const full = opts.full || !prev || !opts.since;
  const clients: Record<string, RosterEntry> = full ? {} : { ...prev };
  const changed = new Set<string>();
  let skippedRows = 0, total: number | null = null;
  const query = full ? {} : { updated_from: opts.since! };
  for await (const page of client.pages(ELEFIN_PATHS.clients, query)) {
    if (full) total = page.meta.total;
    for (const row of page.rows) {
      const c = elefinClient.safeParse(row);
      if (!c.success) { skippedRows++; continue; }
      const id = String(c.data.client_id);
      clients[id] = toEntry(c.data);
      changed.add(id);
    }
  }
  // Most rows unreadable means Elefin changed the shape: keep the last good book.
  if (skippedRows && skippedRows * 2 >= skippedRows + changed.size) {
    throw new ElefinError('bad_response', 'Elefin’s client rows came back in a shape we don’t recognise. We kept your last numbers.', 200, null, ELEFIN_PATHS.clients);
  }
  return { clients, full, changed, skippedRows, total };
}

const none = (skipped: ElefinSyncResultDto['skipped'], error: string | null = null): ElefinSyncResultDto =>
  ({ ok: false, skipped, full: false, clients: null, changed: 0, lookups: 0, verified: 0, unverified: 0, error });

/**
 * One sync. `force` (admin) also runs a paused connection; success un-pauses it.
 * `full` re-reads the whole book regardless of when it was last read.
 */
export async function syncElefin(brokerId: string, opts: { actor?: Actor; force?: boolean; full?: boolean; deps?: SyncDeps; lookups?: number } = {}): Promise<ElefinSyncResultDto> {
  if (inflight.has(brokerId)) return none('busy');
  const b = await prisma.partnerBroker.findUnique({ where: { id: brokerId }, include: { partner: { select: { id: true, user: { select: { name: true } } } } } });
  const cfg = elefinConfigOf(b);
  if (!b || !cfg || b.method !== 'API' || !b.apiKey) return none('not_connected');
  if (cfg.pausedAt && !opts.force) return none('paused', 'Syncing is paused until the key is added again.');
  inflight.add(brokerId);
  const clock = opts.deps?.now ?? Date.now;
  const started = new Date(clock());
  const actor = opts.actor ?? null;
  let abilities: string[] | null = null;
  try {
    const { ibApiHosts } = await getProgramSettings();
    if (!baseUrlAllowed(cfg.baseUrl, ibApiHosts)) throw new ElefinError('bad_response', 'The Elefin API address is no longer approved.');
    const client = new ElefinClient({ baseUrl: cfg.baseUrl, token: decryptSecret(b.apiKey), ...opts.deps });

    // 1. The key.
    const me = await readMe(client);
    abilities = me.key.abilities;
    // The abilities list is only a hint; reading the list below is what proves access.

    // 2. The book. A book too big to keep per client is re-read in full once a day.
    const r = cfg.roster;
    const fullDue = !r.fullAt || started.getTime() - Date.parse(r.fullAt) >= ELEFIN_LIMITS.fullEveryMs;
    const since = r.syncStartedAt ? new Date(Date.parse(r.syncStartedAt) - ELEFIN_LIMITS.overlapMs).toISOString() : null;
    const book = r.clients === null && !fullDue && !opts.full
      ? null
      : await readBook(client, r.clients, { full: !!opts.full || fullDue, since });
    const now = new Date(clock());
    const fullAt = book?.full ? started.toISOString() : r.fullAt;
    const entries = book?.clients ?? r.clients ?? {};
    const size = Object.keys(entries).length;
    const snapshot = book
      ? snapshotOf(Object.values(entries), { now, fullAt, quietDays: ELEFIN_LIMITS.quietDays })
      : cfg.snapshot;
    const keep = size <= ELEFIN_LIMITS.rosterMax;

    // 3. Traders already matched follow the book.
    const partner = { id: b.partnerId, name: firstName(b.partner.user.name) };
    const fromBook = book ? await applyRoster(partner, entries, book.full, book.changed, now) : { gone: new Set<string>(), verified: 0, unverified: 0 };

    // 4. Lookups by email.
    let verified = fromBook.verified, unverified = fromBook.unverified, lookups = 0, lookupFailed = 0, rateLimited = false;
    const due = await lookupCandidates(b.partnerId, now, opts.lookups ?? ELEFIN_LIMITS.lookupsPerRun, fromBook.gone);
    if (due.length) {
      const people = await prisma.user.findMany({ where: { id: { in: due.map(d => d.userId) } }, select: { id: true } });
      const exists = new Set(people.map(p => p.id));
      for (const d of due) {
        if (!exists.has(d.userId)) continue;
        if (lookups > 0) await client.sleep(ELEFIN_LIMITS.lookupGapMs);
        lookups++;
        try {
          const fact = await lookupEmail(client, d.email);
          const ch = await applyFact({ userId: d.userId, partnerId: b.partnerId, partnerName: partner.name, email: d.email }, fact, new Date(clock()));
          if (ch === 'verified') verified++; else if (ch === 'unverified') unverified++;
        } catch (err) {
          if (!(err instanceof ElefinError)) throw err;
          if (err.kind === 'auth' || err.kind === 'forbidden') throw err;
          if (err.kind === 'rate_limited') { rateLimited = true; break; }
          lookupFailed++; // one bad answer doesn't stop the rest; this trader is asked again next run
        }
      }
    }

    // 5. Save. Only aggregates and per-client tuples; never a name or an email.
    const done = new Date(clock());
    const patch: Partial<ElefinConfig> = {
      key: me.key, lastSuccessAt: done.toISOString(), authFailures: 0, pausedAt: null, snapshot,
      ...(book ? { roster: { syncStartedAt: started.toISOString(), fullAt, clients: keep ? entries : null } } : {}),
      ...(lookups ? { lastLookupAt: done.toISOString() } : {}),
    };
    await patchConfig(b.id, patch, { status: 'OK', lastSyncAt: done, lastError: null, accountCount: snapshot?.total ?? me.clients ?? 0 });
    const clients = snapshot?.total ?? me.clients ?? null;
    await prisma.brokerEvent.create({
      data: {
        partnerBrokerId: b.id, kind: 'elefin_sync', status: 'ok',
        payload: {
          full: !!book?.full, clients, changed: book?.changed.size ?? 0, skippedRows: book?.skippedRows ?? 0, lookups, lookupFailed, rateLimited,
          verified, unverified, requests: client.requests, ms: done.getTime() - started.getTime(),
        } as Prisma.InputJsonValue,
      },
    });
    await prisma.brokerEvent.deleteMany({ where: { partnerBrokerId: b.id, kind: 'elefin_sync', status: 'ok', createdAt: { lt: new Date(done.getTime() - KEEP_OK_EVENTS_MS) } } });
    if (cfg.pausedAt) await logEvent({ kind: 'ib.elefin_resumed', partnerId: b.partnerId, actor, message: 'Elefin sync resumed' });
    if (book?.skippedRows) logger.warn('[elefin] client rows not in the documented shape were skipped', { brokerId: b.id, rows: book.skippedRows });
    return { ok: true, full: !!book?.full, clients, changed: book?.changed.size ?? 0, lookups, verified, unverified, error: null };
  } catch (err) {
    return await recordFailure(b.id, b.partnerId, cfg, err, actor, abilities);
  } finally {
    inflight.delete(brokerId);
  }
}

async function recordFailure(id: string, partnerId: string, cfg: ElefinConfig, err: unknown, actor: Actor, abilities: string[] | null = null): Promise<ElefinSyncResultDto> {
  const e = err instanceof ElefinError ? err : null;
  if (!e) logger.warn('[elefin] sync failed', { id, err });
  const now = new Date();
  let msg: string;
  let patch: Partial<ElefinConfig> = {};
  let paused = false;
  if (e && (e.kind === 'auth' || e.kind === 'forbidden')) {
    const failures = cfg.authFailures + 1;
    paused = failures >= ELEFIN_LIMITS.authFailuresToPause;
    patch = { authFailures: failures, pausedAt: paused ? now.toISOString() : cfg.pausedAt };
    msg = paused
      ? 'Elefin stopped accepting your key, so syncing is paused. Add your key again to resume.'
      : e.kind === 'auth' ? 'Elefin didn’t accept your key. We’ll retry; after 3 failures syncing pauses.' : `${e.message} We’ll retry; after 3 failures syncing pauses.`;
  } else if (e?.kind === 'rate_limited') {
    msg = 'Elefin asked us to slow down. We’ll try again on the next sync.';
  } else {
    msg = e?.message ?? 'Sync failed. We’ll try again on the next sync.';
  }
  try {
    const prev = await prisma.partnerBroker.findUnique({ where: { id }, select: { status: true } });
    await patchConfig(id, patch, { status: 'ERROR', lastError: msg.slice(0, 300), lastSyncAt: now });
    await prisma.brokerEvent.create({ data: { partnerBrokerId: id, kind: 'elefin_sync', payload: { kind: e?.kind ?? 'error', status: e?.status ?? null, path: e?.path ?? null, abilities: abilities?.slice(0, 40) ?? null }, status: 'error', error: msg.slice(0, 300) } });
    if (paused && !cfg.pausedAt) await logEvent({ kind: 'ib.elefin_paused', partnerId, actor, message: 'Elefin sync paused: the key was refused 3 times in a row' });
    else if (prev?.status !== 'ERROR') await logEvent({ kind: 'ib.sync_failed', partnerId, actor, message: `Elefin API sync failed: ${msg}` });
  } catch (dbErr) {
    logger.warn('[elefin] could not record a failed sync', { id, err: dbErr });
  }
  return { ...none(undefined, msg) };
}

let tickRunning = false;

/** Scheduler pass: every connected, un-paused Elefin partner whose last sync is due, one at a time. */
export async function syncDueElefin(now = Date.now(), deps?: SyncDeps): Promise<number> {
  if (tickRunning) return 0;
  tickRunning = true;
  try {
    const rows = await prisma.partnerBroker.findMany({
      where: { broker: 'elefin', method: 'API', apiKey: { not: null }, partner: { status: 'ACTIVE' } },
      select: { id: true, apiConfig: true, lastSyncAt: true },
    });
    const due = rows
      .filter(r => { const c = elefinConfigOf(r); return !!c && !c.pausedAt && (!r.lastSyncAt || r.lastSyncAt.getTime() <= now - ELEFIN_LIMITS.syncEveryMs); })
      .sort((a, b) => (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0))
      .slice(0, ELEFIN_LIMITS.perTick);
    for (const r of due) await syncElefin(r.id, { deps });
    if (due.length) logger.info('[elefin] scheduled sync', { partners: due.length });
    return due.length;
  } finally {
    tickRunning = false;
  }
}
