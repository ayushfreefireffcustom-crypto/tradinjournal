// Exchange trade history (D18) and the exchange journal (D17). Fills are
// imported into exchange_fill: the first import reaches back a backfill window,
// later ones continue from where the last stopped (with a small overlap; the
// unique fill id makes repeats harmless). At import, each fill gets the exact
// position after it, worked back from the live position, so rebuilding round
// trips later never depends on what's open at the time.
import { createHash } from 'node:crypto';
import type { ExchangeJournalDto, HistoryImportResultDto, JournalTradeDto } from '@tradinjournal/contracts';
import { prisma, type ExchangeConnection } from '@tradinjournal/db';
import { closedTrades, ExchangeError } from '@tradinjournal/exchange';
import { logger } from '@tradinjournal/logger';
import { ConflictError, NotFoundError } from '../../http/errors.js';
import { credsOf, ExchangeRejectedError } from '../exchanges/exchanges.service.js';
import { anchorPositions, defaultTradingDeps, type TradingDeps } from './trading.service.js';

const DAY = 24 * 3600_000;
const DEFAULT_BACKFILL_DAYS = 90;
const OVERLAP_MS = 10 * 60_000;
/** Delta's position can lag a fresh fill by ~10 s; anchoring waits until the newest fill is this old. */
const SETTLE_MS = 30_000;
const MAX_FILLS = 5000;

/** A stable id for a round trip; journal notes attach to it (fits the journal's 64-char tradeId). */
export function tripKey(connectionId: string, symbol: string, openedAt: Date): string {
  return `ex-${createHash('sha256').update(`${connectionId}:${symbol}:${openedAt.toISOString()}`).digest('hex').slice(0, 40)}`;
}

async function ownConnection(userId: string, connectionId: string): Promise<ExchangeConnection> {
  const c = await prisma.exchangeConnection.findFirst({ where: { id: connectionId, userId } });
  if (!c) throw new NotFoundError('Exchange account not found');
  return c;
}

