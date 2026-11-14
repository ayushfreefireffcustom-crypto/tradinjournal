// Database access for exchange_trade_level. The table comes from migration
// 20261115090000_exchange_trade_level; until it is applied every read here
// returns nothing and every write is skipped, logged once per process. This
// guard is separate from trade-data/store.ts so one missing table never hides
// the other.
import { Prisma, prisma } from '@tradinjournal/db';
import type { LevelSource } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { changed } from '../trade-data/levels.js';
import type { ExchangeLevelRow, NewExchangeLevel } from './exchange-levels.js';

/** Prisma "table / column does not exist" for this table. */
export function isMissingExchangeLevels(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'P2021' || code === 'P2022') return true;
  const msg = String((err as Error)?.message ?? '');
  return /relation "exchange_trade_level" does not exist|table .*exchange_trade_level.* does not exist/i.test(msg);
}

const RECHECK_MS = 10 * 60_000;
let missingUntil = 0;
let warned = false;
/** Test hook. */
export function resetExchangeLevelState(): void { missingUntil = 0; warned = false; }

async function guarded<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  if (Date.now() < missingUntil) return fallback;
  try {
    return await fn();
  } catch (err) {
    if (!isMissingExchangeLevels(err)) throw err;
    missingUntil = Date.now() + RECHECK_MS;
    if (!warned) {
      warned = true;
      logger.warn(`[exchange-levels] ${what}: exchange_trade_level is missing (migration 20261115090000_exchange_trade_level not applied); exchange stops and R stay off`);
    }
    return fallback;
  }
}

const num = (v: Prisma.Decimal | null | undefined) => (v == null ? null : Number(v));
const dec = (v: number | null) => (v == null ? null : new Prisma.Decimal(v));

/** Rows of one account observed at or after `since`, oldest first. */
export async function exchangeLevelRows(connectionId: string, since?: Date): Promise<ExchangeLevelRow[]> {
  const rows = await guarded('read', [] as Array<{ id: string; symbol: string; sl: Prisma.Decimal | null; tp: Prisma.Decimal | null; trail: Prisma.Decimal | null; source: string; observedAt: Date }>,
    () => prisma.exchangeTradeLevel.findMany({
      where: { connectionId, ...(since ? { observedAt: { gte: since } } : {}) },
      orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, symbol: true, sl: true, tp: true, trail: true, source: true, observedAt: true },
    }));
  return rows.map((r) => ({ id: r.id, symbol: r.symbol, sl: num(r.sl), tp: num(r.tp), trail: num(r.trail), source: r.source as LevelSource, observedAt: r.observedAt.getTime() }));
}

/** Insert rows; repeats of (account, order id, time) are skipped. Returns how many were new. */
export async function insertExchangeLevels(connectionId: string, rows: NewExchangeLevel[]): Promise<number> {
  if (!rows.length) return 0;
  return guarded('write', 0, async () => (await prisma.exchangeTradeLevel.createMany({
    data: rows.map((r) => ({
      connectionId, symbol: r.symbol, sl: dec(r.sl), tp: dec(r.tp), trail: dec(r.trail),
      source: r.source, exchangeOrderId: r.exchangeOrderId, observedAt: r.observedAt,
    })),
    skipDuplicates: true,
  })).count);
}

/**
 * Write a snapshot of a symbol's live protection unless it says what the
 * latest row of the current position already says. Rows from before the
 * symbol last went flat belong to an earlier trip and don't count.
 */
export async function recordSnapshotIfChanged(connectionId: string, row: NewExchangeLevel): Promise<boolean> {
  return guarded('snapshot', false, async () => {
    const [last, flat] = await Promise.all([
      prisma.exchangeTradeLevel.findFirst({ where: { connectionId, symbol: row.symbol, observedAt: { lte: row.observedAt } }, orderBy: [{ observedAt: 'desc' }, { id: 'desc' }], select: { sl: true, tp: true, observedAt: true } }),
      prisma.exchangeFill.findFirst({ where: { connectionId, symbol: row.symbol, positionAfter: 0 }, orderBy: { exchTs: 'desc' }, select: { exchTs: true } }),
    ]);
    const current = last && (!flat || last.observedAt > flat.exchTs) ? { sl: num(last.sl), tp: num(last.tp) } : null;
    if (!changed(current, { sl: row.sl, tp: row.tp })) return false;
    return (await insertExchangeLevels(connectionId, [row])) > 0;
  });
}
