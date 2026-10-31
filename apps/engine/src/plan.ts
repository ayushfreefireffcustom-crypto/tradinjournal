// Pure copy planning: turns one leader fill into the follower's order legs.
// Everything that decides a size lives here so it can be tested without a DB
// or an exchange. Fixes MirrorPip-X gaps G3 (rounding residuals), G4 (closes
// sized from the follower's real position, reduce-only, never over-closing)
// and G6 (max position caps the resulting position, not each order).
//
// Rules:
//  1. If the follower holds the opposite side of this order, close first,
//     reduce-only:
//     - leader closing part of its position → close the same share of the
//       follower's position;
//     - otherwise (leader opening, or unknown) → close up to the size this
//       fill would have opened.
//  2. Open only the part of the leader's fill that opened or added to the
//     leader's position, and only once the follower's opposite side is fully
//     closed. When we can't tell what the leader did (no position-after) and
//     the follower is on the other side, we only reduce.
//  3. Opening sizes carry their rounding remainder to the next fill. A full
//     close resets the carry.

import { closeQty, toVenueQty, type InstrumentInfo, type Side } from '@tradinjournal/exchange';

export type SizingMode = 'PROPORTIONAL' | 'FIXED_NOTIONAL' | 'MULTIPLIER';

export interface PlanInput {
  fill: {
    side: Side;
    /** Leader quantity in the leader venue's units. */
    qty: number;
    price: number;
    /** Leader's signed position after the fill (leader units), when known. */
    positionAfter?: number;
    /** Base units per leader qty unit. */
    contractMultiplier?: number;
  };
  sizingMode: SizingMode;
  sizingValue: number;
  copyReverse: boolean;
  leaderEquityUsd: number;
  followerEquityUsd: number;
  maxPositionUsd: number | null;
  /** Follower's signed position on the target contract (follower venue units). */
  followerPosition: number;
  /** Follower venue contract. */
  instrument: Pick<InstrumentInfo, 'contractMultiplier' | 'qtyStep' | 'minQty'>;
  /** Carried unsent size for this follow and symbol (follower venue units). */
  residual: number;
}

export interface PlanLeg {
  kind: 'CLOSE' | 'OPEN';
  side: Side;
  /** Follower venue units, already a valid order size. */
  qty: number;
  reduceOnly: boolean;
}

export interface Plan {
  legs: PlanLeg[];
  residual: number;
  /** Set when nothing will be sent; recorded on a SKIPPED order. */
  skipReason?: string;
}

const sign = (s: Side) => (s === 'BUY' ? 1 : -1);
const flip = (s: Side): Side => (s === 'BUY' ? 'SELL' : 'BUY');

/** Base-asset size the follower should trade for `leaderQty` of the leader's fill. */
export function sizeBaseQty(
  input: Pick<PlanInput, 'fill' | 'sizingMode' | 'sizingValue' | 'leaderEquityUsd' | 'followerEquityUsd'>,
  leaderQty: number,
): { base: number; reason?: string } {
  const mult = input.fill.contractMultiplier ?? 1;
  const v = input.sizingValue;
  if (!(v > 0)) return { base: 0, reason: 'sizing value must be above zero' };
  switch (input.sizingMode) {
    case 'MULTIPLIER':
      return { base: leaderQty * mult * v };
    case 'FIXED_NOTIONAL': {
      if (!(input.fill.price > 0)) return { base: 0, reason: 'leader fill has no price' };
      // Scale to this part of the fill so a split entry still spends `v` in total.
      const share = input.fill.qty > 0 ? leaderQty / input.fill.qty : 1;
      return { base: (v / input.fill.price) * share };
    }
    case 'PROPORTIONAL':
    default:
      if (!(input.leaderEquityUsd > 0)) return { base: 0, reason: 'leader equity unknown' };
      if (!(input.followerEquityUsd > 0)) return { base: 0, reason: 'follower account has no equity' };
      return { base: leaderQty * mult * (input.followerEquityUsd / input.leaderEquityUsd) * v };
  }
}

export function planCopy(input: PlanInput): Plan {
  const { fill, instrument: inst } = input;
  const side = input.copyReverse ? flip(fill.side) : fill.side;
  const legs: PlanLeg[] = [];
  let residual = input.residual;

  // What the leader's fill did to the leader's own position.
  const known = fill.positionAfter != null && Number.isFinite(fill.positionAfter);
  const leaderBefore = known ? fill.positionAfter! - sign(fill.side) * fill.qty : undefined;
  const leaderCloseQty =
    leaderBefore != null && leaderBefore !== 0 && Math.sign(leaderBefore) !== sign(fill.side) ? Math.min(fill.qty, Math.abs(leaderBefore)) : 0;
  const leaderOpenQty = known ? fill.qty - leaderCloseQty : fill.qty;

  // 1. Close the follower's opposite side.
  const open = Math.abs(input.followerPosition);
  const opposite = open > 0 && Math.sign(input.followerPosition) !== sign(side);
  let remainingOpposite = 0;
  let sizeReason: string | undefined;
  if (opposite) {
    let q: number;
    if (leaderCloseQty > 0 && leaderBefore != null) {
      q = closeQty(open, leaderBefore, leaderCloseQty, inst.qtyStep);
    } else {
      const sized = sizeBaseQty(input, fill.qty);
      sizeReason = sized.reason;
      q = Math.min(open, toVenueQty(sized.base, inst, 0).qty);
    }
    if (q > 0) legs.push({ kind: 'CLOSE', side, qty: q, reduceOnly: true });
    remainingOpposite = open - q;
    if (remainingOpposite <= 0) residual = 0;
  }

  // 2. Open what the leader opened, once nothing of the opposite side is left.
  const mayOpen = !opposite || (known && leaderCloseQty > 0 && remainingOpposite <= 0);
  if (mayOpen && leaderOpenQty > 0) {
    const sized = sizeBaseQty(input, leaderOpenQty);
    sizeReason ??= sized.reason;
    let base = sized.base;
    if (base > 0 && input.maxPositionUsd != null && fill.price > 0) {
      const existingBase = (opposite ? 0 : open) * inst.contractMultiplier;
      const room = Math.max(0, input.maxPositionUsd / fill.price - existingBase);
      if (base > room) {
        base = room;
        if (base <= 0) sizeReason = 'max position size reached';
      }
    }
    if (base > 0) {
      const v = toVenueQty(base, inst, residual);
      residual = v.residual;
      if (v.qty > 0) legs.push({ kind: 'OPEN', side, qty: v.qty, reduceOnly: false });
      else sizeReason ??= 'size rounded below one contract (carried to the next fill)';
    }
  }

  if (!legs.length) {
    const reason = sizeReason ?? (opposite || leaderCloseQty > 0 ? 'nothing to close on the follower account' : 'computed size is zero');
    return { legs, residual, skipReason: reason };
  }
  return { legs, residual };
}
