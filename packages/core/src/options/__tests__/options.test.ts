import { describe, expect, it } from 'vitest';
import {
  analyse, atmIv, bsGreeks, bsPrice, byStrike, expiryStats, gammaCentre, gammaFlip, impliedVol, ivAtDelta, maxPain, normCdf, overview,
  parseOptionSymbol, payoff, resolveTemplate, summarize, TEMPLATES, YEAR_MS, type Chain, type Leg, type OptionQuote,
} from '../index.js';

describe('black-scholes', () => {
  it('prices, keeps put-call parity and matches textbook values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(bsPrice('call', 100, 100, 1, 0.2)).toBeCloseTo(7.9656, 3);
    expect(bsPrice('put', 100, 100, 1, 0.2)).toBeCloseTo(7.9656, 3);
    const c = bsPrice('call', 105, 95, 0.3, 0.5);
    const p = bsPrice('put', 105, 95, 0.3, 0.5);
    expect(c - p).toBeCloseTo(105 - 95, 6);
    expect(bsPrice('call', 105, 95, 0, 0.5)).toBe(10); // expired: intrinsic
  });
  it('gives Greeks in per-day and per-vol-point units', () => {
    const g = bsGreeks('call', 100, 100, 1, 0.2);
    expect(g.delta).toBeCloseTo(0.5398, 3);
    expect(g.vega).toBeCloseTo(0.397, 3);
    // Theta per day ≈ price change over one day.
    const dayAhead = bsPrice('call', 100, 100, 1 - 1 / 365, 0.2) - bsPrice('call', 100, 100, 1, 0.2);
    expect(g.theta).toBeCloseTo(dayAhead, 3);
    expect(bsGreeks('put', 100, 100, 1, 0.2).delta).toBeCloseTo(0.5398 - 1, 3);
  });
  it('inverts prices to IV and refuses impossible prices', () => {
    for (const v of [0.1, 0.45, 1.2]) expect(impliedVol('put', bsPrice('put', 78_000, 70_000, 0.07, v), 78_000, 70_000, 0.07)!).toBeCloseTo(v, 5);
    expect(impliedVol('call', 5, 110, 100, 0.1)).toBeNull(); // below intrinsic
    expect(impliedVol('call', 120, 110, 100, 0.1)).toBeNull(); // above the spot
  });
  it('lands on Delta’s own mark for a real contract', () => {
    // C-BTC-99000-271126 on 1 Nov 2026: spot 77,946, mark IV 43.17 %, mark 67.50.
    const T = (Date.UTC(2026, 10, 27, 12) - 1_793_558_560_452) / YEAR_MS;
    expect(bsPrice('call', 77_946, 99_000, T, 0.43169886)).toBeCloseTo(67.5, -0.5);
  });
  it('parses Delta symbols', () => {
    expect(parseOptionSymbol('C-BTC-99000-271126')).toEqual({ kind: 'call', underlying: 'BTC', strike: 99_000, expiryCode: '271126', expiry: Date.UTC(2026, 10, 27, 12) });
    expect(parseOptionSymbol('P-XAUT-3940-031126', 16)!.expiry).toBe(Date.UTC(2026, 10, 3, 16));
    expect(parseOptionSymbol('BTCUSD')).toBeNull();
  });
});

// A synthetic chain: spot 100, two expiries, a put skew, puts carrying more OI below.
const NOW = Date.UTC(2026, 10, 1, 12);
const E1 = NOW + 7 * 86_400_000;
const E2 = NOW + 30 * 86_400_000;
function chain(over: (q: OptionQuote) => void = () => {}): Chain {
  const quotes: OptionQuote[] = [];
  for (const [expiry, base] of [[E1, 0.5], [E2, 0.55]] as const) {
    for (let k = 80; k <= 120; k += 5) {
      for (const kind of ['call', 'put'] as const) {
        const iv = base + (100 - k) * 0.004; // higher IV for lower strikes
        const T = (expiry - NOW) / YEAR_MS;
        const mark = bsPrice(kind, 100, k, T, iv);
        const g = bsGreeks(kind, 100, k, T, iv);
        const q: OptionQuote = {
          symbol: `${kind === 'call' ? 'C' : 'P'}-TST-${k}-${expiry === E1 ? '081126' : '011226'}`, kind, strike: k, expiry, expiryCode: expiry === E1 ? '081126' : '011226',
          mark, last: mark, bid: mark * 0.97, ask: mark * 1.03, bidSize: 50, askSize: 50, markIv: iv, bidIv: iv - 0.01, askIv: iv + 0.01,
          delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega, rho: null,
          oi: kind === 'put' ? (k < 100 ? 300 : 50) : k > 100 ? 200 : 50, oiUsd: null, volume: 10, turnoverUsd: null, change24h: null, oiChangeUsd6h: null,
        };
        over(q);
        quotes.push(q);
      }
    }
  }
  return { underlying: 'TST', spot: 100, contractValue: 1, asOf: NOW, quotes };
}

