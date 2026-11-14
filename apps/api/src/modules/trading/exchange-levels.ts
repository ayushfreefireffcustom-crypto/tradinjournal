// Stop loss / take profit for exchange (crypto) round trips: pure functions
// over exchange_trade_level rows (no I/O). The stop-at-entry / stop-move rules
// are the MT5 ones (../trade-data/levels.ts), reused unchanged.
//
//   • Delta nets one position per product, so a row belongs to the round trip
//     of its symbol whose [openedAt − grace, closedAt] contains it. The grace
//     covers a stop we write a moment before the exchange stamps the entry fill.
//     A row inside one trip and the next one's grace goes to the earlier trip.
//   • Rows observed after the trip closed never count (a stop that just
//     triggered is gone from the open orders: that is not a removed stop).
//   • risk$ = |entry − stop at entry| × peak contracts × contract value, and
//     R = pnlUsd ÷ risk$. pnlUsd is the realized price P&L, before fees and
//     funding (the exchange journal has no fee/funding ledger yet), so R here
//     is slightly better than net R would be.
import type { LevelSource, StopMove } from '@tradinjournal/contracts';
import type { HistoricalOrder, OrderInfo } from '@tradinjournal/exchange';
import { riskTo } from '../trade-data/enrich.js';
import { stopAtEntry, stopMove, targetAtEntry, type LevelRow } from '../trade-data/levels.js';

export interface ExchangeLevelRow extends LevelRow {
  symbol: string;
  trail: number | null;
}

/** A row about to be written. */
export interface NewExchangeLevel {
  symbol: string;
  sl: number | null;
  tp: number | null;
  trail: number | null;
  source: Extract<LevelSource, 'exchange' | 'order' | 'user'>;
  exchangeOrderId: string | null;
  observedAt: Date;
}

/** A stop written up to this long before the entry fill's exchange time still belongs to the trip. */
export const GRACE_MS = 60_000;
/**
 * A snapshot without a stop this close before the close is most likely the
 * stop triggering (gone from the open orders before the closing fill printed),
 * not the trader removing it, so it is ignored.
 */
export const TRIGGER_SETTLE_MS = 10_000;

export interface TripWindow {
  key: string;
  symbol: string;
  openedAt: Date;
  closedAt: Date;
}

/** Level rows per trip key (each row in at most one trip). */
export function levelsForTrips(trips: TripWindow[], rows: ExchangeLevelRow[], graceMs = GRACE_MS): Map<string, ExchangeLevelRow[]> {
  const bySymbol = new Map<string, TripWindow[]>();
  for (const t of trips) (bySymbol.get(t.symbol) ?? bySymbol.set(t.symbol, []).get(t.symbol)!).push(t);
  for (const list of bySymbol.values()) list.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  const out = new Map<string, ExchangeLevelRow[]>();
  for (const r of rows) {
    const list = bySymbol.get(r.symbol);
    if (!list) continue;
    // Sorted by open time: the first trip that can hold the row is the earliest,
    // so a row inside one trip and in the next one's grace stays with the first.
    const t = list.find((x) => r.observedAt >= x.openedAt.getTime() - graceMs && r.observedAt <= x.closedAt.getTime());
    if (!t) continue;
    if (r.source === 'exchange' && r.sl == null && t.closedAt.getTime() - r.observedAt < TRIGGER_SETTLE_MS) continue;
    (out.get(t.key) ?? out.set(t.key, []).get(t.key)!).push(r);
  }
  return out;
}

export interface TripLevels {
  stop: number | null;
  stopSource: LevelSource | null;
  target: number | null;
  move: StopMove | null;
  risk: number | null;
  r: number | null;
}

export const NO_TRIP_LEVELS: TripLevels = { stop: null, stopSource: null, target: null, move: null, risk: null, r: null };

/**
 * Stop at entry, first target, stop move, money at risk and R for one closed
 * trip. `contractValue` is the instrument's contract value (base units per
 * contract, = USD per point per contract on Delta's USD-margined perpetuals).
 */
