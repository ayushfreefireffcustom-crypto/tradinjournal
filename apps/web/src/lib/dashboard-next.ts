// "Next up" on the dashboard: the one thing worth doing now, picked from the
// dashboard data the page already has (no extra request).
//   1. Your latest trading day had trades that broke a rule → review them.
//   2. Otherwise your biggest leak → ask the coach about it.
// "Later" hides a suggestion until tomorrow; starting a review hides it for good.
import type { DashRecentTrade, LeakDTO } from '@/lib/dashboard-v2-api';

export type NextUp =
  | {
    kind: 'review';
    /** Stable for the same set of trades, so a dismissal sticks to them. */
    sig: string;
    /** "today's", "yesterday's", "Tuesday's", "your last session's". */
    day: string;
    /** Trades closed that day (of the latest ones the dashboard has). */
    count: number;
    /** True when every recent trade is from that day, so there may be more than `count`. */
    partial: boolean;
    flagged: number;
    /** Up to two distinct reasons, most common first. */
    reasons: string[];
    minutes: number;
    /** The first flagged trade of the day, in order. */
    href: string;
  }
  | { kind: 'leak'; sig: string; key: string; label: string; sub: string; trades: number; net: number };

const DAY = 86_400_000;
const FLAG_GRADES = new Set(['C', 'D', 'F']);
const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function dayPossessive(ms: number, now: number): string {
  const today = startOfDay(now), day = startOfDay(ms);
  if (day >= today) return "today's";
  const ago = Math.round((today - day) / DAY);
  if (ago === 1) return "yesterday's";
  if (ago < 6) return `${new Date(ms).toLocaleDateString('en-GB', { weekday: 'long' })}'s`;
  return "your last session's";
}

export const cleanReason = (r: string) => r.replace(/^Your rule: /, '');
const flaggedTrade = (t: DashRecentTrade) => t.reasons.length > 0 || (t.grade != null && FLAG_GRADES.has(t.grade));

/** `limit`: how many recent trades the dashboard sends (a full list may stop mid-day). */
export function pickNextUp(d: { recent: DashRecentTrade[]; leaks: { rows: LeakDTO[] } }, now: number, limit = 6): NextUp | null {
  const recent = [...d.recent].sort((a, b) => Date.parse(b.closeTime) - Date.parse(a.closeTime));
  const latest = recent[0];
  if (latest) {
    const lastMs = Date.parse(latest.closeTime);
    if (now - lastMs < 7 * DAY) {
      const day = startOfDay(lastMs);
      const group = recent.filter(t => startOfDay(Date.parse(t.closeTime)) === day).reverse(); // oldest first
      const flagged = group.filter(flaggedTrade);
      if (flagged.length) {
        const counts = new Map<string, number>();
        for (const t of flagged) for (const r of t.reasons) counts.set(cleanReason(r), (counts.get(cleanReason(r)) ?? 0) + 1);
        const reasons = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r);
        return {
          kind: 'review', sig: `review:${group.map(t => t.id).join(',')}`, day: dayPossessive(lastMs, now),
          count: group.length, partial: group.length === recent.length && recent.length >= limit, flagged: flagged.length, reasons,
          minutes: Math.max(2, Math.round(group.length * 1.5)), href: `/trades/${encodeURIComponent(flagged[0]!.id)}`,
        };
      }
    }
  }
  const leak = d.leaks.rows[0];
  if (leak && leak.net < 0) return { kind: 'leak', sig: `leak:${leak.key}:${leak.trades}`, key: leak.key, label: leak.label, sub: leak.sub, trades: leak.trades, net: leak.net };
  return null;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
/** "Two broke a rule", "All 3 broke a rule", "One of the latest 6 broke a rule". */
export function brokeLine(n: Extract<NextUp, { kind: 'review' }>): string {
  const w = (k: number) => WORDS[k] ?? String(k);
  if (n.partial) return `${w(n.flagged)} of the latest ${n.count} broke a rule`;
  if (n.flagged === n.count) return n.count === 1 ? 'It broke a rule' : `All ${n.count} broke a rule`;
  return `${w(n.flagged)} broke a rule`;
}

// ── dismissals (this device) ──
const KEY = 'tl-next-up';
type Store = Record<string, number>; // sig → hidden until (epoch ms)
function read(): Store {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v as Store : {}; } catch { return {}; }
}
export function isHidden(sig: string, now = Date.now()): boolean { return (read()[sig] ?? 0) > now; }
export function hide(sig: string, until: number, now = Date.now()): void {
  try {
    const s = read();
    for (const k of Object.keys(s)) if (s[k]! <= now) delete s[k];
    s[sig] = until;
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* storage unavailable: it just shows again */ }
}
export const tomorrow = (now = Date.now()) => startOfDay(now) + DAY;
