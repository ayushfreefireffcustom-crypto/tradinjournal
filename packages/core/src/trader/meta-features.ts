// Meta-label feature vector for Trader Master.
// Pure — no I/O. Features are what the meta-model sees when predicting
// "will this engine call hit target before stop?"

import type { TechnicalFeatures, TraderDirection } from './types.js';
import type { LaneResult } from './lanes.js';

/** Ordered feature names — keep stable across train/predict. */
export const META_FEATURE_NAMES = [
  'bias_long',
  'heuristic_conf',
  'rsi_norm',
  'ema_spread',
  'atr_pct',
  'bars_norm',
  'lane_macro',
  'lane_flow',
  'lane_news',
  'lane_agree',
] as const;

export type MetaFeatureName = (typeof META_FEATURE_NAMES)[number];

export interface MetaFeatureSnapshot {
  version: 1;
  names: readonly string[];
  values: number[];
  /** Heuristic confidence before meta calibration (0–100). */
  heuristicConfidence: number;
}

function laneScore(lanes: LaneResult[], id: string): number {
  return lanes.find((l) => l.id === id)?.score ?? 0;
}

/**
 * Build a fixed-length feature vector from engine context.
 * All values roughly in [-1, 1] or [0, 1] for stable logistic training.
 */
export function buildMetaFeatures(input: {
  direction: TraderDirection;
  heuristicConfidence: number;
  features: TechnicalFeatures;
  lanes: LaneResult[];
  agreement: number;
}): MetaFeatureSnapshot {
  const f = input.features;
  const price = f.price || 1;
  const emaSpread = (f.ema20 - f.ema50) / (f.ema50 || 1);
  const values = [
    input.direction === 'LONG' ? 1 : input.direction === 'SHORT' ? -1 : 0,
    input.heuristicConfidence / 100,
    (f.rsi - 50) / 50,
    Math.max(-1, Math.min(1, emaSpread * 50)),
    Math.max(0, Math.min(1, f.atr / price)),
    Math.min(1, f.bars / 200),
    laneScore(input.lanes, 'macro'),
    laneScore(input.lanes, 'flow'),
    laneScore(input.lanes, 'news'),
    Math.max(0, Math.min(1, input.agreement)),
  ];
  return {
    version: 1,
    names: [...META_FEATURE_NAMES],
    values,
    heuristicConfidence: input.heuristicConfidence,
  };
}
