import { describe, it, expect } from 'vitest';
import {
  moveSince, fmtMove, squarify, layoutTiles, layoutMap, pickWire, groupByHour, boardLine, mineFrom, youTag, hitsFor, printsFor,
  countdown, hhmm, seriesIndex, storyMoves, eventHitsTrade, type NewsStory, type ReactionSeries,
} from './news-map-api';
import type { CalendarEvent } from './api';

const T0 = Date.UTC(2026, 10, 12, 13, 0);
const min = (m: number) => T0 + m * 60_000;
const series = (key: string, unit: 'bp' | 'pct', vals: number[], step = 5): ReactionSeries => ({ key, unit, dp: 2, points: vals.map((v, i) => [min(i * step), v]) });

function story(p: Partial<NewsStory> & { id: string }): NewsStory {
  return {
    url: '', title: p.id, summary: null, source: 'X', outlets: ['X'], imageUrl: null, publishedAt: new Date(min(0)).toISOString(), country: null,
    category: null, sentiment: null, relevance: null, impact: null, marketMoving: false, tickers: [], desk: null, score: 50, scoreSource: 'ai', sourceCount: 1,
    short: null, line: null, ...p,
  };
}

describe('moveSince', () => {
  it('measures from the last bar at/before publish to the latest bar', () => {
    const m = moveSince(series('XAUUSD', 'pct', [100, 100, 99, 99.1]), min(7))!;
    expect(m.base).toBe(100);
    expect(m.price).toBe(99.1);
    expect(fmtMove(m)).toBe('−0.9%');
    expect(m.dir).toBe('dn');
  });
  it('reports yields in basis points', () => {
    const m = moveSince(series('US10Y', 'bp', [4.10, 4.12, 4.19]), min(0))!;
    expect(fmtMove(m)).toBe('+9bp');
  });
  it('is null when the series starts after publish or nothing traded since', () => {
    expect(moveSince(series('DXY', 'pct', [1, 2]), min(-10))).toBeNull();
    expect(moveSince(series('DXY', 'pct', [1, 2]), min(30))).toBeNull();
    expect(moveSince(undefined, min(0))).toBeNull();
  });
  it('formats flat moves without a sign', () => {
    expect(fmtMove({ v: 0.01, unit: 'pct' })).toBe('0.0%');
    expect(fmtMove({ v: -0.2, unit: 'bp' })).toBe('0bp');
  });
  it('collects a story\'s moves, skipping tickers without data', () => {
    const idx = seriesIndex({ asOf: '', interval: '5m', series: [series('BTCUSD', 'pct', [100, 98.2])] });
    const mv = storyMoves(story({ id: 'a', tickers: ['BTCUSD', 'ZQZ6'] }), idx);
    expect(mv.map(m => m.key)).toEqual(['BTCUSD']);
  });
});

describe('treemap', () => {
  it('fills the box exactly', () => {
    const r = squarify([50, 30, 20], 0, 0, 100, 100);
    const area = r.reduce((a, q) => a + q.w * q.h, 0);
    expect(Math.round(area)).toBe(10000);
  });
  it('drops stories until every tile is readable', () => {
    const tiles = layoutTiles([88, 81, 74, 70, 61, 58, 54], 430, 600);
    expect(tiles.length).toBeGreaterThan(2);
    for (const t of tiles) { expect(t.rect.w).toBeGreaterThanOrEqual(128); expect(t.rect.h).toBeGreaterThanOrEqual(84); }
    const narrow = layoutTiles([88, 81, 74, 70, 61, 58, 54], 200, 300);
    expect(narrow.length).toBeLessThan(7);
  });
  it('picks the anchor width that fits the most tiles', () => {
    const sc = [88, 81, 74, 70, 61, 58, 54];
    const a = layoutMap(sc, 992, 600);
    expect(a.tiles.length).toBeGreaterThanOrEqual(layoutTiles(sc, 992 - Math.round(992 * 0.47), 600).length);
    expect(a.anchorW).toBeGreaterThanOrEqual(300);
  });
  it('returns nothing when even one tile cannot fit', () => {
    expect(layoutTiles([90], 100, 50)).toEqual([]);
  });
});

describe('wire', () => {
  const many = Array.from({ length: 20 }, (_, i) => story({ id: `s${i}`, score: 40 + i, publishedAt: new Date(min(i * 10)).toISOString() }));
  it('Top shows the 12 best, newest first, and counts the rest', () => {
    const { rows, more } = pickWire(many, 'top');
    expect(rows.length).toBe(12);
    expect(more).toBe(8);
    expect(rows[0]!.id).toBe('s19');
    expect(Math.min(...rows.map(r => r.score))).toBe(48);
  });
  it('Important shows every kept story', () => {
    expect(pickWire(many, 'important').rows.length).toBe(20);
  });
  it('groups by UTC hour', () => {
    const g = groupByHour([...many].reverse().slice(0, 8));
    expect(g.map(x => x.hour)).toEqual(['16:00', '15:00']);
  });
});

