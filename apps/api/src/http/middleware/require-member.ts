// Require an APPROVED MacroMember for the signed-in user.
// Must run AFTER requireAuth (needs res.locals.user).
// Non-members / pending / rejected get ForbiddenError — never signal payloads.
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@tradinjournal/db';
import { ForbiddenError, UnauthorizedError } from '../errors.js';

declare global {
  namespace Express {
    interface Locals {
      /** Set by requireMember when the user is an approved macro member. */
      macroMember?: {
        id: string;
        userId: string;
        status: 'PENDING' | 'APPROVED' | 'REJECTED';
        exchange: string;
        exchangeUid: string;
      };
    }
  }
}

export async function requireMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = res.locals.user;
    if (!user?.id) {
      next(new UnauthorizedError());
      return;
    }

    const member = await prisma.macroMember.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        userId: true,
        status: true,
        exchange: true,
        exchangeUid: true,
        expiresAt: true,
      },
    });

    if (!member || member.status !== 'APPROVED') {
      next(new ForbiddenError('TradeAI membership required'));
      return;
    }

    // Expired plan → treat as not a member (no signal leakage).
    if (member.expiresAt && member.expiresAt.getTime() < Date.now()) {
      next(new ForbiddenError('TradeAI membership expired'));
      return;
    }

    res.locals.macroMember = {
      id: member.id,
      userId: member.userId,
      status: member.status,
      exchange: member.exchange,
      exchangeUid: member.exchangeUid,
    };
    next();
  } catch (err) {
    next(err);
  }
}
