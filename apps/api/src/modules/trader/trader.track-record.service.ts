// Aggregate honest Trader Master track record: hit rate, expectancy, calibration.
import { prisma } from '@tradinjournal/db';
import type { TraderTrackRecord, TraderCalibrationBucket } from '@tradinjournal/contracts';
import { outcomeRMultiple, type GradeOutcome, type HitLevel } from '@tradinjournal/core';

const METHODOLOGY =
  'Each LONG/SHORT call is graded with triple-barrier labeling against subsequent ' +
  'candles on the lowest selected timeframe (48-bar vertical horizon). Same-bar ' +
  'ambiguity counts as a stop (conservative). WAIT calls are skipped. Confidence ' +
  'buckets show realized target-hit rate vs the engine’s stated confidence — not a guarantee.';

const DISCLAIMER =
  'Past performance is not indicative of future results. Educational research only — not financial advice.';

const BUCKETS = [
  { key: '50-59', lo: 50, hi: 59, mid: 55 },
  { key: '60-69', lo: 60, hi: 69, mid: 65 },
  { key: '70-79', lo: 70, hi: 79, mid: 75 },
  { key: '80-89', lo: 80, hi: 89, mid: 85 },
  { key: '90-100', lo: 90, hi: 100, mid: 95 },
] as const;

export async function getTrackRecord(opts?: { userId?: string }): Promise<TraderTrackRecord> {
  const where = opts?.userId ? { userId: opts.userId } : {};

  const [pending, skipped, rows] = await Promise.all([
    prisma.traderAnalysis.count({ where: { ...where, outcome: null } }),
    prisma.traderAnalysis.count({ where: { ...where, outcome: 'SKIPPED' } }),
    prisma.traderAnalysis.findMany({
      where: {
        ...where,
        outcome: { in: ['TARGET_HIT', 'STOP_HIT', 'EXPIRED'] },
      },
      select: {
        symbol: true,
        confidence: true,
        outcome: true,
        hitLevel: true,
      },
    }),
  ]);

  let targetHits = 0;
  let stopHits = 0;
  let expired = 0;
  const rSamples: number[] = [];
  const bySymbolMap = new Map<string, { targetHits: number; stopHits: number; expired: number }>();
  const bucketStats = new Map<string, { targetHits: number; stopHits: number; expired: number }>();

  for (const b of BUCKETS) bucketStats.set(b.key, { targetHits: 0, stopHits: 0, expired: 0 });

  for (const row of rows) {
    const outcome = row.outcome as GradeOutcome;
    if (outcome === 'TARGET_HIT') targetHits += 1;
    else if (outcome === 'STOP_HIT') stopHits += 1;
    else expired += 1;

    const r = outcomeRMultiple(outcome, row.hitLevel as HitLevel | null);
    if (r != null) rSamples.push(r);

    const sym = bySymbolMap.get(row.symbol) ?? { targetHits: 0, stopHits: 0, expired: 0 };
    if (outcome === 'TARGET_HIT') sym.targetHits += 1;
    else if (outcome === 'STOP_HIT') sym.stopHits += 1;
    else sym.expired += 1;
    bySymbolMap.set(row.symbol, sym);

    const bucket = BUCKETS.find((b) => row.confidence >= b.lo && row.confidence <= b.hi);
    if (bucket) {
      const st = bucketStats.get(bucket.key)!;
      if (outcome === 'TARGET_HIT') st.targetHits += 1;
      else if (outcome === 'STOP_HIT') st.stopHits += 1;
      else st.expired += 1;
    }
  }

  const decided = targetHits + stopHits;
  const hitRate = decided > 0 ? targetHits / decided : null;
  const expectancyR =
    rSamples.length > 0 ? rSamples.reduce((a, b) => a + b, 0) / rSamples.length : null;

  const calibration: TraderCalibrationBucket[] = BUCKETS.map((b) => {
    const st = bucketStats.get(b.key)!;
    const count = st.targetHits + st.stopHits + st.expired;
    const decidedBucket = st.targetHits + st.stopHits;
    return {
      bucket: b.key,
      predicted: b.mid,
      count,
      hitRate: decidedBucket > 0 ? st.targetHits / decidedBucket : null,
      targetHits: st.targetHits,
      stopHits: st.stopHits,
      expired: st.expired,
    };
  });

  const bySymbol = [...bySymbolMap.entries()]
    .map(([symbol, st]) => {
      const d = st.targetHits + st.stopHits;
      return {
        symbol,
        count: st.targetHits + st.stopHits + st.expired,
        hitRate: d > 0 ? st.targetHits / d : null,
        targetHits: st.targetHits,
        stopHits: st.stopHits,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const graded = rows.length;
  const sampleSize = graded + pending + skipped;

  return {
    sampleSize,
    graded,
    pending,
    skipped,
    targetHits,
    stopHits,
    expired,
    hitRate,
    expectancyR,
    calibration,
    bySymbol,
    methodology: METHODOLOGY,
    disclaimer: DISCLAIMER,
    asOf: new Date().toISOString(),
  };
}
