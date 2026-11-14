// The partner's Elefin connection: connect (probe → save → first sync), status, test,
// sync now, disconnect; and the admin overview. The key is encrypted at rest, never
// returned and never logged.
import { prisma, Prisma } from '@tradinjournal/db';
import type {
  AdminElefinRowDto, ElefinConnectInput, ElefinConnectResultDto, ElefinConnectionDto, ElefinProbeDto, ElefinSyncResultDto, ElefinTestInput,
  ElefinVerificationDto,
} from '@tradinjournal/contracts';
import { registerSecret } from '@tradinjournal/logger';
import { AppError, ConflictError } from '../../../../http/errors.js';
import { decryptSecret, encryptSecret } from '../../../../lib/secrets.js';
import { getProgramSettings } from '../settings.js';
import { logEvent } from '../events.js';
import { baseUrlAllowed, defaultBaseUrl, ELEFIN_LIMITS, outboundIps } from './config.js';
import { ElefinClient } from './client.js';
import { probe } from './probe.js';
import { isSyncing, syncElefin, type SyncDeps } from './sync.js';
import { elefinConfigOf, isElefinConnected, newConfig, patchConfig, type ElefinConfig } from './store.js';
import { clientIdOfRef, ELEFIN_BROKER, HELD_SIGNALS } from './verify.js';

type Actor = { id: string; email: string } | null;

const findRow = (partnerId: string) => prisma.partnerBroker.findUnique({ where: { partnerId_broker: { partnerId, broker: ELEFIN_BROKER } } });

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

