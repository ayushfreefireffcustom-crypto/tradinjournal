// Trade sync writes bridge levels when the bridge sends them, and works
// unchanged when it doesn't (Prisma mocked).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DealWithLevels } from '../../../lib/broker-connector.js';
import { MON } from './fixtures.js';

const db = vi.hoisted(() => ({
  brokerAccount: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  syncRun: { create: vi.fn(), update: vi.fn() },
  execution: { createMany: vi.fn() },
  tradeLevel: { findMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock('@tradinjournal/db', async () => {
  const { Prisma } = await vi.importActual<typeof import('@tradinjournal/db')>('@tradinjournal/db');
  return { prisma: db, Prisma };
});
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../accounts/accounts.credentials.js', () => ({ credsOf: () => ({ login: 1, password: 'p', server: 'S' }) }));

import { syncAccount } from '../../sync/sync.service.js';
import { resetStoreState } from '../store.js';

const deal = (p: Partial<DealWithLevels>): DealWithLevels => ({
  dealTicket: '1', orderTicket: '1', positionId: '7', symbol: 'EURUSD', type: 'BUY', entry: 'IN', volume: '0.1', price: '1.08', profit: '0',
  commission: '0', swap: '0', fee: '0', dealTime: new Date(MON).toISOString(), comment: '', ...p,
});

beforeEach(() => {
  resetStoreState();
  for (const m of Object.values(db)) for (const f of Object.values(m)) f.mockReset();
  db.brokerAccount.updateMany.mockResolvedValue({ count: 1 });
  db.brokerAccount.findUnique.mockResolvedValue({ id: 'a1', lastDealAt: null, password: 'x' });
  db.brokerAccount.update.mockResolvedValue({});
  db.syncRun.create.mockResolvedValue({ id: 'r1' });
  db.syncRun.update.mockResolvedValue({});
  db.execution.createMany.mockResolvedValue({ count: 0 });
  db.tradeLevel.findMany.mockResolvedValue([]);
  db.tradeLevel.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
});

describe('sync + bridge levels', () => {
  it('an older bridge (no sl/tp keys): no /positions call, no levels, no version bump', async () => {
    const positions = vi.fn();
    const r = await syncAccount('a1', { fetch: async () => [deal({})], positions });
    expect(r.status).toBe('synced');
    expect(positions).not.toHaveBeenCalled();
    expect(db.tradeLevel.createMany).not.toHaveBeenCalled();
    expect(db.brokerAccount.update.mock.calls[0]![0].data.dataVersion).toBeUndefined();
  });

  it('a newer bridge: stores the opening order and the snapshot, and bumps the version', async () => {
    const positions = vi.fn(async () => [{ positionId: '7', sl: 1.07, tp: 1.09, updatedAt: null }]);
    const r = await syncAccount('a1', { fetch: async () => [deal({ sl: 1.075, tp: 1.09 })], positions });
    expect(r.status).toBe('synced');
    const rows = db.tradeLevel.createMany.mock.calls[0]![0].data as Array<{ source: string }>;
    expect(rows.map(x => x.source)).toEqual(['order', 'bridge']);
    expect(db.brokerAccount.update.mock.calls[0]![0].data.dataVersion).toEqual({ increment: 1 });
  });

  it('a failing /positions call or a missing table never fails the sync', async () => {
    db.tradeLevel.findMany.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    const r = await syncAccount('a1', { fetch: async () => [deal({ sl: 1.075 })], positions: async () => { throw new Error('bridge down'); } });
    expect(r.status).toBe('synced');
  });
});
