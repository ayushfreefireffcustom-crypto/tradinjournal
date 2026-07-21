import { describe, it, expect } from 'vitest';
import type { AccountStats, Trade } from '@tradinjournal/types';
import { buildTraderContext, RECENT_TRADES_CAP } from '../analysis/context.js';
import type { JournalLike } from '../analysis/insights.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function trade(i: number, netPnl: number, direction: 'LONG' | 'SHORT' = 'LONG'): Trade {
  const open = new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + i * 3_600_000);
  const close = new Date(open.getTime() + 1_800_000);
  return {
    positionId: `p${i}`,
    symbol: i % 2 === 0 ? 'EURUSD' : 'GBPUSD',
    direction,
    status: 'CLOSED',
    openTime: open.toISOString(),
    closeTime: close.toISOString(),
    entryPrice: 1.1,
    exitPrice: 1.1 + netPnl / 1000,
    volume: 1,
    grossPnl: netPnl,
    commission: 0,
    swap: 0,
    netPnl,
    durationSecs: 1800,
    deals: [],
  };
}

function statsFrom(trades: Trade[]): AccountStats {
  const closed = trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.netPnl > 0);
  const losses = closed.filter(t => t.netPnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  return {
    netPnl: closed.reduce((s, t) => s + t.netPnl, 0),
    totalTrades: closed.length,
    openTrades: 0,
    totalWins: wins.length,
    totalLosses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    bestTrade: closed.length ? Math.max(...closed.map(t => t.netPnl)) : 0,
    worstTrade: closed.length ? Math.min(...closed.map(t => t.netPnl)) : 0,
    maxDrawdownPct: 0,
    grossProfit,
    grossLoss,
    avgDurationSecs: 1800,
    startingBalance: 10000,
    currentEquity: 10000,
    equityCurve: [],
    bySymbol: [],
    byDay: [],
    byDirection: { long: { trades: 0, wins: 0, netPnl: 0 }, short: { trades: 0, wins: 0, netPnl: 0 } },
    maxWinStreak: 0,
    maxLossStreak: 0,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildTraderContext', () => {
  it('caps the recent-trades digest and never leaks raw deals', () => {
    const trades = Array.from({ length: 50 }, (_, i) => trade(i, i % 3 === 0 ? -20 : 30));
    const ctx = buildTraderContext(statsFrom(trades), trades, []);

    expect(ctx.recentTrades.length).toBe(RECENT_TRADES_CAP);
    // Digest carries only compact fields — no `deals` array on any entry.
    for (const rt of ctx.recentTrades) {
      expect(rt).not.toHaveProperty('deals');
      expect(Object.keys(rt).sort()).toEqual(
        ['closeTime', 'direction', 'durationSecs', 'netPnl', 'rProxy', 'symbol'].sort(),
      );
    }
    // Whole serialized context must not contain the raw deals key.
    expect(JSON.stringify(ctx)).not.toContain('"deals"');
  });

  it('orders the recent digest most-recent-first', () => {
    const trades = Array.from({ length: 5 }, (_, i) => trade(i, 10));
    const ctx = buildTraderContext(statsFrom(trades), trades, []);
    const times = ctx.recentTrades.map(t => new Date(t.closeTime).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('surfaces tilt when negative-emotion journal entries map to losing trades', () => {
    const trades = [trade(0, -50), trade(1, -30), trade(2, 40)];
    const journal: JournalLike[] = [
      { emotion: 'FOMO', tradeId: 'p0' },
      { emotion: 'Revenge', tradeId: 'p1' },
      { emotion: 'Calm', tradeId: 'p2' },
    ];
    const ctx = buildTraderContext(statsFrom(trades), trades, journal);
    expect(ctx.tilt).toEqual({ count: 2, netPnl: -80 });
  });

  it('handles an empty account without throwing', () => {
    const ctx = buildTraderContext(statsFrom([]), [], []);
    expect(ctx.recentTrades).toEqual([]);
    expect(ctx.tilt).toBeNull();
    expect(ctx.bestDay).toBeNull();
    expect(ctx.summary.totalTrades).toBe(0);
  });
});
