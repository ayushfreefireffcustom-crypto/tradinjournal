// IB connections, referred-accounts lists and client verification.
import { prisma, type Prisma } from '@tradinjournal/db';
import type {
  IbListUploadInput, IbUploadResultDto, PartnerBrokerDto, PartnerBrokerUpsertInput, VerificationStatusDto,
} from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { encryptSecret } from '../../../lib/secrets.js';
import { API_ADAPTERS, brokerKeyFor, brokerLabel, isKnownBroker } from './brokers.js';
import { decideVerification, parseIbList, type IbRow } from './ib.logic.js';
import { fetchSheet, sheetCsvUrl, SourceError } from './sources.js';
import { logEvent } from './events.js';

const SHEET_EVERY_MS = 60 * 60_000;

type Actor = { id: string; email: string } | null;
type PartnerLite = { id: string; user: { name: string } };

// ── Connections ───────────────────────────────────────────────────────────────

type BrokerRow = Prisma.PartnerBrokerGetPayload<object>;

function toDto(b: BrokerRow, counts?: { clientAccounts: number; verified: number }): PartnerBrokerDto {
  return {
    id: b.id, broker: b.broker, label: brokerLabel(b.broker), ibId: b.ibId, method: b.method, sheetUrl: b.sheetUrl,
    hasApiKey: !!b.apiKey, serverMatch: b.serverMatch, status: b.status, lastSyncAt: b.lastSyncAt?.toISOString() ?? null,
    lastError: b.lastError, accountCount: b.accountCount, clientAccounts: counts?.clientAccounts ?? 0, verified: counts?.verified ?? 0,
  };
}

export async function listBrokers(partnerId: string): Promise<PartnerBrokerDto[]> {
  const [rows, counts] = await Promise.all([
    prisma.partnerBroker.findMany({ where: { partnerId }, orderBy: { createdAt: 'asc' } }),
    prisma.clientVerification.groupBy({ by: ['broker', 'status'], where: { partnerId }, _count: { _all: true } }),
  ]);
  return rows.map(b => {
    const mine = counts.filter(c => c.broker === b.broker);
    return toDto(b, {
      clientAccounts: mine.reduce((n, c) => n + c._count._all, 0),
      verified: mine.filter(c => c.status === 'VERIFIED').reduce((n, c) => n + c._count._all, 0),
    });
  });
}

export async function upsertBroker(partner: PartnerLite, input: PartnerBrokerUpsertInput, actor: Actor = null): Promise<PartnerBrokerDto> {
  const broker = input.broker.toLowerCase();
  if (!isKnownBroker(broker)) throw new ValidationError('Pick a broker from the list (or “Other broker”).');
  if (broker === 'other' && !input.serverMatch) throw new ValidationError('For another broker, enter text its MT5 server name contains, e.g. “AcmeFX-Live”.');
  if (input.method === 'SHEET' && (!input.sheetUrl || !sheetCsvUrl(input.sheetUrl))) throw new ValidationError('Paste a Google Sheets link (docs.google.com) that anyone with the link can view.');
  if (input.method === 'API' && !API_ADAPTERS.has(broker)) {
    throw new AppError(422, 'IB_API_UNSUPPORTED', `We can’t connect to ${brokerLabel(broker)}’s IB API yet. Upload your client list or link a Google Sheet instead.`);
  }
  const data = {
    ibId: input.ibId || null, method: input.method, sheetUrl: input.method === 'SHEET' ? input.sheetUrl! : null,
    serverMatch: broker === 'other' ? input.serverMatch! : null,
    ...(input.apiKey ? { apiKey: encryptSecret(input.apiKey) } : {}),
  };
  const row = await prisma.partnerBroker.upsert({
    where: { partnerId_broker: { partnerId: partner.id, broker } },
    create: { partnerId: partner.id, broker, ...data },
    update: data,
  });
  await logEvent({ kind: 'ib.connect', message: `${brokerLabel(broker)} connected (${input.method.toLowerCase()})`, partnerId: partner.id, actor });
  if (row.method === 'SHEET') await syncBroker(row.id);
  else await recheckPartner(partner.id);
  return (await listBrokers(partner.id)).find(b => b.id === row.id)!;
}

