// "% of profit from the top 3 trades" (C2.3) over leader round trips. The
// round-trip rebuild itself lives in @tradinjournal/exchange so the API's
// leader analytics use exactly the same trades.
export { closedTrades, type ClosedTrade, type TradeFill } from '@tradinjournal/exchange';

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
