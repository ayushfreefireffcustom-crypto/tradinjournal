// Pure helpers for the "Cuts priced by meeting" block (unit-tested).
import type { MacroFedWatch } from '@/lib/macro-api';

type Row = MacroFedWatch['rows'][number];

/** The most likely outcome at a meeting, e.g. { word: 'cut', pct: 62 }. Ties go to hold. */
export function meetingOutcome(r: Pick<Row, 'cutPct' | 'holdPct' | 'hikePct'>): { word: 'cut' | 'hold' | 'hike'; pct: number } {
  if (r.cutPct > r.holdPct && r.cutPct >= r.hikePct) return { word: 'cut', pct: Math.round(r.cutPct) };
  if (r.hikePct > r.holdPct && r.hikePct > r.cutPct) return { word: 'hike', pct: Math.round(r.hikePct) };
  return { word: 'hold', pct: Math.round(r.holdPct) };
}

/** 25 bp moves priced by then: 0.6 → "0.6 cuts", −1.1 → "1.1 hikes", ~0 → "none". */
export function cumulativeWord(c: number): string {
  if (Math.abs(c) < 0.05) return 'none';
  const v = Math.abs(c).toFixed(1);
  return `${v} ${c > 0 ? (v === '1.0' ? 'cut' : 'cuts') : v === '1.0' ? 'hike' : 'hikes'}`;
}

/** Change in cuts priced since the prior session, or null when it rounds to nothing. */
export function cumulativeDelta(r: Pick<Row, 'cumulativeCuts' | 'cumulativeCutsYesterday'>): number | null {
  if (r.cumulativeCutsYesterday == null) return null;
  const d = Math.round((r.cumulativeCuts - r.cumulativeCutsYesterday) * 100) / 100;
  return Math.abs(d) >= 0.01 ? d : null;
}

/** Bar segment widths (%), always summing to 100. */
export function segments(r: Pick<Row, 'cutPct' | 'holdPct' | 'hikePct'>): { cut: number; hold: number; hike: number } {
  const cut = Math.max(0, Math.min(100, r.cutPct));
  const hike = Math.max(0, Math.min(100 - cut, r.hikePct));
  return { cut, hold: 100 - cut - hike, hike };
}

/**
 * The day's change as shown next to the word: hikes are shown as a positive
 * count, so for a hikes row the change is in hikes (3.6 → 4.6 hikes = +1.0).
 * `more` says which way it moved: toward cuts or toward hikes (for colour).
 */
export function deltaShown(cum: number, d: number): { value: number; more: 'cuts' | 'hikes' } {
  return { value: cum < 0 ? -d : d, more: d > 0 ? 'cuts' : 'hikes' };
}

/** Section title matching what the furthest meeting shows. */
export function pathTitle(rows: Array<Pick<Row, 'cumulativeCuts'>>): string {
  const last = rows.at(-1);
  return last && last.cumulativeCuts <= -0.05 ? 'Hikes priced by meeting' : 'Cuts priced by meeting';
}
