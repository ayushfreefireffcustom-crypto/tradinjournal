// Builds a compact, token-bounded "trader profile card" from a trader's own
// stats / trades / journal. This is the ONLY thing sent to the LLM for grounding
// — aggregates plus a small recent-trades digest, never the raw deals[] blob —
// so a chat message stays ~1–2k tokens and costs a fraction of a cent.
import type { AccountStats, Trade, SymbolStat, DirectionStat } from '@tradinjournal/types';
import { buildInsights, NEGATIVE_EMOTIONS, type JournalLike } from './insights.js';

/** How many most-recent closed trades to include in the digest. */
export const RECENT_TRADES_CAP = 20;

export interface RecentTradeDigest {
  symbol: string;
  direction: string;
  netPnl: number;
  /** Rough R: netPnl relative to the trader's typical loss size (null if unknown). */
  rProxy: number | null;
  durationSecs: number | null;
  closeTime: string;
}

export interface TraderContext {
  summary: {
    netPnl: number;
    totalTrades: number;
    openTrades: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    maxDrawdownPct: number;
    maxWinStreak: number;
    maxLossStreak: number;
    avgDurationSecs: number;
    startingBalance: number;
    currentEquity: number;
  };
  bestDay: { day: string; netPnl: number; trades: number } | null;
  worstDay: { day: string; netPnl: number; trades: number } | null;
  bestSession: { name: string; netPnl: number } | null;
  direction: { long: DirectionStat; short: DirectionStat };
  holdAsymmetry: { winnerAvgSecs: number; loserAvgSecs: number; ratio: number } | null;
  topSymbols: SymbolStat[];
  worstSymbols: SymbolStat[];
  tilt: { count: number; netPnl: number } | null;
  recentTrades: RecentTradeDigest[];
  insights: string[];
}

const SESSIONS = ['Asia', 'London', 'New York'] as const;

function sessionOf(openTimeUtcHour: number): (typeof SESSIONS)[number] {
  if (openTimeUtcHour < 7) return 'Asia';
  if (openTimeUtcHour < 13) return 'London';
  if (openTimeUtcHour < 22) return 'New York';
  return 'Asia';
}

function avgHold(arr: Trade[]): number | null {
  const w = arr.filter(t => t.durationSecs != null);
  return w.length ? w.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / w.length : null;
}

export function buildTraderContext(stats: AccountStats, trades: Trade[], journal: JournalLike[]): TraderContext {
  const closed = trades.filter(t => t.status === 'CLOSED' && t.closeTime);

  const expectancy = stats.totalTrades > 0 ? stats.netPnl / stats.totalTrades : 0;
  const typicalLoss = Math.abs(stats.avgLoss);

  // Best / worst weekday
  const byDaySorted = [...stats.byDay].sort((a, b) => b.netPnl - a.netPnl);
  const bestDay = byDaySorted.length ? byDaySorted[0]! : null;
  const worstDay = byDaySorted.length ? byDaySorted[byDaySorted.length - 1]! : null;

  // Best session
  const sess: Record<string, number> = { Asia: 0, London: 0, 'New York': 0 };
  for (const t of closed) sess[sessionOf(new Date(t.openTime).getUTCHours())]! += t.netPnl;
  const bestSessionEntry = Object.entries(sess).sort((a, b) => b[1] - a[1])[0];
  const bestSession = bestSessionEntry ? { name: bestSessionEntry[0], netPnl: bestSessionEntry[1] } : null;

  // Hold-time asymmetry
  const winnerAvgSecs = avgHold(closed.filter(t => t.netPnl > 0));
  const loserAvgSecs = avgHold(closed.filter(t => t.netPnl <= 0));
  const holdAsymmetry =
    winnerAvgSecs != null && loserAvgSecs != null && winnerAvgSecs > 0
      ? { winnerAvgSecs, loserAvgSecs, ratio: loserAvgSecs / winnerAvgSecs }
      : null;

  // Symbols (bySymbol is already sorted by |netPnl| desc — re-sort by netPnl for best/worst)
  const bySymbolByPnl = [...stats.bySymbol].sort((a, b) => b.netPnl - a.netPnl);
  const topSymbols = bySymbolByPnl.slice(0, 5);
  const worstSymbols = bySymbolByPnl.filter(s => s.netPnl < 0).slice(-3).reverse();

  // Tilt (journal negative emotions tied to closed trades)
  const closedById = new Map(closed.map(t => [t.positionId, t]));
  let tiltPnl = 0, tiltCount = 0;
  for (const e of journal) {
    if (!e.emotion || !e.tradeId || !NEGATIVE_EMOTIONS.includes(e.emotion)) continue;
    const t = closedById.get(e.tradeId);
    if (t) { tiltPnl += t.netPnl; tiltCount++; }
  }
  const tilt = tiltCount > 0 ? { count: tiltCount, netPnl: tiltPnl } : null;

  // Recent-trades digest (most recent by close time, capped)
  const recentTrades: RecentTradeDigest[] = [...closed]
    .sort((a, b) => new Date(b.closeTime!).getTime() - new Date(a.closeTime!).getTime())
    .slice(0, RECENT_TRADES_CAP)
    .map(t => ({
      symbol: t.symbol,
      direction: t.direction,
      netPnl: t.netPnl,
      rProxy: typicalLoss > 0 ? t.netPnl / typicalLoss : null,
      durationSecs: t.durationSecs,
      closeTime: t.closeTime!,
    }));

  return {
    summary: {
      netPnl: stats.netPnl,
      totalTrades: stats.totalTrades,
      openTrades: stats.openTrades,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      expectancy,
      avgWin: stats.avgWin,
      avgLoss: stats.avgLoss,
      bestTrade: stats.bestTrade,
      worstTrade: stats.worstTrade,
      maxDrawdownPct: stats.maxDrawdownPct,
      maxWinStreak: stats.maxWinStreak ?? 0,
      maxLossStreak: stats.maxLossStreak ?? 0,
      avgDurationSecs: stats.avgDurationSecs,
      startingBalance: stats.startingBalance,
      currentEquity: stats.currentEquity,
    },
    bestDay: bestDay && bestDay.netPnl > 0 ? bestDay : null,
    worstDay: worstDay && worstDay.netPnl < 0 ? worstDay : null,
    bestSession: bestSession && bestSession.netPnl > 0 ? bestSession : null,
    direction: stats.byDirection ?? { long: { trades: 0, wins: 0, netPnl: 0 }, short: { trades: 0, wins: 0, netPnl: 0 } },
    holdAsymmetry,
    topSymbols,
    worstSymbols,
    tilt,
    recentTrades,
    insights: buildInsights(stats, trades, journal).map(i => i.text),
  };
}
