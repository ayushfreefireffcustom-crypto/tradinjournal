// Pulls a partner's clients and MT5 accounts from Elefin, keeps the IbAccount list in
// step (added / changed / removed), then re-runs the existing verification so referred
// traders whose Elefin login is listed get VERIFIED (and lose it when it disappears).
import { prisma, type Prisma } from '@tradinjournal/db';
import type { ElefinSyncResultDto } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { decryptSecret } from '../../../../lib/secrets.js';
import { applyRows, recheckLogin, recheckPartner } from '../ib.service.js';
import { recomputePartner, recomputeUser } from '../access.service.js';
import { getProgramSettings } from '../settings.js';
import { logEvent } from '../events.js';
import type { IbRow } from '../ib.logic.js';
import { baseUrlAllowed, ELEFIN_LIMITS } from './config.js';
import { ElefinClient, ElefinError } from './client.js';
import { toAccount, toClient, type ElefinAccount } from './fields.js';
import { elefinConfigOf, type ElefinConfig } from './store.js';

type Actor = { id: string; email: string } | null;
export interface SyncDeps { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }

const inflight = new Set<string>();
export const isSyncing = (brokerId: string): boolean => inflight.has(brokerId);

/** Above this many changed logins a full partner re-check is cheaper than one per login. */
const PER_LOGIN_RECHECK_MAX = 200;
const KEEP_OK_EVENTS_MS = 30 * 86_400_000;

const saveConfig = (id: string, cfg: ElefinConfig, extra: Prisma.PartnerBrokerUpdateInput = {}) =>
  prisma.partnerBroker.update({ where: { id }, data: { apiConfig: cfg as unknown as Prisma.InputJsonValue, ...extra } });

/** Keeps the most informative value per field when a login shows up twice (client row + account row). */
function merge(into: Map<string, ElefinAccount>, a: ElefinAccount): void {
  const prev = into.get(a.login);
  if (!prev) { into.set(a.login, a); return; }
  into.set(a.login, {
    login: a.login, clientId: a.clientId ?? prev.clientId, email: a.email ?? prev.email, platform: a.platform ?? prev.platform,
    depositTotal: a.depositTotal ?? prev.depositTotal, lotsTotal: a.lotsTotal ?? prev.lotsTotal, lastTradeAt: a.lastTradeAt ?? prev.lastTradeAt,
  });
}

/** Reads every client and account page the key can see. */
export async function fetchElefinAccounts(client: ElefinClient, cfg: ElefinConfig): Promise<{ accounts: Map<string, ElefinAccount>; clients: number | null; skipped: number }> {
  const byLogin = new Map<string, ElefinAccount>();
  const emailByClient = new Map<string, string>();
  let clients: number | null = null, skipped = 0;
  if (cfg.paths.clients && cfg.abilities.clients === 'ok') {
    clients = 0;
    for await (const page of client.pages(cfg.paths.clients)) {
      for (const item of page.items) {
        const c = toClient(item);
        if (!c) continue;
        clients++;
        if (c.id && c.email) emailByClient.set(c.id, c.email);
        for (const a of c.accounts) merge(byLogin, a);
      }
    }
  }
  if (cfg.paths.accounts && cfg.abilities.accounts === 'ok') {
    for await (const page of client.pages(cfg.paths.accounts)) {
      for (const item of page.items) {
        const a = toAccount(item);
        if (!a) { skipped++; continue; }
        if (!a.email && a.clientId) a.email = emailByClient.get(a.clientId) ?? null;
        merge(byLogin, a);
      }
    }
  }
  return { accounts: byLogin, clients, skipped };
}

const sameNum = (a: number | null, b: number | null | undefined) => (a == null ? true : b != null && Math.abs(a - b) < 1e-6);
const sameDate = (a: Date | null, b: Date | null | undefined) => (a == null ? true : !!b && a.getTime() === b.getTime());

/**
 * One sync. Never throws: failures are written on the connection (and pause it after
 * repeated 401/403). `force` (admin) also runs a paused connection; success un-pauses it.
 */
