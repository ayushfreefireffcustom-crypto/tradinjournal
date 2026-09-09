// Multi-lane reconciliation for Trader Master.
// PURE — no I/O. Technical owns baseline direction; other lanes can force WAIT
// on disagreement or raise confidence on agreement. They never flip LONG↔SHORT alone.

import type { TraderDirection } from './types.js';

export type LaneId = 'technical' | 'macro' | 'flow' | 'news' | 'ml';

export interface LaneResult {
  id: LaneId;
  /** −1 bearish … +1 bullish */
  score: number;
  weight: number;
  rationale: string;
}

export interface ReconcileLanesResult {
  direction: TraderDirection;
  confidence: number;
  /** 0..1 — share of weight agreeing with the final direction (WAIT → 0). */
  agreement: number;
  lanes: LaneResult[];
}

/** Soft threshold on *non-technical* lane average to force WAIT. */
const DISAGREE_OTHER = 0.22;
/** Minimum non-technical weight required before disagreement can force WAIT. */
const DISAGREE_MIN_WEIGHT = 0.28;

export function directionToScore(direction: TraderDirection): number {
  if (direction === 'LONG') return 0.72;
  if (direction === 'SHORT') return -0.72;
  return 0;
}

export function technicalLane(
  direction: TraderDirection,
  rationale: string,
  weight = 0.55,
): LaneResult {
  return {
    id: 'technical',
    score: directionToScore(direction),
    weight,
    rationale,
  };
}

/** Macro bias 0–100 → lane score in [-1, 1]. */
export function macroBiasToLane(biasScore: number, label: string, weight = 0.25): LaneResult {
  const score = Math.max(-1, Math.min(1, (biasScore - 50) / 50));
  return {
    id: 'macro',
    score,
    weight,
    rationale: `Macro bias ${biasScore} (${label})`,
  };
}

/** Flow composite already in [-1, 1]. */
export function flowLane(score: number, rationale: string, weight = 0.2): LaneResult {
  return {
    id: 'flow',
    score: Math.max(-1, Math.min(1, score)),
    weight,
    rationale,
  };
}

/** News / sentiment composite already in [-1, 1]. */
export function newsLane(score: number, rationale: string, weight = 0.15): LaneResult {
  return {
    id: 'news',
    score: Math.max(-1, Math.min(1, score)),
    weight,
    rationale,
  };
}

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Reconcile independent lanes into a final direction + confidence.
 * Technical direction is the baseline; strong opposing weight → WAIT.
 */
export function reconcileLanes(
  technicalDirection: TraderDirection,
  technicalConfidence: number,
  extraLanes: LaneResult[] = [],
): ReconcileLanesResult {
  const tech = technicalLane(
    technicalDirection,
    technicalDirection === 'WAIT'
      ? 'No clear HTF trend'
      : `Technical ${technicalDirection.toLowerCase()} from HTF structure`,
  );
  const lanes = [tech, ...extraLanes.filter((l) => l.id !== 'technical' && l.weight > 0)];

  const totalW = lanes.reduce((s, l) => s + l.weight, 0) || 1;

  const others = lanes.filter((l) => l.id !== 'technical');
  const otherW = others.reduce((s, l) => s + l.weight, 0);
  const otherAvg = otherW > 0 ? others.reduce((s, l) => s + l.score * l.weight, 0) / otherW : 0;

  let direction: TraderDirection = technicalDirection;

  if (technicalDirection === 'WAIT') {
    direction = 'WAIT';
  } else if (
    otherW >= DISAGREE_MIN_WEIGHT &&
    technicalDirection === 'LONG' &&
    otherAvg <= -DISAGREE_OTHER
  ) {
    direction = 'WAIT';
  } else if (
    otherW >= DISAGREE_MIN_WEIGHT &&
    technicalDirection === 'SHORT' &&
    otherAvg >= DISAGREE_OTHER
  ) {
    direction = 'WAIT';
  }

  const dirScore = directionToScore(direction);
  let agreeW = 0;
  if (direction === 'WAIT') {
    agreeW = lanes.reduce((s, l) => s + (Math.abs(l.score) < 0.25 ? l.weight : 0), 0);
  } else {
    agreeW = lanes.reduce(
      (s, l) => s + (Math.sign(l.score) === Math.sign(dirScore) || Math.abs(l.score) < 0.08 ? l.weight : 0),
      0,
    );
  }
  const agreement = Math.max(0, Math.min(1, agreeW / totalW));

  let confidence = technicalConfidence * (0.55 + 0.45 * agreement);
  if (direction === 'WAIT' && technicalDirection !== 'WAIT') {
    confidence = Math.min(confidence, 42);
  }
  if (direction === 'WAIT') confidence = Math.min(confidence, 45);

  return {
    direction,
    confidence: clamp01to100(confidence),
    agreement,
    lanes,
  };
}

/** Map a trading symbol to a macro asset when one exists. */
export function mapSymbolToMacroAsset(symbol: string):
  | 'BTC'
  | 'ETH'
  | 'SOL'
  | 'XAU'
  | 'XAG'
  | 'SPX'
  | 'NDX'
  | 'OIL'
  | 'DXY'
  | null {
  const s = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('BTC') || s.includes('BTCUSD') || s === 'XBTUSD') return 'BTC';
  if (s.startsWith('ETH')) return 'ETH';
  if (s.startsWith('SOL')) return 'SOL';
  if (s.includes('XAU') || s.includes('GOLD')) return 'XAU';
  if (s.includes('XAG') || s.includes('SILVER')) return 'XAG';
  if (s.includes('SPX') || s === 'SPY' || s === '^GSPC') return 'SPX';
  if (s.includes('NDX') || s === 'QQQ' || s === 'NAS100' || s === 'USTEC') return 'NDX';
  if (s.includes('WTI') || s.includes('BRENT') || s.includes('USOIL') || s === 'CL') return 'OIL';
  if (s.includes('DXY') || s === 'DX') return 'DXY';
  return null;
}
