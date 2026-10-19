import { describe, it, expect, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { SYNC_CONCURRENCY: 1 } }));
vi.mock('../sync.service.js', () => ({ syncAccount: vi.fn() }));
const { SyncQueue } = await import('../sync.queue.js');

const ok = { status: 'synced' as const, added: 0, pulled: 0, full: false };

function controllable() {
  const order: string[] = [];
  const gates = new Map<string, () => void>();
  const run = (id: string) => new Promise<typeof ok>(res => { order.push(id); gates.set(id, () => res(ok)); });
  const finish = async (id: string) => { gates.get(id)!(); await new Promise(r => setTimeout(r, 0)); };
  return { order, run, finish };
}

describe('SyncQueue', () => {
  it('runs one at a time and dedupes the same account', async () => {
    const c = controllable();
    const q = new SyncQueue(c.run, 1);
    const a1 = q.request('a'), a2 = q.request('a'), b = q.request('b');
    expect(a1).toBe(a2);
    expect(c.order).toEqual(['a']);
    expect(q.stats()).toEqual({ waiting: 1, active: 1 });
    await c.finish('a');
    expect(c.order).toEqual(['a', 'b']);
    await c.finish('b');
    await expect(Promise.all([a1, b])).resolves.toEqual([ok, ok]);
    expect(q.stats()).toEqual({ waiting: 0, active: 0 });
  });

  it('puts user-facing syncs ahead of background ones (FIFO within a priority)', async () => {
    const c = controllable();
    const q = new SyncQueue(c.run, 1);
    q.request('busy', 'low');
    q.request('bg1', 'low'); q.request('bg2', 'low');
    q.request('user1', 'high'); q.request('user2', 'high');
    for (const id of ['busy', 'user1', 'user2', 'bg1']) await c.finish(id);
    expect(c.order).toEqual(['busy', 'user1', 'user2', 'bg1', 'bg2']);
  });

  it('promotes a waiting background sync when a user asks for the same account', async () => {
    const c = controllable();
    const q = new SyncQueue(c.run, 1);
    q.request('busy'); q.request('x', 'low'); q.request('y', 'low');
    q.request('y', 'high');
    await c.finish('busy');
    expect(c.order).toEqual(['busy', 'y']);
  });

  it('respects concurrency and survives a throwing runner', async () => {
    let running = 0, peak = 0;
    const q = new SyncQueue(async id => {
      running++; peak = Math.max(peak, running);
      await new Promise(r => setTimeout(r, 5));
      running--;
      if (id === 'boom') throw new Error('kaput');
      return ok;
    }, 2);
    const results = await Promise.all(['a', 'boom', 'c', 'd'].map(id => q.request(id)));
    expect(peak).toBe(2);
    expect(results[1]).toMatchObject({ status: 'failed', error: expect.objectContaining({ message: 'kaput' }) });
    expect(results[3]).toEqual(ok);
  });
});
