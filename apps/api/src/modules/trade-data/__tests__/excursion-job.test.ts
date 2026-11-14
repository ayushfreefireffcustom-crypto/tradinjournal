// The MAE/MFE job with Prisma, the cache and candles mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MON, H, M, pos } from './fixtures.js';

const db = vi.hoisted(() => ({
  tradeLevel: { findFirst: vi.fn() },
  tradeExcursion: { findMany: vi.fn(), upsert: vi.fn() },
  brokerAccount: { findMany: vi.fn(), update: vi.fn() },
}));
const cache = vi.hoisted(() => new Map<string, unknown>());
const acct = vi.hoisted(() => ({ trades: new Map<string, unknown[]>() }));

vi.mock('@tradinjournal/db', async () => {
  const { Prisma } = await vi.importActual<typeof import('@tradinjournal/db')>('@tradinjournal/db');
  return { prisma: db, Prisma };
});
vi.mock('@tradinjournal/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/cache.js', () => ({
  cacheGet: vi.fn(async (k: string) => cache.get(k) ?? null),
  cacheSet: vi.fn(async (k: string, v: unknown) => { cache.set(k, v); }),
}));
vi.mock('../../../lib/broker-policy.js', () => ({ usableAccountsWhere: vi.fn(async () => undefined) }));
vi.mock('../../market/market.service.js', () => ({ getCandles: vi.fn() }));
vi.mock('../../sync/account-data.js', () => ({
  loadAccountData: vi.fn(async (_u: string, id: string) => ({ account: { id }, trades: () => acct.trades.get(id) ?? [] })),
}));

import { computeDueExcursions, resetExcursionCursor, type CandleFetch } from '../excursion.job.js';
import { resetStoreState } from '../store.js';

/** 1m bars around a gold long from 2000 → +5 points, dipping 2 below entry. */
const goldBars: CandleFetch = async q => {
  const out = [];
  for (let t = q.from * 1000; t <= q.to * 1000; t += 60_000) out.push({ openTime: t, low: 1998, high: 2005, close: 2002 });
  return out;
};

beforeEach(() => {
  resetStoreState(); resetExcursionCursor(); cache.clear(); acct.trades.clear();
  for (const m of Object.values(db)) for (const f of Object.values(m)) f.mockReset();
  db.tradeLevel.findFirst.mockResolvedValue(null);
  db.tradeExcursion.findMany.mockResolvedValue([]);
  db.tradeExcursion.upsert.mockResolvedValue({});
  db.brokerAccount.update.mockResolvedValue({});
  db.brokerAccount.findMany.mockResolvedValue([{ id: 'a1', userId: 'u1', baseCurrency: 'USD' }]);
});

describe('excursion job', () => {
  it('does nothing before the migration (no candles fetched)', async () => {
    db.tradeLevel.findFirst.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2021' }));
    const fetch = vi.fn(goldBars);
    expect(await computeDueExcursions({ fetch })).toEqual({ stored: 0, tried: 0, accounts: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores MAE/MFE for closed trades without one, newest first, and bumps the data version', async () => {
    const a = pos({ open: MON, net: 500, id: '1' }), b = pos({ open: MON + H, net: 500, id: '2' }), open = pos({ open: MON + 2 * H, open_: true, id: '3' });
    acct.trades.set('a1', [a, b, open]);
    db.tradeExcursion.findMany.mockResolvedValue([{ positionId: 1n }]); // a already has one
    const res = await computeDueExcursions({ fetch: goldBars });
    expect(res).toMatchObject({ stored: 1, tried: 1 });
    const call = db.tradeExcursion.upsert.mock.calls[0]![0];
    expect(call.where.brokerAccountId_positionId).toEqual({ brokerAccountId: 'a1', positionId: 2n });
    expect(Number(call.create.maePrice)).toBe(2);
    expect(Number(call.create.mfePrice)).toBe(5);
    expect(Number(call.create.maeMoney)).toBe(200); // 2 points × 1 lot × 100
    expect(call.create.timeframe).toBe('1m');
    expect(db.brokerAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { dataVersion: { increment: 1 } } });
  });

  it('caps the run and remembers symbols with no feed', async () => {
    acct.trades.set('a1', Array.from({ length: 70 }, (_, i) => pos({ open: MON + i * H, id: String(100 + i), symbol: 'WEIRD' })));
    const fetch = vi.fn(async () => []);
    const r1 = await computeDueExcursions({ fetch, limit: 60 });
    expect(r1.tried).toBeLessThanOrEqual(60);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(3 * 2); // first trade (≤ 3 timeframes) per worker, then the symbol is skipped
    fetch.mockClear();
    await computeDueExcursions({ fetch, limit: 60 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a trade whose candles look like another instrument is not retried every run', async () => {
    acct.trades.set('a1', [pos({ open: MON, id: '9', entry: 2000, hold: 20 * M })]);
    const other: CandleFetch = async q => [{ openTime: q.from * 1000, low: 18000, high: 18100, close: 18050 }];
    const fetch = vi.fn(other);
    await computeDueExcursions({ fetch });
    expect(db.tradeExcursion.upsert).not.toHaveBeenCalled();
    fetch.mockClear();
    await computeDueExcursions({ fetch });
    expect(fetch).not.toHaveBeenCalled();
  });
});
