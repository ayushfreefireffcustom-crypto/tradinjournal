// Market-wide maths (E10–E14): sectors, per-symbol stats, correlation,
// altcoin season and breadth. Pure: callers pass candles or returns.
import type { Candle } from '../trader/types.js';

// ── Sectors ───────────────────────────────────────────────────────────────────
// A hand-kept map of well-known coins to one sector each. Anything not listed
// is "Other": better an honest bucket than a guess.

export const SECTORS = ['Store of value', 'Smart-contract L1', 'Layer 2', 'DeFi', 'Exchange', 'Meme', 'AI', 'Payments', 'Gaming & metaverse', 'Infrastructure', 'Real-world assets', 'Other'] as const;
export type Sector = (typeof SECTORS)[number];

const SECTOR_OF: Record<string, Sector> = {};
const put = (s: Sector, coins: string) => { for (const c of coins.split(/\s+/).filter(Boolean)) SECTOR_OF[c] = s; };
put('Store of value', 'BTC BCH LTC PAXG XAUT ZEC DASH XMR');
put('Smart-contract L1', 'ETH SOL ADA AVAX DOT NEAR APT SUI TRX TON ATOM ALGO HBAR ICP EGLD SEI INJ KAS XTZ EOS NEO FTM S ETC TIA HYPE BERA MOVE VET IOTA THETA FLOW KAIA');
put('Layer 2', 'ARB OP POL MATIC IMX STRK MNT ZK METIS LRC SKL BLAST SCR MANTA CELO');
put('DeFi', 'UNI AAVE MKR SKY LDO CRV COMP SNX SUSHI 1INCH DYDX GMX JUP RAY CAKE PENDLE ENA ETHFI JTO MORPHO EIGEN COW BAL YFI RUNE OSMO AERO ZRO');
put('Exchange', 'BNB OKB CRO LEO KCS GT BGB HT FTT WOO');
put('Meme', 'DOGE SHIB PEPE WIF BONK FLOKI TRUMP BOME MEME NEIRO PNUT MOG BRETT TURBO POPCAT PENGU DOGS 1000SATS FARTCOIN SPX GOAT ACT');
put('AI', 'FET TAO RENDER RNDR AGIX OCEAN WLD AI16Z VIRTUAL ARKM GRT AIXBT IO NMR');
put('Payments', 'XRP XLM CELR XNO ACH');
put('Gaming & metaverse', 'AXS SAND MANA GALA ENJ APE ILV YGG PIXEL BEAMX RON MAGIC ALICE');
put('Infrastructure', 'LINK FIL AR STX QNT PYTH API3 BAND W ENS AKT JASMY HNT STORJ');
put('Real-world assets', 'ONDO OM POLYX CFG TRU RSR PLUME');

export function sectorOf(base: string): Sector {
  return SECTOR_OF[base.toUpperCase()] ?? 'Other';
}

// ── Returns and stats ─────────────────────────────────────────────────────────

const DAY = 86_400_000;

/** Daily simple returns, oldest first. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1]! > 0) out.push(closes[i]! / closes[i - 1]! - 1);
  return out;
}

/** % change from the close `days` daily bars ago to the last close; null without enough history. */
export function returnOver(daily: Candle[], days: number): number | null {
  if (daily.length <= days) return null;
  const from = daily[daily.length - 1 - days]!.close;
  return from > 0 ? (daily[daily.length - 1]!.close / from - 1) * 100 : null;
}

