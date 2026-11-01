// Leader round trips rebuilt from their fills (C2.3), for "% of profit from the
// top 3 trades". A trade is one position from flat back to flat (a flip closes
// one and opens the next). P&L is in USD via each symbol's contract multiplier.
// DB-free so it can be unit tested.
import { applyFill, type PosState } from './position.js';

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
  pnlUsd: number;
  closedAt: Date;
}

/**
 * Closed trades in fill order. A position that was already open before the
 * first fill we saw has an unknown entry price, so its P&L is skipped: the
 * symbol is tracked from `positionAfter` until it next goes flat, and only
 * trades opened after that count. Symbols with no multiplier are skipped.
 */
export function closedTrades(fills: TradeFill[], multiplierOf: (symbol: string) => number | null): ClosedTrade[] {
  const out: ClosedTrade[] = [];
  const state = new Map<string, { pos: PosState | null; known: boolean; pnl: number; signed: number }>();
  for (const f of fills) {
    const mult = multiplierOf(f.symbol);
    if (mult == null) continue;
    const s = state.get(f.symbol) ?? { pos: null, known: true, pnl: 0, signed: 0 };
    state.set(f.symbol, s);
    const delta = f.side === 'BUY' ? f.qty : -f.qty;
    // The venue says where the position was before this fill; if that isn't
    // what we tracked, part of it predates what we saw.
    if (f.positionAfter != null && !approx(f.positionAfter - delta, s.signed)) {
      s.known = false;
      s.pos = null;
      s.pnl = 0;
      s.signed = f.positionAfter;
      if (approx(s.signed, 0)) s.known = true;
      continue;
    }
    if (!s.known) {
      s.signed += delta;
      if (approx(s.signed, 0)) { s.known = true; s.signed = 0; }
      continue;
    }
    const before = s.signed;
    const r = applyFill(s.pos, f.side, f.qty, f.price, mult);
    s.pnl += r.realizedDelta;
    s.signed = before + delta;
    const flipped = before !== 0 && Math.sign(s.signed) !== 0 && Math.sign(s.signed) !== Math.sign(before);
    if (r.closed || flipped || approx(s.signed, 0)) {
      out.push({ symbol: f.symbol, pnlUsd: s.pnl, closedAt: f.ts });
      s.pnl = 0;
    }
    s.pos = approx(s.signed, 0) ? null : { side: r.side, qty: r.qty, avgEntry: r.avgEntry };
    if (approx(s.signed, 0)) s.signed = 0;
  }
  return out;
}

/** Fewer closed trades than this and the share says nothing (3 of 3 is always 100%). */
export const MIN_TRADES_FOR_TOP3 = 5;

/**
 * Share of gross profit (winning trades only) that came from the 3 best trades,
 * 0–100. null with too few trades or no winners: unknown, not 0.
 */
export function top3ProfitSharePct(trades: Array<{ pnlUsd: number }>): number | null {
  if (trades.length < MIN_TRADES_FOR_TOP3) return null;
  const wins = trades.map((t) => t.pnlUsd).filter((p) => p > 0).sort((a, b) => b - a);
  const gross = wins.reduce((a, b) => a + b, 0);
  if (gross <= 0) return null;
  return (wins.slice(0, 3).reduce((a, b) => a + b, 0) / gross) * 100;
}

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
