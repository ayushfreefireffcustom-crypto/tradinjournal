// Macro membership — apply / status / admin approve|reject.
// userId is the better-auth user id (no FK on User table).
import { prisma } from '@tradinjournal/db';
import { isAdmin } from '../../lib/admin.js';
import { logger } from '@tradinjournal/logger';
import type { MacroMemberApplyInput, MacroMemberDto } from '@tradinjournal/contracts';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../http/errors.js';
import { listLatestSignals } from './macro-signals.service.js';
import type { MacroSignalDto } from '@tradinjournal/contracts';

function toDto(row: {
  id: string;
  exchange: string;
  exchangeUid: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  plan: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MacroMemberDto {
  return {
    id: row.id,
    exchange: row.exchange,
    exchangeUid: row.exchangeUid,
    status: row.status,
    plan: row.plan,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isMacroAdmin(email: string | null | undefined): boolean {
  return isAdmin(email);
}

/** Current membership for a user, or null if they never applied. */
export async function getMembership(userId: string): Promise<MacroMemberDto | null> {
  const row = await prisma.macroMember.findUnique({ where: { userId } });
  return row ? toDto(row) : null;
}

/**
 * Apply for TradeAI access. Re-apply allowed only from REJECTED → PENDING.
 * APPROVED / PENDING applications cannot be overwritten (ConflictError).
 */
export async function applyMembership(
  userId: string,
  input: MacroMemberApplyInput,
): Promise<MacroMemberDto> {
  const exchange = input.exchange;
  const exchangeUid = input.exchangeUid.trim();
  if (!exchangeUid) throw new ValidationError('exchangeUid is required');

  const existing = await prisma.macroMember.findUnique({ where: { userId } });
  if (existing?.status === 'APPROVED') {
    throw new ConflictError('Already an approved TradeAI member');
  }
  if (existing?.status === 'PENDING') {
    throw new ConflictError('Application already pending review');
  }

  if (existing?.status === 'REJECTED') {
    const row = await prisma.macroMember.update({
      where: { userId },
      data: { exchange, exchangeUid, status: 'PENDING' },
    });
    logger.info('[macro] membership re-applied', { userId, exchange });
    return toDto(row);
  }

  const row = await prisma.macroMember.create({
    data: { userId, exchange, exchangeUid, status: 'PENDING' },
  });
  logger.info('[macro] membership applied', { userId, exchange });
  return toDto(row);
}

export async function listMembers(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<MacroMemberDto[]> {
  const rows = await prisma.macroMember.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return rows.map(toDto);
}

export async function approveMember(id: string, adminEmail: string): Promise<MacroMemberDto> {
  if (!isMacroAdmin(adminEmail)) throw new ForbiddenError('Not a macro admin');
  const row = await prisma.macroMember.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Membership application not found');
  if (row.status === 'APPROVED') return toDto(row);

  const updated = await prisma.macroMember.update({
    where: { id },
    data: { status: 'APPROVED', expiresAt: null },
  });
  logger.info('[macro] membership approved', { id, adminEmail });
  return toDto(updated);
}

export async function rejectMember(id: string, adminEmail: string): Promise<MacroMemberDto> {
  if (!isMacroAdmin(adminEmail)) throw new ForbiddenError('Not a macro admin');
  const row = await prisma.macroMember.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Membership application not found');

  const updated = await prisma.macroMember.update({
    where: { id },
    data: { status: 'REJECTED' },
  });
  logger.info('[macro] membership rejected', { id, adminEmail });
  return toDto(updated);
}

/** Latest signals for approved members. Gate enforced by requireMember. */
export async function listSignals(): Promise<MacroSignalDto[]> {
  return listLatestSignals();
}
