// Lightweight L2 logistic regression + PAVA isotonic calibration.
// Pure TS — no native deps. Good enough for meta-labeling until a Python
// LightGBM worker is warranted by sample size.

export interface LogisticModel {
  weights: number[]; // includes bias as last element
  featureCount: number;
}

export interface IsotonicModel {
  /** Sorted x breakpoints (raw probabilities). */
  x: number[];
  /** Corresponding calibrated probabilities. */
  y: number[];
}

export interface MetaModelArtifact {
  version: 1;
  trainedAt: string;
  sampleSize: number;
  trainHits: number;
  trainMisses: number;
  /** Out-of-fold AUC proxy (0.5 = chance). */
  oofAuc: number | null;
  logistic: LogisticModel;
  isotonic: IsotonicModel | null;
  featureNames: string[];
  embargoBars: number;
  notes: string;
}

function sigmoid(z: number): number {
  if (z > 20) return 1;
  if (z < -20) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function predictLogistic(model: LogisticModel, x: number[]): number {
  let z = model.weights[model.featureCount] ?? 0; // bias
  for (let i = 0; i < model.featureCount; i++) {
    z += (model.weights[i] ?? 0) * (x[i] ?? 0);
  }
  return sigmoid(z);
}

/**
 * Train binary logistic regression with L2 regularization (gradient descent).
 * y ∈ {0, 1}. Returns model with bias as last weight.
 */
export function trainLogistic(
  X: number[][],
  y: number[],
  opts?: { l2?: number; lr?: number; epochs?: number },
): LogisticModel {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  if (n === 0 || d === 0) {
    return { weights: Array(d + 1).fill(0), featureCount: d };
  }
  const l2 = opts?.l2 ?? 0.05;
  const lr = opts?.lr ?? 0.08;
  const epochs = opts?.epochs ?? 400;
  const w = Array(d + 1).fill(0) as number[];

  for (let ep = 0; ep < epochs; ep++) {
    const grad = Array(d + 1).fill(0) as number[];
    for (let i = 0; i < n; i++) {
      const xi = X[i]!;
      let z = w[d]!;
      for (let j = 0; j < d; j++) z += w[j]! * (xi[j] ?? 0);
      const p = sigmoid(z);
      const err = p - y[i]!;
      for (let j = 0; j < d; j++) grad[j]! += err * (xi[j] ?? 0);
      grad[d]! += err;
    }
    for (let j = 0; j < d; j++) {
      grad[j]! = grad[j]! / n + l2 * w[j]!;
      w[j]! -= lr * grad[j]!;
    }
    grad[d]! /= n;
    w[d]! -= lr * grad[d]!;
  }
  return { weights: w, featureCount: d };
}

/** Pairwise AUC (Mann–Whitney). */
export function aucScore(scores: number[], labels: number[]): number | null {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (labels[i] === 1) pos.push(scores[i]!);
    else neg.push(scores[i]!);
  }
  if (pos.length === 0 || neg.length === 0) return null;
  let wins = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (pos.length * neg.length);
}

/**
 * PAVA isotonic regression for non-decreasing calibration.
 * Returns piecewise-constant mapping from raw score → calibrated prob.
 */
