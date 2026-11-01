// Black-Scholes for European options (Part G). Delta India's options are
// European and settle in USD, so prices here are in USD per 1 unit of the
// underlying, like Delta quotes them. Rates are taken as 0 (crypto has no
// risk-free curve worth modelling at these horizons).
export type OptionKind = 'call' | 'put';

export const YEAR_MS = 365 * 86_400_000;

/** Standard normal density. */
export const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf, max error ~1e-7). */
export function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Value at expiry. */
export const intrinsic = (kind: OptionKind, spot: number, strike: number) => (kind === 'call' ? Math.max(0, spot - strike) : Math.max(0, strike - spot));

/** Price with T in years and vol as a fraction (0.45 = 45 %). At or past expiry it's the intrinsic value. */
export function bsPrice(kind: OptionKind, spot: number, strike: number, T: number, vol: number): number {
  if (T <= 0 || vol <= 0) return intrinsic(kind, spot, strike);
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + 0.5 * sd * sd) / sd;
  const d2 = d1 - sd;
  return kind === 'call' ? spot * normCdf(d1) - strike * normCdf(d2) : strike * normCdf(-d2) - spot * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1 vol point (0.01). */
  vega: number;
}

export function bsGreeks(kind: OptionKind, spot: number, strike: number, T: number, vol: number): Greeks {
  if (T <= 0 || vol <= 0) {
    const itm = kind === 'call' ? spot > strike : spot < strike;
    return { delta: itm ? (kind === 'call' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sq = Math.sqrt(T);
  const sd = vol * sq;
  const d1 = (Math.log(spot / strike) + 0.5 * sd * sd) / sd;
  const pdf = normPdf(d1);
  return {
    delta: kind === 'call' ? normCdf(d1) : normCdf(d1) - 1,
    gamma: pdf / (spot * sd),
    theta: -(spot * pdf * vol) / (2 * sq) / 365,
    vega: (spot * pdf * sq) / 100,
  };
}

/**
 * The vol that reproduces a price, or null when the price is outside what any
 * vol can give (below intrinsic, above the spot/strike bound). Newton steps,
 * falling back to bisection.
 */
export function impliedVol(kind: OptionKind, price: number, spot: number, strike: number, T: number): number | null {
  if (!(T > 0) || !(price > 0) || !(spot > 0) || !(strike > 0)) return null;
  const lower = intrinsic(kind, spot, strike);
  const upper = kind === 'call' ? spot : strike;
  if (price <= lower + 1e-9 || price >= upper) return null;
  let lo = 1e-4;
  let hi = 10;
  let v = 0.6;
  for (let k = 0; k < 100; k++) {
    const p = bsPrice(kind, spot, strike, T, v);
    const diff = p - price;
    if (Math.abs(diff) < 1e-7 * Math.max(1, price)) return v;
    if (diff > 0) hi = v; else lo = v;
    const vega = bsGreeks(kind, spot, strike, T, v).vega * 100;
    const next = vega > 1e-10 ? v - diff / vega : NaN;
    v = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return v;
}
