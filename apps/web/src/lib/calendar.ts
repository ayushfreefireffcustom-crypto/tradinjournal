// Shared calendar aggregation — used by both the /calendar page and the
// dashboard's embedded calendar so the logic (and the weekly-totals column)
// stays in one place.
import type { Trade } from './api';

export interface DayAgg { netPnl: number; trades: number }
export interface CalendarCell { day: number | null; agg: DayAgg | null }
export interface WeekTotal { netPnl: number; trades: number; days: number }

export interface MonthView {
  weeks: CalendarCell[][];
  weekTotals: WeekTotal[];
  monthStats: { net: number; tradeCount: number; tradingDays: number; best: number; worst: number };
  maxAbs: number;
}

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Local-date key so cells match what the trader sees in their own timezone.
export function dayKey(y: number, m: number, d: number): string { return `${y}-${m}-${d}`; }

// Compact money for calendar cells: +$1.2k / -$390.
export function calMoney(v: number): string {
  const sign = v < 0 ? '-' : '+';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

// Aggregate closed trades by local close-date.
export function aggregateByCloseDate(trades: Trade[]): Map<string, DayAgg> {
  const map = new Map<string, DayAgg>();
  for (const t of trades) {
    if (t.status !== 'CLOSED' || !t.closeTime) continue;
    const d = new Date(t.closeTime);
    const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
    const agg = map.get(key) ?? { netPnl: 0, trades: 0 };
    agg.netPnl += t.netPnl;
    agg.trades += 1;
    map.set(key, agg);
  }
  return map;
}

// Build the month grid (leading blanks + days, padded to whole weeks), the
// per-week totals, month summary and the max-abs value for colour intensity.
export function buildMonthView(year: number, month: number, byDay: Map<string, DayAgg>): MonthView {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const flat: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i++) flat.push({ day: null, agg: null });
  for (let d = 1; d <= daysInMonth; d++) flat.push({ day: d, agg: byDay.get(dayKey(year, month, d)) ?? null });
  while (flat.length % 7 !== 0) flat.push({ day: null, agg: null });

  const weeks: CalendarCell[][] = [];
  const weekTotals: WeekTotal[] = [];
  for (let i = 0; i < flat.length; i += 7) {
    const week = flat.slice(i, i + 7);
    weeks.push(week);
    const wt: WeekTotal = { netPnl: 0, trades: 0, days: 0 };
    for (const c of week) {
      if (c.agg) { wt.netPnl += c.agg.netPnl; wt.trades += c.agg.trades; wt.days += 1; }
    }
    weekTotals.push(wt);
  }

  let net = 0, tradeCount = 0, tradingDays = 0, best = -Infinity, worst = Infinity, maxAbs = 1;
  for (let d = 1; d <= daysInMonth; d++) {
    const agg = byDay.get(dayKey(year, month, d));
    if (!agg) continue;
    net += agg.netPnl;
    tradeCount += agg.trades;
    tradingDays += 1;
    best = Math.max(best, agg.netPnl);
    worst = Math.min(worst, agg.netPnl);
    maxAbs = Math.max(maxAbs, Math.abs(agg.netPnl));
  }

  return {
    weeks,
    weekTotals,
    monthStats: {
      net, tradeCount, tradingDays,
      best: best === -Infinity ? 0 : best,
      worst: worst === Infinity ? 0 : worst,
    },
    maxAbs,
  };
}

// Green/red intensity background for a day/week cell.
export function cellBg(netPnl: number, maxAbs: number): string {
  const intensity = Math.min(1, Math.abs(netPnl) / maxAbs);
  return netPnl >= 0
    ? `rgba(0, 197, 102, ${0.08 + intensity * 0.5})`
    : `rgba(255, 59, 48, ${0.08 + intensity * 0.5})`;
}
