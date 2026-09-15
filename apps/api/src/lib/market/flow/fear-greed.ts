// Fear & Greed floor signal for the News/sentiment lane (crypto).
// Free Alternative.me API — no auth. Soft-fails to null.
import { cacheGet, cacheSet } from '../../cache.js';
import { fetchJson } from '../http.js';
import { logger } from '@tradinjournal/logger';

const TTL = 15 * 60; // 15 min

interface FearGreedResponse {
  data?: { value: string; value_classification: string }[];
}

export interface FearGreedSnapshot {
  value: number; // 0..100
  label: string;
  /** −1 extreme fear … +1 extreme greed, centered at 50. */
  score: number;
}

export async function fetchFearGreed(): Promise<FearGreedSnapshot | null> {
  const key = 'trader:fng';
  const cached = await cacheGet<FearGreedSnapshot>(key);
  if (cached) return cached;
  try {
    const json = await fetchJson<FearGreedResponse>(
      'https://api.alternative.me/fng/?limit=1',
    );
    const row = json.data?.[0];
    if (!row) return null;
    const value = Number(row.value);
    if (!Number.isFinite(value)) return null;
    const snap: FearGreedSnapshot = {
      value,
      label: row.value_classification,
      score: Math.max(-1, Math.min(1, (value - 50) / 50)),
    };
    await cacheSet(key, snap, TTL);
    return snap;
  } catch (err) {
    logger.warn(`[trader/fng] ${(err as Error).message}`);
    return null;
  }
}
