// Database access for trade_level / trade_excursion. The tables come from
// migration 20261114130000_trading_data; until it is applied every read here
// returns "no data" and every write is skipped, logged once per process (no
// 500s, no log spam). `available()` tells the UI whether it can offer edits.
import { Prisma, prisma } from '@tradinjournal/db';
import type { LevelSource } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import type { LevelRow } from './levels.js';

/** Prisma "table / column does not exist". */
export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'P2021' || code === 'P2022') return true;
  const msg = String((err as Error)?.message ?? '');
  return /relation "trade_(level|excursion)" does not exist|table .*trade_(level|excursion).* does not exist/i.test(msg);
}

/** While the tables are missing we skip the database and look again after this long (the migration is applied by hand, without a redeploy). */
const RECHECK_MS = 10 * 60_000;
let missingUntil = 0;
let warned = false;
/** Test hook. */
export function resetStoreState(): void { missingUntil = 0; warned = false; }
const isMissingNow = () => Date.now() < missingUntil;

/** Runs `fn`; a missing table turns into `fallback` (logged once). Other errors propagate. */
export async function guarded<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  if (isMissingNow()) return fallback;
  try {
    return await fn();
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    missingUntil = Date.now() + RECHECK_MS;
    if (!warned) {
      warned = true;
      logger.warn(`[trade-data] ${what}: trade_level / trade_excursion tables are missing (migration 20261114130000_trading_data not applied); stops, R and MAE/MFE stay off`);
    }
    return fallback;
  }
}

/** Checks for the table once (cheap) so pages can hide edits before the migration. */
export async function available(): Promise<boolean> {
  return guarded('probe', false, async () => { await prisma.tradeLevel.findFirst({ select: { id: true } }); return true; });
}

const num = (v: Prisma.Decimal | null | undefined) => (v == null ? null : Number(v));
type LevelRecord = { id: string; positionId: bigint; sl: Prisma.Decimal | null; tp: Prisma.Decimal | null; source: string; observedAt: Date };
const toRow = (r: LevelRecord): LevelRow => ({ id: r.id, sl: num(r.sl), tp: num(r.tp), source: r.source as LevelSource, observedAt: r.observedAt.getTime() });

/** Every level row of an account, grouped by position id (string). */
export async function levelsByPosition(accountId: string, positionIds?: string[]): Promise<Map<string, LevelRow[]>> {
  const rows = await guarded('read levels', [] as LevelRecord[], () => prisma.tradeLevel.findMany({
    where: { brokerAccountId: accountId, ...(positionIds ? { positionId: { in: positionIds.filter(id => /^\d{1,19}$/.test(id)).map(BigInt) } } : {}) },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, positionId: true, sl: true, tp: true, source: true, observedAt: true },
  }));
  const out = new Map<string, LevelRow[]>();
  for (const r of rows) {
    const k = r.positionId.toString();
    (out.get(k) ?? out.set(k, []).get(k)!).push(toRow(r));
  }
  return out;
}

export interface NewLevel { positionId: string; sl: number | null; tp: number | null; source: LevelSource; observedAt: Date }

export async function insertLevels(accountId: string, rows: NewLevel[]): Promise<number> {
  if (!rows.length) return 0;
  return guarded('write levels', 0, async () => (await prisma.tradeLevel.createMany({
    data: rows.map(r => ({
      brokerAccountId: accountId, positionId: BigInt(r.positionId), source: r.source, observedAt: r.observedAt,
      sl: r.sl == null ? null : new Prisma.Decimal(r.sl), tp: r.tp == null ? null : new Prisma.Decimal(r.tp),
    })),
  })).count);
}

/** Deletes one of the trader's own rows; returns false when it isn't theirs / not found. */
export async function deleteOwnLevel(accountId: string, id: string): Promise<{ positionId: string } | null> {
  return guarded('delete level', null, async () => {
    const row = await prisma.tradeLevel.findFirst({ where: { id, brokerAccountId: accountId, source: { in: ['user', 'plan'] } }, select: { id: true, positionId: true } });
    if (!row) return null;
    await prisma.tradeLevel.delete({ where: { id: row.id } });
    return { positionId: row.positionId.toString() };
  });
}

export interface ExcursionRow { maePrice: number; mfePrice: number; maeMoney: number | null; mfeMoney: number | null; timeframe: string; bars: number }

export async function excursionsByPosition(accountId: string): Promise<Map<string, ExcursionRow>> {
  const rows = await guarded('read excursions', [] as Array<{ positionId: bigint; maePrice: Prisma.Decimal; mfePrice: Prisma.Decimal; maeMoney: Prisma.Decimal | null; mfeMoney: Prisma.Decimal | null; timeframe: string; bars: number }>,
    () => prisma.tradeExcursion.findMany({
      where: { brokerAccountId: accountId },
      select: { positionId: true, maePrice: true, mfePrice: true, maeMoney: true, mfeMoney: true, timeframe: true, bars: true },
    }));
  return new Map(rows.map(r => [r.positionId.toString(), {
    maePrice: Number(r.maePrice), mfePrice: Number(r.mfePrice), maeMoney: num(r.maeMoney), mfeMoney: num(r.mfeMoney), timeframe: r.timeframe, bars: r.bars,
  }]));
}

export async function excursionIds(accountId: string): Promise<Set<string>> {
  const rows = await guarded('read excursion ids', [] as Array<{ positionId: bigint }>,
    () => prisma.tradeExcursion.findMany({ where: { brokerAccountId: accountId }, select: { positionId: true } }));
  return new Set(rows.map(r => r.positionId.toString()));
}

export async function upsertExcursion(accountId: string, positionId: string, e: ExcursionRow & { source: string }): Promise<boolean> {
  return guarded('write excursion', false, async () => {
    const data = {
      maePrice: new Prisma.Decimal(e.maePrice), mfePrice: new Prisma.Decimal(e.mfePrice),
      maeMoney: e.maeMoney == null ? null : new Prisma.Decimal(e.maeMoney), mfeMoney: e.mfeMoney == null ? null : new Prisma.Decimal(e.mfeMoney),
      timeframe: e.timeframe, bars: e.bars, source: e.source, computedAt: new Date(),
    };
    await prisma.tradeExcursion.upsert({
      where: { brokerAccountId_positionId: { brokerAccountId: accountId, positionId: BigInt(positionId) } },
      create: { brokerAccountId: accountId, positionId: BigInt(positionId), ...data },
      update: data,
    });
    return true;
  });
}

/**
 * Derived trades/stats and the insights pages are cached per (account,
 * dataVersion); bumping it makes a level or excursion write show at once,
 * on every API instance.
 */
export async function bumpDataVersion(accountId: string): Promise<void> {
  await prisma.brokerAccount.update({ where: { id: accountId }, data: { dataVersion: { increment: 1 } } }).catch(() => {});
}
