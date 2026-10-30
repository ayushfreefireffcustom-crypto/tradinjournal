import { describe, it, expect } from 'vitest';
import type { JournalEntry, Trade } from './api';
import {
  weekStart, isoWeek, weekSummary, weeklyReview, symbolBars, holdStudy, sessionOf, sessionStudy, fmtUsd, fmtUsdCompact, fmtHold,
} from './dashboard-v6';

let seq = 0;
function trade(p: Partial<Trade> & { closeTime: string; netPnl: number }): Trade {
  seq++;
  return {
    positionId: `p${seq}`, symbol: 'EURUSD', direction: 'LONG', status: 'CLOSED',
    openTime: p.openTime ?? new Date(new Date(p.closeTime).getTime() - 3600_000).toISOString(),
    entryPrice: 1, exitPrice: 1, volume: 1, grossPnl: p.netPnl, commission: 0, swap: 0,
    durationSecs: 3600, deals: [], ...p,
  };
}
const note = (tradeId: string, body = 'note'): JournalEntry => ({
  id: `j-${tradeId}`, userId: 'u', brokerAccountId: null, title: null, body, emotion: null, tags: [], tradeId,
  entryDate: '', createdAt: '', updatedAt: '',
});

// Thursday 29 Oct 2026, 15:00 local.
const NOW = new Date(2026, 9, 29, 15, 0);
const at = (day: number, h = 12) => new Date(2026, 9, day, h).toISOString();

describe('week helpers', () => {
  it('starts weeks on Monday at local midnight', () => {
    const s = weekStart(NOW);
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 9, 26, 0]);
    expect(weekStart(new Date(2026, 10, 1, 9)).getDate()).toBe(26); // Sunday stays in the same week
  });
  it('computes ISO week numbers', () => {
    expect(isoWeek(new Date(2026, 9, 26))).toBe(44);
    expect(isoWeek(new Date(2021, 0, 3))).toBe(53);
  });
  it('summarises a week by day', () => {
    const w = weekSummary([
      trade({ closeTime: at(26), netPnl: 100 }),
      trade({ closeTime: at(27), netPnl: -40 }),
      trade({ closeTime: at(27, 14), netPnl: -10 }),
      trade({ closeTime: at(22), netPnl: 999 }), // previous week
    ], NOW);
    expect(w.net).toBe(50);
    expect(w.trades).toHaveLength(3);
    expect([w.greenDays, w.redDays]).toEqual([1, 1]);
    expect(w.days[3]!.isToday).toBe(true);
    expect(w.days[4]!.isFuture).toBe(true);
    expect(w.days.map(d => d.date)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(w.month).toBe('October');
  });
  it('ignores open trades', () => {
    const open = { ...trade({ closeTime: at(26), netPnl: 5 }), status: 'OPEN' as const };
    expect(weekSummary([open], NOW).trades).toHaveLength(0);
  });
});

describe('weeklyReview', () => {
  it('counts journaled trades and points at the latest unjournaled one', () => {
    const a = trade({ closeTime: at(26), netPnl: 50 });
    const b = trade({ closeTime: at(27), netPnl: -80 });
    const c = trade({ closeTime: at(28), netPnl: 20 });
    const r = weeklyReview([a, b, c], [note(a.positionId), note(b.positionId, '   ')], NOW)!;
    expect(r.which).toBe('this');
    expect(r.week).toBe(44);
    expect([r.total, r.journaled]).toEqual([3, 1]);
    expect(r.nextTradeId).toBe(c.positionId);
    expect(r.line).toBe('Tuesday cost you the most this week, −$80.');
  });
  it('falls back to last week, and to null with no trades', () => {
    const r = weeklyReview([trade({ closeTime: at(20), netPnl: 30 }), trade({ closeTime: at(21), netPnl: 10 })], [], NOW)!;
    expect(r.which).toBe('last');
    expect(r.week).toBe(43);
    expect(r.line).toBe('Tuesday was your best day last week, +$30.');
    expect(weeklyReview([], [], NOW)).toBeNull();
  });
});

describe('edge studies', () => {
  it('builds symbol bars ordered by trade count', () => {
    const bars = symbolBars([
      trade({ closeTime: at(26), netPnl: 100, symbol: 'XAUUSD' }),
      trade({ closeTime: at(26), netPnl: -30, symbol: 'XAUUSD' }),
      trade({ closeTime: at(26), netPnl: 10, symbol: 'EURUSD' }),
    ]);
    expect(bars[0]).toEqual({ symbol: 'XAUUSD', trades: 2, grossWin: 100, grossLoss: 30, net: 70, winRate: 0.5 });
    expect(bars).toHaveLength(2);
  });
  it('compares winner and loser hold times', () => {
    const h = holdStudy([
      trade({ closeTime: at(26), netPnl: 10, durationSecs: 7200 }),
      trade({ closeTime: at(26), netPnl: -10, durationSecs: 3600 }),
      trade({ closeTime: at(26), netPnl: 5, durationSecs: 10800 }),
    ]);
    expect(h.winnerToLoser).toBe(2.5);
    expect(h.medianSecs).toBe(7200);
    expect(h.longWinRate).toBe(1);
  });
  it('assigns sessions by UTC entry hour', () => {
    expect([sessionOf(3), sessionOf(8), sessionOf(15), sessionOf(22)]).toEqual(['Asia', 'London', 'New York', 'Asia']);
    const s = sessionStudy([
      trade({ openTime: '2026-10-26T08:00:00Z', closeTime: '2026-10-26T10:30:00Z', netPnl: 40 }),
      trade({ openTime: '2026-10-26T14:00:00Z', closeTime: '2026-10-27T01:00:00Z', netPnl: -15 }),
    ]);
    expect(s.best?.key).toBe('London');
    expect(s.arcs).toHaveLength(1); // the overnight trade has no same-day arc
    expect(s.arcs[0]!.from).toBe(8);
    expect(s.arcs[0]!.to).toBe(10.5);
  });
});

describe('formatting', () => {
  it('formats signed money with a real minus sign', () => {
    expect(fmtUsd(1284, 0)).toBe('+$1,284');
    expect(fmtUsd(-118.2)).toBe('−$118.20');
    expect(fmtUsd(0)).toBe('$0.00');
    expect([fmtUsd(-0.4, 0), fmtUsd(-0.004), fmtUsd(0.3, 0)]).toEqual(['$0', '$0.00', '$0']);
  });
  it('formats compact axis money and hold times', () => {
    expect([fmtUsdCompact(25000), fmtUsdCompact(1500), fmtUsdCompact(-300), fmtUsdCompact(2_400_000)]).toEqual(['$25k', '$1.5k', '−$300', '$2.4M']);
    expect([fmtUsdCompact(-0.4), fmtUsdCompact(999.6), fmtUsdCompact(9960), fmtUsdCompact(-999_600)]).toEqual(['$0', '$1.0k', '$10k', '−$1.0M']);
    expect([fmtHold(2880), fmtHold(7800), fmtHold(3600), fmtHold(97200), fmtHold(null)]).toEqual(['48m', '2h 10m', '1h', '1d 3h', '—']);
  });
});
