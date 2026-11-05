import { describe, it, expect, vi, beforeEach } from 'vitest';

const env: { PLATFORM_ACCESS_ENABLED: boolean; ELEFIN_VERIFY_MODE: string } = { PLATFORM_ACCESS_ENABLED: true, ELEFIN_VERIFY_MODE: 'stub' };
vi.mock('@tradinjournal/config', () => ({ env }));
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

describe('requirePlatformAccess in broker mode', () => {
  beforeEach(() => { assertPlatformAccess.mockReset(); clearAccessPassCache(); env.ELEFIN_VERIFY_MODE = 'broker'; });

  it('lets a locked-out user reach their accounts, so they can connect Elefin', async () => {
    const denied = Object.assign(new Error('elefin'), { statusCode: 403 });
    assertPlatformAccess.mockRejectedValue(denied);
    expect(await call('u9', '/api/accounts')).toBeUndefined();
    expect(await call('u9', '/api/trades')).toBe(denied);
    expect(assertPlatformAccess).toHaveBeenCalledTimes(1);
  });
});
