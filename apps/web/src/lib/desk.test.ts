import { describe, it, expect } from 'vitest';
import type { JournalEntry, Trade } from './api';
import {
  breakdown, dayBuckets, dayLabel, dayStats, fmtPrice, groupByDay, leakiest, marketKind, notesByTrade, tagTone, tickerMark, withDrawdown,
} from './desk';

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
const at = (day: number, h = 12) => new Date(2026, 9, day, h).toISOString();
const entry = (tradeId: string, p: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `j${tradeId}`, userId: 'u', brokerAccountId: null, title: null, body: '', emotion: null, tags: [], tradeId,
  entryDate: '', createdAt: '', updatedAt: '', ...p,
});

describe('days', () => {
  it('buckets by local day and summarises', () => {
    const days = dayBuckets([
      trade({ closeTime: at(26, 9), netPnl: 100 }), trade({ closeTime: at(26, 15), netPnl: -20 }),
      trade({ closeTime: at(27), netPnl: -50 }), trade({ closeTime: at(28), netPnl: 30 }), trade({ closeTime: at(29), netPnl: 10 }),
    ]);
    expect(days.map(d => [d.date.getDate(), d.pnl, d.n])).toEqual([[26, 80, 2], [27, -50, 1], [28, 30, 1], [29, 10, 1]]);
    expect(dayStats(days)).toEqual({ avgGreen: 40, avgRed: -50, bestStreak: 2, perDay: 1.25, green: 3, red: 1 });
    expect(dayStats([])).toMatchObject({ avgGreen: null, avgRed: null, perDay: null, bestStreak: 0 });
  });
  it('tracks drawdown from the running peak and drops undated points', () => {
    const dd = withDrawdown([{ time: '', equity: 100 }, { time: at(1), equity: 100 }, { time: at(2), equity: 120 }, { time: at(3), equity: 90 }]);
    expect(dd.map(p => p.dd)).toEqual([0, 0, 0.25]);
  });
});

describe('labels', () => {
  it('classifies markets and ticker marks', () => {
    expect(['XAUUSD', 'NAS100', 'US30.cash', 'EURUSD', 'GBPJPY.r', 'BTCUSD', 'USOIL', 'AAPL'].map(marketKind))
      .toEqual(['Metal', 'Index', 'Index', 'FX', 'FX', 'Crypto', 'Energy', '']);
    expect(['US30', 'NAS100', 'XAUUSD', 'US500'].map(tickerMark)).toEqual(['US30', 'NAS', 'XAU', 'SPX']);
  });
  it('labels days and formats prices by size', () => {
    const now = new Date(2026, 9, 30, 15);
    expect(dayLabel(new Date(2026, 9, 30), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 29), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 9, 26), now)).toBe('Monday, Oct 26');
    expect([fmtPrice(1.0825), fmtPrice(193.4), fmtPrice(20896.8), fmtPrice(null)]).toEqual(['1.08250', '193.400', '20,896.80', '—']);
  });
});

describe('breakdown', () => {
  const ts = [
    trade({ closeTime: at(26), netPnl: 100, symbol: 'XAUUSD', openTime: '2026-10-26T08:00:00Z' }),
    trade({ closeTime: at(27), netPnl: -40, symbol: 'XAUUSD', openTime: '2026-10-27T14:00:00Z' }),
    trade({ closeTime: at(27), netPnl: 10, symbol: 'EURUSD', openTime: '2026-10-27T02:00:00Z' }),
    trade({ closeTime: at(28), netPnl: -30, symbol: 'EURUSD', openTime: '2026-10-28T09:00:00Z' }),
    trade({ closeTime: at(28), netPnl: 25, symbol: 'EURUSD', openTime: '2026-10-28T09:30:00Z' }),
  ];
  it('splits won and given back by symbol, sorted by net', () => {
    expect(breakdown(ts, 'symbol')).toEqual([
      { key: 'XAUUSD', kind: 'Metal', n: 2, wins: 1, gw: 100, gl: 40 },
      { key: 'EURUSD', kind: 'FX', n: 3, wins: 2, gw: 35, gl: 30 },
    ]);
  });
  it('orders sessions and weekdays naturally', () => {
    expect(breakdown(ts, 'session').map(r => r.key)).toEqual(['Asia', 'London', 'New York']);
    expect(breakdown(ts, 'weekday').map(r => r.key)).toEqual(['Monday', 'Tuesday', 'Wednesday']);
  });
  it('finds the leakiest row with enough trades', () => {
    expect(leakiest(breakdown(ts, 'symbol'))?.key).toBe('EURUSD');
    expect(leakiest([])).toBeNull();
  });
});

describe('journal notes and grouping', () => {
  it('merges emotion and tags per trade with tones', () => {
    const m = notesByTrade([entry('a', { emotion: 'FOMO', tags: ['News'] }), entry('a', { body: 'x', tags: ['news'] }), entry('b', { body: '  ' }), entry('c', { tags: ['Followed plan'] })]);
    expect(m.get('a')).toEqual({ noted: true, tags: [{ label: 'FOMO', tone: 'r' }, { label: 'News', tone: 'n' }] });
    expect(m.get('b')?.noted).toBe(false);
    expect(m.get('c')?.tags[0]?.tone).toBe('g');
    expect(tagTone('Patient')).toBe('g');
  });
  it('groups closed trades by day, newest first', () => {
    const g = groupByDay([trade({ closeTime: at(26, 9), netPnl: 1 }), trade({ closeTime: at(27), netPnl: 2 }), trade({ closeTime: at(26, 16), netPnl: 3 })]);
    expect(g.map(x => [x.date.getDate(), x.trades.map(t => t.netPnl)])).toEqual([[27, [2]], [26, [3, 1]]]);
  });
});
