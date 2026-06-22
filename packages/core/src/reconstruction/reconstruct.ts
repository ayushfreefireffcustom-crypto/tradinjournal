import { Decimal } from 'decimal.js';
import type { RawDeal, ReconstructedTrade, TradeSide, BalanceEvent } from '../types.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ReconstructionResult {
  trades: ReconstructedTrade[];
  balanceEvents: BalanceEvent[];
  skipped: bigint[];
}

/**
 * Turn a flat list of raw MT5 deals into reconstructed round-trip trades.
 *
 * Works identically for NETTING and HEDGING accounts — in both modes each
 * positionId maps to one round-trip. Deals must be sorted by dealTime
 * ascending before calling this function.
 */
export function reconstructTrades(deals: RawDeal[]): ReconstructionResult {
  const tradingDeals: RawDeal[] = [];
  const balanceEvents: BalanceEvent[] = [];
  const skipped: bigint[] = [];

  for (const deal of deals) {
    if (deal.type === 'BALANCE') {
      balanceEvents.push({
        ticket: deal.dealTicket,
        amount: deal.profit,
        comment: deal.comment ?? '',
        eventTime: deal.dealTime,
      });
    } else if (deal.type === 'BUY' || deal.type === 'SELL') {
      tradingDeals.push(deal);
    } else {
      skipped.push(deal.dealTicket);
    }
  }

  const grouped = groupByPosition(tradingDeals);
  const trades: ReconstructedTrade[] = [];

  for (const [positionId, positionDeals] of grouped) {
    const result = buildTrade(positionId, positionDeals);
    if (result !== null) trades.push(result);
    else skipped.push(...positionDeals.map((d) => d.dealTicket));
  }

  trades.sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

  return { trades, balanceEvents, skipped };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function groupByPosition(deals: RawDeal[]): Map<bigint, RawDeal[]> {
  const map = new Map<bigint, RawDeal[]>();
  for (const deal of deals) {
    const group = map.get(deal.positionId) ?? [];
    group.push(deal);
    map.set(deal.positionId, group);
  }
  return map;
}

function buildTrade(positionId: bigint, deals: RawDeal[]): ReconstructedTrade | null {
  const sorted = [...deals].sort(
    (a, b) =>
      a.dealTime.getTime() - b.dealTime.getTime() ||
      (a.dealTicket < b.dealTicket ? -1 : 1),
  );

  const expanded = expandInout(sorted);

  const entryDeals = expanded.filter((d) => d._entry === 'IN');
  const exitDeals = expanded.filter((d) => d._entry === 'OUT' || d._entry === 'OUT_BY');

  if (entryDeals.length === 0) return null;

  // noUncheckedIndexedAccess: length > 0 is confirmed above
  const firstEntry = entryDeals[0]!;
  const side: TradeSide = firstEntry.type === 'BUY' ? 'BUY' : 'SELL';

  // ── entry stats ──
  let totalEntryVolume = new Decimal(0);
  let weightedEntryPrice = new Decimal(0);

  for (const d of entryDeals) {
    weightedEntryPrice = weightedEntryPrice.plus(d._volume.times(d._price));
    totalEntryVolume = totalEntryVolume.plus(d._volume);
  }

  const avgEntry = totalEntryVolume.isZero()
    ? new Decimal(0)
    : weightedEntryPrice.div(totalEntryVolume);

  // ── exit stats ──
  let totalExitVolume = new Decimal(0);
  let weightedExitPrice = new Decimal(0);
  let grossPnl = new Decimal(0);

  for (const d of exitDeals) {
    weightedExitPrice = weightedExitPrice.plus(d._volume.times(d._price));
    totalExitVolume = totalExitVolume.plus(d._volume);
    grossPnl = grossPnl.plus(d.profit);
  }

  const avgExit = totalExitVolume.isZero()
    ? null
    : weightedExitPrice.div(totalExitVolume);

  // ── totals ──
  let commission = new Decimal(0);
  let swap = new Decimal(0);

  for (const d of expanded) {
    commission = commission.plus(d.commission);
    swap = swap.plus(d.swap);
  }

  const netPnl = grossPnl.plus(commission).plus(swap);

  // ── status & timestamps ──
  const status =
    totalExitVolume.greaterThanOrEqualTo(totalEntryVolume) ? 'CLOSED' : 'OPEN';

  const openTime = firstEntry.dealTime;
  const closeTime =
    exitDeals.length > 0
      ? exitDeals.reduce(
          (latest, d) => (d.dealTime > latest ? d.dealTime : latest),
          exitDeals[0]!.dealTime,
        )
      : null;

  return {
    positionId,
    symbol: sorted[0]!.symbol,
    side,
    status,
    openTime,
    closeTime,
    volume: totalEntryVolume,
    avgEntry,
    avgExit,
    grossPnl,
    commission,
    swap,
    netPnl,
    dealTickets: sorted.map((d) => d.dealTicket),
  };
}

// ─── INOUT expansion ──────────────────────────────────────────────────────────

interface ExpandedDeal extends RawDeal {
  _entry: 'IN' | 'OUT' | 'OUT_BY';
  _volume: Decimal;
  _price: Decimal;
}

/**
 * An INOUT deal closes the current position AND opens a new one in the
 * opposite direction (reversal). Split into two virtual legs:
 *   OUT leg — closes the existing position, carries the profit
 *   IN  leg — opens the new reversed position, zero P&L
 */
function expandInout(deals: RawDeal[]): ExpandedDeal[] {
  const result: ExpandedDeal[] = [];

  for (const deal of deals) {
    if (deal.entry === 'INOUT') {
      result.push({ ...deal, _entry: 'OUT', _volume: deal.volume, _price: deal.price });
      result.push({
        ...deal,
        profit: new Decimal(0),
        commission: new Decimal(0),
        swap: new Decimal(0),
        _entry: 'IN',
        _volume: deal.volume,
        _price: deal.price,
      });
    } else {
      result.push({
        ...deal,
        _entry: deal.entry === 'OUT_BY' ? 'OUT_BY' : (deal.entry as 'IN' | 'OUT'),
        _volume: deal.volume,
        _price: deal.price,
      });
    }
  }

  return result;
}
