// The partner's Elefin connection: connect (probe → save → first sync), status, test,
// sync now, disconnect; and the admin overview. The key is encrypted at rest, never
// returned and never logged.
import { prisma, Prisma } from '@tradinjournal/db';
import type {
  AdminElefinRowDto, ElefinConnectInput, ElefinConnectResultDto, ElefinConnectionDto, ElefinProbeDto, ElefinSyncResultDto, ElefinTestInput,
} from '@tradinjournal/contracts';
import { registerSecret } from '@tradinjournal/logger';
import { AppError, ConflictError } from '../../../../http/errors.js';
import { decryptSecret, encryptSecret } from '../../../../lib/secrets.js';
import { getProgramSettings } from '../settings.js';
import { logEvent } from '../events.js';
import { baseUrlAllowed, defaultBaseUrl, ELEFIN_LIMITS, outboundIps } from './config.js';
import { ElefinClient } from './client.js';
import { probe, type ProbeResult } from './probe.js';
import { isSyncing, syncElefin, type SyncDeps } from './sync.js';
import { elefinConfigOf, isElefinConnected, keyHint, type ElefinConfig } from './store.js';

type Actor = { id: string; email: string } | null;
const BROKER = 'elefin';

const findRow = (partnerId: string) => prisma.partnerBroker.findUnique({ where: { partnerId_broker: { partnerId, broker: BROKER } } });

// "Test connection" and connect both call Elefin with the partner's key: a few a minute is plenty.
const testLog = new Map<string, number[]>();
const TEST_MAX = 6, TEST_WINDOW_MS = 5 * 60_000;
function limitTests(partnerId: string, now = Date.now()): void {
  const win = (testLog.get(partnerId) ?? []).filter(t => t > now - TEST_WINDOW_MS);
  if (win.length >= TEST_MAX) {
    const wait = Math.ceil((win[0]! + TEST_WINDOW_MS - now) / 1000);
    throw new AppError(429, 'ELEFIN_TEST_LIMIT', `That’s a lot of tests in a row. Try again in ${wait} seconds.`);
  }
  win.push(now);
  testLog.set(partnerId, win);
}
export function resetElefinTestLimits(): void { testLog.clear(); }

async function resolveBaseUrl(raw: string | undefined): Promise<string> {
  const base = (raw?.trim() || defaultBaseUrl()).replace(/\/+$/, '');
  const { ibApiHosts } = await getProgramSettings();
  if (!baseUrlAllowed(base, ibApiHosts)) {
    throw new AppError(422, 'ELEFIN_HOST', 'That isn’t an Elefin API address we can use. Leave it blank for Elefin’s default, or ask TRADElogs to approve the address.');
  }
  return base;
}

/** The probe without internal fields. */
const publicProbe = ({ paths: _p, partnerRef: _r, ...dto }: ProbeResult): ElefinProbeDto => dto;