describe('boardLine', () => {
  it('summarises the signs in at most 8 words', () => {
    const line = boardLine([
      { key: 'US10Y', dir: 'up' }, { key: 'DXY', dir: 'up' }, { key: 'EURUSD', dir: 'dn' }, { key: 'XAUUSD', dir: 'dn' },
      { key: 'US500', dir: 'dn' }, { key: 'US100', dir: 'dn' }, { key: 'BTCUSD', dir: 'dn' }, { key: 'WTI', dir: 'dn' },
    ])!;
    expect(line).toBe('Yields and dollar up, everything else down');
    expect(line.split(' ').length).toBeLessThanOrEqual(8);
    expect(boardLine([{ key: 'BTCUSD', dir: 'up' }])).toBeNull();
    expect(boardLine([{ key: 'BTCUSD', dir: 'flat' }, { key: 'DXY', dir: 'flat' }])).toBe('Little moved');
  });
});

describe('personal', () => {
  const now = min(60);
  const trades = [
    { symbol: 'GOLD.m', direction: 'LONG' as const, status: 'OPEN' as const, openTime: new Date(min(-60)).toISOString(), closeTime: null, netPnl: -186 },
    { symbol: 'BTCUSDT', direction: 'SHORT' as const, status: 'CLOSED' as const, openTime: new Date(min(-600)).toISOString(), closeTime: null, netPnl: 20 },
    { symbol: 'BTCUSDT', direction: 'LONG' as const, status: 'CLOSED' as const, openTime: new Date(min(-900)).toISOString(), closeTime: null, netPnl: 20 },
    { symbol: 'EURUSD', direction: 'LONG' as const, status: 'CLOSED' as const, openTime: new Date(now - 90 * 86_400_000).toISOString(), closeTime: null, netPnl: 1 },
  ];
  const mine = mineFrom(trades, now);
  it('canonicalises broker symbols and keeps a 30-day count', () => {
    expect([...mine.open.keys()]).toEqual(['XAUUSD']);
    expect(mine.recent.get('BTCUSD')).toBe(2);
    expect(mine.recent.has('EURUSD')).toBe(false);
  });
  it('tags stories with open or traded symbols', () => {
    expect(youTag(story({ id: 'cpi', tickers: ['US10Y', 'XAUUSD'] }), mine)).toEqual({ kind: 'open', symbol: 'XAUUSD' });
    expect(youTag(story({ id: 'btc', tickers: ['BTCUSD'] }), mine)).toEqual({ kind: 'trade', symbol: 'BTCUSD' });
    expect(youTag(story({ id: 'oil', tickers: ['WTI'] }), mine)).toBeNull();
  });
  it('lists open positions first, then recent symbols', () => {
    const idx = seriesIndex({ asOf: '', interval: '5m', series: [series('BTCUSD', 'pct', [100, 98.2])] });
    const st = [story({ id: 'cpi', score: 96, tickers: ['XAUUSD'] }), story({ id: 'btc', score: 88, tickers: ['BTCUSD'] })];
    const hits = hitsFor(st, mine, idx, s => `Story ${st.indexOf(s) + 1}`);
    expect(hits.map(h => h.title)).toEqual(['XAUUSD long, open', 'BTCUSD']);
    expect(hits[0]!.value).toBe('−$186');
    expect(hits[1]!.value).toBe('−1.8%');
    expect(hits[1]!.sub).toBe('Story 2 · traded 2× this month');
    expect(hitsFor(st, mineFrom([]), idx, () => '')).toEqual([]);
  });
  it('flags a USD release for a gold position', () => {
    expect(eventHitsTrade({ currency: 'USD' }, mine)).toBe('XAUUSD');
    expect(eventHitsTrade({ currency: 'JPY' }, mine)).toBeNull();
  });
});

describe('calendar', () => {
  const ev = (title: string, at: number, actual: string | null): CalendarEvent => ({
    id: title, title, country: 'US', currency: 'USD', category: null, impact: 'HIGH', eventTime: new Date(at).toISOString(),
    actual, forecast: '0.3%', previous: '0.3%', unit: null, actualAt: null, watched: false,
  });
  it('finds the released prints behind a story', () => {
    const events = [ev('CPI m/m', min(30), '0.4%'), ev('Core CPI y/y', min(30), '3.1%'), ev('GDP q/q', min(30), '0.1%'), ev('CPI m/m', min(-300), '0.2%')];
    const p = printsFor({ title: 'US CPI hotter than forecast', publishedAt: new Date(min(31)).toISOString() }, events);
    expect(p.map(e => e.title)).toEqual(['CPI m/m', 'Core CPI y/y']);
    expect(printsFor({ title: 'Bitcoin slips', publishedAt: new Date(min(31)).toISOString() }, events)).toEqual([]);
  });
  it('formats times and countdowns', () => {
    expect(hhmm(min(42))).toBe('13:42');
    expect(countdown(78 * 60_000)).toBe('1h 18m');
    expect(countdown(8 * 60_000)).toBe('8m');
    expect(countdown(10_000)).toBe('now');
  });
});
