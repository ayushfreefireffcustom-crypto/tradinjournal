// LightGBM challenger. Trains beside the logistic champion and is served only
// when shouldPromoteLgbm says it actually wins.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import { Prisma } from '@tradinjournal/db';
import {
  META_FEATURE_NAMES,
  shouldPromoteLgbm,
  type MetaFeatureSnapshot,
  type MetaModelArtifact,
} from '@tradinjournal/core';
import { predictLgbmRemote, trainLgbmRemote, type LgbmArtifact } from './trader.lgbm.client.js';

const LOGISTIC_KEY = 'trader_meta_model_v1';

export const LGBM_MODEL_KEY = 'trader_meta_model_lgbm_v1';
export const CHAMPION_KEY = 'trader_meta_champion';

export interface LgbmTrainResult {
  trained: boolean;
  serving: boolean;
  reason?: string;
  sampleSize?: number;
  oofAuc?: number | null;
  oofBrier?: number | null;
}

let cache: { model: LgbmArtifact | null; champion: string; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

export function invalidateLgbmCache(): void {
  cache = null;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return (row?.value as T | null) ?? null;
}

export async function loadLgbmState(): Promise<{ artifact: LgbmArtifact | null; champion: string }> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return { artifact: cache.model, champion: cache.champion };
  const [artifact, champ] = await Promise.all([
    readSetting<LgbmArtifact>(LGBM_MODEL_KEY),
    readSetting<{ kind?: string }>(CHAMPION_KEY),
  ]);
  const champion = champ?.kind === 'lgbm' ? 'lgbm' : 'logistic';
  cache = { model: artifact, champion, expiresAt: now + CACHE_MS };
  return { artifact, champion };
}

export async function trainLgbmChallenger(): Promise<LgbmTrainResult> {
  const rows = await prisma.traderAnalysis.findMany({
    where: {
      outcome: { in: ['TARGET_HIT', 'STOP_HIT'] },
      NOT: { featureSnapshot: { equals: Prisma.DbNull } },
      direction: { in: ['LONG', 'SHORT'] },
    },
    orderBy: { asOf: 'asc' },
    take: 5000,
    select: { outcome: true, asOf: true, featureSnapshot: true },
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

  if (X.length < 24) {
    return { trained: false, serving: false, reason: `Need ≥24 samples to fit (have ${X.length})`, sampleSize: X.length };
  }

  const trained = await trainLgbmRemote({ X, y, asOfMs, featureNames: [...META_FEATURE_NAMES] });
  if (!trained?.trained || !trained.model) {
    return {
      trained: false,
      serving: false,
      reason: trained?.reason ?? 'LightGBM service unavailable',
      sampleSize: X.length,
    };
  }

  const logistic = await readSetting<MetaModelArtifact>(LOGISTIC_KEY);
  const decision = shouldPromoteLgbm({
    sampleSize: trained.sampleSize ?? X.length,
    lgbmAuc: trained.oofAuc ?? null,
    logisticAuc: logistic?.oofAuc ?? null,
    lgbmBrier: trained.oofBrier ?? null,
    logisticBrier: logistic?.oofBrier ?? null,
  });

  const artifact: LgbmArtifact = {
    ...trained,
    promoted: decision.promote,
    promoteReason: decision.reason,
    logisticAuc: logistic?.oofAuc ?? null,
    logisticBrier: logistic?.oofBrier ?? null,
  };

  await prisma.systemSetting.upsert({
    where: { key: LGBM_MODEL_KEY },
    create: { key: LGBM_MODEL_KEY, value: artifact as unknown as Prisma.InputJsonValue, updatedBy: 'trader-lgbm' },
    update: { value: artifact as unknown as Prisma.InputJsonValue, updatedBy: 'trader-lgbm' },
  });
  await prisma.systemSetting.upsert({
    where: { key: CHAMPION_KEY },
    create: {
      key: CHAMPION_KEY,
      value: { kind: decision.promote ? 'lgbm' : 'logistic', reason: decision.reason, updatedAt: new Date().toISOString() },
      updatedBy: 'trader-lgbm',
    },
    update: {
      value: { kind: decision.promote ? 'lgbm' : 'logistic', reason: decision.reason, updatedAt: new Date().toISOString() },
      updatedBy: 'trader-lgbm',
    },
  });
  invalidateLgbmCache();

  logger.info(`[trader/lgbm] trained n=${X.length} serving=${decision.promote} ${decision.reason}`);
  return {
    trained: true,
    serving: decision.promote,
    reason: decision.reason,
    sampleSize: trained.sampleSize ?? X.length,
    oofAuc: trained.oofAuc,
    oofBrier: trained.oofBrier,
  };
}

export async function predictLgbmIfServing(values: number[]): Promise<{ p: number; artifact: LgbmArtifact } | null> {
  const { artifact, champion } = await loadLgbmState();
  if (champion !== 'lgbm' || !artifact?.promoted || !artifact.model) return null;
  const p = await predictLgbmRemote(values, artifact);
  if (p == null) return null;
  return { p, artifact };
}
