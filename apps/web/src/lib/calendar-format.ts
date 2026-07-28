// Pure formatting/derivation helpers for the economic calendar, shared by the
// full calendar view and the compact CalendarRail. No React, no side effects —
// unit-tested in calendar-format.test.ts.
import type { EventImpact } from '@/lib/api';

export type CalRange = 'today' | 'week' | 'upcoming';

// ── Scope-based navigation (day / week / month over an anchor date) ──
// All boundaries are LOCAL so "today"/"this week"/"this month" match the day the
// user sees. The window is [from, to) as ISO instants for the API.
export type CalScope = 'day' | 'week' | 'month';

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Monday-anchored week start (ISO week convention). */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Mon=0 … Sun=6
  s.setDate(s.getDate() - dow);
  return s;
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** [from,to) window (ISO) for a scope anchored on `anchor`. */
export function scopeWindow(scope: CalScope, anchor: Date = new Date()): { from: string; to: string } {
  if (scope === 'day') {
    const s = startOfDay(anchor);
    return { from: s.toISOString(), to: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1).toISOString() };
  }
  if (scope === 'week') {
    const s = startOfWeek(anchor);
    return { from: s.toISOString(), to: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7).toISOString() };
  }
  const s = startOfMonth(anchor);
  return { from: s.toISOString(), to: new Date(s.getFullYear(), s.getMonth() + 1, 1).toISOString() };
}

/** Move the anchor one scope-unit backward (-1) or forward (+1). */
export function shiftAnchor(scope: CalScope, anchor: Date, dir: -1 | 1): Date {
  if (scope === 'day') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir);
  if (scope === 'week') return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * dir);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

/** Human label for the current period, e.g. "Wed 29 Jul", "28 Jul – 03 Aug", "July 2026". */
export function periodLabel(scope: CalScope, anchor: Date): string {
  if (scope === 'day') return anchor.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
  if (scope === 'month') return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const s = startOfWeek(anchor);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
  const opt = { day: '2-digit', month: 'short' } as const;
  return `${s.toLocaleDateString(undefined, opt)} – ${e.toLocaleDateString(undefined, opt)}`;
}

/** ISO-3166 alpha-2 → flag emoji (regional-indicator letters). EU → 🇪🇺. */
export function flag(cc: string): string {
  const c = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** UTC [from,to) window for a range, relative to `now` (injectable for tests). */
export function rangeWindow(r: CalRange, now: Date = new Date()): { from: string; to: string } {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (r === 'today') {
    const end = new Date(startOfToday.getTime() + 24 * 3600_000);
    return { from: startOfToday.toISOString(), to: end.toISOString() };
  }
  if (r === 'week') {
    const end = new Date(startOfToday.getTime() + 7 * 24 * 3600_000);
    return { from: startOfToday.toISOString(), to: end.toISOString() };
  }
  return {
    from: new Date(now.getTime() - 3600_000).toISOString(),
    to: new Date(startOfToday.getTime() + 8 * 24 * 3600_000).toISOString(),
  };
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "in 2h 15m" until an event; empty once it has started. */
export function countdown(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  return `in ${h}h ${mins % 60}m`;
}

/** Compare actual vs forecast → direction for the surprise color, when numeric. */
export function surprise(actual: string | null, forecast: string | null): 'up' | 'down' | null {
  if (!actual || !forecast) return null;
  const a = parseFloat(actual.replace(/[^0-9.-]/g, ''));
  const f = parseFloat(forecast.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(a) || Number.isNaN(f) || a === f) return null;
  return a > f ? 'up' : 'down';
}

/** Local day label used to group events under headers. */
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
}

// Impact → Tailwind class fragments, shared so page and rail look identical.
export const impactAccent: Record<EventImpact, string> = {
  HIGH: 'border-l-loss',
  MEDIUM: 'border-l-warning',
  LOW: 'border-l-border-strong',
};
export const impactPill: Record<EventImpact, string> = {
  HIGH: 'bg-loss/15 text-loss',
  MEDIUM: 'bg-warning/15 text-warning',
  LOW: 'bg-surface text-fg-3',
};
export const impactDot: Record<EventImpact, string> = {
  HIGH: 'bg-loss',
  MEDIUM: 'bg-warning',
  LOW: 'bg-fg-3',
};
