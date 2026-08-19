// Read the current user's recent Trader Master analyses (newest first).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { TraderAnalysisDto, TraderTimeframe } from '@tradinjournal/contracts';

const HISTORY_LIMIT = 20;

function num(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

export async function listHistory(userId: string): Promise<TraderAnalysisDto[]> {
  try {
    const rows = await prisma.traderAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      assetClass: r.assetClass as TraderAnalysisDto['assetClass'],
      timeframes: r.timeframes as TraderTimeframe[],
      direction: r.direction as TraderAnalysisDto['direction'],
      entryLow: num(r.entryLow),
      entryHigh: num(r.entryHigh),
      stop: num(r.stop),
      t1: num(r.t1),
      t2: num(r.t2),
      t3: num(r.t3),
      support: r.support as TraderAnalysisDto['support'],
      resistance: r.resistance as TraderAnalysisDto['resistance'],
      confidence: r.confidence,
      rationale: r.rationale,
      invalidation: r.invalidation,
      detail: r.detail,
      perTimeframe: r.perTimeframe as TraderAnalysisDto['perTimeframe'],
      aiUsed: r.aiUsed,
      asOf: r.asOf.toISOString(),
      engineVer: r.engineVer,
    }));
  } catch (err) {
    // History is non-critical (e.g. table missing pre-migration) — return empty.
    logger.warn(`[trader] history read failed: ${(err as Error).message}`);
    return [];
  }
}
