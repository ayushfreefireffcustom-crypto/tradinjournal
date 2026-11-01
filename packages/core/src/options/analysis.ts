// The builder's analysis panel (G8): how a set of legs sits against the
// market. Each figure says what it's computed from; none is a prediction.
import { gexOf, ivAtStrike, type Chain, type OptionQuote } from './chain.js';
import type { Leg, LegsSummary } from './legs.js';

export interface LegAnalysis {
  symbol: string;
  /** (ask − bid) / mid, %. */
  spreadPct: number | null;
  /** Contracts available at the touch on the side this leg trades against. */
  topSize: number | null;
  fill: 'easy' | 'ok' | 'hard' | 'no_quote';
  /** Leg IV minus the smile through its neighbours, in vol points. */
  ivEdge: number | null;
  richCheap: 'rich' | 'cheap' | 'fair' | null;
  /** OI × |delta|: how much positioning sits on this contract, in contracts. */
  deltaWeightedOi: number | null;
  /** Dealer gamma at this strike (all expiries), USD per 1 % move. */
  gexAtStrike: number | null;
}
export interface Analysis {
  /** What you can lose on the premium: paid premium for debits, the max loss for credits. */
  premiumAtRisk: number | null;
  /** Net theta per day as a % of the premium involved: + earns from decay, − pays for it. */
  decayPerDayPct: number | null;
  /** Nearest breakeven's distance from the price, %. */
  toBreakevenPct: number | null;
  legs: LegAnalysis[];
}

const quoteOf = (c: Chain, l: Leg): OptionQuote | undefined => (l.kind === 'future' ? undefined : c.quotes.find((q) => q.kind === l.kind && q.strike === l.strike && q.expiry === l.expiry));

/** The smile at a strike from the other strikes, so a contract isn't compared with itself. */
function smileWithout(c: Chain, q: OptionQuote): number | null {
  return ivAtStrike({ ...c, quotes: c.quotes.filter((x) => !(x.expiry === q.expiry && x.strike === q.strike)) }, q.expiry, q.strike);
}

export function analyse(legs: Leg[], c: Chain, s: LegsSummary): Analysis {
  const debit = s.netPremium;
  const premiumAtRisk = debit > 0 ? debit : s.maxLoss != null ? -s.maxLoss : null;
  const gross = legs.filter((l) => l.kind !== 'future').reduce((a, l) => a + Math.abs(l.side * l.qty * c.contractValue * l.price), 0);
  const be = s.breakevens.length ? s.breakevens.reduce((a, b) => (Math.abs(b - c.spot) < Math.abs(a - c.spot) ? b : a)) : null;
  const gexByStrike = new Map<number, number>();
  for (const q of c.quotes) gexByStrike.set(q.strike, (gexByStrike.get(q.strike) ?? 0) + gexOf(q, c.spot, c.contractValue));
  return {
    premiumAtRisk,
    decayPerDayPct: gross > 0 ? (s.greeks.theta / gross) * 100 : null,
    toBreakevenPct: be != null ? ((be - c.spot) / c.spot) * 100 : null,
    legs: legs.filter((l) => l.kind !== 'future').map((l) => {
      const q = quoteOf(c, l);
      if (!q) return { symbol: l.symbol ?? '', spreadPct: null, topSize: null, fill: 'no_quote', ivEdge: null, richCheap: null, deltaWeightedOi: null, gexAtStrike: null };
      const mid = q.bid != null && q.ask != null ? (q.bid + q.ask) / 2 : null;
      const spreadPct = mid && mid > 0 ? ((q.ask! - q.bid!) / mid) * 100 : null;
      const topSize = l.side === 1 ? q.askSize : q.bidSize;
      const fill: LegAnalysis['fill'] = spreadPct == null || topSize == null ? 'no_quote' : spreadPct <= 5 && topSize >= l.qty ? 'easy' : spreadPct <= 15 && topSize >= l.qty / 2 ? 'ok' : 'hard';
      const fit = q.markIv != null ? smileWithout(c, q) : null;
      const ivEdge = q.markIv != null && fit != null ? (q.markIv - fit) * 100 : null;
      return {
        symbol: q.symbol, spreadPct, topSize, fill, ivEdge,
        richCheap: ivEdge == null ? null : ivEdge > 1.5 ? 'rich' : ivEdge < -1.5 ? 'cheap' : 'fair',
        deltaWeightedOi: q.delta != null ? q.oi * Math.abs(q.delta) : null,
        gexAtStrike: gexByStrike.get(q.strike) ?? null,
      };
    }),
  };
}
