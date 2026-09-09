// Read the current user's recent Trader Master analyses (newest first).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type {
  TraderAnalysisDto,
  TraderTimeframe,
  TraderOutcome,
  TraderHitLevel,
  TraderLaneResult,
} from '@tradinjournal/contracts';

const HISTORY_LIMIT = 40;

function num(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

function mapRow(r: {
  id: string;
  symbol: string;
  assetClass: string;
  timeframes: string[];
  direction: string;
  entryLow: { toNumber(): number } | number;
  entryHigh: { toNumber(): number } | number;
  stop: { toNumber(): number } | number;
  t1: { toNumber(): number } | number;
  t2: { toNumber(): number } | number;
  t3: { toNumber(): number } | number;
  support: unknown;
  resistance: unknown;
  confidence: number;
  rationale: string;
  invalidation: string;
  detail: string;
  perTimeframe: unknown;
  laneBreakdown: unknown;
  aiUsed: boolean;
  asOf: Date;
  engineVer: string;
  outcome: string | null;
  hitLevel: string | null;
  gradedAt: Date | null;
  horizonBars: number | null;
  horizonTf: string | null;
  mfePct: number | null;
  maePct: number | null;
}): TraderAnalysisDto {
  return {
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
    laneBreakdown: (r.laneBreakdown as TraderLaneResult[] | null) ?? undefined,
    aiUsed: r.aiUsed,
    asOf: r.asOf.toISOString(),
    engineVer: r.engineVer,
    outcome: (r.outcome as TraderOutcome | null) ?? null,
    hitLevel: (r.hitLevel as TraderHitLevel | null) ?? null,
    gradedAt: r.gradedAt?.toISOString() ?? null,
    horizonBars: r.horizonBars,
    horizonTf: (r.horizonTf as TraderTimeframe | null) ?? null,
    mfePct: r.mfePct,
    maePct: r.maePct,
  };
}

export async function listHistory(userId: string): Promise<TraderAnalysisDto[]> {
  try {
    const rows = await prisma.traderAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return rows.map(mapRow);
  } catch (err) {
    // History is non-critical (e.g. table missing pre-migration) — return empty.
    logger.warn(`[trader] history read failed: ${(err as Error).message}`);
    return [];
  }
}

export { mapRow as mapTraderAnalysisRow };
