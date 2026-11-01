// Entry planning shared by the backtester and live deployments: size, stop,
// target and trail distance for a new position. One function, so live trades
// are sized exactly as they were backtested.
import { VENUE_INFO, type Sizing, type StrategySpec } from './spec.js';

export interface EntryPlan { qty: number; stop: number | null; target: number | null; risk: number | null; trailDist: number | null; leverage: number }
export interface PlanInput {
  spec: StrategySpec;
  symbol: string;
  side: 1 | -1;
  price: number;
  atr: number | null;
  equity: number;
  /** Margin already tied up in other open positions. */
  marginUsed: number;
  multiplier?: number;
  /** Closed trades so far (Kelly sizing). */
  history?: Array<{ pnl: number; pnlPct: number }>;
}

export function planEntry(x: PlanInput): EntryPlan | { skip: string } {
  const { spec, side, price, atr, equity } = x;
  const cfg = spec.market.symbols.find((s) => s.symbol === x.symbol);
  const lev = Math.max(1, Math.min(VENUE_INFO[spec.market.venue].maxLeverage, cfg?.leverage ?? spec.market.leverage));
  const sl = spec.risk.stopLoss;
  let dist: number | null = null;
  let stop: number | null = null;
  if (sl) {
    if (sl.mode === 'price') {
      stop = sl.value;
      dist = Math.abs(price - sl.value);
      if ((side === 1 && stop >= price) || (side === -1 && stop <= price)) return { skip: 'The fixed stop price is on the wrong side of the market.' };
    } else {
      dist = sl.mode === 'pct' ? (price * sl.value) / 100 : sl.mode === 'points' ? sl.value : atr != null ? atr * sl.value : null;
      if (dist == null) return { skip: 'Not enough history yet for the ATR stop.' };
      stop = price - side * dist;
    }
  }
  const sz: Sizing = (cfg as { sizing?: Sizing } | undefined)?.sizing ?? spec.sizing;
  let qty = 0;
  switch (sz.mode) {
    case 'risk_pct': if (!dist) return { skip: 'Sizing by risk needs a stop.' }; qty = (equity * sz.value) / 100 / dist; break;
    case 'equity_pct': qty = (((equity * sz.value) / 100) * lev) / price; break;
    case 'qty': qty = sz.value; break;
    case 'notional': qty = sz.value / price; break;
    case 'atr': if (!atr) return { skip: 'Not enough history yet for ATR sizing.' }; qty = (equity * sz.value) / 100 / atr; break;
    case 'kelly': {
      const h = x.history ?? [];
      let f = sz.value / 100;
      if (h.length >= 20) {
        const wins = h.filter((t) => t.pnl > 0);
        const losses = h.filter((t) => t.pnl <= 0);
        const W = wins.length / h.length;
        const avgW = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
        const avgL = losses.length ? Math.abs(losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length) : 0;
        const R = avgL ? avgW / avgL : 0;
        f = R ? Math.max(0, Math.min(0.25, (W - (1 - W) / R) * (sz.kellyFraction ?? 0.5))) : 0;
      }
      qty = (equity * f * lev) / price;
      break;
    }
  }
  qty *= x.multiplier ?? 1;
  // Never more than the free margin allows.
  const maxQty = (Math.max(0, equity - x.marginUsed) * lev) / price;
  if (qty > maxQty) qty = maxQty;
  if (!(qty > 0) || !Number.isFinite(qty)) return { skip: 'Not enough free margin.' };
  const tp = spec.risk.takeProfit;
  let target: number | null = null;
  if (tp) {
    if (tp.mode === 'pct') target = price * (1 + (side * tp.value) / 100);
    else if (tp.mode === 'points') target = price + side * tp.value;
    else if (tp.mode === 'price') target = tp.value;
    else if (tp.mode === 'rr' && dist) target = price + side * dist * tp.value;
  }
  const tr = spec.risk.trailing;
  const trailDist = tr ? (tr.mode === 'pct' ? (price * tr.value) / 100 : atr != null ? atr * tr.value : null) : null;
  return { qty, stop, target, risk: dist, trailDist, leverage: lev };
}
