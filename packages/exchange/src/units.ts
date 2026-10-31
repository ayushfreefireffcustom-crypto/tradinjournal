// Pure quantity maths shared by adapters and the copy engine. Kept free of I/O
// so it can be unit-tested; these numbers decide order sizes.

import type { InstrumentInfo } from './types.js';

export interface VenueQty {
  /** Quantity to send, a whole multiple of qtyStep (0 = skip). */
  qty: number;
  /**
   * Unsent remainder in venue units, signed like the intent. Carry it into the
   * next conversion for the same follow and symbol so many small fills add up
   * instead of each rounding away (MirrorPip-X gap G3).
   */
  residual: number;
}

const EPS = 1e-9;

/**
 * Convert an intended size in base-asset units into venue units.
 *
 * Rounds to the nearest step (0.997 contracts → 1; flooring dropped closes in
 * MirrorPip-X), after adding the carried residual. Results under `minQty`
 * are not sent and are carried instead.
 */
export function toVenueQty(baseQty: number, inst: Pick<InstrumentInfo, 'contractMultiplier' | 'qtyStep' | 'minQty'>, carried = 0): VenueQty {
  const mult = inst.contractMultiplier > 0 ? inst.contractMultiplier : 1;
  const step = inst.qtyStep > 0 ? inst.qtyStep : 1;
  if (!Number.isFinite(baseQty) || baseQty < 0) return { qty: 0, residual: carried };
  const want = baseQty / mult + carried;
  const steps = Math.round(want / step + EPS);
  let qty = roundTo(steps * step, step);
  if (qty < inst.minQty - EPS) qty = 0;
  return { qty, residual: roundTo(want - qty, 1e-12) };
}

/**
 * Size of a reduce-only close for a follower, proportional to how much of their
 * own position the leader is closing. Capped at the follower's real open size,
 * so a close can never flip or over-close (MirrorPip-X gap G4).
 */
export function closeQty(followerOpenQty: number, leaderPositionBefore: number, leaderCloseQty: number, step: number): number {
  const open = Math.abs(followerOpenQty);
  const before = Math.abs(leaderPositionBefore);
  if (open <= 0 || before <= 0 || leaderCloseQty <= 0) return 0;
  const share = Math.min(1, leaderCloseQty / before);
  // A full close by the leader closes everything, whatever rounding says.
  if (share >= 1 - EPS) return open;
  const s = step > 0 ? step : 1;
  return Math.min(open, roundTo(Math.round((open * share) / s) * s, s));
}

function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(value.toFixed(Math.min(decimals + 2, 12)));
}