export function fitIsotonic(raw: number[], labels: number[]): IsotonicModel | null {
  if (raw.length < 8) return null;
  const pairs = raw
    .map((x, i) => ({ x, y: labels[i]! }))
    .sort((a, b) => a.x - b.x);

  // Pool adjacent violators
  type Block = { sumY: number; n: number; xMin: number; xMax: number };
  const blocks: Block[] = pairs.map((p) => ({
    sumY: p.y,
    n: 1,
    xMin: p.x,
    xMax: p.x,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const a = blocks[i]!;
    const b = blocks[i + 1]!;
    const meanA = a.sumY / a.n;
    const meanB = b.sumY / b.n;
    if (meanA > meanB + 1e-12) {
      blocks[i] = {
        sumY: a.sumY + b.sumY,
        n: a.n + b.n,
        xMin: a.xMin,
        xMax: b.xMax,
      };
      blocks.splice(i + 1, 1);
      if (i > 0) i -= 1;
    } else {
      i += 1;
    }
  }

  return {
    x: blocks.map((b) => (b.xMin + b.xMax) / 2),
    y: blocks.map((b) => b.sumY / b.n),
  };
}

/** Apply isotonic calibration via linear interpolation on the PAVA curve. */
export function applyIsotonic(model: IsotonicModel, raw: number): number {
  const { x, y } = model;
  if (x.length === 0) return raw;
  if (raw <= x[0]!) return y[0]!;
  if (raw >= x[x.length - 1]!) return y[y.length - 1]!;
  for (let i = 0; i < x.length - 1; i++) {
    if (raw >= x[i]! && raw <= x[i + 1]!) {
      const t = (raw - x[i]!) / (x[i + 1]! - x[i]! || 1e-9);
      return y[i]! + t * (y[i + 1]! - y[i]!);
    }
  }
  return raw;
}

/**
 * Purged walk-forward: for each fold, train on past, test on future with embargo.
 * Returns OOF predictions aligned to sample indices (NaN where not predicted).
 */
export function purgedWalkForwardPredict(
  X: number[][],
  y: number[],
  asOfMs: number[],
  opts?: { folds?: number; embargoMs?: number },
): { oof: number[]; models: LogisticModel[] } {
  const n = X.length;
  const folds = opts?.folds ?? 4;
  const embargoMs = opts?.embargoMs ?? 48 * 3600_000;
  const oof = Array(n).fill(Number.NaN) as number[];
  const models: LogisticModel[] = [];
  if (n < 20) return { oof, models };

  const order = [...Array(n).keys()].sort((a, b) => asOfMs[a]! - asOfMs[b]!);
  const foldSize = Math.floor(n / folds);
  if (foldSize < 5) return { oof, models };

  for (let f = 1; f < folds; f++) {
    const testStart = f * foldSize;
    const testEnd = f === folds - 1 ? n : (f + 1) * foldSize;
    const testIdx = order.slice(testStart, testEnd);
    const testMinAsOf = Math.min(...testIdx.map((i) => asOfMs[i]!));
    const trainIdx = order
      .slice(0, testStart)
      .filter((i) => asOfMs[i]! < testMinAsOf - embargoMs);
    if (trainIdx.length < 10 || testIdx.length < 3) continue;

    const Xtr = trainIdx.map((i) => X[i]!);
    const ytr = trainIdx.map((i) => y[i]!);
    const model = trainLogistic(Xtr, ytr);
    models.push(model);
    for (const i of testIdx) {
      oof[i] = predictLogistic(model, X[i]!);
    }
  }
  return { oof, models };
}

export function trainMetaModel(input: {
  X: number[][];
  y: number[];
  asOfMs: number[];
  featureNames: string[];
}): MetaModelArtifact {
  const { X, y, asOfMs, featureNames } = input;
  const { oof, models } = purgedWalkForwardPredict(X, y, asOfMs);
  const oofPairs = oof
    .map((p, i) => ({ p, y: y[i]! }))
    .filter((r) => Number.isFinite(r.p));
  const oofAuc = aucScore(
    oofPairs.map((r) => r.p),
    oofPairs.map((r) => r.y),
  );

  // Final model on all data (production); calibration from OOF only (no leakage).
  const logistic = models.length > 0 ? trainLogistic(X, y) : trainLogistic(X, y);
  const isotonic =
    oofPairs.length >= 8
      ? fitIsotonic(
          oofPairs.map((r) => r.p),
          oofPairs.map((r) => r.y),
        )
      : null;

  return {
    version: 1,
    trainedAt: new Date().toISOString(),
    sampleSize: y.length,
    trainHits: y.filter((v) => v === 1).length,
    trainMisses: y.filter((v) => v === 0).length,
    oofAuc,
    logistic,
    isotonic,
    featureNames,
    embargoBars: 48,
    notes:
      'Meta-label logistic + isotonic calibration. Direction stays engine-owned; ' +
      'this only estimates P(hit target before stop). Purged walk-forward OOF for calibration.',
  };
}

/** Raw logistic → calibrated hit probability in [0, 1]. */
export function predictHitProbability(model: MetaModelArtifact, x: number[]): number {
  const raw = predictLogistic(model.logistic, x);
  const cal = model.isotonic ? applyIsotonic(model.isotonic, raw) : raw;
  return Math.max(0.05, Math.min(0.95, cal));
}