export async function removeBroker(partnerId: string, id: string, actor: Actor = null): Promise<void> {
  const row = await prisma.partnerBroker.findFirst({ where: { id, partnerId } });
  if (!row) throw new NotFoundError('Broker connection not found');
  await prisma.partnerBroker.delete({ where: { id } });
  await logEvent({ kind: 'ib.disconnect', message: `${brokerLabel(row.broker)} disconnected`, partnerId, actor });
  await recheckPartner(partnerId);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

async function applyRows(b: BrokerRow, rows: IbRow[], mode: 'replace' | 'merge', skipped: number, source: string, actor: Actor): Promise<Omit<IbUploadResultDto, 'broker' | 'rechecked'>> {
  const now = new Date();
  const existing = await prisma.ibAccount.findMany({ where: { partnerBrokerId: b.id } });
  const byId = new Map(existing.map(e => [e.accountId, e]));
  const incoming = new Set(rows.map(r => r.accountId));
  let added = 0, updated = 0, removed = 0;
  const creates: Prisma.IbAccountCreateManyInput[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows) {
    const e = byId.get(r.accountId);
    if (!e) { creates.push({ partnerBrokerId: b.id, partnerId: b.partnerId, broker: b.broker, accountId: r.accountId, email: r.email }); added++; continue; }
    const email = r.email ?? e.email;
    if (e.removedAt || email !== e.email) { ops.push(prisma.ibAccount.update({ where: { id: e.id }, data: { removedAt: null, email, lastSeenAt: now } })); updated++; }
  }
  if (mode === 'replace') {
    const gone = existing.filter(e => !e.removedAt && !incoming.has(e.accountId)).map(e => e.id);
    if (gone.length) { ops.push(prisma.ibAccount.updateMany({ where: { id: { in: gone } }, data: { removedAt: now } })); removed = gone.length; }
    ops.push(prisma.ibAccount.updateMany({ where: { partnerBrokerId: b.id, accountId: { in: [...incoming] }, removedAt: null }, data: { lastSeenAt: now } }));
  }
  await prisma.$transaction([
    ...(creates.length ? [prisma.ibAccount.createMany({ data: creates, skipDuplicates: true })] : []),
    ...ops,
  ]);
  const accountCount = await prisma.ibAccount.count({ where: { partnerBrokerId: b.id, removedAt: null } });
  await prisma.partnerBroker.update({ where: { id: b.id }, data: { status: 'OK', lastSyncAt: now, lastError: null, accountCount } });
  await logEvent({
    kind: 'ib.sync', partnerId: b.partnerId, actor,
    message: `${brokerLabel(b.broker)} list ${source}: ${accountCount} accounts (+${added}, ${updated} changed, −${removed}${skipped ? `, ${skipped} rows skipped` : ''})`,
    detail: { added, updated, removed, skipped, accountCount, source },
  });
  return { added, updated, removed, skipped };
}

export async function uploadList(partnerId: string, id: string, input: IbListUploadInput, actor: Actor = null): Promise<IbUploadResultDto> {
  const b = await prisma.partnerBroker.findFirst({ where: { id, partnerId } });
  if (!b) throw new NotFoundError('Broker connection not found');
  const { rows, skipped } = parseIbList(input.text);
  if (!rows.length) throw new ValidationError('No account numbers found. Put one account per line, or a CSV with an “Account” column.');
  const counts = await applyRows(b, rows, input.mode, skipped, 'uploaded', actor);
  const rechecked = await recheckPartner(partnerId, b.broker);
  return { broker: (await listBrokers(partnerId)).find(x => x.id === id)!, ...counts, rechecked };
}

/** Re-reads a Google Sheet list. Failures mark the connection, never throw. */
export async function syncBroker(id: string, actor: Actor = null): Promise<PartnerBrokerDto | null> {
  const b = await prisma.partnerBroker.findUnique({ where: { id } });
  if (!b) return null;
  if (b.method !== 'SHEET' || !b.sheetUrl) {
    await recheckPartner(b.partnerId, b.broker);
    return (await listBrokers(b.partnerId)).find(x => x.id === id) ?? null;
  }
  try {
    const { rows, skipped } = await fetchSheet(b.sheetUrl);
    if (!rows.length) throw new SourceError('The sheet has no account numbers in it.');
    await applyRows(b, rows, 'replace', skipped, 'synced from the sheet', actor);
    await recheckPartner(b.partnerId, b.broker);
  } catch (err) {
    const msg = err instanceof SourceError ? err.message : 'Sync failed. Try again in a few minutes.';
    if (!(err instanceof SourceError)) logger.warn('[partners] sheet sync failed', { id, err });
    await prisma.partnerBroker.update({ where: { id }, data: { status: 'ERROR', lastError: msg, lastSyncAt: new Date() } });
    await logEvent({ kind: 'ib.sync_failed', partnerId: b.partnerId, actor, message: `${brokerLabel(b.broker)} sheet sync failed: ${msg}` });
  }
  return (await listBrokers(b.partnerId)).find(x => x.id === id) ?? null;
}

export async function syncDueSheets(now = Date.now()): Promise<number> {
  const due = await prisma.partnerBroker.findMany({
    where: { method: 'SHEET', partner: { status: 'ACTIVE' }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now - SHEET_EVERY_MS) } }] },
    select: { id: true }, take: 20,
  });
  for (const b of due) await syncBroker(b.id);
  return due.length;
}

