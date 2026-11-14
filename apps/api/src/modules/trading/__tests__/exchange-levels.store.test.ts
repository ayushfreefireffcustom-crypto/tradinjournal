// exchange_trade_level access degrades to "no data" before its migration is
// applied, and snapshots are only written when they say something new (Prisma mocked).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  exchangeTradeLevel: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
  exchangeFill: { findFirst: vi.fn() },
}));
const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('@tradinjournal/db', async () => {
  const { Prisma } = await vi.importActual<typeof import('@tradinjournal/db')>('@tradinjournal/db');
  return { prisma: db, Prisma };
});
vi.mock('@tradinjournal/logger', () => ({ logger: log }));

import { Prisma } from '@tradinjournal/db';
import { exchangeLevelRows, insertExchangeLevels, isMissingExchangeLevels, recordSnapshotIfChanged, resetExchangeLevelState } from '../exchange-levels.store.js';

const missing = () => Object.assign(new Error('The table `public.exchange_trade_level` does not exist in the current database.'), { code: 'P2021' });
const at = new Date('2026-11-01T12:00:00Z');
const snap = { symbol: 'BTCUSD', sl: 69_000, tp: 72_000, trail: null, source: 'exchange' as const, exchangeOrderId: 's1', observedAt: at };

beforeEach(() => {
  resetExchangeLevelState();
  for (const m of Object.values(db)) for (const f of Object.values(m)) f.mockReset();
  for (const f of Object.values(log)) f.mockReset();
  db.exchangeTradeLevel.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  db.exchangeFill.findFirst.mockResolvedValue(null);
});

describe('exchange level store', () => {
  it('recognises a missing table, and only that', () => {
    expect(isMissingExchangeLevels(missing())).toBe(true);
    expect(isMissingExchangeLevels(new Error('relation "exchange_trade_level" does not exist'))).toBe(true);
    expect(isMissingExchangeLevels(new Error('connection refused'))).toBe(false);
  });

  it('before the migration: reads are empty, writes are skipped, warned once, and the database is left alone for a while', async () => {
    db.exchangeTradeLevel.findMany.mockRejectedValue(missing());
    db.exchangeTradeLevel.createMany.mockRejectedValue(missing());
    expect(await exchangeLevelRows('c1')).toEqual([]);
    expect(await insertExchangeLevels('c1', [snap])).toBe(0);
    expect(await recordSnapshotIfChanged('c1', snap)).toBe(false);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(db.exchangeTradeLevel.findMany).toHaveBeenCalledTimes(1);
    expect(db.exchangeTradeLevel.createMany).not.toHaveBeenCalled(); // skipped while known missing
  });

  it('other database errors still surface', async () => {
    db.exchangeTradeLevel.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(exchangeLevelRows('c1')).rejects.toThrow(/connection refused/);
  });

  it('reads decimals as numbers and inserts with skipDuplicates', async () => {
    db.exchangeTradeLevel.findMany.mockResolvedValue([{ id: 'a', symbol: 'BTCUSD', sl: new Prisma.Decimal('69000.5'), tp: null, trail: new Prisma.Decimal(25), source: 'order', observedAt: at }]);
    expect(await exchangeLevelRows('c1', at)).toEqual([{ id: 'a', symbol: 'BTCUSD', sl: 69000.5, tp: null, trail: 25, source: 'order', observedAt: at.getTime() }]);
    expect(db.exchangeTradeLevel.findMany.mock.calls[0]![0].where).toEqual({ connectionId: 'c1', observedAt: { gte: at } });
    expect(await insertExchangeLevels('c1', [snap])).toBe(1);
    const arg = db.exchangeTradeLevel.createMany.mock.calls[0]![0];
    expect(arg.skipDuplicates).toBe(true);
    expect(Number(arg.data[0].sl)).toBe(69_000);
    expect(arg.data[0].trail).toBeNull();
  });

  it('writes a snapshot only when it differs from the current position’s latest row', async () => {
    db.exchangeTradeLevel.findFirst.mockResolvedValue({ sl: new Prisma.Decimal(69_000), tp: new Prisma.Decimal(72_000), observedAt: new Date(at.getTime() - 60_000) });
    expect(await recordSnapshotIfChanged('c1', snap)).toBe(false);
    expect(await recordSnapshotIfChanged('c1', { ...snap, sl: 69_500 })).toBe(true);
    // The same levels again after the symbol went flat belong to a new trip: written.
    db.exchangeFill.findFirst.mockResolvedValue({ exchTs: new Date(at.getTime() - 30_000) });
    expect(await recordSnapshotIfChanged('c1', snap)).toBe(true);
    // Nothing set and nothing before: nothing to write.
    db.exchangeTradeLevel.findFirst.mockResolvedValue(null);
    expect(await recordSnapshotIfChanged('c1', { ...snap, sl: null, tp: null })).toBe(false);
    expect(db.exchangeTradeLevel.createMany).toHaveBeenCalledTimes(2);
  });
});
