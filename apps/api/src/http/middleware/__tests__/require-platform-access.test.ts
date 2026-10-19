import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { PLATFORM_ACCESS_ENABLED: true } }));
vi.mock('../../../lib/admin.js', () => ({ isAdmin: () => false }));
vi.mock('../../../modules/admin/settings.service.js', () => ({ isMaintenanceEnabled: async () => false, getMaintenanceMode: async () => ({}) }));
const assertPlatformAccess = vi.fn();
vi.mock('../../../modules/admin/access.service.js', () => ({ assertPlatformAccess: (...a: unknown[]) => assertPlatformAccess(...a) }));

const { requirePlatformAccess, clearAccessPassCache } = await import('../require-platform-access.js');

const call = (userId = 'u1', baseUrl = '/api/trades') => new Promise<unknown>(resolve => {
  void requirePlatformAccess({ baseUrl, path: '/' } as never, { locals: { user: { id: userId, email: `${userId}@x.test` } } } as never, err => resolve(err));
});

describe('requirePlatformAccess caching', () => {
  beforeEach(() => { assertPlatformAccess.mockReset(); clearAccessPassCache(); });

  it('remembers a pass, so a page burst costs one check', async () => {
    assertPlatformAccess.mockResolvedValue(undefined);
    const results = await Promise.all(Array.from({ length: 6 }, () => call()));
    await call();
    expect(results.every(r => r === undefined)).toBe(true);
    expect(assertPlatformAccess).toHaveBeenCalledTimes(1);
  });

  it('never caches a failure', async () => {
    const denied = Object.assign(new Error('inactive'), { statusCode: 403 });
    assertPlatformAccess.mockRejectedValueOnce(denied).mockResolvedValue(undefined);
    expect(await call()).toBe(denied);
    expect(await call()).toBeUndefined(); // re-checked, now passes
    expect(assertPlatformAccess).toHaveBeenCalledTimes(2);
  });

  it('keeps users and route kinds apart', async () => {
    assertPlatformAccess.mockResolvedValue(undefined);
    await call('u1'); await call('u2'); await call('u1', '/api/accounts');
    expect(assertPlatformAccess).toHaveBeenCalledTimes(3);
  });
});
