// Client-side stats computation — a faithful port of the backend
// computeStats() in apps/api/src/modules/trades/trades.service.ts, so a date
// range can drive every widget on the client without a round-trip and stay
// consistent with the server for the ALL-time range.
import type { AccountStats, DayStat, DirectionStat, EquityPoint, SymbolStat, Trade } from './api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'ALL';

export const RANGES: RangeKey[] = ['1W', '1M', '3M', '1Y', 'ALL'];

// Start timestamp (ms) for a range relative to now; null means "all time".
export function rangeStart(range: RangeKey, now = Date.now()): number | null {
  const DAY = 86400000;
  switch (range) {
    case '1W': return now - 7 * DAY;
    case '1M': return now - 30 * DAY;
    case '3M': return now - 90 * DAY;
    case '1Y': return now - 365 * DAY;
    case 'ALL': return null;
  }
}

/**
 * Filter trades to a range and compute stats as if starting from the balance
 * at the range's start. Open trades are always kept (they are "current").
 * accountStartingBalance is the all-time starting balance from the API.
 */
export function statsForRange(trades: Trade[], accountStartingBalance: number, range: RangeKey): AccountStats {
  const start = rangeStart(range);
  const closed = trades.filter(t => t.status === 'CLOSED' && t.closeTime);

  // Balance carried into the range = starting balance + P&L realised before it.
  let baseBalance = accountStartingBalance;
  if (start !== null) {
    for (const t of closed) {
      if (new Date(t.closeTime!).getTime() < start) baseBalance += t.netPnl;
    }
  }

  const inRange = trades.filter(t => {
    if (t.status === 'OPEN') return true;
    if (!t.closeTime) return false;
    return start === null || new Date(t.closeTime).getTime() >= start;
  });

  return computeStats(inRange, baseBalance);
}

export interface RollingPoint {
  i: number;        // trade index (1-based)
  time: string;     // close time
  winRate: number;  // 0..1 over the trailing window
  expectancy: number; // avg net P&L over the trailing window
}

// Rolling win-rate and expectancy over a trailing window of closed trades,
// chronological by close time. Emits a point once `window` trades exist.
export function rollingSeries(trades: Trade[], window = 20): RollingPoint[] {
  const closed = trades
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());
  const out: RollingPoint[] = [];
  for (let i = 0; i < closed.length; i++) {
    if (i + 1 < window) continue;
    const slice = closed.slice(i + 1 - window, i + 1);
    const wins = slice.filter(t => t.netPnl > 0).length;
    const sum = slice.reduce((s, t) => s + t.netPnl, 0);
    out.push({
      i: i + 1,
      time: closed[i]!.closeTime!,
      winRate: wins / slice.length,
      expectancy: sum / slice.length,
    });
  }
  return out;
}

export interface ScatterPoint {
  hour: number;       // UTC open hour 0..23
  durationSecs: number;
  netPnl: number;
  volume: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  closeTime: string;
}

// Per-closed-trade points for the scatter plot (P&L vs time-of-day / duration).
export function scatterPoints(trades: Trade[]): ScatterPoint[] {
  return trades
    .filter(t => t.status === 'CLOSED' && t.closeTime)
    .map(t => ({
      hour: new Date(t.openTime).getUTCHours(),
      durationSecs: t.durationSecs ?? 0,
      netPnl: t.netPnl,
      volume: t.volume,
      symbol: t.symbol,
      direction: t.direction,
      closeTime: t.closeTime!,
    }));
}

export function computeStats(trades: Trade[], startingBalance: number): AccountStats {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.netPnl > 0);
  const losses = closed.filter(t => t.netPnl <= 0);

  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl = closed.reduce((s, t) => s + t.netPnl, 0);

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? -grossLoss / losses.length : 0;
  const bestTrade = closed.length > 0 ? Math.max(...closed.map(t => t.netPnl)) : 0;
  const worstTrade = closed.length > 0 ? Math.min(...closed.map(t => t.netPnl)) : 0;
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;

  const durArr = closed.filter(t => t.durationSecs !== null);
  const avgDurationSecs = durArr.length > 0
    ? durArr.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / durArr.length
    : 0;

  const sorted = [...closed]
    .filter(t => t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());
  const equityCurve: EquityPoint[] = [{ time: '', equity: startingBalance }];
  let equity = startingBalance;
  for (const t of sorted) {
    equity += t.netPnl;
    equityCurve.push({ time: t.closeTime!, equity });
  }

  let peak = startingBalance;
  let maxDrawdownPct = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  const symMap = new Map<string, { trades: number; wins: number; losses: number; netPnl: number }>();
  for (const t of closed) {
    const s = symMap.get(t.symbol) ?? { trades: 0, wins: 0, losses: 0, netPnl: 0 };
    s.trades++;
    s.netPnl += t.netPnl;
    if (t.netPnl > 0) s.wins++; else s.losses++;
    symMap.set(t.symbol, s);
  }
  const bySymbol: SymbolStat[] = Array.from(symMap.entries()).map(([symbol, s]) => ({
    symbol, ...s,
    winRate: s.trades > 0 ? s.wins / s.trades : 0,
    avgPnl: s.trades > 0 ? s.netPnl / s.trades : 0,
  })).sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));

  const dayMap = new Map<string, { trades: number; netPnl: number }>();
  for (const t of closed) {
    const day = DAYS[new Date(t.closeTime!).getDay()]!;
    const d = dayMap.get(day) ?? { trades: 0, netPnl: 0 };
    d.trades++;
    d.netPnl += t.netPnl;
    dayMap.set(day, d);
  }
  const byDay: DayStat[] = DAYS.filter(d => dayMap.has(d)).map(day => ({ day, ...dayMap.get(day)! }));

  // Long vs Short split.
  const long: DirectionStat = { trades: 0, wins: 0, netPnl: 0 };
  const short: DirectionStat = { trades: 0, wins: 0, netPnl: 0 };
  for (const t of closed) {
    const d = t.direction === 'LONG' ? long : short;
    d.trades++;
    d.netPnl += t.netPnl;
    if (t.netPnl > 0) d.wins++;
  }

  // Longest win / loss streaks (chronological, `sorted` is ascending by close).
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of sorted) {
    if (t.netPnl > 0) { curWin++; curLoss = 0; if (curWin > maxWinStreak) maxWinStreak = curWin; }
    else { curLoss++; curWin = 0; if (curLoss > maxLossStreak) maxLossStreak = curLoss; }
  }

  return {
    netPnl,
    totalTrades: closed.length,
    openTrades: trades.filter(t => t.status === 'OPEN').length,
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    bestTrade,
    worstTrade,
    maxDrawdownPct,
    grossProfit,
    grossLoss,
    avgDurationSecs,
    startingBalance,
    currentEquity: equity,
    equityCurve,
    bySymbol,
    byDay,
    byDirection: { long, short },
    maxWinStreak,
    maxLossStreak,
  };
}
