// IB connections, referred-accounts lists and client verification.
import { prisma, type Prisma } from '@tradinjournal/db';
import type {
  IbListUploadInput, IbUploadResultDto, PartnerBrokerDto, PartnerBrokerUpsertInput, VerificationStatusDto,
} from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../http/errors.js';
import { encryptSecret } from '../../../lib/secrets.js';
import { brokerKeyFor, brokerLabel, isKnownBroker } from './brokers.js';
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
  // API connections are set up in a second step (integrations.service saveApiConfig).
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

export async function applyRows(b: BrokerRow, rows: IbRow[], mode: 'replace' | 'merge', skipped: number, source: string, actor: Actor): Promise<Omit<IbUploadResultDto, 'broker' | 'rechecked'>> {
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
  if (b.method === 'API') {
    const { syncApi } = await import('./integrations.service.js');
    await syncApi(b.id, actor);
    await recheckPartner(b.partnerId, b.broker);
    return (await listBrokers(b.partnerId)).find(x => x.id === id) ?? null;
  }
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

/** An account to check: synced MT5 (ownership proven by login) or added for checking only. */
export type AccountRef = { kind: 'mt5' | 'external'; id: string; userId: string; broker: string; server: string; login: string; platform: string };

const mt5Ref = (a: { id: string; userId: string; broker: string; server: string; mt5Login: bigint }): AccountRef =>
  ({ kind: 'mt5', id: a.id, userId: a.userId, broker: a.broker, server: a.server, login: a.mt5Login.toString(), platform: 'MT5' });
const extRef = (a: { id: string; userId: string; broker: string; server: string; login: string; platform: string }): AccountRef =>
  ({ kind: 'external', id: a.id, userId: a.userId, broker: a.broker, server: a.server, login: a.login, platform: a.platform });
const keyOf = (a: AccountRef) => (a.kind === 'mt5' ? { brokerAccountId: a.id } : { externalAccountId: a.id });

export async function accountsOf(userId: string): Promise<AccountRef[]> {
  const [mt5, ext] = await Promise.all([
    prisma.brokerAccount.findMany({ where: { userId }, select: ACCOUNT_SELECT, orderBy: { createdAt: 'asc' } }),
    prisma.externalAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return [...mt5.map(mt5Ref), ...ext.map(extRef)];
}

/** Checks one account against the referring partner's IB lists. */
export async function verifyAccount(
  account: AccountRef,
  ref: { partnerId: string; partner: PartnerLite },
  opts: { brokerEmail?: string | null; requestReview?: boolean; userEmail?: string | null; counted?: boolean } = {},
): Promise<VerificationStatusDto> {
  const brokers = await prisma.partnerBroker.findMany({ where: { partnerId: ref.partnerId }, select: { broker: true, serverMatch: true } });
  const brokerKey = brokerKeyFor(account, brokers);
  const login = account.login;
  const key = keyOf(account);
  const prev = await prisma.clientVerification.findUnique({ where: key as { brokerAccountId: string } });
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
    ownershipProven: account.kind === 'mt5',
  });
  const data = {
    partnerId: ref.partnerId, broker: brokerKey, status: out.status, method: out.method, ibAccountId: out.ibAccountId,
    reason: out.reason, signal: out.signal, brokerEmail, checkedAt: new Date(), reviewRequestedAt,
  };
  if (prev) {
    await prisma.clientVerification.update({ where: { id: prev.id }, data: { ...data, ...(opts.counted ? { attempts: { increment: 1 } } : {}) } });
  } else {
    await prisma.clientVerification.create({ data: { userId: account.userId, ...key, ...data, attempts: opts.counted ? 1 : 0 } });
  }
  if (prev?.status !== out.status) {
    await logEvent({
      kind: `verify.${out.status.toLowerCase()}`, partnerId: ref.partnerId, userId: account.userId,
      message: `${account.platform} account ${login} (${brokerKey ? brokerLabel(brokerKey) : account.broker}): ${prev?.status ?? 'new'} → ${out.status}`,
      detail: { ...key, signal: out.signal },
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
  const accounts = await accountsOf(userId);
  for (const a of accounts) await verifyAccount(a, ref, opts);
  return accounts.length;
}

/** The client re-checks one account (optionally with the email the broker has). */
export async function verifyOne(userId: string, accountId: string, input: { brokerEmail?: string; requestReview?: boolean; userEmail?: string }): Promise<VerificationStatusDto> {
  const ref = await referralFor(userId);
  if (!ref) throw new ConflictError('Join a partner first: enter their code above.');
  const account = (await accountsOf(userId)).find(a => a.id === accountId);
  if (!account) throw new NotFoundError('Broker account not found');
  const prev = await prisma.clientVerification.findUnique({ where: keyOf(account) as { brokerAccountId: string } });
  if (prev && prev.attempts >= 30 && !input.requestReview) throw new AppError(429, 'VERIFY_LIMIT', 'Too many checks on this account. Ask for a review instead.');
  return verifyAccount(account, ref, { brokerEmail: input.brokerEmail, requestReview: input.requestReview, userEmail: input.userEmail, counted: true });
}

/** A client adds an account our bridge can't sync (MT4…) so it can be checked against the IB list. */
export async function addExternalAccount(user: { id: string; email: string }, input: { platform: string; login: string; server: string; broker: string; brokerEmail?: string }) {
  const ref = await referralFor(user.id);
  if (!ref) throw new ConflictError('Join a partner first: enter their code above.');
  const count = await prisma.externalAccount.count({ where: { userId: user.id } });
  if (count >= 5) throw new ConflictError('You can add up to 5 accounts this way.');
  const mt5 = input.platform === 'MT5' && await prisma.brokerAccount.findFirst({ where: { userId: user.id, mt5Login: BigInt(/^\d+$/.test(input.login) ? input.login : '0'), server: input.server } });
  if (mt5) throw new ConflictError('This MT5 account is already connected.');
  let ext;
  try {
    ext = await prisma.externalAccount.create({ data: { userId: user.id, platform: input.platform, login: input.login, server: input.server, broker: input.broker } });
  } catch {
    throw new ConflictError('That account has already been added by someone. Ask support if it’s yours.');
  }
  // Counts as "connected" for the partner's funnel.
  await prisma.referral.updateMany({ where: { userId: user.id, connectedAt: null }, data: { connectedAt: new Date() } });
  await logEvent({ kind: 'account.external_add', partnerId: ref.partnerId, userId: user.id, message: `${input.platform} account ${input.login} on ${input.server} added for checking` });
  await verifyAccount(extRef(ext), ref, { brokerEmail: input.brokerEmail, userEmail: user.email, counted: true });
  return ext.id;
}

export async function removeExternalAccount(userId: string, id: string): Promise<void> {
  const ext = await prisma.externalAccount.findFirst({ where: { id, userId } });
  if (!ext) throw new NotFoundError('Account not found');
  await prisma.externalAccount.delete({ where: { id } });
}

/** Re-runs verification for a partner's clients (all, or those at one broker). */
export async function recheckPartner(partnerId: string, broker?: string): Promise<number> {
  const refs = await prisma.referral.findMany({
    where: { partnerId, connectedAt: { not: null } },
    include: { partner: { include: { user: { select: { name: true } } } } },
  });
  let n = 0;
  for (const ref of refs) {
    for (const a of await accountsOf(ref.userId)) {
      if (broker) {
        const prev = await prisma.clientVerification.findUnique({ where: keyOf(a) as { brokerAccountId: string }, select: { broker: true } });
        if (prev && prev.broker && prev.broker !== broker) continue;
      }
      await verifyAccount(a, ref);
      n++;
    }
  }
  return n;
}

/** Re-checks the clients whose account matches one broker-reported account id (postbacks). */
export async function recheckLogin(partnerId: string, login: string): Promise<string[]> {
  const ref = await prisma.referral.findMany({ where: { partnerId }, include: { partner: { include: { user: { select: { name: true } } } } } });
  const users = ref.map(r => r.userId);
  if (!users.length) return [];
  const [mt5, ext] = await Promise.all([
    /^\d+$/.test(login) ? prisma.brokerAccount.findMany({ where: { userId: { in: users }, mt5Login: BigInt(login) }, select: ACCOUNT_SELECT }) : Promise.resolve([]),
    prisma.externalAccount.findMany({ where: { userId: { in: users }, login } }),
  ]);
  const touched: string[] = [];
  for (const a of [...mt5.map(mt5Ref), ...ext.map(extRef)]) {
    await verifyAccount(a, ref.find(r => r.userId === a.userId)!);
    touched.push(a.userId);
  }
  return touched;
}

/** Admin decision on a verification in review (or any verification). */
export async function reviewVerification(id: string, action: 'approve' | 'reject', note: string | undefined, actor: { id: string; email: string }) {
  const v = await prisma.clientVerification.findUnique({ where: { id }, include: { brokerAccount: { select: { mt5Login: true } }, externalAccount: { select: { login: true, platform: true } } } });
  if (!v) throw new NotFoundError('Verification not found');
  const status = action === 'approve' ? 'VERIFIED' : 'REJECTED';
  await prisma.clientVerification.update({
    where: { id },
    data: {
      status, method: 'manual', reviewedById: actor.id, reviewedByEmail: actor.email, reviewedAt: new Date(), reviewNote: note ?? null,
      reason: status === 'REJECTED' ? (note ? `Reviewed: ${note}` : 'An admin reviewed this account and could not confirm it.') : null,
    },
  });
  const label = v.brokerAccount ? `MT5 account ${v.brokerAccount.mt5Login.toString()}` : `${v.externalAccount?.platform ?? ''} account ${v.externalAccount?.login ?? ''}`;
  await logEvent({
    kind: `verify.manual_${action}`, partnerId: v.partnerId, userId: v.userId, actor,
    message: `${label} ${action === 'approve' ? 'approved' : 'rejected'} by admin${note ? `: ${note}` : ''}`,
  });
  return { userId: v.userId, partnerId: v.partnerId, status };
}
