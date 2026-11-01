import { describe, expect, it } from 'vitest';
import type { Trade } from './api';
import { MAX_MATCHES, RECENT_TRADES, matches, paletteSections, symbolEntries, tradeEntries, type PaletteEntry } from './palette';

const trade = (id: string, symbol: string, closeTime: string | null, netPnl = 10, direction: Trade['direction'] = 'LONG'): Trade => ({
  positionId: id, symbol, direction, status: closeTime ? 'CLOSED' : 'OPEN', openTime: '2026-10-01T09:00:00Z', closeTime,
  entryPrice: 1, exitPrice: closeTime ? 1.1 : null, volume: 1, grossPnl: netPnl, commission: 0, swap: 0, netPnl, durationSecs: 60, deals: [],
});

const pages: PaletteEntry[] = [
  { id: 'p1', group: 'Pages', label: 'Dashboard', hint: 'Journal', href: '/dashboard' },
  { id: 'p2', group: 'Pages', label: 'Trade log', hint: 'Journal', href: '/trades' },
  { id: 'p3', group: 'Pages', label: 'Copy trading', hint: 'Copy trading', href: '/copy' },
  { id: 'p4', group: 'Pages', label: 'Settings', hint: 'Account', href: '/settings' },
];
const actions: PaletteEntry[] = [
  { id: 'a1', group: 'Actions', label: 'Switch to light theme', keywords: 'appearance mode' },
  { id: 'a2', group: 'Actions', label: 'Hide balances', keywords: 'privacy blur money' },
];

describe('trade and symbol entries', () => {
  const trades = [
    trade('101', 'XAUUSD', '2026-10-30T10:00:00Z', -42.5, 'SHORT'),
    trade('102', 'EURUSD', '2026-11-01T10:00:00Z', 12),
    trade('103', 'XAUUSD', null),
    trade('104', 'XAUUSD', '2026-10-31T10:00:00Z', 5),
  ];
  it('lists closed trades newest first, linking to the trade', () => {
    const e = tradeEntries(trades);
    expect(e.map((x) => x.id)).toEqual(['trade:102', 'trade:104', 'trade:101']);
    expect(e[2]).toMatchObject({ label: 'XAUUSD Short', hint: '30 Oct', href: '/trades/101', pnl: -42.5 });
  });
  it('counts every trade per symbol, most traded first', () => {
    expect(symbolEntries(trades).map((x) => [x.label, x.hint, x.href])).toEqual([
      ['XAUUSD', '3 trades', '/trades?symbol=XAUUSD'],
      ['EURUSD', '1 trade', '/trades?symbol=EURUSD'],
    ]);
  });
  it('finds a trade by its ticket', () => {
    const [t] = tradeEntries([trade('5550123', 'US30', '2026-10-30T10:00:00Z')]);
    expect(matches(t!, '5550123')).toBe(true);
    expect(matches(t!, '#5550123')).toBe(true);
    expect(matches(t!, 'us30 long')).toBe(true);
    expect(matches(t!, 'us30 short')).toBe(false);
  });
});

describe('paletteSections', () => {
  const many = Array.from({ length: 12 }, (_, i) => trade(String(200 + i), i % 2 ? 'NAS100' : 'GBPJPY', `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00Z`));
  const t = tradeEntries(many);
  const s = symbolEntries(many);

  it('shows pages, actions and a few recent trades before anything is typed', () => {
    const out = paletteSections('', pages, actions, t, s);
    expect(out.map((x) => x.group)).toEqual(['Pages', 'Actions', 'Recent trades']);
    expect(out[2]!.entries).toHaveLength(RECENT_TRADES);
    expect(out[2]!.entries[0]!.href).toBe('/trades/211');
  });
  it('drops empty sections and caps trades for a query', () => {
    const out = paletteSections('nas', pages, actions, t, s);
    expect(out.map((x) => x.group)).toEqual(['Symbols', 'Trades']);
    expect(out[1]!.entries).toHaveLength(MAX_MATCHES);
  });
  it('puts labels that start with the query first', () => {
    const out = paletteSections('trad', pages, actions, t, s);
    expect(out[0]!.entries.map((x) => x.label)).toEqual(['Trade log', 'Copy trading']);
  });
  it('matches extra keywords and the section name, but not the group heading', () => {
    expect(paletteSections('dark', pages, [...actions, { id: 'a3', group: 'Actions', label: 'Switch to dark theme' }], t, s)[0]!.entries.map((x) => x.id)).toEqual(['a3']);
    expect(paletteSections('privacy', pages, actions, t, s)[0]!.entries.map((x) => x.id)).toEqual(['a2']);
    expect(paletteSections('account', pages, actions, t, s)[0]!.entries.map((x) => x.label)).toEqual(['Settings']);
    expect(paletteSections('pages', pages, actions, t, s)).toEqual([]);
  });
  it('returns nothing for a query nothing matches', () => {
    expect(paletteSections('zzzz', pages, actions, t, s)).toEqual([]);
  });
});