/** Waits for a promise up to `ms`; null if it isn't done (it keeps running). */
async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>(r => { t = setTimeout(() => r(null), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(t); }
}

// ── Status ──────────────────────────────────────────────────────────────────

async function counts(partnerId: string) {
  const rows = await prisma.clientVerification.groupBy({ by: ['status'], where: { partnerId, broker: BROKER }, _count: { _all: true } });
  return {
    clientAccounts: rows.reduce((n, r) => n + r._count._all, 0),
    verified: rows.filter(r => r.status === 'VERIFIED').reduce((n, r) => n + r._count._all, 0),
  };
}

function eventMessage(e: { status: string; error: string | null; payload: unknown }): string {
  if (e.status !== 'ok') return e.error ?? 'Sync failed';
  const p = (e.payload ?? {}) as { accounts?: number; added?: number; removed?: number };
  const parts = [`${p.accounts ?? 0} accounts`];
  if (p.added) parts.push(`+${p.added}`);
  if (p.removed) parts.push(`−${p.removed}`);
  return parts.join(' · ');
}

export async function connectionStatus(partnerId: string): Promise<ElefinConnectionDto> {
  const [b, c] = await Promise.all([findRow(partnerId), counts(partnerId)]);
  const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
  const base = {
    defaultBaseUrl: defaultBaseUrl(), syncEveryMinutes: ELEFIN_LIMITS.syncEveryMs / 60_000, outboundIps: outboundIps(),
  };
  if (!b || !cfg) {
    return {
      ...base, state: 'NOT_CONNECTED', brokerId: b?.id ?? null, keyHint: null, baseUrl: defaultBaseUrl(), connectedAt: null,
      lastSyncAt: b?.lastSyncAt?.toISOString() ?? null, lastSuccessAt: null, nextSyncAt: null, lastError: null, pausedAt: null,
      abilities: null, fields: null, counts: { clients: null, accounts: b?.accountCount ?? 0, ...c }, canSyncAt: null, events: [],
    };
  }
  const events = await prisma.brokerEvent.findMany({ where: { partnerBrokerId: b.id, kind: 'elefin_sync' }, orderBy: { createdAt: 'desc' }, take: 8 });
  const state = isSyncing(b.id) || (b.status === 'PENDING' && !cfg.lastSuccessAt) ? 'SYNCING'
    : cfg.pausedAt ? 'PAUSED' : b.status === 'ERROR' ? 'ERROR' : 'OK';
  const canSync = cfg.manualSyncAt ? new Date(cfg.manualSyncAt).getTime() + ELEFIN_LIMITS.manualSyncGapMs : 0;
  return {
    ...base, state, brokerId: b.id, keyHint: cfg.keyHint, baseUrl: cfg.baseUrl, connectedAt: cfg.connectedAt,
    lastSyncAt: b.lastSyncAt?.toISOString() ?? null, lastSuccessAt: cfg.lastSuccessAt,
    nextSyncAt: cfg.pausedAt || !b.lastSyncAt ? null : new Date(b.lastSyncAt.getTime() + ELEFIN_LIMITS.syncEveryMs).toISOString(),
    lastError: b.status === 'ERROR' ? b.lastError : null, pausedAt: cfg.pausedAt, abilities: cfg.abilities, fields: cfg.fields,
    counts: { clients: cfg.counts.clients, accounts: b.accountCount, ...c },
    canSyncAt: canSync > Date.now() ? new Date(canSync).toISOString() : null,
    events: events.map(e => ({ at: e.createdAt.toISOString(), status: e.status, message: eventMessage(e) })),
  };
}

// ── Test / connect ──────────────────────────────────────────────────────────

/** Tests a pasted key (nothing saved) or, without one, the saved key. */
export async function testConnection(partnerId: string, input: ElefinTestInput, deps: SyncDeps = {}): Promise<ElefinProbeDto> {
  let token = input.key?.trim();
  let baseUrl = input.baseUrl;
  if (!token) {
    const b = await findRow(partnerId);
    const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
    if (!b || !cfg) throw new ConflictError('Paste your Elefin key first.');
    token = decryptSecret(b.apiKey!);
    baseUrl ??= cfg.baseUrl;
  }
  registerSecret(token);
  const base = await resolveBaseUrl(baseUrl);
  limitTests(partnerId);
  return publicProbe(await probe(new ElefinClient({ baseUrl: base, token, ...deps })));
}

/**
 * Probes the key; when it can read MT5 logins, saves it (encrypted) on the partner's
 * Elefin connection and starts the first sync. A failed probe saves nothing.
 */
export async function connect(partnerId: string, input: ElefinConnectInput, actor: Actor, opts: { deps?: SyncDeps; waitMs?: number } = {}): Promise<ElefinConnectResultDto> {
  const token = input.key.trim();
  registerSecret(token);
  const baseUrl = await resolveBaseUrl(input.baseUrl);
  limitTests(partnerId);
  const result = await probe(new ElefinClient({ baseUrl, token, ...opts.deps }));
  if (!result.ok) return { probe: publicProbe(result), connection: await connectionStatus(partnerId), sync: null };

  const prev = await findRow(partnerId);
  const cfg: ElefinConfig = {
    provider: 'elefin', baseUrl, keyHint: keyHint(token), connectedAt: new Date().toISOString(), paths: result.paths,
    abilities: result.abilities, fields: result.fields, counts: result.counts, partnerRef: result.partnerRef,
    lastSuccessAt: null, authFailures: 0, pausedAt: null, manualSyncAt: null, dropGuard: null,
  };
  const data = {
    method: 'API' as const, apiKey: encryptSecret(token), apiConfig: cfg as unknown as Prisma.InputJsonValue,
    status: 'PENDING' as const, lastError: null,
  };
  const row = prev
    ? await prisma.partnerBroker.update({ where: { id: prev.id }, data: { ...data, ibId: prev.ibId ?? result.partnerRef } })
    : await prisma.partnerBroker.create({ data: { partnerId, broker: BROKER, ibId: result.partnerRef, ...data } });
  const replaced = isElefinConnected(prev);
  await logEvent({
    kind: replaced ? 'ib.elefin_key_replaced' : 'ib.elefin_connect', partnerId, actor,
    message: `Elefin partner API ${replaced ? 'key replaced' : 'connected'} (key ${cfg.keyHint})`,
    detail: { clients: result.counts.clients, accounts: result.counts.accounts, abilities: result.abilities },
  });
  const sync = await within(syncElefin(row.id, { actor, deps: opts.deps }), opts.waitMs ?? 8_000);
  return { probe: publicProbe(result), connection: await connectionStatus(partnerId), sync };
}

// ── Sync now / disconnect ───────────────────────────────────────────────────

export async function syncNow(partnerId: string, actor: Actor, opts: { deps?: SyncDeps; waitMs?: number } = {}): Promise<{ result: ElefinSyncResultDto | null; connection: ElefinConnectionDto }> {
  const b = await findRow(partnerId);
  const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
  if (!b || !cfg) throw new ConflictError('Connect your Elefin key first.');
  if (cfg.pausedAt) throw new ConflictError('Syncing is paused because Elefin stopped accepting your key. Add your key again to resume.');
  const last = cfg.manualSyncAt ? new Date(cfg.manualSyncAt).getTime() : 0;
  const wait = last + ELEFIN_LIMITS.manualSyncGapMs - Date.now();
  if (wait > 0) throw new AppError(429, 'ELEFIN_SYNC_SOON', `You synced a moment ago. Try again in ${Math.ceil(wait / 1000)} seconds.`);
  if (isSyncing(b.id)) throw new ConflictError('A sync is already running. It usually takes under a minute.');
  await prisma.partnerBroker.update({ where: { id: b.id }, data: { apiConfig: { ...cfg, manualSyncAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue } });
  const result = await within(syncElefin(b.id, { actor, deps: opts.deps }), opts.waitMs ?? 8_000);
  return { result, connection: await connectionStatus(partnerId) };
}

/**
 * Wipes the key. The last synced list stays as an ordinary list (clients stay verified)
 * until the partner uploads a new one or connects again.
 */
export async function disconnect(partnerId: string, actor: Actor): Promise<ElefinConnectionDto> {
  const b = await findRow(partnerId);
  if (b && (b.apiKey || elefinConfigOf(b))) {
    await prisma.partnerBroker.update({
      where: { id: b.id },
      data: { method: 'LIST', apiKey: null, apiConfig: Prisma.DbNull, status: b.accountCount ? 'OK' : 'PENDING', lastError: null },
    });
    await logEvent({ kind: 'ib.elefin_disconnect', partnerId, actor, message: `Elefin partner API disconnected; the last list (${b.accountCount} accounts) stays until you upload a new one or reconnect` });
  }
  return connectionStatus(partnerId);
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function adminConnections(): Promise<AdminElefinRowDto[]> {
  const partners = await prisma.partner.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    include: { user: { select: { name: true, email: true } }, ibBrokers: { where: { broker: BROKER } } },
    orderBy: { createdAt: 'asc' },
  });
  const ver = await prisma.clientVerification.groupBy({ by: ['partnerId', 'status'], where: { broker: BROKER }, _count: { _all: true } });
  return partners.map(p => {
    const b = p.ibBrokers[0] ?? null;
    const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
    const mine = ver.filter(v => v.partnerId === p.id);
    const state: AdminElefinRowDto['state'] = !b || !cfg ? 'NOT_CONNECTED'
      : isSyncing(b.id) || (b.status === 'PENDING' && !cfg.lastSuccessAt) ? 'SYNCING' : cfg.pausedAt ? 'PAUSED' : b.status === 'ERROR' ? 'ERROR' : 'OK';
    return {
      partnerId: p.id, partnerName: p.user.name, partnerEmail: p.user.email, partnerStatus: p.status, state,
      keyHint: cfg?.keyHint ?? null, connectedAt: cfg?.connectedAt ?? null, lastSyncAt: b?.lastSyncAt?.toISOString() ?? null,
      lastError: b?.status === 'ERROR' ? b.lastError : null, accounts: b?.accountCount ?? 0,
      verified: mine.filter(v => v.status === 'VERIFIED').reduce((n, v) => n + v._count._all, 0),
      clientAccounts: mine.reduce((n, v) => n + v._count._all, 0),
    };
  });
}

/** Admin "Sync now": no spacing, and it also tries a paused connection once. */
export async function adminSync(partnerId: string, actor: Actor, opts: { deps?: SyncDeps; waitMs?: number } = {}) {
  const b = await findRow(partnerId);
  if (!b || !isElefinConnected(b)) throw new ConflictError('This partner hasn’t connected an Elefin key.');
  const result = await within(syncElefin(b.id, { actor, force: true, deps: opts.deps }), opts.waitMs ?? 15_000);
  return { result, connection: await connectionStatus(partnerId) };
}
