// Money per 1.0 price move per 1 lot ("value per point"), in the account
// currency. Ported from the Charts page (apps/web/src/components/charts/
// trade-math.ts: learnedPointValue, symbolSpec, specPointValueUsd):
//
//   1. the trade's own fills (gross P&L ÷ price move ÷ volume) — what the
//      broker actually paid on it;
//   2. learned from the account's closed trades on the symbol: the median of
//      at least two that agree within 25 %;
//   3. the standard contract spec, only where it doesn't depend on the broker
//      (FX, metals, crypto) and only for USD accounts, with a USD quote or USD
//      as the FX base.
import type { Trade } from '@tradinjournal/types';

export type PointValueSource = 'trade' | 'symbol' | 'spec';
export interface PointValue { value: number; source: PointValueSource }

const FIAT = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'ZAR', 'MXN', 'TRY', 'CNH', 'PLN', 'HUF', 'CZK'];
const METALS: Record<string, number> = { XAU: 100, XAG: 5000, XPT: 100, XPD: 100 };
const ALIAS: Record<string, string> = { GOLD: 'XAUUSD', SILVER: 'XAGUSD', BITCOIN: 'BTCUSD', ETHEREUM: 'ETHUSD' };

/** XAUUSD.m / XAUUSDm / GOLD → XAUUSD; BTCUSDT → BTCUSD. */
export function marketKey(raw: string): string {
  let s = (raw || '').trim();
  const suffix = /^([A-Z0-9]{3,})([a-z]+)$/.exec(s);
  if (suffix) s = suffix[1]!;
  s = s.split(':')[0]!.toUpperCase().split('.')[0]!.replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{2,12}(USDT|USDC|BUSD|PERP)$/.test(s)) s = s.replace(/(USDT|USDC|BUSD|PERP)$/, 'USD');
  return ALIAS[s] ?? s;
}

/** Contract size and quote currency where they're the same at every broker; null otherwise. */
export function standardSpec(symbol: string): { kind: 'fx' | 'metal' | 'crypto'; base: string; quote: string; contractSize: number } | null {
  const k = marketKey(symbol);
  const base = k.slice(0, 3), quote = k.slice(3, 6);
  if (k.length === 6 && METALS[base] && FIAT.includes(quote)) return { kind: 'metal', base, quote, contractSize: METALS[base]! };
  if (k.length === 6 && FIAT.includes(base) && FIAT.includes(quote)) return { kind: 'fx', base, quote, contractSize: 100_000 };
  const crypto = /^([A-Z0-9]{2,10})USD$/.exec(k);
  if (crypto && !FIAT.includes(crypto[1]!) && !METALS[crypto[1]!]) return { kind: 'crypto', base: crypto[1]!, quote: 'USD', contractSize: 1 };
  return null;
}

/** Spec value per point in USD (null when it needs a conversion rate we don't have). */
export function specPointValueUsd(symbol: string, price: number): number | null {
  const s = standardSpec(symbol);
  if (!s) return null;
  if (s.quote === 'USD') return s.contractSize;
  if (s.kind === 'fx' && s.base === 'USD') return price > 0 ? s.contractSize / price : null;
  return null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** One closed trade's own value per point (gross ÷ move ÷ volume). */
export function tradePointValue(t: Pick<Trade, 'status' | 'exitPrice' | 'entryPrice' | 'volume' | 'direction' | 'grossPnl'>): number | null {
  if (t.status !== 'CLOSED' || t.exitPrice == null || !(t.volume > 0)) return null;
  const move = (t.exitPrice - t.entryPrice) * (t.direction === 'LONG' ? 1 : -1);
  if (Math.abs(move) < Math.abs(t.entryPrice) * 1e-5 || Math.abs(t.grossPnl) < 0.01) return null;
  const v = t.grossPnl / (move * t.volume);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Median of ≥ 2 values that agree within 25 % of it. */
export function learnedValue(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = median(vals);
  const agree = vals.filter(v => Math.abs(v - m) <= m * 0.25);
  return agree.length >= 2 ? median(agree) : null;
}

/**
 * Value per point for every position, learned once per symbol from the
 * account's closed trades. `accountCcy` gates the spec fallback (USD only).
 */
export function pointValues(positions: Trade[], accountCcy: string): Map<string, PointValue> {
  const bySym = new Map<string, number[]>();
  const own = new Map<string, number>();
  for (const t of positions) {
    const v = tradePointValue(t);
    if (v == null) continue;
    own.set(t.positionId, v);
    (bySym.get(t.symbol) ?? bySym.set(t.symbol, []).get(t.symbol)!).push(v);
  }
  const learned = new Map<string, number | null>();
  const out = new Map<string, PointValue>();
  for (const t of positions) {
    const o = own.get(t.positionId);
    if (o != null) { out.set(t.positionId, { value: o, source: 'trade' }); continue; }
    if (!learned.has(t.symbol)) learned.set(t.symbol, learnedValue(bySym.get(t.symbol) ?? []));
    const l = learned.get(t.symbol);
    if (l != null) { out.set(t.positionId, { value: l, source: 'symbol' }); continue; }
    if ((accountCcy || 'USD').toUpperCase() === 'USD') {
      const s = specPointValueUsd(t.symbol, t.entryPrice);
      if (s != null) out.set(t.positionId, { value: s, source: 'spec' });
    }
  }
  return out;
}
