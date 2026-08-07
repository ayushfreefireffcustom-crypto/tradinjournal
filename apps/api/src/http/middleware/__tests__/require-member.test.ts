import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const findUnique = vi.fn();
vi.mock('@tradinjournal/db', () => ({
  prisma: { macroMember: { findUnique } },
}));

const { requireMember } = await import('../require-member.js');
const { ForbiddenError, UnauthorizedError } = await import('../../errors.js');

async function run(locals: Record<string, unknown>): Promise<Error | undefined> {
  const res = { locals } as unknown as Response;
  let captured: Error | undefined;
  const next = ((err?: Error) => { captured = err; }) as NextFunction;
  await requireMember({} as Request, res, next);
  return captured;
}

describe('requireMember', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('rejects when there is no authenticated user', async () => {
    const err = await run({});
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the user has never applied', async () => {
    findUnique.mockResolvedValue(null);
    const err = await run({ user: { id: 'u1', email: 'a@b.com' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects PENDING members', async () => {
    findUnique.mockResolvedValue({
      id: 'm1', userId: 'u1', status: 'PENDING', exchange: 'DELTA', exchangeUid: 'x', expiresAt: null,
    });
    const err = await run({ user: { id: 'u1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects REJECTED members', async () => {
    findUnique.mockResolvedValue({
      id: 'm1', userId: 'u1', status: 'REJECTED', exchange: 'DELTA', exchangeUid: 'x', expiresAt: null,
    });
    const err = await run({ user: { id: 'u1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('rejects APPROVED members whose plan has expired', async () => {
    findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      status: 'APPROVED',
      exchange: 'DELTA',
      exchangeUid: 'x',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const err = await run({ user: { id: 'u1' } });
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it('accepts APPROVED members and stamps res.locals.macroMember', async () => {
    findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      status: 'APPROVED',
      exchange: 'DELTA',
      exchangeUid: 'uid-9',
      expiresAt: null,
    });
    const locals: Record<string, unknown> = { user: { id: 'u1' } };
    const res = { locals } as unknown as Response;
    let err: Error | undefined;
    await requireMember({} as Request, res, ((e?: Error) => { err = e; }) as NextFunction);
    expect(err).toBeUndefined();
    expect(locals.macroMember).toEqual({
      id: 'm1',
      userId: 'u1',
      status: 'APPROVED',
      exchange: 'DELTA',
      exchangeUid: 'uid-9',
    });
  });

  it('accepts APPROVED members with a future expiresAt', async () => {
    findUnique.mockResolvedValue({
      id: 'm1',
      userId: 'u1',
      status: 'APPROVED',
      exchange: 'COINDCX',
      exchangeUid: 'y',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const err = await run({ user: { id: 'u1' } });
    expect(err).toBeUndefined();
  });
});
