import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@tradinjournal/config', () => ({
  env: { CORS_ORIGIN: 'https://www.tradelogs.com, http://localhost:3009/', APP_URL: 'https://app.example.com' },
}));

const { requireSameOrigin } = await import('../require-same-origin.js');
const { ForbiddenError } = await import('../../errors.js');

function call(method: string, origin?: string): Error | undefined {
  const req = { method, get: (name: string) => (name === 'origin' ? origin : undefined) } as unknown as Request;
  let captured: Error | undefined = new Error('next not called');
  const next = ((err?: Error) => { captured = err; }) as NextFunction;
  requireSameOrigin(req, {} as Response, next);
  return captured;
}

describe('requireSameOrigin', () => {
  it('refuses a cookie-carrying write from another site', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(call(m, 'https://evil.example')).toBeInstanceOf(ForbiddenError);
  });

  it('refuses look-alike origins', () => {
    expect(call('POST', 'https://www.tradelogs.com.evil.example')).toBeInstanceOf(ForbiddenError);
    expect(call('POST', 'http://www.tradelogs.com')).toBeInstanceOf(ForbiddenError);
    expect(call('POST', 'null')).toBeInstanceOf(ForbiddenError);
  });

  it('allows writes from every configured web origin (comma list, trailing slash, APP_URL)', () => {
    expect(call('POST', 'https://www.tradelogs.com')).toBeUndefined();
    expect(call('DELETE', 'http://localhost:3009')).toBeUndefined();
    expect(call('PATCH', 'https://app.example.com')).toBeUndefined();
  });

  it('allows non-browser callers, which send no Origin and carry no ambient cookie', () => {
    expect(call('POST', undefined)).toBeUndefined();
  });

  it('never blocks reads', () => {
    expect(call('GET', 'https://evil.example')).toBeUndefined();
    expect(call('OPTIONS', 'https://evil.example')).toBeUndefined();
  });
});
