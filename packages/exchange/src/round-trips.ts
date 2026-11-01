// Round trips rebuilt from an account's fills: one position from flat back to
// flat (a flip closes one and opens the next). P&L is in USD via each symbol's
// contract multiplier. Used for leader stats (C2.3) and the leader analytics
// (C4.3b). Pure, so it is unit tested without a database.
import { applyFill, type Dir, type PosState } from './positions.js';

export interface TradeFill {
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  /** Signed position after the fill, when the venue reports it. */
  positionAfter: number | null;
  ts: Date;
}

export interface ClosedTrade {
  symbol: string;
  side: Dir;
  /** Largest size the position reached, in contracts. */
  qty: number;
  /** Average entry price of the position. */
  avgEntry: number;
  /** Quantity-weighted average of the closing fills. */
  avgExit: number;
  pnlUsd: number;
  openedAt: Date;
  closedAt: Date;
}

interface OpenTrip {
  side: Dir;
  peak: number;
  openedAt: Date;
  pnl: number;
  exitQty: number;
  exitNotional: number;
}

/**
 * Closed trades in fill order. A position that was already open before the
 * first fill we saw has an unknown entry price, so it is skipped: the symbol
 * is tracked from `positionAfter` until it next goes flat, and only trades
 * opened after that count. Symbols with no multiplier are skipped.
 */
export function closedTrades(fills: TradeFill[], multiplierOf: (symbol: string) => number | null): ClosedTrade[] {
  const out: ClosedTrade[] = [];
  const state = new Map<string, { pos: PosState | null; known: boolean; signed: number; trip: OpenTrip | null }>();
  for (const f of fills) {
    const mult = multiplierOf(f.symbol);
    if (mult == null) continue;
    const s = state.get(f.symbol) ?? { pos: null, known: true, signed: 0, trip: null };
    state.set(f.symbol, s);
    const delta = f.side === 'BUY' ? f.qty : -f.qty;
    // The venue says where the position was before this fill; if that isn't
    // what we tracked, part of it predates what we saw.
    if (f.positionAfter != null && !approx(f.positionAfter - delta, s.signed)) {
      s.known = approx(f.positionAfter, 0);
      s.pos = null;
      s.trip = null;
      s.signed = s.known ? 0 : f.positionAfter;
      continue;
    }
    if (!s.known) {
      s.signed += delta;
      if (approx(s.signed, 0)) { s.known = true; s.signed = 0; }
      continue;
    }
    const before = s.signed;
    const after = before + delta;
    const r = applyFill(s.pos, f.side, f.qty, f.price, mult);
    if (approx(before, 0)) {
      s.trip = { side: delta > 0 ? 'LONG' : 'SHORT', peak: 0, openedAt: f.ts, pnl: 0, exitQty: 0, exitNotional: 0 };
    }
    const trip = s.trip!;
    const reducing = !approx(before, 0) && Math.sign(delta) !== Math.sign(before);
    if (reducing) {
      const closedQty = Math.min(Math.abs(before), Math.abs(delta));
      trip.exitQty += closedQty;
      trip.exitNotional += closedQty * f.price;
      trip.pnl += r.realizedDelta;
    }
    const flipped = !approx(before, 0) && !approx(after, 0) && Math.sign(after) !== Math.sign(before);
    if (!reducing || flipped) trip.peak = Math.max(trip.peak, flipped ? Math.abs(before) : Math.abs(after));
    if (approx(after, 0) || flipped) {
      out.push({
        symbol: f.symbol,
        side: trip.side,
        qty: trip.peak,
        avgEntry: s.pos?.avgEntry ?? f.price,
        avgExit: trip.exitQty > 0 ? trip.exitNotional / trip.exitQty : f.price,
        pnlUsd: trip.pnl,
        openedAt: trip.openedAt,
        closedAt: f.ts,
      });
      s.trip = flipped ? { side: after > 0 ? 'LONG' : 'SHORT', peak: Math.abs(after), openedAt: f.ts, pnl: 0, exitQty: 0, exitNotional: 0 } : null;
    }
    s.signed = approx(after, 0) ? 0 : after;
    s.pos = s.signed === 0 ? null : { side: r.side, qty: r.qty, avgEntry: r.avgEntry };
  }
  return out;
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
