/** Proxy ATR as a fraction of price when no OHLC series exists. */
export function proxyAtr(price: number, frac = 0.015): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  return price * frac;
}
