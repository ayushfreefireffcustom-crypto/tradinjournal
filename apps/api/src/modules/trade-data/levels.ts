// Stop loss / take profit levels of a position: pure functions over its
// trade_level rows (no I/O). See packages/contracts/src/schema/trade-data.ts.
//
//   • Stop at entry = the EARLIEST row with a stop. R is measured against it.
//   • Moved stop: ≥ 2 rows with different stops. Widened = a later stop further
//     from the entry than the first one (or removed by the broker); else
//     tightened. Rows the trader typed only count when they carry a stop, so
//     "add a target" never reads as a removed stop.
import type { LevelRowDTO, LevelSource, PositionLevelsDTO, StopMove } from '@tradinjournal/contracts';

export interface LevelRow {
  id: string;
  sl: number | null;
  tp: number | null;
  source: LevelSource;
  /** Epoch ms. */
  observedAt: number;
}

/** Sources whose rows are snapshots of the live position (a missing stop means "no stop now"). */
const SNAPSHOT: ReadonlySet<LevelSource> = new Set(['bridge', 'exchange']);
const MINE: ReadonlySet<LevelSource> = new Set(['user', 'plan']);

const byTime = (a: LevelRow, b: LevelRow) => a.observedAt - b.observedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const same = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;

export function sortLevels(rows: LevelRow[]): LevelRow[] {
  return [...rows].sort(byTime);
}

/** Earliest row with a stop (the stop at entry). */
export function stopAtEntry(rows: LevelRow[]): LevelRow | null {
  return sortLevels(rows).find(r => r.sl != null) ?? null;
}

export function targetAtEntry(rows: LevelRow[]): LevelRow | null {
  return sortLevels(rows).find(r => r.tp != null) ?? null;
}

/** Latest stop and target (each from the newest row that says something about it). */
export function currentLevels(rows: LevelRow[]): { sl: number | null; tp: number | null } {
  const s = sortLevels(rows);
  let sl: number | null = null, tp: number | null = null;
  for (const r of s) {
    if (r.sl != null || SNAPSHOT.has(r.source)) sl = r.sl;
    if (r.tp != null || SNAPSHOT.has(r.source)) tp = r.tp;
  }
  return { sl, tp };
}

/** Widened / tightened / null (no move, or not enough rows). */
export function stopMove(rows: LevelRow[], side: 'LONG' | 'SHORT'): StopMove | null {
  const s = sortLevels(rows);
  const first = s.findIndex(r => r.sl != null);
  if (first < 0) return null;
  const s0 = s[first]!.sl!;
  let tightened = false;
  for (const r of s.slice(first + 1)) {
    if (r.sl == null) {
      // A live snapshot without a stop after one was set: the stop was removed.
      if (SNAPSHOT.has(r.source)) return 'widened';
      continue;
    }
    if (same(r.sl, s0)) continue;
    const further = side === 'LONG' ? r.sl < s0 : r.sl > s0;
    if (further) return 'widened';
    tightened = true;
  }
  return tightened ? 'tightened' : null;
}

/** Whether a new snapshot says something the latest row doesn't (dedupe for sync writes). */
export function changed(last: Pick<LevelRow, 'sl' | 'tp'> | null, next: { sl: number | null; tp: number | null }): boolean {
  if (!last) return next.sl != null || next.tp != null;
  const eq = (a: number | null, b: number | null) => (a == null ? b == null : b != null && same(a, b));
  return !eq(last.sl, next.sl) || !eq(last.tp, next.tp);
}

/**
 * Validate a stop / target the trader types for a position. The stop at entry
 * must be on the losing side of the entry; a later stop may be anywhere
 * (trailing into profit), a target must be on the winning side.
 */
export function levelError(side: 'LONG' | 'SHORT', entry: number, sl: number | null, tp: number | null, hasStop: boolean): string | null {
  if (sl == null && tp == null) return 'Add a stop or a target';
  const long = side === 'LONG';
  if (sl != null && !hasStop && (long ? sl >= entry : sl <= entry)) return `The stop has to be ${long ? 'below' : 'above'} the entry for a ${long ? 'long' : 'short'}`;
  if (tp != null && (long ? tp <= entry : tp >= entry)) return `The target has to be ${long ? 'above' : 'below'} the entry for a ${long ? 'long' : 'short'}`;
  if (sl != null && tp != null && (long ? sl >= tp : sl <= tp)) return 'The stop has to be on the other side of the target';
  return null;
}

const HISTORY_MAX = 20;

export function levelsDto(rows: LevelRow[], side: 'LONG' | 'SHORT', available = true): PositionLevelsDTO {
  const s = sortLevels(rows);
  const stop = stopAtEntry(s), target = targetAtEntry(s);
  const history: LevelRowDTO[] = s.slice(-HISTORY_MAX).map(r => ({
    id: r.id, sl: r.sl, tp: r.tp, source: r.source, at: new Date(r.observedAt).toISOString(), mine: MINE.has(r.source),
  }));
  return {
    available,
    stop: stop?.sl ?? null, stopSource: stop?.source ?? null,
    target: target?.tp ?? null, targetSource: target?.source ?? null,
    current: currentLevels(s),
    move: stopMove(s, side),
    history,
  };
}

export const NO_LEVELS = (available: boolean): PositionLevelsDTO => ({
  available, stop: null, stopSource: null, target: null, targetSource: null, current: { sl: null, tp: null }, move: null, history: [],
});