describe('chain analytics', () => {
  it('reads ATM IV, the priced move, skew and the term structure', () => {
    const c = chain();
    expect(atmIv(c, E1)).toBeCloseTo(0.5, 6);
    const s = expiryStats(c, E1);
    expect(s.atmStrike).toBe(100);
    expect(s.straddle).toBeCloseTo(bsPrice('call', 100, 100, 7 / 365, 0.5) * 2, 6);
    expect(s.sigmaMove).toBeCloseTo(100 * 0.5 * Math.sqrt(7 / 365), 6);
    expect(s.rr25).toBeLessThan(0); // puts richer than calls
    const narrow = { ...c, quotes: c.quotes.filter((q) => q.strike >= 95 && q.strike <= 105) };
    expect(ivAtDelta(narrow, E1, 'call', 0.05)).toBeNull(); // outside the quoted deltas, not extrapolated
    const o = overview(c);
    expect(o.term.map((t) => Math.round(t.days))).toEqual([7, 30]);
    expect(o.termSlope).toBeCloseTo(5, 6); // 55 % − 50 %
    expect(o.putCallOi).toBeCloseTo((4 * 300 + 5 * 50) / (4 * 200 + 5 * 50), 6);
  });
  it('finds max pain, gamma by strike and the gamma flip', () => {
    const c = chain();
    expect(maxPain(c, E1)).toBe(100);
    const rows = byStrike(c, E1);
    expect(rows.find((r) => r.strike === 90)!.gex).toBeLessThan(0); // put-heavy
    expect(rows.find((r) => r.strike === 110)!.gex).toBeGreaterThan(0); // call-heavy
    expect(gammaCentre(c)!).toBeGreaterThan(90);
    expect(gammaCentre(c)!).toBeLessThan(110);
    const flip = gammaFlip(c)!;
    expect(flip).toBeGreaterThan(85);
    expect(flip).toBeLessThan(115);
  });
});