export function tripLevels(rows: LevelRow[], t: { side: 'LONG' | 'SHORT'; avgEntry: number; qty: number; pnlUsd: number }, contractValue: number | null): TripLevels {
  if (!rows.length) return NO_TRIP_LEVELS;
  const stopRow = stopAtEntry(rows);
  const targetRow = targetAtEntry(rows);
  const risk = stopRow ? riskTo(t.side, t.avgEntry, stopRow.sl!, t.qty, contractValue) : null;
  return {
    stop: stopRow?.sl ?? null,
    stopSource: stopRow?.source ?? null,
    target: targetRow?.tp ?? null,
    move: stopMove(rows, t.side),
    risk,
    r: risk != null ? Math.round((t.pnlUsd / risk) * 100) / 100 : null,
  };
}

export interface ProtectiveOrder {
  exchangeOrderId: string;
  kind: 'SL' | 'TP';
  /** Trigger price; null / 0 when the venue doesn't say (a trailing stop). */
  price: number | null;
  trail: number | null;
  qty: number;
}

/** A reduce-only stop or take-profit order as a protective order; null for anything else. */
export function protectiveOf(o: OrderInfo): ProtectiveOrder | null {
  if (!o.reduceOnly) return null;
  const kind = o.type === 'STOP_MARKET' || o.type === 'STOP_LIMIT' ? 'SL' : o.type === 'TAKE_PROFIT_MARKET' || o.type === 'TAKE_PROFIT_LIMIT' ? 'TP' : null;
  if (!kind) return null;
  return { exchangeOrderId: o.exchangeOrderId, kind, price: o.stopPrice ?? o.limitPrice ?? null, trail: o.trailAmount ?? null, qty: Math.max(0, o.qty - o.filledQty) };
}

const positive = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) && v > 0 ? v : null);

/**
 * One snapshot of a position's live protection. With several stops (or
 * targets) the one covering the most contracts speaks for the position. A
 * trailing stop without a trigger price starts at mark − trail (long) or
 * mark + trail (short); without a mark only the trail is known.
 */
export function snapshotOf(orders: ProtectiveOrder[], side: 'LONG' | 'SHORT', mark: number | null): { sl: number | null; tp: number | null; trail: number | null; exchangeOrderId: string | null } {
  const pick = (kind: 'SL' | 'TP') => orders.filter((o) => o.kind === kind).sort((a, b) => b.qty - a.qty)[0] ?? null;
  const sl = pick('SL');
  const tp = pick('TP');
  let slPrice = positive(sl?.price);
  const trail = positive(sl?.trail);
  if (slPrice == null && trail != null && positive(mark) != null) {
    const start = side === 'LONG' ? mark! - trail : mark! + trail;
    slPrice = start > 0 ? start : null;
  }
  return { sl: slPrice, tp: positive(tp?.price), trail, exchangeOrderId: sl?.exchangeOrderId ?? tp?.exchangeOrderId ?? null };
}

/**
 * One 'order' row per historical stop / take-profit order, at the time it was
 * created. A stop that opens a position isn't a stop loss; its bracket SL/TP
 * (and those on any other order) are. A trailing stop's start isn't in the
 * history (its last trigger price would overstate the stop), so only the
 * trail is kept for it.
 */
export function historyRows(orders: HistoricalOrder[]): NewExchangeLevel[] {
  const out: NewExchangeLevel[] = [];
  for (const o of orders) {
    if (!o.createdAt || !o.symbol || !o.exchangeOrderId) continue;
    const p = o.reduceOnly || o.bracketOrder ? protectiveOf({ ...o, reduceOnly: true }) : null;
    const trailing = p?.kind === 'SL' && positive(p.trail) != null;
    const sl = p?.kind === 'SL' && !trailing ? positive(p.price) : null;
    const tp = p?.kind === 'TP' ? positive(p.price) : null;
    const row: NewExchangeLevel = {
      symbol: o.symbol,
      sl: sl ?? (o.bracketTrailAmount ? null : positive(o.bracketStopLoss)),
      tp: tp ?? positive(o.bracketTakeProfit),
      trail: trailing ? p!.trail : positive(o.bracketTrailAmount),
      source: 'order',
      exchangeOrderId: o.exchangeOrderId,
      observedAt: o.createdAt,
    };
    if (row.sl != null || row.tp != null || row.trail != null) out.push(row);
  }
  return out;
}
