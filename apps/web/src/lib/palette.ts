// What the ⌘K palette lists (A3.9): pages, actions, the selected account's
// recent trades and the symbols it trades. Kept free of React so the matching
// and ordering can be unit tested.
import type { Trade } from './api';

export type PaletteGroup = 'Pages' | 'Actions' | 'Recent trades' | 'Trades' | 'Symbols';

export interface PaletteEntry {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Muted text on the right (the page's section, a date, a trade count). */
  hint?: string;
  /** Extra words that should find this entry ("dark", "light" for the theme). */
  keywords?: string;
  href?: string;
  /** Signed P&L shown on the right of a trade, coloured by sign. */
  pnl?: number;
}

export interface PaletteSection { group: PaletteGroup; entries: PaletteEntry[] }

/** Recent trades shown before anything is typed. */
export const RECENT_TRADES = 4;
/** Trades and symbols shown for a query; the full list is one click away on /trades. */
export const MAX_MATCHES = 6;

const words = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** Every word of the query appears somewhere in the entry. */
export function matches(e: PaletteEntry, q: string): boolean {
  const hay = `${e.label} ${e.hint ?? ''} ${e.keywords ?? ''}`.toLowerCase();
  return words(q).every((w) => hay.includes(w));
}

/** Labels that start with the query come first, then the rest in their own order. */
function rank(list: PaletteEntry[], q: string): PaletteEntry[] {
  const first = words(q)[0] ?? '';
  return list
    .map((e, i) => ({ e, i, head: e.label.toLowerCase().startsWith(first) ? 0 : 1 }))
    .sort((a, b) => a.head - b.head || a.i - b.i)
    .map((x) => x.e);
}

const day = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`; };

/** Closed trades newest first, as palette entries that open the trade. */
export function tradeEntries(trades: Trade[]): PaletteEntry[] {
  return trades
    .filter((t) => t.status === 'CLOSED' && t.closeTime)
    .sort((a, b) => (a.closeTime! < b.closeTime! ? 1 : -1))
    .map((t) => ({
      id: `trade:${t.positionId}`,
      group: 'Trades' as const,
      label: `${t.symbol} ${t.direction === 'LONG' ? 'Long' : 'Short'}`,
      hint: day(t.closeTime!),
      keywords: `#${t.positionId} ${t.positionId}`,
      href: `/trades/${encodeURIComponent(t.positionId)}`,
      pnl: t.netPnl,
    }));
}

/** Each traded symbol once, most traded first, opening the trade log filtered to it. */
export function symbolEntries(trades: Trade[]): PaletteEntry[] {
  const count = new Map<string, number>();
  for (const t of trades) count.set(t.symbol, (count.get(t.symbol) ?? 0) + 1);
  return [...count]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([s, n]) => ({
      id: `symbol:${s}`,
      group: 'Symbols' as const,
      label: s,
      hint: `${n} trade${n === 1 ? '' : 's'}`,
      href: `/trades?symbol=${encodeURIComponent(s)}`,
    }));
}

/**
 * The sections to draw, in order. With nothing typed: pages, actions and the
 * latest few trades. With a query: everything that matches, best first.
 */
export function paletteSections(q: string, pages: PaletteEntry[], actions: PaletteEntry[], trades: PaletteEntry[], symbols: PaletteEntry[]): PaletteSection[] {
  const out: PaletteSection[] = [];
  const push = (group: PaletteGroup, entries: PaletteEntry[]) => { if (entries.length) out.push({ group, entries }); };
  if (!q.trim()) {
    push('Pages', pages);
    push('Actions', actions);
    push('Recent trades', trades.slice(0, RECENT_TRADES).map((e) => ({ ...e, group: 'Recent trades' })));
    return out;
  }
  push('Pages', rank(pages.filter((e) => matches(e, q)), q));
  push('Symbols', rank(symbols.filter((e) => matches(e, q)), q).slice(0, MAX_MATCHES));
  push('Actions', rank(actions.filter((e) => matches(e, q)), q));
  push('Trades', trades.filter((e) => matches(e, q)).slice(0, MAX_MATCHES));
  return out;
}
