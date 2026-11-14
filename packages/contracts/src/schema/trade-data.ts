// Trade data: stop loss / take profit levels per position (trade_level) and the
// excursion while it was open (trade_excursion). Used by Dashboard, Analytics,
// the trade log and the trade review for R-multiples, stop moves and MAE/MFE.
//
//   • Levels come from the MT5 bridge (position snapshots and the opening
//     order), exchange stop orders, the trader ("Add stop / target") and the
//     Charts page plan. Each change is a new row; the EARLIEST row with a stop
//     is the stop at entry that R is measured against.
//   • R = net ÷ (|entry − stop at entry| × volume × value per point).
//   • A stop is "moved" when a position has ≥ 2 rows with different stops:
//     widened = moved away from the entry (or removed), tightened = closer.
import { z } from 'zod';

export const LEVEL_SOURCES = ['bridge', 'order', 'exchange', 'user', 'plan'] as const;
export type LevelSource = (typeof LEVEL_SOURCES)[number];
export type StopMove = 'widened' | 'tightened';

const price = z.number().positive().finite().max(1e9);
const id = z.string().min(1).max(64);

/** POST /api/trade-data/levels — the trader's stop and/or target for a position. */
export const addLevelSchema = z.object({
  accountId: id,
  positionId: z.string().regex(/^\d{1,19}$/, 'positionId must be the MT5 position number'),
  sl: price.nullable().optional(),
  tp: price.nullable().optional(),
  /** 'plan' = saved from the Charts page risk ruler for the open position. */
  source: z.enum(['user', 'plan']).default('user'),
});
export type AddLevelInput = z.infer<typeof addLevelSchema>;

/** DELETE /api/trade-data/levels — remove one of your own rows (typo fix). */
export const deleteLevelSchema = z.object({ accountId: id, id });
export type DeleteLevelInput = z.infer<typeof deleteLevelSchema>;

export interface LevelRowDTO {
  id: string;
  sl: number | null;
  tp: number | null;
  source: LevelSource;
  /** ISO time the level was seen (or set). */
  at: string;
  /** The trader's own row (can be deleted). */
  mine: boolean;
}

/** Everything known about one position's levels; `available` is false until the table exists. */
export interface PositionLevelsDTO {
  available: boolean;
  /** Stop at entry (earliest row with a stop) and where it came from. */
  stop: number | null;
  stopSource: LevelSource | null;
  /** Earliest target. */
  target: number | null;
  targetSource: LevelSource | null;
  /** Latest stop / target (after any moves). */
  current: { sl: number | null; tp: number | null };
  move: StopMove | null;
  /** Oldest first, ≤ 20. */
  history: LevelRowDTO[];
}

export interface AddLevelDTO { levels: PositionLevelsDTO }
