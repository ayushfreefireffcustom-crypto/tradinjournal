// Champion/challenger gate for the LightGBM meta-labeler.
// Pure. A trained model is not a served model.

export const LGBM_MIN_SAMPLES = 200;
export const LGBM_MIN_AUC_EDGE = 0.03;

export interface LgbmPromoteInput {
  sampleSize: number;
  lgbmAuc: number | null;
  logisticAuc: number | null;
  lgbmBrier: number | null;
  logisticBrier: number | null;
}

export interface LgbmPromoteDecision {
  promote: boolean;
  reason: string;
}

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Serve LightGBM only when it has a real sample and beats the logistic
 * champion on both ranking (AUC) and calibration (Brier).
 */
export function shouldPromoteLgbm(input: LgbmPromoteInput): LgbmPromoteDecision {
  if (input.sampleSize < LGBM_MIN_SAMPLES) {
    return {
      promote: false,
      reason: `Need ≥${LGBM_MIN_SAMPLES} graded samples (have ${input.sampleSize})`,
    };
  }
  if (!finite(input.lgbmAuc) || !finite(input.logisticAuc)) {
    return { promote: false, reason: 'Missing out-of-fold AUC for challenger or champion' };
  }
  if (input.lgbmAuc < input.logisticAuc + LGBM_MIN_AUC_EDGE) {
    return {
      promote: false,
      reason: `LightGBM AUC ${input.lgbmAuc.toFixed(3)} does not beat logistic ${input.logisticAuc.toFixed(3)} by ${LGBM_MIN_AUC_EDGE}`,
    };
  }
  if (!finite(input.lgbmBrier) || !finite(input.logisticBrier)) {
    return { promote: false, reason: 'Missing out-of-fold Brier score for challenger or champion' };
  }
  if (input.lgbmBrier >= input.logisticBrier) {
    return {
      promote: false,
      reason: `LightGBM Brier ${input.lgbmBrier.toFixed(3)} is not better than logistic ${input.logisticBrier.toFixed(3)}`,
    };
  }
  return {
    promote: true,
    reason: `LightGBM AUC ${input.lgbmAuc.toFixed(3)} and Brier ${input.lgbmBrier.toFixed(3)} beat logistic`,
  };
}
