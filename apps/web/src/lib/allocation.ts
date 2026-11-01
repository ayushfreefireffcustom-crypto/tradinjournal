// Allocation (QW.7): the share of closed trades per symbol, the five busiest
// plus "Others". Five, not six: in a ring the sixth series colour would sit
// next to the first, and those two are too alike to tell apart.
import type { AccountStats } from './api';

export interface AllocationSlice { key: string; label: string; trades: number; netPnl: number; color: string }

export function allocationSlices(rows: AccountStats['bySymbol']): { total: number; slices: AllocationSlice[] } {
  const total = rows.reduce((a, r) => a + r.trades, 0);
  const top = [...rows].sort((a, b) => b.trades - a.trades || Math.abs(b.netPnl) - Math.abs(a.netPnl) || a.symbol.localeCompare(b.symbol)).slice(0, 5);
  const rest = rows.filter((r) => !top.includes(r));
  const slices: AllocationSlice[] = top.map((r, i) => ({ key: r.symbol, label: r.symbol, trades: r.trades, netPnl: r.netPnl, color: `var(--series-${i + 1})` }));
  if (rest.length) slices.push({ key: '__other', label: `Others (${rest.length})`, trades: rest.reduce((a, r) => a + r.trades, 0), netPnl: rest.reduce((a, r) => a + r.netPnl, 0), color: 'var(--series-other)' });
  return { total, slices: slices.filter((x) => x.trades > 0) };
}