/** % change since the last close of the previous calendar year (UTC). */
export function returnYtd(daily: Candle[]): number | null {
  const last = daily[daily.length - 1];
  if (!last) return null;
  const year = new Date(last.openTime).getUTCFullYear();
  const base = [...daily].reverse().find((c) => new Date(c.openTime).getUTCFullYear() < year);
  return base && base.close > 0 ? (last.close / base.close - 1) * 100 : null;
}

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
function stdev(x: number[]): number {
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

/** Pearson correlation; null for fewer than 10 pairs or a flat series. */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; syy += (y[i]! - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Returns lined up by day, so a missing day in either series doesn't shift the other. */
export function alignedReturns(a: Candle[], b: Candle[]): [number[], number[]] {
  const day = (t: number) => Math.floor(t / DAY);
  const mb = new Map(b.map((c) => [day(c.openTime), c.close]));
  const ra: number[] = [];
  const rb: number[] = [];
  let prev: { a: number; b: number } | null = null;
  for (const c of a) {
    const bc = mb.get(day(c.openTime));
    if (bc == null) { prev = null; continue; }
    if (prev && prev.a > 0 && prev.b > 0) { ra.push(c.close / prev.a - 1); rb.push(bc / prev.b - 1); }
    prev = { a: c.close, b: bc };
  }
  return [ra, rb];
}

export interface SymbolStats {
  returns: { d7: number | null; d30: number | null; d90: number | null; ytd: number | null };
  /** Annualised from the last 30 daily returns, %. Crypto trades every day: √365. */
  realisedVol30: number | null;
  /** Worst peak-to-trough fall over the last 90 days, % (negative). */
  maxDrawdown90: number | null;
  /** Share of the last 90 days that closed up, 0–1. */
  upDayRatio90: number | null;
  /** Against the benchmark over the last 90 aligned daily returns. */
  beta90: number | null;
  corr90: number | null;
}

export function symbolStats(daily: Candle[], benchmark?: Candle[], periodsPerYear = 365): SymbolStats {
  const closes = daily.map((c) => c.close);
  const r = dailyReturns(closes);
  const last30 = r.slice(-30);
  const last90 = daily.slice(-91);
  let dd: number | null = null;
  if (last90.length >= 2) {
    let peak = last90[0]!.close;
    dd = 0;
    for (const c of last90) { peak = Math.max(peak, c.close); dd = Math.min(dd, (c.close / peak - 1) * 100); }
  }
  const r90 = dailyReturns(last90.map((c) => c.close));
  let beta: number | null = null;
  let corr: number | null = null;
  if (benchmark?.length) {
    const [a, b] = alignedReturns(daily.slice(-91), benchmark.slice(-91));
    corr = correlation(a, b);
    if (a.length >= 10) {
      const mb = mean(b);
      const varB = b.reduce((s, v) => s + (v - mb) ** 2, 0);
      const ma = mean(a);
      beta = varB ? a.reduce((s, v, i) => s + (v - ma) * (b[i]! - mb), 0) / varB : null;
    }
  }
  return {
    returns: { d7: returnOver(daily, 7), d30: returnOver(daily, 30), d90: returnOver(daily, 90), ytd: returnYtd(daily) },
    realisedVol30: last30.length >= 10 ? stdev(last30) * Math.sqrt(periodsPerYear) * 100 : null,
    maxDrawdown90: dd,
    upDayRatio90: r90.length >= 10 ? r90.filter((x) => x > 0).length / r90.length : null,
    beta90: beta,
    corr90: corr,
  };
}

/** Pairwise correlation of daily returns; matrix[i][j], null where data is too thin. */
export function correlationMatrix(series: Candle[][]): Array<Array<number | null>> {
  return series.map((a, i) => series.map((b, j) => (i === j ? 1 : correlation(...alignedReturns(a, b)))));
}

// ── Altcoin season and breadth ────────────────────────────────────────────────

/**
 * Share of altcoins that beat BTC over the window (90 days by convention).
 * 75 or more is altcoin season, 25 or less is bitcoin season.
 */
export function altcoinSeason(altReturns: Array<number | null>, btcReturn: number | null): { index: number | null; label: 'altcoin season' | 'bitcoin season' | 'neither'; counted: number } {
  const xs = altReturns.filter((x): x is number => x != null);
  if (btcReturn == null || xs.length < 10) return { index: null, label: 'neither', counted: xs.length };
  const index = Math.round((xs.filter((x) => x > btcReturn).length / xs.length) * 100);
  return { index, label: index >= 75 ? 'altcoin season' : index <= 25 ? 'bitcoin season' : 'neither', counted: xs.length };
}

export interface Breadth { up: number; down: number; flat: number; advanceRatio: number | null; medianChange: number | null; avgChange: number | null }
/** Advancers vs decliners from 24h changes (%); within ±0.1 % counts as flat. */
export function breadth(changes: number[]): Breadth {
  const up = changes.filter((x) => x > 0.1).length;
  const down = changes.filter((x) => x < -0.1).length;
  const sorted = [...changes].sort((a, b) => a - b);
  const mid = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) : null;
  return { up, down, flat: changes.length - up - down, advanceRatio: up + down ? up / (up + down) : null, medianChange: mid, avgChange: changes.length ? mean(changes) : null };
}

// ── Derivatives ───────────────────────────────────────────────────────────────

export type SqueezeKind = 'short_squeeze' | 'long_squeeze' | 'short_build' | 'long_build';
/**
 * Reads price and open interest together over the same window:
 *   price up, OI down: shorts being forced out (short squeeze)
 *   price down, OI down: longs being forced out (long squeeze)
 *   price down, OI up: new shorts piling in
 *   price up, OI up: new longs piling in
 * Below the thresholds (moves of 2 % price, 3 % OI) nothing is called.
 */
export function squeezeOf(priceChangePct: number | null, oiChangePct: number | null, minPrice = 2, minOi = 3): SqueezeKind | null {
  if (priceChangePct == null || oiChangePct == null) return null;
  if (Math.abs(priceChangePct) < minPrice || Math.abs(oiChangePct) < minOi) return null;
  if (oiChangePct < 0) return priceChangePct > 0 ? 'short_squeeze' : 'long_squeeze';
  return priceChangePct > 0 ? 'long_build' : 'short_build';
}

/** Funding as an annual rate, %: a per-period rate (in %) times periods per year. */
export const annualisedFunding = (ratePct: number, intervalHours = 8) => ratePct * (24 / intervalHours) * 365;
