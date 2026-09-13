// HTTP client for the LightGBM challenger process. Soft-fails when it is down.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

export interface LgbmTrainResponse {
  trained: boolean;
  reason?: string;
  sampleSize?: number;
  oofAuc?: number | null;
  oofBrier?: number | null;
  featureNames?: string[];
  model?: string;
  trainedAt?: string;
}

export interface LgbmArtifact extends LgbmTrainResponse {
  promoted?: boolean;
  promoteReason?: string;
  logisticAuc?: number | null;
  logisticBrier?: number | null;
}

const TRAIN_MS = 60_000;
const PREDICT_MS = 4_000;

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const base = env.TRADER_ML_URL?.replace(/\/$/, '');
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`[trader/lgbm] ${path} HTTP ${res.status} ${text.slice(0, 180)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.warn(`[trader/lgbm] ${path} unreachable: ${(err as Error).message}`);
    return null;
  }
}

export function trainLgbmRemote(input: {
  X: number[][];
  y: number[];
  asOfMs: number[];
  featureNames: string[];
}): Promise<LgbmTrainResponse | null> {
  return post<LgbmTrainResponse>('/train', input, TRAIN_MS);
}

export async function predictLgbmRemote(values: number[], artifact: LgbmArtifact): Promise<number | null> {
  if (!artifact.model) return null;
  const res = await post<{ probability?: number }>(
    '/predict',
    { values, model: artifact.model, featureNames: artifact.featureNames },
    PREDICT_MS,
  );
  const p = res?.probability;
  return typeof p === 'number' && Number.isFinite(p) ? Math.max(0.05, Math.min(0.95, p)) : null;
}
