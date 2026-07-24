import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// The guard reads env at call time, so a mutable mock lets each case pick its
// own configuration — including "no token configured", which a running server
// can't demonstrate without being restarted with a broken env.
const mockEnv: { INTERNAL_API_TOKEN?: string } = {};
vi.mock('@tradinjournal/config', () => ({ env: mockEnv }));

const { requireInternalToken } = await import('../require-internal-token.js');
const { UnauthorizedError } = await import('../../errors.js');

const VALID = 'a'.repeat(64);

function call(header?: string): Error | undefined {
  const req = { get: (name: string) => (name === 'x-internal-token' ? header : undefined) } as unknown as Request;
  let captured: Error | undefined;
  const next = ((err?: Error) => { captured = err; }) as NextFunction;
  requireInternalToken(req, {} as Response, next);
  return captured;
}

describe('requireInternalToken', () => {
  beforeEach(() => {
    mockEnv.INTERNAL_API_TOKEN = VALID;
  });

  it('rejects when no token is configured — unconfigured means CLOSED, not open', () => {
    delete mockEnv.INTERNAL_API_TOKEN;
    const err = call(VALID);
    expect(err).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a request with no token header', () => {
    expect(call(undefined)).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an empty token', () => {
    expect(call('')).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a wrong token of the same length', () => {
    expect(call('b'.repeat(64))).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a token that is merely a prefix of the real one', () => {
    expect(call(VALID.slice(0, 32))).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a token with the real one as a prefix', () => {
    expect(call(`${VALID}extra`)).toBeInstanceOf(UnauthorizedError);
  });

  it('accepts the configured token', () => {
    expect(call(VALID)).toBeUndefined();
  });
});
