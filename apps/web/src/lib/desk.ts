// Derivations for the "desk" dashboard (components/v6/desk). Pure functions over
// the trader's own closed trades and journal; nothing here invents a number.
// Days are the viewer's local calendar days; sessions use the UTC entry hour.
import type { EquityPoint, JournalEntry, Trade } from './api';
import { sessionOf } from './dashboard-v6';

const closedOnly = (trades: Trade[]) => trades.filter(t => t.status === 'CLOSED' && t.closeTime);
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface DayBucket { key: string; date: Date; pnl: number; n: number }

/** Closed trades summed per local calendar day, oldest first. */
export function dayBuckets(trades: Trade[]): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const t of closedOnly(trades)) {
    const c = new Date(t.closeTime!);
    const key = localKey(c);
    const b = map.get(key) ?? { key, date: new Date(c.getFullYear(), c.getMonth(), c.getDate()), pnl: 0, n: 0 };
    b.pnl += t.netPnl;
    b.n++;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface DayStats { avgGreen: number | null; avgRed: number | null; bestStreak: number; perDay: number | null; green: number; red: number }

export function dayStats(days: DayBucket[]): DayStats {
  const green = days.filter(d => d.pnl > 0);
  const red = days.filter(d => d.pnl < 0);
  let run = 0, best = 0;
  for (const d of days) { run = d.pnl > 0 ? run + 1 : 0; best = Math.max(best, run); }
  const avg = (a: DayBucket[]) => (a.length ? a.reduce((s, d) => s + d.pnl, 0) / a.length : null);
  return {
    avgGreen: avg(green), avgRed: avg(red), bestStreak: best,
    perDay: days.length ? days.reduce((s, d) => s + d.n, 0) / days.length : null,
    green: green.length, red: red.length,
  };
}

export interface DrawdownPoint { time: string; equity: number; dd: number }

/** Equity curve with the running drawdown from the peak (0..1). */
export function withDrawdown(curve: EquityPoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return curve
    .filter(p => Number.isFinite(new Date(p.time).getTime()) && Number.isFinite(p.equity))
    .map(p => {
      peak = Math.max(peak, p.equity);
      return { time: p.time, equity: p.equity, dd: peak > 0 ? (peak - p.equity) / peak : 0 };
    });
}

/** Rough market type for a broker symbol; '' when unsure. */
export function marketKind(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^(XAU|XAG|XPT|XPD|GOLD|SILVER)/.test(s)) return 'Metal';
  if (/^(BTC|ETH|SOL|XRP|LTC|DOGE|ADA|BNB)/.test(s)) return 'Crypto';
  if (/^(US30|US100|US500|NAS|SPX|SP500|DJ|DOW|GER|DE30|DE40|UK100|FTSE|JP225|NIKKEI|HK50|AUS200|FRA40|EU50|STOXX|USTEC|US2000)/.test(s)) return 'Index';
  if (/^(USOIL|UKOIL|WTI|BRENT|XTI|XBR|NGAS|NATGAS|OIL)/.test(s)) return 'Energy';
  if (/^[A-Z]{6}/.test(s) && /(USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|SGD|HKD|SEK|NOK|ZAR|MXN|TRY|CNH)/.test(s.slice(0, 6))) return 'FX';
  return '';
}

/** Short ticker for a 34px symbol tile. */
export function tickerMark(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^US30/.test(s)) return 'US30';
  if (/^(NAS|US100|USTEC)/.test(s)) return 'NAS';
  if (/^(SPX|US500|SP500)/.test(s)) return 'SPX';
  return s.slice(0, 3);
}

export type BreakdownBy = 'symbol' | 'session' | 'weekday';
export interface BreakdownRow { key: string; kind: string; n: number; wins: number; gw: number; gl: number }

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Gross won (gw) and gross given back (gl, positive) per symbol, session (UTC
 * entry hour) or weekday (local close day). Symbols sort by net; sessions and
 * weekdays keep their natural order.
 */
export function breakdown(trades: Trade[], by: BreakdownBy): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const t of closedOnly(trades)) {
    const key = by === 'symbol' ? t.symbol
      : by === 'session' ? sessionOf(new Date(t.openTime).getUTCHours())
        : WEEKDAYS[(new Date(t.closeTime!).getDay() + 6) % 7]!;
    const r = map.get(key) ?? { key, kind: by === 'symbol' ? marketKind(t.symbol) : '', n: 0, wins: 0, gw: 0, gl: 0 };
    r.n++;
    if (t.netPnl > 0) { r.wins++; r.gw += t.netPnl; } else r.gl += -t.netPnl;
    map.set(key, r);
  }
  const rows = [...map.values()];
  if (by === 'symbol') return rows.sort((a, b) => (b.gw - b.gl) - (a.gw - a.gl));
  const order = by === 'session' ? ['Asia', 'London', 'New York'] : WEEKDAYS;
  return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

/** The row that gives back the largest share of what it wins (needs ≥3 trades and some wins). */
export function leakiest(rows: BreakdownRow[]): BreakdownRow | null {
  const eligible = rows.filter(r => r.n >= 3 && r.gw > 0);
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => b.gl / b.gw - a.gl / a.gw)[0]!;
}

export type TagTone = 'g' | 'r' | 'n';
const GOOD = ['disciplined', 'confident', 'patient', 'followed plan', 'a+ setup', 'calm'];
const BAD = ['fomo', 'revenge', 'hesitant', 'moved stop', 'overtraded', 'greedy', 'fearful', 'tilt'];
export function tagTone(tag: string): TagTone {
  const t = tag.trim().toLowerCase();
  return GOOD.includes(t) ? 'g' : BAD.includes(t) ? 'r' : 'n';
}

export interface TradeNote { noted: boolean; tags: { label: string; tone: TagTone }[] }

/** Journal note state for each trade: whether it has a note, plus its emotion and tags. */
export function notesByTrade(journal: JournalEntry[]): Map<string, TradeNote> {
  const out = new Map<string, TradeNote>();
  for (const e of journal) {
    if (!e.tradeId) continue;
    const prev = out.get(e.tradeId) ?? { noted: false, tags: [] };
    const labels = [...(e.emotion ? [e.emotion] : []), ...e.tags];
    for (const l of labels) if (!prev.tags.some(x => x.label.toLowerCase() === l.toLowerCase())) prev.tags.push({ label: l, tone: tagTone(l) });
    prev.noted = prev.noted || !!e.body.trim() || labels.length > 0;
    out.set(e.tradeId, prev);
  }
  return out;
}

export interface TradeGroup { key: string; date: Date; trades: Trade[] }

/** Closed trades, newest first, grouped by local close day. */
export function groupByDay(trades: Trade[]): TradeGroup[] {
  const groups: TradeGroup[] = [];
  const sorted = [...closedOnly(trades)].sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!));
  for (const t of sorted) {
    const c = new Date(t.closeTime!);
    const key = localKey(c);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, date: new Date(c.getFullYear(), c.getMonth(), c.getDate()), trades: [] }; groups.push(g); }
    g.trades.push(t);
  }
  return groups;
}

/** "Today", "Yesterday" or "Monday, Oct 26". */
export function dayLabel(d: Date, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (t === today) return 'Today';
  if (t === today - 86400000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Price with the precision the instrument needs (digits taken from the larger of two prices). */
export function fmtPrice(v: number | null | undefined, ref?: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const base = Math.max(Math.abs(v), Math.abs(ref ?? 0));
  const digits = base >= 1000 ? 2 : base >= 100 ? 3 : base >= 10 ? 4 : 5;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
