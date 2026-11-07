import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = { PLATFORM_ACCESS_ENABLED: true, ADMIN_EMAILS_LIST: ['boss@tradelogs.com'] };
vi.mock('@tradinjournal/config', () => ({ env }));
const users = new Map<string, string>([['u-client', 'client@x.test'], ['u-boss', 'boss@tradelogs.com'], ['u-granted', 'Friend@X.test']]);
const grants = [{ email: 'friend@x.test' }];
vi.mock('@tradinjournal/db', () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => (users.has(where.id) ? { email: users.get(where.id) } : null) },
    accessGrant: {
      findFirst: async ({ where }: { where: { email: string } }) => grants.find(g => g.email === where.email) ?? null,
      findMany: async () => grants,
    },
  },
}));

const p = await import('../broker-policy.js');
const elefin = { server: 'Elefin-Trade' }, xellion = { server: 'Xellion-Live' };

describe('Elefin-only broker policy', () => {
  beforeEach(() => { env.PLATFORM_ACCESS_ENABLED = true; p.clearBrokerPolicyCache(); });

  it('recognises Elefin servers only by the server name', () => {
    expect(p.isElefinServer('Elefin-Trade')).toBe(true);
    expect(p.isElefinServer(' elefin-live 2')).toBe(true);
    expect(p.isElefinServer('Xellion-Live')).toBe(false);
    expect(p.isElefinServer('MyElefin-Fake')).toBe(false);
  });

  it('limits clients to Elefin accounts while the gate is on', async () => {
    expect(await p.elefinOnlyFor('u-client')).toBe(true);
    expect(await p.accountUsable('u-client', elefin)).toBe(true);
    expect(await p.accountUsable('u-client', xellion)).toBe(false);
    await expect(p.assertAccountUsable('u-client', xellion)).rejects.toMatchObject({ statusCode: 403, code: 'ELEFIN_ACCOUNTS_ONLY' });
    await expect(p.assertAccountUsable('u-client', elefin)).resolves.toBeUndefined();
  });

  it('splits a client’s accounts into usable and locked, keeping both', async () => {
    const { usable, locked } = await p.splitUsable('u-client', [elefin, xellion, { server: 'Elefin-Demo' }]);
    expect(usable.map(a => a.server)).toEqual(['Elefin-Trade', 'Elefin-Demo']);
    expect(locked.map(a => a.server)).toEqual(['Xellion-Live']);
  });

  it('admins and granted users can use any broker', async () => {
    expect(await p.elefinOnlyFor('u-boss')).toBe(false);
    expect(await p.accountUsable('u-boss', xellion)).toBe(true);
    expect(await p.elefinOnlyFor('u-granted')).toBe(false); // grant email matched case-insensitively
    expect((await p.splitUsable('u-granted', [xellion])).locked).toEqual([]);
  });

  it('does nothing while the gate is off', async () => {
    env.PLATFORM_ACCESS_ENABLED = false;
    expect(await p.elefinOnlyFor('u-client')).toBe(false);
    expect(await p.accountUsable('u-client', xellion)).toBe(true);
    expect(await p.usableAccountsWhere()).toBeUndefined();
  });

  it('background sync only picks Elefin accounts or exempt owners', async () => {
    expect(await p.usableAccountsWhere()).toEqual({
      OR: [
        { server: { startsWith: 'elefin', mode: 'insensitive' } },
        { user: { email: { in: ['boss@tradelogs.com', 'friend@x.test'], mode: 'insensitive' } } },
      ],
    });
  });
});
