// Admin side of the partner programme. Every write is audited (AdminAuditLog) and,
// when it concerns one partner, also lands on that partner's note trail.
import { prisma } from '@tradinjournal/db';
import type {
  AdminCreatePartnerInput, AdminPartnerDetailDto, AdminPartnerRowDto, AdminPartnerStatusInput,
  AdminAssignClientInput, AdminReferrerLookupDto, PartnerClientDto, PartnerNoteDto, PartnerRange,
  PartnerStatusDto, ReservedPartnerCodeDto,
} from '@tradinjournal/contracts';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { logAdminAction } from '../admin/admin-audit.service.js';
import { isBuiltinReserved, normalizeCode } from './partner.logic.js';
import {
  codeStats, createPartnerRecord, getPartnerById, overview, primaryCode, referralInclude, releaseCode, rowCounters,
  toClient, type PartnerWithUser,
} from './partners.service.js';

export interface Actor { id: string; email: string }

function toRow(p: PartnerWithUser, c: { clicks30d: number; converted30d: number; signups30d: number; clients: number; connected: number; active: number }): AdminPartnerRowDto {
  return {
    id: p.id, userId: p.userId, name: p.user.name, email: p.user.email, code: primaryCode(p), status: p.status,
    joinedAt: p.createdAt.toISOString(), approvedAt: p.approvedAt?.toISOString() ?? null, audience: p.audience, ...c,
  };
}

async function rowFor(p: PartnerWithUser): Promise<AdminPartnerRowDto> {
  return toRow(p, (await rowCounters([p.id])).get(p.id)!);
}

async function note(partnerId: string, actor: Actor, body: string): Promise<void> {
  await prisma.partnerNote.create({ data: { partnerId, authorId: actor.id, authorEmail: actor.email, body } });
}

async function audit(actor: Actor, action: string, partnerId: string, details: Record<string, unknown> = {}) {
  await logAdminAction({ action, actorId: actor.id, actorEmail: actor.email, targetType: 'partner', targetId: partnerId, details });
}

// ── Partners ──────────────────────────────────────────────────────────────────

export async function listPartners(status?: PartnerStatusDto): Promise<AdminPartnerRowDto[]> {
  const partners = await prisma.partner.findMany({
    where: status ? { status } : { status: { not: 'REVOKED' } },
    include: { user: { select: { id: true, name: true, email: true } }, codes: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  const counters = await rowCounters(partners.map(p => p.id));
  return partners.map(p => toRow(p, counters.get(p.id)!));
}

export async function createPartner(input: AdminCreatePartnerInput, actor: Actor): Promise<AdminPartnerRowDto> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, name: true } });
  if (!user) throw new NotFoundError('No TRADElogs account uses that email. Ask them to sign up first.');
  const existing = await prisma.partner.findUnique({ where: { userId: user.id } });
  if (existing) throw new ConflictError(`This user is already a partner (${existing.status.toLowerCase()}).`);
  const p = await createPartnerRecord({ userId: user.id, name: user.name, status: 'ACTIVE', audience: input.audience ?? null, requestedCode: input.code ?? null });
  await note(p.id, actor, 'Partner created by admin.');
  await audit(actor, 'partner.create', p.id, { email: input.email, code: primaryCode(p) });
  return rowFor(p);
}

