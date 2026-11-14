// Service layer with Prisma mocked: the missing-table path (migration not
// applied), ownership + validation on the stop editor, and the loader.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MON, H, pos } from './fixtures.js';

const db = vi.hoisted(() => ({
  tradeLevel: { findFirst: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), delete: vi.fn() },
  tradeExcursion: { findMany: vi.fn(), upsert: vi.fn() },
  trade: { findMany: vi.fn() },
  brokerAccount: { findFirst: vi.fn(), update: vi.fn() },
}));
const warn = vi.hoisted(() => vi.fn());
const data = vi.hoisted(() => ({ trades: [] as unknown[], throws: null as Error | null }));

vi.mock('@tradinjournal/db', async () => {
  const { Prisma } = await vi.importActual<typeof import('@tradinjournal/db')>('@tradinjournal/db');
  return { prisma: db, Prisma };
});
vi.mock('@tradinjournal/logger', () => ({ logger: { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../sync/account-data.js', () => ({
  loadAccountData: vi.fn(async () => {
    if (data.throws) throw data.throws;
    return { account: { id: 'acc1', baseCurrency: 'USD' }, trades: () => data.trades };
  }),
}));

import { addLevel, deleteLevel, loadTradeExtras, positionLevels } from '../trade-data.service.js';
import { isMissingTable, resetStoreState } from '../store.js';

const missing = () => Object.assign(new Error('The table `public.trade_level` does not exist in the current database.'), { code: 'P2021' });

beforeEach(() => {
  resetStoreState();
  for (const m of [db.tradeLevel, db.tradeExcursion, db.trade, db.brokerAccount]) for (const f of Object.values(m)) f.mockReset();
  warn.mockReset();
  db.trade.findMany.mockResolvedValue([]);
  db.brokerAccount.update.mockResolvedValue({});
  data.throws = null;
});

describe('missing tables (migration not applied)', () => {
  it('recognises P2021 / P2022', () => {
    expect(isMissingTable(missing())).toBe(true);
    expect(isMissingTable({ code: 'P2022' })).toBe(true);
    expect(isMissingTable(new Error('boom'))).toBe(false);
  });

  it('the loader returns no levels / excursions, logs once, and stops querying', async () => {
    db.tradeLevel.findMany.mockRejectedValue(missing());
    db.tradeExcursion.findMany.mockRejectedValue(missing());
    const t = pos({ open: MON, net: 50 });
    const a = await loadTradeExtras({ id: 'acc1', baseCurrency: 'USD' }, [t]);
    expect(a.extras.get(t.positionId)).toMatchObject({ r: null, stop: null, move: null, mae: null });
    await loadTradeExtras({ id: 'acc1', baseCurrency: 'USD' }, [t]);
    expect(warn).toHaveBeenCalledTimes(1);
    // After the first miss the tables aren't queried again for a while.
    expect(db.tradeLevel.findMany.mock.calls.length + db.tradeExcursion.findMany.mock.calls.length).toBeLessThanOrEqual(2);
    expect(await positionLevels('acc1', t)).toMatchObject({ available: false, history: [] });
  });

  it('adding a stop says it can’t be saved yet (409), never 500', async () => {
    const t = pos({ open: MON, id: '42' });
    data.trades = [t];
    db.tradeLevel.findFirst.mockRejectedValue(missing());
    await expect(addLevel('u1', { accountId: 'acc1', positionId: '42', sl: 1990, source: 'user' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('other database errors are not swallowed', async () => {
    db.tradeLevel.findMany.mockRejectedValue(new Error('connection reset'));
    db.tradeExcursion.findMany.mockResolvedValue([]);
    await expect(loadTradeExtras({ id: 'acc1', baseCurrency: 'USD' }, [])).rejects.toThrow('connection reset');
  });
});

describe('stop editor', () => {
  beforeEach(() => {
    db.tradeLevel.findFirst.mockResolvedValue({ id: 'probe' });
    db.tradeLevel.findMany.mockResolvedValue([]);
    db.tradeLevel.createMany.mockResolvedValue({ count: 1 });
  });

  it('checks the account through loadAccountData (ownership)', async () => {
    data.throws = Object.assign(new Error('Broker account not found'), { statusCode: 404 });
    await expect(addLevel('intruder', { accountId: 'acc1', positionId: '42', sl: 1990, source: 'user' })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.tradeLevel.createMany).not.toHaveBeenCalled();
  });

  it('404 for a position that isn’t on the account', async () => {
    data.trades = [pos({ open: MON, id: '41' })];
    await expect(addLevel('u1', { accountId: 'acc1', positionId: '42', sl: 1990, source: 'user' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a stop on the winning side of entry (422)', async () => {
    data.trades = [pos({ open: MON, id: '42', entry: 2000 })];
    await expect(addLevel('u1', { accountId: 'acc1', positionId: '42', sl: 2005, source: 'user' })).rejects.toMatchObject({ statusCode: 422 });
    expect(db.tradeLevel.createMany).not.toHaveBeenCalled();
  });

  it('stores a new row and bumps the data version so every page refreshes', async () => {
    data.trades = [pos({ open: MON, id: '42', entry: 2000 })];
    const out = await addLevel('u1', { accountId: 'acc1', positionId: '42', sl: 1990, tp: 2020, source: 'user' }, new Date(MON + H));
    const row = db.tradeLevel.createMany.mock.calls[0]![0].data[0];
    expect(row).toMatchObject({ brokerAccountId: 'acc1', positionId: 42n, source: 'user', observedAt: new Date(MON + H) });
    expect(Number(row.sl)).toBe(1990);
    expect(db.brokerAccount.update).toHaveBeenCalledWith({ where: { id: 'acc1' }, data: { dataVersion: { increment: 1 } } });
    expect(out.levels.available).toBe(true);
  });

  it('deletes only the trader’s own rows on their own account', async () => {
    db.brokerAccount.findFirst.mockResolvedValueOnce(null);
    await expect(deleteLevel('intruder', { accountId: 'acc1', id: 'l1' })).rejects.toMatchObject({ statusCode: 404 });
    db.brokerAccount.findFirst.mockResolvedValueOnce({ id: 'acc1' });
    db.tradeLevel.findFirst.mockResolvedValueOnce(null);
    await expect(deleteLevel('u1', { accountId: 'acc1', id: 'bridge-row' })).rejects.toMatchObject({ statusCode: 404 });
    expect(db.tradeLevel.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ source: { in: ['user', 'plan'] } }) }));
    data.trades = [pos({ open: MON, id: '42' })];
    db.brokerAccount.findFirst.mockResolvedValueOnce({ id: 'acc1' });
    db.tradeLevel.findFirst.mockResolvedValueOnce({ id: 'l1', positionId: 42n }).mockResolvedValue({ id: 'probe' });
    db.tradeLevel.delete.mockResolvedValue({});
    await deleteLevel('u1', { accountId: 'acc1', id: 'l1' });
    expect(db.tradeLevel.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
  });
});

describe('loader', () => {
  it('turns levels, excursions and stored R into per-position extras', async () => {
    const a = pos({ open: MON, net: 500, id: '1' }), b = pos({ open: MON + H, net: -100, id: '2' });
    db.tradeLevel.findMany.mockResolvedValue([{ id: 'x', positionId: 1n, sl: 1995, tp: null, source: 'order', observedAt: new Date(MON) }]);
    db.tradeExcursion.findMany.mockResolvedValue([{ positionId: 2n, maePrice: 3, mfePrice: 1, maeMoney: null, mfeMoney: null, timeframe: '1m', bars: 30 }]);
    db.trade.findMany.mockResolvedValue([{ symbol: 'XAUUSD', openTime: new Date(MON + H), rMultiple: -0.5, metric: null }]);
    const { extras } = await loadTradeExtras({ id: 'acc1', baseCurrency: 'USD' }, [a, b]);
    expect(extras.get('1')).toMatchObject({ r: 1, rFrom: 'stop', stop: 1995 });
    expect(extras.get('2')).toMatchObject({ r: -0.5, rFrom: 'stored', mae: 300, mfe: 100 });
  });
});