// ── Verification ──────────────────────────────────────────────────────────────

const ACCOUNT_SELECT = { id: true, userId: true, broker: true, server: true, mt5Login: true } as const;
type AccountLite = { id: string; userId: string; broker: string; server: string; mt5Login: bigint };

/** Checks one connected account against the referring partner's IB lists. */
export async function verifyAccount(
  account: AccountLite,
  ref: { partnerId: string; partner: PartnerLite },
  opts: { brokerEmail?: string | null; requestReview?: boolean; userEmail?: string | null; counted?: boolean } = {},
): Promise<VerificationStatusDto> {
  const brokers = await prisma.partnerBroker.findMany({ where: { partnerId: ref.partnerId }, select: { broker: true, serverMatch: true } });
  const brokerKey = brokerKeyFor(account, brokers);
  const login = account.mt5Login.toString();
  const prev = await prisma.clientVerification.findUnique({ where: { brokerAccountId: account.id } });
  const brokerEmail = opts.brokerEmail ?? prev?.brokerEmail ?? null;
  const emailToCheck = (brokerEmail ?? opts.userEmail ?? '').toLowerCase() || null;
  const [here, elsewhere, emailHit] = brokerKey ? await Promise.all([
    prisma.ibAccount.findFirst({ where: { partnerId: ref.partnerId, broker: brokerKey, accountId: login, removedAt: null }, select: { id: true } }),
    prisma.ibAccount.count({ where: { broker: brokerKey, accountId: login, removedAt: null, partnerId: { not: ref.partnerId } } }),
    emailToCheck ? prisma.ibAccount.count({ where: { partnerId: ref.partnerId, broker: brokerKey, email: emailToCheck, removedAt: null } }) : Promise.resolve(0),
  ]) : [null, 0, 0];
  const reviewRequestedAt = opts.requestReview ? new Date() : prev?.reviewRequestedAt ?? null;
  const out = decideVerification({
    partnerName: ref.partner.user.name.split(' ')[0] ?? ref.partner.user.name, brokerKey, brokerLabel: brokerKey ? brokerLabel(brokerKey) : 'this broker',
    partnerBrokers: brokers.map(b => b.broker), listedHere: here, listedElsewhere: elsewhere > 0, emailListed: emailHit > 0,
    prev: prev ? { status: prev.status, method: prev.method, reviewRequestedAt } : reviewRequestedAt ? { status: 'PENDING', method: null, reviewRequestedAt } : null,
  });
  const data = {
    partnerId: ref.partnerId, broker: brokerKey, status: out.status, method: out.method, ibAccountId: out.ibAccountId,
    reason: out.reason, signal: out.signal, brokerEmail, checkedAt: new Date(), reviewRequestedAt,
  };
  await prisma.clientVerification.upsert({
    where: { brokerAccountId: account.id },
    create: { userId: account.userId, brokerAccountId: account.id, ...data, attempts: opts.counted ? 1 : 0 },
    update: { ...data, ...(opts.counted ? { attempts: { increment: 1 } } : {}) },
  });
  if (prev?.status !== out.status) {
    await logEvent({
      kind: `verify.${out.status.toLowerCase()}`, partnerId: ref.partnerId, userId: account.userId,
      message: `Account ${login} (${brokerKey ? brokerLabel(brokerKey) : account.broker}): ${prev?.status ?? 'new'} → ${out.status}`,
      detail: { brokerAccountId: account.id, signal: out.signal },
    });
  }
  return out.status;
}