/** Import new fills for one connection. Safe to repeat and to run from two places at once. */
export async function importConnection(c: ExchangeConnection, days: number | undefined, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<HistoryImportResultDto> {
  if (c.status !== 'ACTIVE') throw new ConflictError('This exchange key stopped working. Reconnect it to import history.');
  const ex = deps.adapterFor(c.exchange, c.environment);
  const creds = credsOf(c, deps.key());
  const since = c.historySyncedAt ? new Date(c.historySyncedAt.getTime() - OVERLAP_MS) : new Date(now.getTime() - (days ?? DEFAULT_BACKFILL_DAYS) * DAY);
  try {
    const fills = (await ex.getFills(creds, { since, limit: MAX_FILLS }))
      .filter((f) => f.timestamp >= since)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const newest = fills[0]?.timestamp.getTime();
    if (newest && now.getTime() - newest < SETTLE_MS) await deps.sleep(SETTLE_MS - (now.getTime() - newest));
    const positions = await ex.getPositions(creds);
    const anchored = anchorPositions(fills, positions);
    const mults = new Map<string, number | null>();
    for (const f of anchored) {
      if (!mults.has(f.symbol)) mults.set(f.symbol, f.contractMultiplier ?? (await ex.getInstrument(f.symbol).catch(() => null))?.contractMultiplier ?? null);
    }
    const rows = anchored.map((f) => ({
      connectionId: c.id,
      externalId: f.externalId,
      exchangeOrderId: f.exchangeOrderId ?? null,
      symbol: f.symbol,
      side: f.side,
      qty: f.qty,
      price: f.price,
      fee: f.fee ?? null,
      exchTs: f.timestamp,
      positionAfter: f.positionAfter,
      contractMultiplier: mults.get(f.symbol) ?? null,
    }));
    const { count } = rows.length ? await prisma.exchangeFill.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    // Fills stored earlier by other paths (our own orders) may lack the import's extras: fill them in.
    for (const r of rows) {
      await prisma.exchangeFill.updateMany({ where: { connectionId: c.id, externalId: r.externalId, positionAfter: null }, data: { positionAfter: r.positionAfter, contractMultiplier: r.contractMultiplier } });
    }
    await prisma.exchangeConnection.update({ where: { id: c.id }, data: { historySyncedAt: now } });
    const truncated = fills.length >= MAX_FILLS;
    return {
      imported: count,
      seen: fills.length,
      from: since.toISOString(),
      to: now.toISOString(),
      message: count ? `Imported ${count} new ${count === 1 ? 'fill' : 'fills'}.${truncated ? ' That was the most one import takes; run it again for the rest.' : ''}` : 'Up to date: no new fills.',
    };
  } catch (err) {
    throw err instanceof ExchangeError ? new ExchangeRejectedError(err) : err;
  }
}

export async function importHistory(userId: string, connectionId: string, days: number | undefined, now = new Date(), deps: TradingDeps = defaultTradingDeps): Promise<HistoryImportResultDto> {
  return importConnection(await ownConnection(userId, connectionId), days, now, deps);
}

/** Background job: keep every active account's history at most 15 minutes old, a few at a time. */
export async function importDue(now = new Date(), deps: TradingDeps = defaultTradingDeps, batch = 20, scopeConnectionIds?: string[]): Promise<{ done: number; failed: number }> {
  const due = await prisma.exchangeConnection.findMany({
    where: { status: 'ACTIVE', ...(scopeConnectionIds ? { id: { in: scopeConnectionIds } } : {}), OR: [{ historySyncedAt: null }, { historySyncedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }] },
    orderBy: { historySyncedAt: { sort: 'asc', nulls: 'first' } },
    take: batch,
  });
  let done = 0;
  let failed = 0;
  for (const c of due) {
    try {
      await importConnection(c, undefined, now, deps);
      done++;
    } catch (err) {
      failed++;
      logger.debug('[history] import failed', { connectionId: c.id, err: String(err) });
    }
  }
  return { done, failed };
}

/** Closed round trips from the imported fills, with any journal note attached (D17). */
export async function exchangeJournal(userId: string, connectionId: string): Promise<ExchangeJournalDto> {
  const c = await ownConnection(userId, connectionId);
  const fills = await prisma.exchangeFill.findMany({
    where: { connectionId: c.id },
    orderBy: [{ exchTs: 'asc' }, { ingestedAt: 'asc' }],
    select: { symbol: true, side: true, qty: true, price: true, positionAfter: true, contractMultiplier: true, exchTs: true },
  });
  const mults = new Map<string, number | null>();
  for (const f of fills) if (f.contractMultiplier != null) mults.set(f.symbol, Number(f.contractMultiplier));
  const trips = closedTrades(
    fills.map((f) => ({ symbol: f.symbol, side: f.side, qty: Number(f.qty), price: Number(f.price), positionAfter: f.positionAfter != null ? Number(f.positionAfter) : null, ts: f.exchTs })),
    (s) => mults.get(s) ?? null,
  );
  const keyed = trips.map((t) => ({ t, key: tripKey(c.id, t.symbol, t.openedAt) }));
  const notes = keyed.length
    ? await prisma.journalEntry.findMany({ where: { userId, tradeId: { in: keyed.map((k) => k.key) } }, orderBy: { updatedAt: 'desc' } })
    : [];
  const noteFor = new Map<string, (typeof notes)[number]>();
  for (const n of notes) if (n.tradeId && !noteFor.has(n.tradeId)) noteFor.set(n.tradeId, n);
  const trades: JournalTradeDto[] = keyed.map(({ t, key }) => {
    const n = noteFor.get(key);
    return {
      key, symbol: t.symbol, side: t.side, qty: t.qty, avgEntry: t.avgEntry, avgExit: t.avgExit,
      pnlUsd: Math.round(t.pnlUsd * 100) / 100, openedAt: t.openedAt.toISOString(), closedAt: t.closedAt.toISOString(),
      note: n ? { id: n.id, body: n.body, emotion: n.emotion, tags: n.tags } : null,
    };
  });
  return {
    connection: { id: c.id, label: c.label, environment: c.environment },
    trades,
    startingEquityUsd: null,
    fillCount: fills.length,
    firstFillAt: fills[0]?.exchTs.toISOString() ?? null,
    historySyncedAt: c.historySyncedAt?.toISOString() ?? null,
  };
}