export async function partnerDetail(id: string, range: PartnerRange): Promise<AdminPartnerDetailDto> {
  const p = await getPartnerById(id);
  const [ov, row, codes, notes] = await Promise.all([
    overview(p, range), rowFor(p), codeStats(p),
    prisma.partnerNote.findMany({ where: { partnerId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return {
    ...ov, admin: row, codes,
    notes: notes.map((n): PartnerNoteDto => ({ id: n.id, body: n.body, authorEmail: n.authorEmail, createdAt: n.createdAt.toISOString() })),
  };
}

const TRANSITIONS: Record<AdminPartnerStatusInput['action'], { from: PartnerStatusDto[]; to: PartnerStatusDto; label: string }> = {
  approve: { from: ['PENDING'], to: 'ACTIVE', label: 'Approved' },
  decline: { from: ['PENDING'], to: 'REVOKED', label: 'Application declined' },
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED', label: 'Suspended' },
  reinstate: { from: ['SUSPENDED', 'REVOKED'], to: 'ACTIVE', label: 'Reinstated' },
  revoke: { from: ['ACTIVE', 'SUSPENDED', 'PENDING'], to: 'REVOKED', label: 'Partner status revoked' },
};

export async function setStatus(id: string, input: AdminPartnerStatusInput, actor: Actor): Promise<AdminPartnerRowDto> {
  const p = await getPartnerById(id);
  const t = TRANSITIONS[input.action];
  if (!t.from.includes(p.status)) throw new ConflictError(`Can’t ${input.action} a partner who is ${p.status.toLowerCase()}.`);
  const now = new Date();
  await prisma.partner.update({
    where: { id },
    data: {
      status: t.to,
      ...(t.to === 'ACTIVE' ? { approvedAt: p.approvedAt ?? now, suspendedAt: null, revokedAt: null } : {}),
      ...(t.to === 'SUSPENDED' ? { suspendedAt: now } : {}),
      ...(t.to === 'REVOKED' ? { revokedAt: now } : {}),
    },
  });
  await note(id, actor, `${t.label}.${input.reason ? ` Reason: ${input.reason}` : ''}`);
  await audit(actor, `partner.${input.action}`, id, { from: p.status, to: t.to, reason: input.reason ?? null });
  return rowFor(await getPartnerById(id));
}

export async function addNote(id: string, body: string, actor: Actor): Promise<PartnerNoteDto> {
  await getPartnerById(id);
  const n = await prisma.partnerNote.create({ data: { partnerId: id, authorId: actor.id, authorEmail: actor.email, body } });
  return { id: n.id, body: n.body, authorEmail: n.authorEmail, createdAt: n.createdAt.toISOString() };
}

// ── Clients ───────────────────────────────────────────────────────────────────

export async function assignClient(partnerId: string, input: AdminAssignClientInput, actor: Actor): Promise<PartnerClientDto> {
  const p = await getPartnerById(partnerId);
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, name: true } });
  if (!user) throw new NotFoundError('No TRADElogs account uses that email.');
  if (user.id === p.userId) throw new ConflictError('A partner can’t be their own client.');
  const existing = await prisma.referral.findUnique({ where: { userId: user.id }, include: { partner: { include: { user: { select: { name: true } } } } } });
  if (existing?.partnerId === partnerId) throw new ConflictError('This user is already this partner’s client.');
  if (existing && !input.force) throw new ConflictError(`This user is already referred by ${existing.partner.user.name}. Send force: true to move them.`);
  const def = await prisma.partnerChannel.findFirst({ where: { partnerId, slug: '' } });
  const code = primaryCode(p) ?? 'ADMIN';
  const r = existing
    ? await prisma.referral.update({ where: { id: existing.id }, data: { partnerId, channelId: def?.id ?? null, code, source: 'ADMIN', clickId: null }, include: referralInclude })
    : await prisma.referral.create({ data: { userId: user.id, partnerId, channelId: def?.id ?? null, code, source: 'ADMIN' }, include: referralInclude });
  await note(partnerId, actor, `Client assigned: ${user.name}${existing ? ` (moved from ${existing.partner.user.name})` : ''}.${input.reason ? ` Reason: ${input.reason}` : ''}`);
  if (existing) await note(existing.partnerId, actor, `Client moved to ${p.user.name}: ${user.name}.${input.reason ? ` Reason: ${input.reason}` : ''}`);
  await audit(actor, 'partner.client.assign', partnerId, { userId: user.id, fromPartnerId: existing?.partnerId ?? null, reason: input.reason ?? null });
  return toClient(r);
}

export async function unlinkClient(partnerId: string, referralId: string, reason: string | undefined, actor: Actor): Promise<void> {
  const r = await prisma.referral.findFirst({ where: { id: referralId, partnerId }, include: { user: { select: { name: true } } } });
  if (!r) throw new NotFoundError('Client not found for this partner');
  await prisma.referral.delete({ where: { id: r.id } });
  await note(partnerId, actor, `Client unlinked: ${r.user.name}.${reason ? ` Reason: ${reason}` : ''}`);
  await audit(actor, 'partner.client.unlink', partnerId, { userId: r.userId, reason: reason ?? null });
}

export async function moveAllClients(fromId: string, toId: string, reason: string | undefined, actor: Actor): Promise<{ moved: number }> {
  if (fromId === toId) throw new ConflictError('Pick two different partners.');
  const [from, to] = await Promise.all([getPartnerById(fromId), getPartnerById(toId)]);
  if (to.status !== 'ACTIVE') throw new ConflictError('Clients can only move to an active partner.');
  const def = await prisma.partnerChannel.findFirst({ where: { partnerId: toId, slug: '' } });
  // The receiving partner's own account can't become their own client.
  const { count } = await prisma.referral.updateMany({
    where: { partnerId: fromId, userId: { not: to.userId } },
    data: { partnerId: toId, channelId: def?.id ?? null, code: primaryCode(to) ?? 'ADMIN', source: 'ADMIN', clickId: null },
  });
  await note(fromId, actor, `${count} client${count === 1 ? '' : 's'} moved to ${to.user.name}.${reason ? ` Reason: ${reason}` : ''}`);
  await note(toId, actor, `${count} client${count === 1 ? '' : 's'} moved in from ${from.user.name}.${reason ? ` Reason: ${reason}` : ''}`);
  await audit(actor, 'partner.client.move_all', fromId, { toPartnerId: toId, moved: count, reason: reason ?? null });
  return { moved: count };
}

// ── Codes ─────────────────────────────────────────────────────────────────────

export async function revokeCode(partnerId: string, codeId: string, actor: Actor): Promise<void> {
  const { code } = await releaseCode(partnerId, codeId);
  await note(partnerId, actor, `Custom code ${code} revoked.`);
  await audit(actor, 'partner.code.revoke', partnerId, { code });
}

export async function listReserved(): Promise<ReservedPartnerCodeDto[]> {
  const rows = await prisma.reservedPartnerCode.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(r => ({ id: r.id, code: r.code, reason: r.reason, createdByEmail: r.createdByEmail, createdAt: r.createdAt.toISOString() }));
}

export async function reserveName(code: string, reason: string | undefined, actor: Actor): Promise<ReservedPartnerCodeDto> {
  if (isBuiltinReserved(code)) throw new ConflictError('That name is already blocked by default.');
  const held = await prisma.partnerCode.findUnique({ where: { code }, include: { partner: { include: { user: { select: { name: true } } } } } });
  if (held) throw new ConflictError(`${held.partner.user.name} holds that code. Revoke it from their profile first.`);
  if (await prisma.reservedPartnerCode.findUnique({ where: { code } })) throw new ConflictError('That name is already reserved.');
  const r = await prisma.reservedPartnerCode.create({ data: { code, reason: reason ?? null, createdById: actor.id, createdByEmail: actor.email } });
  await logAdminAction({ action: 'partner.code.reserve', actorId: actor.id, actorEmail: actor.email, targetType: 'partner_code', targetId: r.id, details: { code } });
  return { id: r.id, code: r.code, reason: r.reason, createdByEmail: r.createdByEmail, createdAt: r.createdAt.toISOString() };
}

export async function releaseName(id: string, actor: Actor): Promise<void> {
  const r = await prisma.reservedPartnerCode.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Reserved name not found');
  await prisma.reservedPartnerCode.delete({ where: { id } });
  await logAdminAction({ action: 'partner.code.release_reserved', actorId: actor.id, actorEmail: actor.email, targetType: 'partner_code', targetId: id, details: { code: r.code } });
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/** "Who referred this person?" by email, and "who owns this code?" by code. */
export async function lookup(q: string): Promise<AdminReferrerLookupDto> {
  const out: AdminReferrerLookupDto = { query: q, user: null, referredBy: null, codeOwner: null };
  if (q.includes('@')) {
    const user = await prisma.user.findUnique({ where: { email: q.toLowerCase() }, select: { id: true, name: true, email: true } });
    if (user) {
      out.user = user;
      const r = await prisma.referral.findUnique({ where: { userId: user.id }, include: referralInclude });
      if (r) out.referredBy = { partner: await rowFor(await getPartnerById(r.partnerId)), client: toClient(r) };
    }
  }
  const code = normalizeCode(q);
  if (code) {
    const c = await prisma.partnerCode.findUnique({ where: { code } });
    if (c) out.codeOwner = await rowFor(await getPartnerById(c.partnerId));
  }
  return out;
}

/** 404s unknown partners for routes that only need the id. */
export async function partnerDetailExists(id: string): Promise<string> {
  return (await getPartnerById(id)).id;
}