async function referralFor(userId: string) {
  return prisma.referral.findUnique({ where: { userId }, include: { partner: { include: { user: { select: { name: true } } } } } });
}

/** Verifies every account of a referred user. No partner → nothing to check. */
export async function verifyUser(userId: string, opts: { userEmail?: string | null } = {}): Promise<number> {
  const ref = await referralFor(userId);
  if (!ref) return 0;
  const accounts = await prisma.brokerAccount.findMany({ where: { userId }, select: ACCOUNT_SELECT });
  for (const a of accounts) await verifyAccount(a, ref, opts);
  return accounts.length;
}

/** The client re-checks one account (optionally with the email the broker has). */
export async function verifyOne(userId: string, brokerAccountId: string, input: { brokerEmail?: string; requestReview?: boolean; userEmail?: string }): Promise<VerificationStatusDto> {
  const ref = await referralFor(userId);
  if (!ref) throw new ConflictError('Join a partner first: enter their code above.');
  const account = await prisma.brokerAccount.findFirst({ where: { id: brokerAccountId, userId }, select: ACCOUNT_SELECT });
  if (!account) throw new NotFoundError('Broker account not found');
  const prev = await prisma.clientVerification.findUnique({ where: { brokerAccountId } });
  if (prev && prev.attempts >= 30 && !input.requestReview) throw new AppError(429, 'VERIFY_LIMIT', 'Too many checks on this account. Ask for a review instead.');
  return verifyAccount(account, ref, { brokerEmail: input.brokerEmail, requestReview: input.requestReview, userEmail: input.userEmail, counted: true });
}

/** Re-runs verification for a partner's clients (all, or those at one broker). */
export async function recheckPartner(partnerId: string, broker?: string): Promise<number> {
  const refs = await prisma.referral.findMany({
    where: { partnerId, connectedAt: { not: null } },
    include: { partner: { include: { user: { select: { name: true } } } } },
  });
  let n = 0;
  for (const ref of refs) {
    const accounts = await prisma.brokerAccount.findMany({ where: { userId: ref.userId }, select: ACCOUNT_SELECT });
    for (const a of accounts) {
      if (broker) {
        const prev = await prisma.clientVerification.findUnique({ where: { brokerAccountId: a.id }, select: { broker: true } });
        if (prev && prev.broker && prev.broker !== broker) continue;
      }
      await verifyAccount(a, ref);
      n++;
    }
  }
  return n;
}

/** Admin decision on a verification in review (or any verification). */
export async function reviewVerification(id: string, action: 'approve' | 'reject', note: string | undefined, actor: { id: string; email: string }) {
  const v = await prisma.clientVerification.findUnique({ where: { id }, include: { brokerAccount: { select: { mt5Login: true } } } });
  if (!v) throw new NotFoundError('Verification not found');
  const status = action === 'approve' ? 'VERIFIED' : 'REJECTED';
  await prisma.clientVerification.update({
    where: { id },
    data: {
      status, method: 'manual', reviewedById: actor.id, reviewedByEmail: actor.email, reviewedAt: new Date(), reviewNote: note ?? null,
      reason: status === 'REJECTED' ? (note ? `Reviewed: ${note}` : 'An admin reviewed this account and could not confirm it.') : null,
    },
  });
  await logEvent({
    kind: `verify.manual_${action}`, partnerId: v.partnerId, userId: v.userId, actor,
    message: `Account ${v.brokerAccount.mt5Login.toString()} ${action === 'approve' ? 'approved' : 'rejected'} by admin${note ? `: ${note}` : ''}`,
  });
  return { userId: v.userId, partnerId: v.partnerId, status };
}
