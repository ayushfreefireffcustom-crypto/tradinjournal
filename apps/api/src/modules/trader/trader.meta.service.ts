// Train + load the Trader Master meta-label model (SystemSetting-backed).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { Prisma } from '@tradinjournal/db';
import {
  META_FEATURE_NAMES,
  trainMetaModel,
  predictHitProbability,
  type MetaModelArtifact,
  type MetaFeatureSnapshot,
  type LaneResult,
} from '@tradinjournal/core';
import { predictLgbmIfServing } from './trader.lgbm.service.js';

export const META_MODEL_KEY = 'trader_meta_model_v1';
const MIN_SAMPLES = 24;

let cache: { model: MetaModelArtifact | null; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

export async function loadMetaModel(): Promise<MetaModelArtifact | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.model;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: META_MODEL_KEY } });
    const model = (row?.value as MetaModelArtifact | null) ?? null;
    if (model && model.version === 1 && model.logistic?.weights?.length) {
      cache = { model, expiresAt: now + CACHE_MS };
      return model;
    }
  } catch (err) {
    logger.warn(`[trader/meta] load failed: ${(err as Error).message}`);
  }
  cache = { model: null, expiresAt: now + CACHE_MS };
  return null;
}

export function invalidateMetaModelCache(): void {
  cache = null;
}

export interface MetaTrainResult {
  trained: boolean;
  reason?: string;
  sampleSize?: number;
  oofAuc?: number | null;
  trainHits?: number;
  trainMisses?: number;
}

/** Rebuild meta-model from graded TARGET_HIT / STOP_HIT rows with feature snapshots. */
export async function trainMetaModelFromDb(): Promise<MetaTrainResult> {
  const rows = await prisma.traderAnalysis.findMany({
    where: {
      outcome: { in: ['TARGET_HIT', 'STOP_HIT'] },
      NOT: { featureSnapshot: { equals: Prisma.DbNull } },
      direction: { in: ['LONG', 'SHORT'] },
    },
    orderBy: { asOf: 'asc' },
    take: 5000,
    select: {
      outcome: true,
      asOf: true,
      featureSnapshot: true,
    },
  });

  const X: number[][] = [];
  const y: number[] = [];
  const asOfMs: number[] = [];

  for (const r of rows) {
    const snap = r.featureSnapshot as MetaFeatureSnapshot | null;
    if (!snap?.values || snap.values.length !== META_FEATURE_NAMES.length) continue;
    X.push(snap.values);
    y.push(r.outcome === 'TARGET_HIT' ? 1 : 0);
    asOfMs.push(r.asOf.getTime());
  }

  if (X.length < MIN_SAMPLES) {
    return {
      trained: false,
      reason: `Need ≥${MIN_SAMPLES} graded samples with features (have ${X.length})`,
      sampleSize: X.length,
    };
  }

  const artifact = trainMetaModel({
    X,
    y,
    asOfMs,
    featureNames: [...META_FEATURE_NAMES],
  });

  await prisma.systemSetting.upsert({
    where: { key: META_MODEL_KEY },
    create: {
      key: META_MODEL_KEY,
      value: artifact as unknown as Prisma.InputJsonValue,
      updatedBy: 'trader-meta-train',
    },
    update: {
      value: artifact as unknown as Prisma.InputJsonValue,
      updatedBy: 'trader-meta-train',
    },
  });
  invalidateMetaModelCache();

  logger.info(
    `[trader/meta] trained n=${artifact.sampleSize} auc=${artifact.oofAuc?.toFixed(3) ?? 'n/a'} hits=${artifact.trainHits}`,
  );

  return {
    trained: true,
    sampleSize: artifact.sampleSize,
    oofAuc: artifact.oofAuc,
    trainHits: artifact.trainHits,
    trainMisses: artifact.trainMisses,
  };
}

/**
 * Apply meta-model: returns calibrated confidence (0–100) + optional ML lane.
 * Falls back to heuristic when model missing / WAIT.
 */
export async function applyMetaConfidence(input: {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  heuristicConfidence: number;
  snapshot: MetaFeatureSnapshot;
  lanes: LaneResult[];
}): Promise<{
  confidence: number;
  confidenceSource: 'heuristic' | 'meta_v1' | 'meta_lgbm';
  rawConfidence: number;
  lanes: LaneResult[];
  mlProb: number | null;
}> {
  const rawConfidence = input.heuristicConfidence;
  if (input.direction === 'WAIT') {
    return {
      confidence: Math.min(rawConfidence, 45),
      confidenceSource: 'heuristic',
      rawConfidence,
      lanes: input.lanes,
      mlProb: null,
    };
  }

  const model = await loadMetaModel();
  const lgbm = await predictLgbmIfServing(input.snapshot.values).catch(() => null);
  if (lgbm) {
    return finishMeta(input, lgbm.p, 'meta_lgbm', lgbm.artifact.oofAuc ?? null, 'LightGBM');
  }
  if (!model) {
    return {
      confidence: rawConfidence,
      confidenceSource: 'heuristic',
      rawConfidence,
      lanes: input.lanes,
      mlProb: null,
    };
  }

  const pHit = predictHitProbability(model, input.snapshot.values);
  return finishMeta(input, pHit, 'meta_v1', model.oofAuc, 'logistic');
}

function finishMeta(
  input: {
    direction: 'LONG' | 'SHORT' | 'WAIT';
    heuristicConfidence: number;
    lanes: LaneResult[];
  },
  pHit: number,
  source: 'meta_v1' | 'meta_lgbm',
  auc: number | null,
  label: string,
): {
  confidence: number;
  confidenceSource: 'heuristic' | 'meta_v1' | 'meta_lgbm';
  rawConfidence: number;
  lanes: LaneResult[];
  mlProb: number | null;
} {
  const confidence = Math.max(5, Math.min(95, Math.round(pHit * 100)));
  const signed = (pHit - 0.5) * 2;
  const dirSign = input.direction === 'SHORT' ? -1 : 1;
  const mlLane: LaneResult = {
    id: 'ml',
    score: Math.max(-1, Math.min(1, signed * dirSign)),
    weight: 0.18,
    rationale: `${label} P(hit)=${(pHit * 100).toFixed(0)}% (AUC ${auc != null ? auc.toFixed(2) : '—'})`,
    source: label,
  };
  return {
    confidence,
    confidenceSource: source,
    rawConfidence: input.heuristicConfidence,
    lanes: [...input.lanes.filter((l) => l.id !== 'ml'), mlLane],
    mlProb: pHit,
  };
}