export async function syncElefin(brokerId: string, opts: { actor?: Actor; force?: boolean; deps?: SyncDeps } = {}): Promise<ElefinSyncResultDto> {
  const none = (skipped: ElefinSyncResultDto['skipped'], error: string | null = null): ElefinSyncResultDto =>
    ({ ok: false, skipped, accounts: 0, added: 0, removed: 0, changed: 0, rechecked: 0, error });
  if (inflight.has(brokerId)) return none('busy');
  const b = await prisma.partnerBroker.findUnique({ where: { id: brokerId } });
  const cfg = elefinConfigOf(b);
  if (!b || !cfg || b.method !== 'API' || !b.apiKey) return none('not_connected');
  if (cfg.pausedAt && !opts.force) return none('paused', 'Syncing is paused until the key is added again.');
  inflight.add(brokerId);
  const started = Date.now();
  const actor = opts.actor ?? null;
  try {
    const { ibApiHosts } = await getProgramSettings();
    if (!baseUrlAllowed(cfg.baseUrl, ibApiHosts)) throw new ElefinError('bad_response', 'The Elefin API address is no longer approved.');
    const client = new ElefinClient({ baseUrl: cfg.baseUrl, token: decryptSecret(b.apiKey), ...opts.deps });
    const { accounts, clients, skipped } = await fetchElefinAccounts(client, cfg);
    const now = new Date();

    const existing = await prisma.ibAccount.findMany({ where: { partnerBrokerId: b.id } });
    const byId = new Map(existing.map(e => [e.accountId, e]));
    const activeBefore = existing.filter(e => !e.removedAt);
    const removed = activeBefore.filter(e => !accounts.has(e.accountId)).map(e => e.accountId);
    const added: string[] = [], emailChanged: string[] = [];
    for (const a of accounts.values()) {
      const e = byId.get(a.login);
      if (!e || e.removedAt) added.push(a.login);
      else if (a.email && a.email !== e.email) emailChanged.push(a.login);
    }

    // Most of the list vanishing at once is more likely a key or scope change at Elefin
    // than real churn: keep the list until a second sync says the same.
    if (activeBefore.length >= 5 && removed.length > activeBefore.length / 2) {
      if (!cfg.dropGuard) {
        const msg = `Elefin returned ${accounts.size} accounts, down from ${activeBefore.length}. We kept your list and will check again on the next sync.`;
        await saveConfig(b.id, { ...cfg, dropGuard: { count: accounts.size, at: now.toISOString() } }, { status: 'ERROR', lastError: msg, lastSyncAt: now });
        await prisma.brokerEvent.create({ data: { partnerBrokerId: b.id, kind: 'elefin_sync', payload: { accounts: accounts.size, before: activeBefore.length, held: true }, status: 'error', error: msg } });
        await logEvent({ kind: 'ib.elefin_drop_held', partnerId: b.partnerId, actor, message: msg });
        return { ...none(undefined, msg), accounts: accounts.size };
      }
    }

    const changedLogins = [...new Set([...added, ...removed, ...emailChanged])];
    const rows: IbRow[] = [...accounts.values()].map(a => ({ accountId: a.login, email: a.email }));
    if (changedLogins.length || !cfg.lastSuccessAt) {
      await applyRows(b, rows, 'replace', skipped, 'synced from the Elefin API', actor);
    } else {
      // Nothing joined or left: just mark the list as fresh (no audit line every 20 minutes).
      await prisma.ibAccount.updateMany({ where: { partnerBrokerId: b.id, removedAt: null }, data: { lastSeenAt: now } });
      await prisma.partnerBroker.update({ where: { id: b.id }, data: { status: 'OK', lastSyncAt: now, lastError: null, accountCount: accounts.size } });
    }

    // Activity Elefin reports (deposits, lots, last trade, platform), only where it changed.
    const fresh = new Map((await prisma.ibAccount.findMany({ where: { partnerBrokerId: b.id, removedAt: null } })).map(e => [e.accountId, e]));
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    for (const a of accounts.values()) {
      const e = fresh.get(a.login);
      if (!e) continue;
      if (sameNum(a.depositTotal, e.depositTotal) && sameNum(a.lotsTotal, e.lotsTotal) && sameDate(a.lastTradeAt, e.lastTradeAt) && (a.platform == null || a.platform === e.platform)) continue;
      updates.push(prisma.ibAccount.update({
        where: { id: e.id },
        data: {
          reportedAt: now,
          ...(a.depositTotal != null ? { depositTotal: a.depositTotal } : {}), ...(a.lotsTotal != null ? { lotsTotal: a.lotsTotal } : {}),
          ...(a.lastTradeAt ? { lastTradeAt: a.lastTradeAt } : {}), ...(a.platform ? { platform: a.platform } : {}),
        },
      }));
    }
    for (let i = 0; i < updates.length; i += 100) await prisma.$transaction(updates.slice(i, i + 100));

    const firstSync = !cfg.lastSuccessAt;
    await saveConfig(b.id, {
      ...cfg, lastSuccessAt: now.toISOString(), authFailures: 0, pausedAt: null, dropGuard: null,
      counts: { clients, accounts: accounts.size },
    });
    await prisma.brokerEvent.create({
      data: {
        partnerBrokerId: b.id, kind: 'elefin_sync', status: 'ok',
        payload: { clients, accounts: accounts.size, added: added.length, removed: removed.length, changed: emailChanged.length, requests: client.requests, ms: Date.now() - started },
      },
    });
    await prisma.brokerEvent.deleteMany({ where: { partnerBrokerId: b.id, kind: 'elefin_sync', status: 'ok', createdAt: { lt: new Date(now.getTime() - KEEP_OK_EVENTS_MS) } } });
    if (cfg.pausedAt) await logEvent({ kind: 'ib.elefin_resumed', partnerId: b.partnerId, actor, message: 'Elefin sync resumed' });

    // Verification, then access, through the existing rules.
    let rechecked = 0;
    if (firstSync || changedLogins.length > PER_LOGIN_RECHECK_MAX) {
      rechecked = await recheckPartner(b.partnerId, 'elefin');
      await recomputePartner(b.partnerId);
    } else if (changedLogins.length) {
      const touched = new Set<string>();
      for (const login of changedLogins) for (const u of await recheckLogin(b.partnerId, login)) touched.add(u);
      for (const u of touched) await recomputeUser(u);
      rechecked = touched.size;
    }
    return { ok: true, accounts: accounts.size, added: added.length, removed: removed.length, changed: emailChanged.length, rechecked, error: null };
  } catch (err) {
    return await recordFailure(b.id, b.partnerId, cfg, err, actor);
  } finally {
    inflight.delete(brokerId);
  }
}

