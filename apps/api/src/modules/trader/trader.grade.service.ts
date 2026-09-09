// Grade pending TraderAnalysis rows against subsequent candles (triple-barrier).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { MarketTimeframe, TraderDirection } from '@tradinjournal/contracts';
import {
  gradeAnalysis,
  lowestTimeframe,
  timeframeMs,
  DEFAULT_HORIZON_BARS,
  type GradeOutcome,
  type HitLevel,
} from '@tradinjournal/core';
import { loadPublicCandlesWindow } from '../market/market.service.js';

const BATCH_DEFAULT = 40;

export interface GradeBatchResult {
  scanned: number;
  graded: number;
  stillOpen: number;
  errors: number;
}

/**
 * Scan ungraded analyses old enough that at least one LTF bar should exist,
 * fetch post-asOf candles, and persist terminal outcomes.
 */
export async function gradePendingAnalyses(limit = BATCH_DEFAULT): Promise<GradeBatchResult> {
  const rows = await prisma.traderAnalysis.findMany({
    where: { outcome: null },
    orderBy: { asOf: 'asc' },
    take: Math.min(200, Math.max(1, limit)),
  });

  let graded = 0;
  let stillOpen = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const direction = row.direction as TraderDirection;
      const horizonTf = lowestTimeframe(row.timeframes);
      const barMs = timeframeMs(horizonTf);
      const asOfMs = row.asOf.getTime();

      // Too fresh — wait for at least one full bar after asOf.
      if (Date.now() < asOfMs + barMs) {
        stillOpen += 1;
        continue;
      }

      if (direction === 'WAIT') {
        await prisma.traderAnalysis.update({
          where: { id: row.id },
          data: {
            outcome: 'SKIPPED',
            hitLevel: null,
            gradedAt: new Date(),
            horizonBars: DEFAULT_HORIZON_BARS,
            horizonTf,
            mfePct: 0,
            maePct: 0,
          },
        });
        graded += 1;
        continue;
      }

      const toMs = asOfMs + DEFAULT_HORIZON_BARS * barMs + barMs;
      const candles = await loadPublicCandlesWindow(
        row.symbol,
        horizonTf as MarketTimeframe,
        asOfMs,
        toMs,
        DEFAULT_HORIZON_BARS + 8,
      );

      const result = gradeAnalysis(
        {
          direction,
          entryLow: num(row.entryLow),
          entryHigh: num(row.entryHigh),
          stop: num(row.stop),
          t1: num(row.t1),
          t2: num(row.t2),
          t3: num(row.t3),
          asOfMs,
          horizonBars: DEFAULT_HORIZON_BARS,
        },
        candles,
      );

      if (result.outcome == null) {
        stillOpen += 1;
        continue;
      }

      await prisma.traderAnalysis.update({
        where: { id: row.id },
        data: {
          outcome: result.outcome as GradeOutcome,
          hitLevel: (result.hitLevel as HitLevel | null) ?? null,
          gradedAt: new Date(),
          horizonBars: result.horizonBars,
          horizonTf,
          mfePct: result.mfePct,
          maePct: result.maePct,
        },
      });
      graded += 1;
    } catch (err) {
      errors += 1;
      logger.warn(`[trader/grade] ${row.id} ${row.symbol}: ${(err as Error).message}`);
    }
  }

  return { scanned: rows.length, graded, stillOpen, errors };
}

function num(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}
