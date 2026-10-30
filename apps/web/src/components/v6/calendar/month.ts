// Monday-first month grid for the v6 calendar, built on the shared daily
// aggregation (lib/calendar). Cells outside the month carry their real date.
import type { JournalEntry, Trade } from '@/lib/api';
import { dayKey, type DayAgg } from '@/lib/calendar';

export interface MonthCell { date: Date; key: string; inMonth: boolean; agg: DayAgg | null }
export interface MonthWeek { cells: MonthCell[]; net: number; trades: number; days: number; index: number }

export function mondayMonth(year: number, month: number, byDay: Map<string, DayAgg>): MonthWeek[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const last = new Date(year, month + 1, 0);
  const trail = 6 - ((last.getDay() + 6) % 7);
  const total = lead + last.getDate() + trail;
  const weeks: MonthWeek[] = [];
  for (let i = 0; i < total; i += 7) {
    const cells: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + d);
      const key = dayKey(date.getFullYear(), date.getMonth(), date.getDate());
      const inMonth = date.getMonth() === month;
      cells.push({ date, key, inMonth, agg: inMonth ? byDay.get(key) ?? null : null });
    }
    const inside = cells.filter(c => c.agg);
    weeks.push({
      cells, index: weeks.length + 1, days: inside.length,
      net: inside.reduce((s, c) => s + c.agg!.netPnl, 0),
      trades: inside.reduce((s, c) => s + c.agg!.trades, 0),
    });
  }
  return weeks;
}

const localDay = (raw: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Local days (dayKey) that have a journal note: a trade's note lands on its close day. */
export function notedDays(journal: JournalEntry[], trades: Trade[]): Set<string> {
  const closeById = new Map<string, string>();
  for (const t of trades) if (t.closeTime) closeById.set(t.positionId, t.closeTime);
  const out = new Set<string>();
  for (const e of journal) {
    if (!e.body.trim() && !e.emotion && !e.tags.length) continue;
    const raw = (e.tradeId && closeById.get(e.tradeId)) || e.entryDate || e.createdAt;
    const d = raw ? localDay(raw) : null;
    if (d) out.add(dayKey(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return out;
}
