import type { Deal, Trade, AccountStats, EquityPoint, SymbolStat, DayStat, DirectionStat } from '@tradinjournal/types';
import { getDeals } from '../../lib/broker-connector.js';
import { findAccountById } from '../accounts/accounts.repository.js';

async function getCredsAndDeals(userId: string, accountId: string): Promise<{ deals: Deal[]; balance: number }> {
  const account = await findAccountById(accountId, userId);
  if (!account) throw Object.assign(new Error('Broker account not found'), { statusCode: 404 });
  const pass = account.password;
  if (!pass) throw Object.assign(new Error('No password stored for this account'), { statusCode: 400 });

  const deals = await getDeals({ login: Number(account.mt5Login), password: pass, server: account.server });

  // extract starting balance from BALANCE deals
  const balance = deals
    .filter(d => d.type === 'BALANCE')
    .reduce((s, d) => s + parseFloat(d.profit), 0);

  return { deals, balance };
}

// ─── Trade reconstruction ────────────────────────────────────────────────────

export function reconstructTrades(deals: Deal[]): Trade[] {
  const byPosition = new Map<string, Deal[]>();

  for (const deal of deals) {
    if (deal.type === 'BALANCE') continue;
    if (!deal.positionId || deal.positionId === '0') continue;
    const group = byPosition.get(deal.positionId) ?? [];
    group.push(deal);
    byPosition.set(deal.positionId, group);
  }

  const trades: Trade[] = [];

  for (const [posId, posDeals] of byPosition) {
    posDeals.sort((a, b) => new Date(a.dealTime).getTime() - new Date(b.dealTime).getTime());

    const inDeals  = posDeals.filter(d => d.entry === 'IN');
    const outDeals = posDeals.filter(d => d.entry === 'OUT' || d.entry === 'INOUT' || d.entry === 'OUT_BY');

    if (inDeals.length === 0) continue;

    const totalInVol  = inDeals.reduce((s, d) => s + parseFloat(d.volume), 0);
    const totalOutVol = outDeals.reduce((s, d) => s + parseFloat(d.volume), 0);

    const entryPrice = totalInVol > 0
      ? inDeals.reduce((s, d) => s + parseFloat(d.price) * parseFloat(d.volume), 0) / totalInVol
      : 0;
    const exitPrice = totalOutVol > 0
      ? outDeals.reduce((s, d) => s + parseFloat(d.price) * parseFloat(d.volume), 0) / totalOutVol
      : null;

    const grossPnl   = posDeals.reduce((s, d) => s + parseFloat(d.profit), 0);
    const commission = posDeals.reduce((s, d) => s + parseFloat(d.commission), 0);
    const swap       = posDeals.reduce((s, d) => s + parseFloat(d.swap), 0);
    const netPnl     = grossPnl + commission + swap;

    const openTime  = inDeals[0]!.dealTime;
    const closeTime = outDeals.length > 0 ? outDeals[outDeals.length - 1]!.dealTime : null;
    const durationSecs = closeTime
      ? (new Date(closeTime).getTime() - new Date(openTime).getTime()) / 1000
      : null;

    const firstIn = inDeals[0]!;
    const direction: Trade['direction'] = firstIn.type === 'BUY' ? 'LONG' : 'SHORT';
    // Epsilon guards against float summation drift (e.g. many 0.01-lot fills)
    // making a fully-closed position compare as fractionally still open.
    const status: Trade['status'] = totalOutVol >= totalInVol - 1e-8 ? 'CLOSED' : 'OPEN';

    trades.push({
      positionId: posId,
      symbol: firstIn.symbol,
      direction,
      status,
      openTime,
      closeTime,
      entryPrice,
      exitPrice,
      volume: totalInVol,
      grossPnl,
      commission,
      swap,
      netPnl,
      durationSecs,
      deals: posDeals,
    });
  }

  return trades.sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());
}

// ─── Stats computation ────────────────────────────────────────────────────────

export function computeStats(trades: Trade[], startingBalance: number): AccountStats {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins   = closed.filter(t => t.netPnl > 0);
  const losses = closed.filter(t => t.netPnl <= 0);

  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const netPnl      = closed.reduce((s, t) => s + t.netPnl, 0);

  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const avgWin       = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss      = losses.length > 0 ? -grossLoss / losses.length : 0;
  const bestTrade    = closed.length > 0 ? Math.max(...closed.map(t => t.netPnl)) : 0;
  const worstTrade   = closed.length > 0 ? Math.min(...closed.map(t => t.netPnl)) : 0;
  const winRate      = closed.length > 0 ? wins.length / closed.length : 0;

  const durArr = closed.filter(t => t.durationSecs !== null);
  const avgDurationSecs = durArr.length > 0
    ? durArr.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / durArr.length
    : 0;

  // Equity curve (sorted by close time)
  const sorted = [...closed].sort((a, b) =>
    new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime()
  );
  const equityCurve: EquityPoint[] = [{ time: '', equity: startingBalance }];
  let equity = startingBalance;
  for (const t of sorted) {
    equity += t.netPnl;
    equityCurve.push({ time: t.closeTime!, equity });
  }

  // Max drawdown
  let peak = startingBalance;
  let maxDrawdownPct = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  // By symbol
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

  // By day of week
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayMap = new Map<string, { trades: number; netPnl: number }>();
  for (const t of closed) {
    const day = DAYS[new Date(t.closeTime!).getDay()]!;
    const d = dayMap.get(day) ?? { trades: 0, netPnl: 0 };
    d.trades++;
    d.netPnl += t.netPnl;
    dayMap.set(day, d);
  }
  const byDay: DayStat[] = DAYS
    .filter(d => dayMap.has(d))
    .map(day => ({ day, ...dayMap.get(day)! }));

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
    netPnl, totalTrades: closed.length, openTrades: trades.filter(t => t.status === 'OPEN').length,
    totalWins: wins.length, totalLosses: losses.length, winRate, profitFactor,
    avgWin, avgLoss, bestTrade, worstTrade, maxDrawdownPct, grossProfit, grossLoss,
    avgDurationSecs, startingBalance, currentEquity: equity,
    equityCurve, bySymbol, byDay,
    byDirection: { long, short },
    maxWinStreak,
    maxLossStreak,
  };
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function fetchDeals(userId: string, accountId: string): Promise<Deal[]> {
  const { deals } = await getCredsAndDeals(userId, accountId);
  return deals;
}

export async function fetchTrades(userId: string, accountId: string): Promise<Trade[]> {
  const { deals } = await getCredsAndDeals(userId, accountId);
  return reconstructTrades(deals);
}

export async function fetchStats(userId: string, accountId: string): Promise<AccountStats> {
  const { deals, balance } = await getCredsAndDeals(userId, accountId);
  const trades = reconstructTrades(deals);
  return computeStats(trades, balance);
}

// Trades + stats from a SINGLE bridge fetch. The MT5 bridge serialises on one
// terminal, so callers that need both (e.g. the AI coach grounding) must not run
// fetchTrades + fetchStats concurrently — that double-hits the terminal and can
// fail. This does one login and derives both.
export async function fetchStatsAndTrades(
  userId: string,
  accountId: string,
): Promise<{ stats: AccountStats; trades: Trade[] }> {
  const { deals, balance } = await getCredsAndDeals(userId, accountId);
  const trades = reconstructTrades(deals);
  return { trades, stats: computeStats(trades, balance) };
}
