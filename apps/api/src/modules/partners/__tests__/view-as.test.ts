import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/admin.js', () => ({ isAdmin: (e?: string) => e === 'boss@tradelogs.com' }));
vi.mock('@tradinjournal/db', () => ({ prisma: { partner: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'p1' ? { userId: 'u-partner' } : null) } } }));
const { viewAsPartner, partnerUserId } = await import('../view-as.js');

function run(method: string, query: Record<string, string>, email: string) {
  return new Promise<{ status?: number; body?: { error: { code: string } }; next: boolean; locals: Record<string, unknown> }>(resolve => {
    const out: { status?: number; body?: { error: { code: string } }; next: boolean; locals: Record<string, unknown> } = { next: false, locals: { user: { id: 'u-admin', email } } };
    const res = { locals: out.locals, status(c: number) { out.status = c; return this; }, json(b: { error: { code: string } }) { out.body = b; resolve(out); return this; } };
    void viewAsPartner({ method, query } as never, res as never, () => { out.next = true; resolve(out); });
  });
}

describe('view as partner', () => {
  it('does nothing without ?viewAs', async () => {
    const r = await run('GET', {}, 'someone@x.test');
    expect(r.next).toBe(true);
    expect(partnerUserId({ locals: r.locals } as never)).toBe('u-admin');
  });
  it('lets an admin read a partner’s data', async () => {
    const r = await run('GET', { viewAs: 'p1' }, 'boss@tradelogs.com');
    expect(r.next).toBe(true);
    expect(partnerUserId({ locals: r.locals } as never)).toBe('u-partner');
  });
  it('refuses non-admins', async () => {
    const r = await run('GET', { viewAs: 'p1' }, 'client@x.test');
    expect(r).toMatchObject({ status: 403, next: false, body: { error: { code: 'FORBIDDEN' } } });
  });
  it('refuses every change while viewing', async () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const r = await run(m, { viewAs: 'p1' }, 'boss@tradelogs.com');
      expect(r).toMatchObject({ status: 403, next: false, body: { error: { code: 'READ_ONLY' } } });
    }
  });
  it('404s an unknown partner', async () => {
    const r = await run('GET', { viewAs: 'nope' }, 'boss@tradelogs.com');
    expect(r).toMatchObject({ status: 404, next: false });
  });
});