/** Waits for a promise up to `ms`; null if it isn't done (it keeps running). */
async function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>(r => { t = setTimeout(() => r(null), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(t); }
}

// ── Status ──────────────────────────────────────────────────────────────────

/** Referred traders and where their Elefin email check stands. */
async function verification(partnerId: string, cfg: ElefinConfig | null): Promise<ElefinVerificationDto> {
  const [referred, rows] = await Promise.all([
    prisma.referral.count({ where: { partnerId } }),
    prisma.clientVerification.findMany({
      where: { partnerId, broker: ELEFIN_BROKER, brokerAccountId: null, externalAccountId: null },
      select: { status: true, signal: true, ibAccountId: true, checkedAt: true },
    }),
  ]);
  const verified = rows.filter(r => r.status === 'VERIFIED');
  const held = rows.filter(r => r.status !== 'VERIFIED' && HELD_SIGNALS.includes(r.signal as never)).length;
  const notFound = rows.filter(r => r.status !== 'VERIFIED' && !HELD_SIGNALS.includes(r.signal as never)).length;
  const book = cfg?.roster.clients ?? null;
  const last = rows.reduce<Date | null>((d, r) => (r.checkedAt && (!d || r.checkedAt > d) ? r.checkedAt : d), null);
  return {
    referred, verified: verified.length, held, notFound, waiting: Math.max(0, referred - rows.length),
    verifiedFunded: book ? verified.filter(r => { const id = clientIdOfRef(r.ibAccountId); return !!id && book[id]?.[3] === 1; }).length : 0,
    lastCheckAt: last?.toISOString() ?? null,
  };
}

function eventMessage(e: { status: string; error: string | null; payload: unknown }): string {
  if (e.status !== 'ok') return e.error ?? 'Sync failed';
  const p = (e.payload ?? {}) as { clients?: number | null; changed?: number; full?: boolean; lookups?: number; verified?: number; unverified?: number };
  const parts = [`${(p.clients ?? 0).toLocaleString('en-US')} clients`];
  if (!p.full && p.changed) parts.push(`${p.changed} changed`);
  if (p.full) parts.push('full read');
  if (p.lookups) parts.push(`${p.lookups} checked`);
  if (p.verified) parts.push(`+${p.verified} verified`);
  if (p.unverified) parts.push(`−${p.unverified} verified`);
  return parts.join(' · ');
}

const stateOf = (b: { id: string; status: string }, cfg: ElefinConfig): ElefinConnectionDto['state'] =>
  isSyncing(b.id) || (b.status === 'PENDING' && !cfg.lastSuccessAt) ? 'SYNCING' : cfg.pausedAt ? 'PAUSED' : b.status === 'ERROR' ? 'ERROR' : 'OK';

export async function connectionStatus(partnerId: string): Promise<ElefinConnectionDto> {
  const b = await findRow(partnerId);
  const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
  const base = { defaultBaseUrl: defaultBaseUrl(), syncEveryMinutes: ELEFIN_LIMITS.syncEveryMs / 60_000, outboundIps: outboundIps() };
  const ver = await verification(partnerId, cfg);
  if (!b || !cfg) {
    return {
      ...base, state: 'NOT_CONNECTED', brokerId: b?.id ?? null, keyHint: null, baseUrl: defaultBaseUrl(), connectedAt: null,
      lastSyncAt: b?.lastSyncAt?.toISOString() ?? null, lastSuccessAt: null, nextSyncAt: null, lastError: null, pausedAt: null,
      key: null, roster: null, verification: ver, canSyncAt: null, events: [],
    };
  }
  const events = await prisma.brokerEvent.findMany({ where: { partnerBrokerId: b.id, kind: 'elefin_sync' }, orderBy: { createdAt: 'desc' }, take: 8 });
  const canSync = cfg.manualSyncAt ? new Date(cfg.manualSyncAt).getTime() + ELEFIN_LIMITS.manualSyncGapMs : 0;
  return {
    ...base, state: stateOf(b, cfg), brokerId: b.id, keyHint: cfg.keyHint, baseUrl: cfg.baseUrl, connectedAt: cfg.connectedAt,
    lastSyncAt: b.lastSyncAt?.toISOString() ?? null, lastSuccessAt: cfg.lastSuccessAt,
    nextSyncAt: cfg.pausedAt || !b.lastSyncAt ? null : new Date(b.lastSyncAt.getTime() + ELEFIN_LIMITS.syncEveryMs).toISOString(),
    lastError: b.status === 'ERROR' ? b.lastError : null, pausedAt: cfg.pausedAt, key: cfg.key, roster: cfg.snapshot, verification: ver,
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
  return probe(new ElefinClient({ baseUrl: base, token, ...deps }));
}

/**
 * Probes the key; when it can read the partner's clients, saves it (encrypted) on the
 * partner's Elefin connection and starts the first sync. A failed probe saves nothing.
 */
export async function connect(partnerId: string, input: ElefinConnectInput, actor: Actor, opts: { deps?: SyncDeps; waitMs?: number } = {}): Promise<ElefinConnectResultDto> {
  const token = input.key.trim();
  registerSecret(token);
  const baseUrl = await resolveBaseUrl(input.baseUrl);
  limitTests(partnerId);
  const result = await probe(new ElefinClient({ baseUrl, token, ...opts.deps }));
  if (!result.ok) return { probe: result, connection: await connectionStatus(partnerId), sync: null };

  const prev = await findRow(partnerId);
  const cfg = newConfig(baseUrl, token, result.key);
  const partnerRef = result.key?.partnerId != null ? String(result.key.partnerId) : null;
  const data = {
    method: 'API' as const, apiKey: encryptSecret(token), apiConfig: cfg as unknown as Prisma.InputJsonValue,
    status: 'PENDING' as const, lastError: null,
  };
  const row = prev
    ? await prisma.partnerBroker.update({ where: { id: prev.id }, data: { ...data, ibId: prev.ibId ?? partnerRef } })
    : await prisma.partnerBroker.create({ data: { partnerId, broker: ELEFIN_BROKER, ibId: partnerRef, ...data } });
  const replaced = isElefinConnected(prev);
  await logEvent({
    kind: replaced ? 'ib.elefin_key_replaced' : 'ib.elefin_connect', partnerId, actor,
    message: `Elefin partner API ${replaced ? 'key replaced' : 'connected'} (key ${cfg.keyHint}${partnerRef ? `, Elefin partner #${partnerRef}` : ''})`,
    detail: { clients: result.clients, abilities: result.key?.abilities ?? [], expiresAt: result.key?.expiresAt ?? null },
  });
  const sync = await within(syncElefin(row.id, { actor, full: true, deps: opts.deps }), opts.waitMs ?? 8_000);
  return { probe: result, connection: await connectionStatus(partnerId), sync };
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
  await patchConfig(b.id, { manualSyncAt: new Date().toISOString() });
  const result = await within(syncElefin(b.id, { actor, deps: opts.deps }), opts.waitMs ?? 8_000);
  return { result, connection: await connectionStatus(partnerId) };
}

/**
 * Wipes the key and the cached book. Traders verified through Elefin stay verified (as
 * with a list that stops updating) until the partner connects again and they're re-checked.
 */
export async function disconnect(partnerId: string, actor: Actor): Promise<ElefinConnectionDto> {
  const b = await findRow(partnerId);
  if (b && (b.apiKey || elefinConfigOf(b))) {
    // What's left is whatever list the partner uploaded themselves (the API never writes one).
    const listed = await prisma.ibAccount.count({ where: { partnerBrokerId: b.id, removedAt: null } });
    await prisma.partnerBroker.update({
      where: { id: b.id },
      data: { method: 'LIST', apiKey: null, apiConfig: Prisma.DbNull, status: listed ? 'OK' : 'PENDING', lastError: null, accountCount: listed },
    });
    await logEvent({ kind: 'ib.elefin_disconnect', partnerId, actor, message: 'Elefin partner API disconnected; the key and the cached client numbers are deleted' });
  }
  return connectionStatus(partnerId);
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function adminConnections(): Promise<AdminElefinRowDto[]> {
  const partners = await prisma.partner.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    include: { user: { select: { name: true, email: true } }, ibBrokers: { where: { broker: ELEFIN_BROKER } } },
    orderBy: { createdAt: 'asc' },
  });
  const ids = partners.map(p => p.id);
  const [refs, ver] = await Promise.all([
    prisma.referral.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids } }, _count: { _all: true } }),
    prisma.clientVerification.groupBy({ by: ['partnerId'], where: { partnerId: { in: ids }, broker: ELEFIN_BROKER, brokerAccountId: null, externalAccountId: null, status: 'VERIFIED' }, _count: { _all: true } }),
  ]);
  return partners.map(p => {
    const b = p.ibBrokers[0] ?? null;
    const cfg = isElefinConnected(b) ? elefinConfigOf(b) : null;
    return {
      partnerId: p.id, partnerName: p.user.name, partnerEmail: p.user.email, partnerStatus: p.status,
      state: !b || !cfg ? 'NOT_CONNECTED' : stateOf(b, cfg),
      keyHint: cfg?.keyHint ?? null, elefinPartner: cfg?.key?.partnerName ?? null, keyExpiresAt: cfg?.key?.expiresAt ?? null,
      connectedAt: cfg?.connectedAt ?? null, lastSyncAt: b?.lastSyncAt?.toISOString() ?? null,
      lastError: b?.status === 'ERROR' ? b.lastError : null,
      clients: cfg?.snapshot?.total ?? null, funded: cfg?.snapshot?.funded ?? null,
      referred: refs.find(r => r.partnerId === p.id)?._count._all ?? 0,
      verified: ver.find(v => v.partnerId === p.id)?._count._all ?? 0,
    };
  });
}

/** Admin "Sync now": no spacing, re-reads the whole book, and also tries a paused connection once. */
export async function adminSync(partnerId: string, actor: Actor, opts: { deps?: SyncDeps; waitMs?: number } = {}) {
  const b = await findRow(partnerId);
  if (!b || !isElefinConnected(b)) throw new ConflictError('This partner hasn’t connected an Elefin key.');
  const result = await within(syncElefin(b.id, { actor, force: true, full: true, deps: opts.deps }), opts.waitMs ?? 15_000);
  return { result, connection: await connectionStatus(partnerId) };
}