async function recordFailure(id: string, partnerId: string, cfg: ElefinConfig, err: unknown, actor: Actor): Promise<ElefinSyncResultDto> {
  const e = err instanceof ElefinError ? err : null;
  if (!e) logger.warn('[elefin] sync failed', { id, err });
  const now = new Date();
  let msg: string;
  let next: ElefinConfig = cfg;
  let paused = false;
  if (e && (e.kind === 'auth' || e.kind === 'forbidden')) {
    const failures = cfg.authFailures + 1;
    paused = failures >= ELEFIN_LIMITS.authFailuresToPause;
    next = { ...cfg, authFailures: failures, pausedAt: paused ? now.toISOString() : cfg.pausedAt };
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
    await saveConfig(id, next, { status: 'ERROR', lastError: msg.slice(0, 300), lastSyncAt: now });
    await prisma.brokerEvent.create({ data: { partnerBrokerId: id, kind: 'elefin_sync', payload: { kind: e?.kind ?? 'error', status: e?.status ?? null }, status: 'error', error: msg.slice(0, 300) } });
    if (paused && !cfg.pausedAt) await logEvent({ kind: 'ib.elefin_paused', partnerId, actor, message: 'Elefin sync paused: the key was refused 3 times in a row' });
    else if (prev?.status !== 'ERROR') await logEvent({ kind: 'ib.sync_failed', partnerId, actor, message: `Elefin API sync failed: ${msg}` });
  } catch (dbErr) {
    logger.warn('[elefin] could not record a failed sync', { id, err: dbErr });
  }
  return { ok: false, accounts: 0, added: 0, removed: 0, changed: 0, rechecked: 0, error: msg };
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