describe('legs and payoff', () => {
  const T = 30;
  const call = (k: number, side: 1 | -1, price: number): Leg => ({ kind: 'call', side, qty: 1, strike: k, expiry: NOW + T * 86_400_000, price, iv: 0.5 });
  const put = (k: number, side: 1 | -1, price: number): Leg => ({ kind: 'put', side, qty: 1, strike: k, expiry: NOW + T * 86_400_000, price, iv: 0.5 });
  it('long call: premium at risk, unlimited upside, breakeven at strike + premium', () => {
    const s = summarize([call(100, 1, 5)], 1, 100, NOW, 0.5);
    expect(s.netPremium).toBe(5);
    expect(s.maxLoss).toBeCloseTo(-5, 9);
    expect(s.maxProfit).toBeNull();
    expect(s.breakevens).toHaveLength(1);
    expect(s.breakevens[0]).toBeCloseTo(105, 4);
    expect(s.probProfit!).toBeGreaterThan(0.2);
    expect(s.probProfit!).toBeLessThan(0.5);
    expect(s.greeks.delta).toBeCloseTo(bsGreeks('call', 100, 100, T / 365, 0.5).delta, 9);
  });
  it('spreads and condors have capped profit and loss', () => {
    const bull = summarize([call(100, 1, 6), call(110, -1, 2)], 1, 100, NOW, 0.5);
    expect(bull.maxProfit).toBeCloseTo(10 - 4, 9);
    expect(bull.maxLoss).toBeCloseTo(-4, 9);
    expect(bull.riskReward).toBeCloseTo(1.5, 9);
    const condor = summarize([put(85, 1, 0.5), put(90, -1, 1.5), call(110, -1, 1.5), call(115, 1, 0.5)], 1, 100, NOW, 0.5);
    expect(condor.netPremium).toBeCloseTo(-2, 9); // a credit
    expect(condor.maxProfit).toBeCloseTo(2, 9);
    expect(condor.maxLoss).toBeCloseTo(-3, 9);
    expect(condor.breakevens.map((b) => Math.round(b * 100) / 100)).toEqual([88, 112]);
    const naked = summarize([call(110, -1, 2)], 1, 100, NOW, 0.5);
    expect(naked.maxLoss).toBeNull();
  });
  it('values legs before expiry and scales by contract size', () => {
    const p = payoff([call(100, 1, 5)], 0.001, { from: 80, to: 120, steps: 4, at: NOW });
    expect(p.map((x) => x.s)).toEqual([80, 90, 100, 110, 120]);
    expect(p[4]!.expiry).toBeCloseTo((20 - 5) * 0.001, 9);
    expect(p[2]!.now).toBeCloseTo((bsPrice('call', 100, 100, T / 365, 0.5) - 5) * 0.001, 9);
    // Covered call: the future's P&L counts, its price isn't premium.
    const cc = summarize([{ kind: 'future', side: 1, qty: 1, price: 100 }, call(110, -1, 2)], 1, 100, NOW, 0.5);
    expect(cc.netPremium).toBe(-2);
    expect(cc.maxProfit).toBeCloseTo(12, 9);
  });
  it('resolves templates to listed strikes around the money', () => {
    const ks = [80, 85, 90, 95, 100, 105, 110, 115, 120];
    const ic = resolveTemplate(TEMPLATES.find((t) => t.id === 'iron_condor')!, { strikes: ks, spot: 101, expiry: E1, qty: 2 })!;
    expect(ic.map((l) => `${l.side > 0 ? '+' : '-'}${l.kind}${l.strike}x${l.qty}`)).toEqual(['+put80x2', '-put90x2', '-call110x2', '+call120x2']);
    const fly = resolveTemplate(TEMPLATES.find((t) => t.id === 'call_butterfly')!, { strikes: ks, spot: 100, expiry: E1, qty: 1 })!;
    expect(fly[1]).toMatchObject({ strike: 100, qty: 2, side: -1 });
    expect(resolveTemplate(TEMPLATES.find((t) => t.id === 'calendar_call')!, { strikes: ks, spot: 100, expiry: E1, qty: 1 })).toBeNull(); // needs a far expiry
    for (const t of TEMPLATES) expect(t.categories.length).toBeGreaterThan(0);
  });
});

describe('analysis panel', () => {
  it('flags a contract priced off the smile, thin books and decay', () => {
    const c = chain((q) => { if (q.strike === 110 && q.kind === 'call' && q.expiry === E1) { q.markIv = q.markIv! + 0.05; q.askSize = 1; } });
    const q = c.quotes.find((x) => x.strike === 110 && x.kind === 'call' && x.expiry === E1)!;
    const legs: Leg[] = [{ kind: 'call', side: 1, qty: 3, strike: 110, expiry: E1, price: q.mark!, iv: q.markIv!, symbol: q.symbol }];
    const s = summarize(legs, 1, 100, NOW, 0.5);
    const a = analyse(legs, c, s);
    expect(a.premiumAtRisk).toBeCloseTo(3 * q.mark!, 9);
    expect(a.legs[0]!.richCheap).toBe('rich');
    expect(a.legs[0]!.ivEdge!).toBeGreaterThan(4);
    expect(a.legs[0]!.fill).toBe('hard'); // 1 contract at the ask for a 3-lot
    expect(a.decayPerDayPct!).toBeLessThan(0); // a long option pays for time
    expect(a.toBreakevenPct!).toBeGreaterThan(10);
    expect(a.legs[0]!.deltaWeightedOi).toBeCloseTo(q.oi * Math.abs(q.delta!), 9);
  });
});
