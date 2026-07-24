import { describe, it, expect } from 'vitest';
import { buildTraderContext, type TraderContext } from '@tradinjournal/core';
import type { AccountStats, Trade } from '@tradinjournal/types';
import { hashContext } from '../report-hash.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// A real TraderContext (not a cast) so the hash is exercised against the exact
// shape the report service will feed it.

function trade(i: number, netPnl: number): Trade {
  const open = new Date(Date.UTC(2026, 0, 1, 10, 0, 0) + i * 3_600_000);
  const close = new Date(open.getTime() + 1_800_000);
  return {
    positionId: `p${i}`,
    symbol: i % 2 === 0 ? 'EURUSD' : 'GBPUSD',
    direction: 'LONG',
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

function contextOf(trades: Trade[]): TraderContext {
  return buildTraderContext(statsFrom(trades), trades, []);
}

/** Rebuild an object graph with every key order reversed, values untouched. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).reverse()) out[key] = reverseKeys(src[key]);
    return out;
  }
  return value;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('hashContext', () => {
  const base = Array.from({ length: 10 }, (_, i) => trade(i, i % 3 === 0 ? -20 : 30));

  it('is stable for the same data — a repeat dashboard load stays a cache hit', () => {
    expect(hashContext(contextOf(base))).toBe(hashContext(contextOf(base)));
  });

  it('ignores property order, so an equivalent context never forces a rewrite', () => {
    const ctx = contextOf(base);
    const shuffled = reverseKeys(ctx) as TraderContext;
    expect(hashContext(shuffled)).toBe(hashContext(ctx));
  });

  it('changes when a trade is added — the review regenerates on new data', () => {
    const withOneMore = [...base, trade(99, 120)];
    expect(hashContext(contextOf(withOneMore))).not.toBe(hashContext(contextOf(base)));
  });

  it('changes when an existing trade result changes', () => {
    const edited = base.map((t, i) => (i === 0 ? { ...t, netPnl: t.netPnl + 1 } : t));
    expect(hashContext(contextOf(edited))).not.toBe(hashContext(contextOf(base)));
  });

  it('returns a hex sha256 digest', () => {
    expect(hashContext(contextOf(base))).toMatch(/^[0-9a-f]{64}$/);
  });
});
