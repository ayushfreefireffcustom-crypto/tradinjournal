import { describe, it, expect, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: {} })); // no REDIS_URL → in-process counters
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn() } }));
const { perUserRateLimit } = await import('../rate-limit.js');

const run = async (mw: ReturnType<typeof perUserRateLimit>, userId?: string) => {
  const res = { locals: { user: userId ? { id: userId } : undefined }, setHeader: vi.fn() };
  let passed: unknown = 'not-called';
  await mw({} as never, res as never, (e?: unknown) => { passed = e; });
  return { err: passed, res };
};

describe('perUserRateLimit', () => {
  it('allows max requests per window per user, then 429s with Retry-After', async () => {
    const mw = perUserRateLimit({ name: `t${Math.random()}`, max: 3, windowSeconds: 60, message: 'slow down' });
    for (let i = 0; i < 3; i++) expect((await run(mw, 'u1')).err).toBeUndefined();
    const blocked = await run(mw, 'u1');
    expect(blocked.err).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED', message: 'slow down' });
    expect(blocked.res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect((await run(mw, 'u2')).err).toBeUndefined(); // other users unaffected
  });

  it('skips anonymous requests (auth runs first)', async () => {
    const mw = perUserRateLimit({ name: 'anon', max: 0, windowSeconds: 60, message: 'x' });
    expect((await run(mw)).err).toBeUndefined();
  });
});
