import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_FILTERS, cleanFilters, CSV_HEADERS, csvRow, dayTitle, fmtHold, gradeTone, loadViews, money2, pathGeom, qs, rStr,
  sameFilters, shortDate, storeViews, type TlPath, type TlRow,
} from './tradelog-v2-api';

const row = (p: Partial<TlRow> = {}): TlRow => ({
  id: '48218774', symbol: 'NAS100', side: 'SHORT', status: 'CLOSED', openTime: Date.UTC(2026, 10, 13, 10, 18), closeTime: Date.UTC(2026, 10, 13, 12, 29),
  day: '2026-11-13', session: 'LONDON', volume: 2.4, entry: 24968, exit: 25258.7, net: -697.6, gross: -680, commission: -16.8, swap: -0.8,
  r: -1.72, holdSecs: 7860, exitReason: 'sl', sl: 25258.7, tp: null, grade: 'F',
  flags: [{ key: 'after-losses', short: 'After 2L', label: 'After 2 losses' }], tags: ['news'], emotion: 'FOMO', noted: true, ...p,
});

describe('filters and saved views', () => {
  it('cleans empty values and compares regardless of key order', () => {
    expect(cleanFilters({ symbol: 'XAUUSD', q: '  gold ', tag: '', side: undefined })).toEqual({ symbol: 'XAUUSD', q: 'gold' });
    expect(sameFilters({ rule: 'any', symbol: 'X' }, { symbol: 'X', rule: 'any', q: '' })).toBe(true);
    expect(sameFilters({}, BUILTIN_FILTERS.all)).toBe(true);
    expect(sameFilters({ grade: 'D,F' }, BUILTIN_FILTERS.grade)).toBe(true);
    expect(sameFilters({ grade: 'D' }, BUILTIN_FILTERS.grade)).toBe(false);
  });
  it('builds query strings without empty params', () => {
    expect(qs({ accountId: 'a', range: 'ALL', symbol: undefined, q: '', offset: 0 })).toBe('accountId=a&range=ALL&offset=0');
  });
  it('stores views per user and survives broken storage', () => {
    // No localStorage in node: both calls fail softly.
    expect(loadViews('u1')).toEqual([]);
    expect(storeViews('u1', [{ id: 'v1', name: 'Gold', filters: { symbol: 'XAUUSD' } }])).toBe(false);
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
    expect(storeViews('u1', [{ id: 'v1', name: 'Gold', filters: { symbol: 'XAUUSD' } }])).toBe(true);
    expect(loadViews('u1')).toEqual([{ id: 'v1', name: 'Gold', filters: { symbol: 'XAUUSD' } }]);
    expect(loadViews('u2')).toEqual([]);
    mem.set('tl-log-views:u3', '{not json');
    expect(loadViews('u3')).toEqual([]);
    mem.set('tl-log-views:u4', JSON.stringify([{ id: 1 }, { id: 'ok', name: 'x', filters: {} }]));
    expect(loadViews('u4').map(v => v.id)).toEqual(['ok']);
  });
  afterEach(() => vi.unstubAllGlobals());
});

describe('formatting', () => {
  it('hold, money, R, days', () => {
    expect(fmtHold(7860)).toBe('2h 11m');
    expect(fmtHold(3120)).toBe('52m');
    expect(fmtHold(45)).toBe('45s');
    expect(fmtHold(3 * 86400 + 4 * 3600)).toBe('3d 4h');
    expect(fmtHold(null)).toBe('—');
    expect(money2(-697.6)).toBe('−$697.60');
    expect(money2(1008.68)).toBe('+$1,008.68');
    expect(money2(0)).toBe('$0.00');
    expect(rStr(-1.72)).toBe('−1.72R');
    expect(rStr(0.29)).toBe('+0.29R');
    expect(dayTitle('2026-11-13')).toBe('Fri 13 Nov');
    expect(dayTitle('2026-09-25')).toBe('Fri 25 Sep');
    expect(dayTitle('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dayTitle('open')).toBe('Open positions');
    expect(shortDate(new Date(2026, 8, 25, 12).getTime())).toBe('25 Sep');
    expect(gradeTone('A')).toBe('up');
    expect(gradeTone('C')).toBe('mid');
    expect(gradeTone('F')).toBe('dn');
    expect(gradeTone(null)).toBe('');
  });
  it('CSV keeps the old columns and adds R, exit, grade, rules', () => {
    const r = csvRow(row());
    expect(r).toHaveLength(CSV_HEADERS.length);
    expect(CSV_HEADERS.slice(0, 13)).toEqual(['Position ID', 'Symbol', 'Direction', 'Status', 'Open Time', 'Close Time', 'Volume', 'Entry Price', 'Exit Price', 'Gross P&L', 'Commission', 'Swap', 'Net P&L']);
    expect(r[13]).toBe(-1.72);
    expect(r[16]).toBe('F');
    expect(r[17]).toBe('After 2 losses');
    expect(r[18]).toBe('FOMO; news');
    expect(csvRow(row({ status: 'OPEN', closeTime: null, exit: null, r: null, grade: null, flags: [], tags: [], emotion: null }))[5]).toBe('');
  });
});

describe('mini path geometry', () => {
  const p: TlPath = { id: 'x', tf: '5m', points: [100, 101, 99, 103], lo: 98.5, hi: 103.5, entry: 100, exit: 103, sl: 98, tp: null };
  it('starts at entry, ends at exit, includes a nearby stop', () => {
    const g = pathGeom(p, 100, 26);
    expect(g.d.startsWith('M3.0,')).toBe(true);
    expect(g.end[0]).toBeCloseTo(97);
    expect(g.sl).not.toBeNull();
    expect(g.sl!).toBeGreaterThan(g.end[1]); // stop below the path (y grows down)
    expect(g.tp).toBeNull();
  });
  it('drops a stop that is far outside the traded range', () => {
    expect(pathGeom({ ...p, sl: 50 }, 100, 26).sl).toBeNull();
  });
  it('handles a flat path', () => {
    const g = pathGeom({ ...p, points: [100, 100], lo: 100, hi: 100, exit: 100, sl: null }, 100, 26);
    expect(Number.isFinite(g.end[1])).toBe(true);
  });
});
