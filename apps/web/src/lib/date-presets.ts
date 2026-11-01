// Date-range presets for the picker (A2.25): calendar periods in local time,
// weeks starting Monday (the calendar page does too).
import type { CustomRange } from './stats';

export type PresetKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'ytd' | 'lastYear';

export const PRESETS: Array<[PresetKey, string]> = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['thisWeek', 'This week'], ['lastWeek', 'Last week'],
  ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['ytd', 'Year to date'], ['lastYear', 'Last year'],
];

/** "2026-03-04" for a local date. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (y: number, m: number, d: number) => isoDay(new Date(y, m, d));

export function presetRange(k: PresetKey, now = new Date()): CustomRange {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const monday = d - ((now.getDay() + 6) % 7);
  switch (k) {
    case 'today': return { from: day(y, m, d), to: day(y, m, d) };
    case 'yesterday': return { from: day(y, m, d - 1), to: day(y, m, d - 1) };
    case 'thisWeek': return { from: day(y, m, monday), to: day(y, m, d) };
    case 'lastWeek': return { from: day(y, m, monday - 7), to: day(y, m, monday - 1) };
    case 'thisMonth': return { from: day(y, m, 1), to: day(y, m, d) };
    case 'lastMonth': return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case 'ytd': return { from: day(y, 0, 1), to: day(y, m, d) };
    case 'lastYear': return { from: day(y - 1, 0, 1), to: day(y - 1, 11, 31) };
  }
}

/** "3 Mar – 21 Mar", "Wed, 4 Mar", with the year only when it isn't this one. */
export function rangeText(r: CustomRange, now = new Date()): string {
  const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y!, m! - 1, d!); };
  const a = parse(r.from), b = parse(r.to);
  const yr = (x: Date) => (x.getFullYear() !== now.getFullYear() ? ` ${x.getFullYear()}` : '');
  const f = (x: Date) => `${x.getDate()} ${x.toLocaleDateString('en-GB', { month: 'short' })}`;
  if (r.from === r.to) return `${a.toLocaleDateString('en-GB', { weekday: 'short' })}, ${f(a)}${yr(a)}`;
  return a.getFullYear() === b.getFullYear() ? `${f(a)} – ${f(b)}${yr(b)}` : `${f(a)}${yr(a)} – ${f(b)}${yr(b)}`;
}
