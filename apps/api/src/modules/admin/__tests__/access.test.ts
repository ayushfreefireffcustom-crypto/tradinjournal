import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({
  env: {
    ELEFIN_VERIFY_MODE: 'stub',
    ACCESS_MIN_TRADES_7D: 2,
    ACCESS_ACTIVITY_WINDOW_DAYS: 7,
    ADMIN_EMAILS_LIST: ['admin@test.com'],
    MACRO_ADMIN_EMAILS_LIST: [],
  },
}));

describe('isAdmin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('matches admin emails case-insensitively', async () => {
    const { isAdmin } = await import('../../../lib/admin.js');
    expect(isAdmin('Admin@Test.com')).toBe(true);
    expect(isAdmin('other@test.com')).toBe(false);
  });
});

describe('StubElefinProvider', () => {
  it('verifies @elefin.test emails', async () => {
    const { getElefinProvider, resetElefinProvider } = await import('../elefin.provider.js');
    resetElefinProvider();
    const p = getElefinProvider();
    const r = await p.verifyUnderUs({ email: 'trader@elefin.test' });
    expect(r.verified).toBe(true);
  });

  it('rejects unknown emails without stub logins', async () => {
    const { getElefinProvider, resetElefinProvider } = await import('../elefin.provider.js');
    resetElefinProvider();
    process.env.ELEFIN_STUB_LOGINS = '99999';
    const p = getElefinProvider();
    const r = await p.verifyUnderUs({ email: 'nobody@example.com' });
    expect(r.verified).toBe(false);
    delete process.env.ELEFIN_STUB_LOGINS;
  });
});
