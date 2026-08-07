// Per-asset signed sensitivity to each factor.
// Positive = asset tends to rise when the factor's natural direction is +1.
// Examples: Gold likes weaker USD (dollar −1), weaker real yields/hawkish policy (−),
// and mild risk-off (+). Equities like growth/liquidity and hate credit stress/VIX.
import type { FactorKey, MacroAsset } from './types.js';

export type SensitivityMatrix = Record<MacroAsset, Record<FactorKey, number>>;

export const SENSITIVITIES: SensitivityMatrix = {
  // Risk-on crypto: loves liquidity + growth, hates hawkish policy / strong USD / credit stress / VIX.
  BTC: {
    inflation: -0.3,
    policy: -0.8,
    growth: 0.7,
    rates: -0.5,
    liquidity: 1.0,
    credit: -0.8,
    risk: -1.0,
    dollar: -0.6,
  },
  // Gold: anti-USD, anti-real-yields/hawkish, mild safe-haven into risk.
  XAU: {
    inflation: 0.6,
    policy: -0.9,
    growth: -0.2,
    rates: -0.8,
    liquidity: 0.7,
    credit: 0.3,
    risk: 0.5,
    dollar: -1.0,
  },
  // Equities: pro-growth/liquidity, anti credit-stress / VIX / hawkish surprise.
  SPX: {
    inflation: -0.5,
    policy: -0.7,
    growth: 1.0,
    rates: -0.4,
    liquidity: 0.8,
    credit: -1.0,
    risk: -1.0,
    dollar: -0.2,
  },
  // Dollar: stronger when hawkish / risk-off / growth relative; weaker with liquidity flood.
  DXY: {
    inflation: 0.3,
    policy: 0.9,
    growth: 0.4,
    rates: 0.7,
    liquidity: -0.6,
    credit: 0.5,
    risk: 0.6,
    dollar: 1.0, // identity — dollar factor tracks itself
  },
};
