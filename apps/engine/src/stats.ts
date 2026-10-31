// Ported unchanged from MirrorPip-X (`apps/engine/src/stats.ts`).
// Pure leaderboard math over an equity curve. Kept DB-free for unit testing.

export interface EquityPoint {
  equityUsd: number;
  ts: Date;
}

export interface CurveStats {
  roiPct: number;
  maxDrawdownPct: number;
}

/**
 * ROI and max drawdown over the points whose timestamp is >= `sinceMs` (epoch
 * ms; pass 0 for "all time"). ROI is first→last return; drawdown is the largest
 * peak-to-trough decline as a positive percentage. Points must be time-ordered.
 */
export function curveStats(points: EquityPoint[], sinceMs = 0): CurveStats {
  const pts = points.filter((p) => p.ts.getTime() >= sinceMs);
  if (pts.length < 2) return { roiPct: 0, maxDrawdownPct: 0 };

  const first = pts[0]!.equityUsd;
  const last = pts[pts.length - 1]!.equityUsd;
  const roiPct = first > 0 ? ((last - first) / first) * 100 : 0;

  let peak = pts[0]!.equityUsd;
  let maxDd = 0;
  for (const p of pts) {
    if (p.equityUsd > peak) peak = p.equityUsd;
    if (peak > 0) {
      const dd = ((peak - p.equityUsd) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return { roiPct, maxDrawdownPct: maxDd };
}

export const WINDOWS: Record<string, number> = {
  '7d': 7 * 24 * 3600 * 1000,
  '30d': 30 * 24 * 3600 * 1000,
  all: 0,
};
