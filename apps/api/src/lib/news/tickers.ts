// Deterministic story → tickers / desk / fallback score for the News map.
// Pure (no I/O), unit-tested in __tests__/tickers.test.ts. Nothing is stored:
// the read path derives these from the headline every time, so a rule change
// applies to old rows too.
//
// Tickers use the page's display keys (US10Y, DXY, XAUUSD, US500, WTI…), the
// same keys GET /api/news/reactions serves series for.
import type { NewsDesk, NewsScoreSource } from '@tradinjournal/contracts';

type Region = 'US' | 'EU' | 'UK' | 'JP' | 'CN';

interface Rule {
  re: RegExp;
  tickers: string[];
  /** How much this kind of story tends to move markets (feeds the fallback score). */
  weight: number;
  /** Only fire when the story is about this region (or no region is named). */
  region?: Region;
  /** Marks the story as a RATES-desk item. */
  rates?: boolean;
}

const REGIONS: { region: Region; re: RegExp }[] = [
  { region: 'US', re: /\b(u\.?s\.?|united states|american|fed|fomc|federal reserve|powell|treasur(?:y|ies)|wall street|nonfarm|payrolls?|jobless claims)\b/i },
  { region: 'EU', re: /\b(ecb|lagarde|euro ?zone|euro area|eurozone|germany|german|bund|france|french|italy|italian)\b/i },
  { region: 'UK', re: /\b(uk|u\.k\.|britain|british|boe|bank of england|bailey|gilts?|sterling)\b/i },
  { region: 'JP', re: /\b(japan|japanese|boj|bank of japan|ueda|jgbs?|yen)\b/i },
  { region: 'CN', re: /\b(china|chinese|pboc|yuan|beijing)\b/i },
];

// Order matters: earlier rules put their tickers first.
const RULES: Rule[] = [
  // US data prints and the Fed: the whole rates/dollar/gold/equities complex.
  { re: /\b(cpi|inflation|consumer prices|pce|ppi|core prices)\b/i, tickers: ['US10Y', 'DXY', 'XAUUSD', 'US500'], weight: 34, region: 'US' },
  { re: /\b(nonfarm|non-farm|payrolls?|nfp|jobs report|jobless claims|unemployment rate)\b/i, tickers: ['US10Y', 'DXY', 'XAUUSD', 'US500'], weight: 30, region: 'US' },
  { re: /\b(fomc|fed|federal reserve|powell|fed funds|rate decision)\b/i, tickers: ['US10Y', 'DXY', 'XAUUSD', 'US500'], weight: 28, region: 'US', rates: true },
  { re: /\b(rate cuts?|rate hikes?|cut odds|basis points?|\d+ ?bps?)\b/i, tickers: ['US10Y', 'DXY'], weight: 18, region: 'US', rates: true },
  { re: /\b(treasur(?:y|ies)|yields?|bond market|bonds?|t-notes?|10-year|two-year|2-year)\b/i, tickers: ['US10Y', 'DXY'], weight: 16, region: 'US', rates: true },
  { re: /\b(gdp|retail sales|ism|pmi)\b/i, tickers: ['US10Y', 'DXY', 'US500'], weight: 20, region: 'US' },
  // Other central banks / regions.
  { re: /\b(ecb|lagarde|euro ?zone|euro area|eurozone|euro)\b/i, tickers: ['EURUSD'], weight: 18 },
  { re: /\b(bunds?|german yields?)\b/i, tickers: ['EURUSD'], weight: 12, rates: true },
  { re: /\b(boj|bank of japan|ueda|yen|jgbs?|japan(?:ese)?\b[^.]*\b(?:bonds?|yields?))\b/i, tickers: ['USDJPY', 'JP10Y'], weight: 18 },
  { re: /\b(jgbs?|japan(?:ese)?\b[^.]*\b(?:bonds?|yields?))\b/i, tickers: [], weight: 4, rates: true },
  { re: /\b(boe|bank of england|bailey|sterling|pound|gilts?|uk (?:gdp|inflation|cpi|jobs))\b/i, tickers: ['GBPUSD'], weight: 16 },
  { re: /\b(gilts?|uk yields?)\b/i, tickers: [], weight: 4, rates: true },
  { re: /\b(yuan|pboc)\b/i, tickers: ['USDCNH'], weight: 12 },
  // Dollar.
  { re: /\b(dollar|dxy|greenback)\b/i, tickers: ['DXY'], weight: 12 },
  // Crypto.
  { re: /\b(bitcoin|btc|xbt)\b/i, tickers: ['BTCUSD'], weight: 14 },
  { re: /\b(ether|ethereum|eth)\b/i, tickers: ['ETHUSD'], weight: 12 },
  { re: /\b(solana|sol)\b/i, tickers: ['SOLUSD'], weight: 8 },
  { re: /\b(xrp|ripple)\b/i, tickers: ['XRPUSD'], weight: 8 },
  { re: /\b(crypto|cryptocurrenc(?:y|ies)|stablecoins?|liquidat(?:ed|ions?))\b/i, tickers: ['BTCUSD'], weight: 8 },
  // Energy and geopolitics.
  { re: /\b(oil|crude|opec\+?|brent|wti|barrels?|refiner(?:y|ies))\b/i, tickers: ['WTI', 'BRENT'], weight: 16 },
  { re: /\b(drone|missile|strike|attack|explosion)\b.*\b(terminal|pipeline|tanker|refinery|port|oil|gas field)\b/i, tickers: ['WTI', 'BRENT'], weight: 22 },
  { re: /\b(natural gas|lng)\b/i, tickers: ['NATGAS'], weight: 10 },
  { re: /\b(war|invasion|missiles?|airstrikes?|sanctions?|ceasefire|escalat(?:ion|es))\b/i, tickers: ['XAUUSD', 'WTI'], weight: 16 },
  // Metals.
  { re: /\b(gold|bullion|xau)\b/i, tickers: ['XAUUSD'], weight: 12 },
  { re: /\b(silver|xag)\b/i, tickers: ['XAGUSD'], weight: 8 },
  // Equities.
  { re: /\b(s&p|s&p 500|spx|sp500|us500|index futures|stock futures|equit(?:y|ies)|wall street|stocks)\b/i, tickers: ['US500'], weight: 12 },
  { re: /\b(nasdaq|ndx|us100|tech stocks|chipmakers?|nvidia|apple|microsoft|alphabet|amazon|meta|tesla)\b/i, tickers: ['US100'], weight: 12 },
  { re: /\b(dow|djia|us30)\b/i, tickers: ['US30'], weight: 10 },
];

const MAX_TICKERS = 5;

function regionsOf(text: string): Set<Region> {
  const out = new Set<Region>();
  for (const r of REGIONS) if (r.re.test(text)) out.add(r.region);
  return out;
}

interface Match { tickers: string[]; weight: number; rates: boolean }

function analyse(title: string, summary?: string | null): Match {
  // The headline decides; the summary only adds when the headline names nothing.
  const head = run(title);
  if (head.tickers.length || !summary) return head;
  const both = run(`${title}. ${summary}`);
  return { ...both, weight: Math.round(both.weight * 0.6) };
}

function run(text: string): Match {
  const regions = regionsOf(text);
  const tickers: string[] = [];
  let weight = 0;
  let rates = false;
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    // A US-only rule fires when the US is named, or when no region is named at all.
    if (rule.region && !regions.has(rule.region) && regions.size > 0) continue;
    weight = Math.max(weight, rule.weight);
    if (rule.rates) rates = true;
    for (const t of rule.tickers) if (!tickers.includes(t)) tickers.push(t);
  }
  return { tickers: tickers.slice(0, MAX_TICKERS), weight, rates };
}

/** Tickers a headline is about, most relevant first (≤ 5). */
export function tickersFor(title: string, summary?: string | null): string[] {
  return analyse(title, summary).tickers;
}

/**
 * The page tab a story belongs to. RATES is carved out of MACRO (and un-tagged)
 * stories about yields, bonds and cut odds; everything else follows the stored
 * category, with a keyword guess when the row has none yet.
 */
export function deskFor(category: string | null | undefined, title: string, summary?: string | null): NewsDesk | null {
  const m = analyse(title, summary);
  if (m.rates && (category == null || category === 'MACRO')) return 'RATES';
  if (category === 'MACRO' || category === 'CRYPTO' || category === 'MARKETS' || category === 'GEOPOLITICAL' || category === 'REGULATORY') return category;
  const t = m.tickers;
  if (t.some(x => x === 'BTCUSD' || x === 'ETHUSD' || x === 'SOLUSD' || x === 'XRPUSD')) return 'CRYPTO';
  if (t.includes('WTI') && /\b(drone|missile|strike|attack|war|sanction)/i.test(title)) return 'GEOPOLITICAL';
  if (t.includes('US10Y') || t.includes('EURUSD') || t.includes('USDJPY') || t.includes('GBPUSD')) return 'MACRO';
  if (t.length) return 'MARKETS';
  return null;
}

export interface ScoreInput {
  title: string;
  summary?: string | null;
  relevance: number | null;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  marketMoving: boolean;
  category: string | null;
  sourceCount: number;
}

/** Fallback score ceiling: an un-enriched story can be kept, never shown as market-moving (80+). */
export const RULES_SCORE_MAX = 75;

/**
 * 0..100 story score. The LLM relevance when the row is enriched; otherwise a
 * rules score from the keyword weight, the stored impact/category, and how many
 * outlets carried it, capped below the market-moving band.
 */
export function storyScore(s: ScoreInput): { score: number; source: NewsScoreSource } {
  if (typeof s.relevance === 'number') return { score: clamp(Math.round(s.relevance), 0, 100), source: 'ai' };
  const m = analyse(s.title, s.summary);
  let v = 22 + m.weight;
  if (s.impact === 'HIGH') v += 18;
  else if (s.impact === 'MEDIUM') v += 8;
  if (s.marketMoving) v += 10;
  if (s.category === 'MACRO' || s.category === 'GEOPOLITICAL') v += 4;
  v += Math.min(16, Math.max(0, s.sourceCount - 1) * 4);
  return { score: clamp(Math.round(v), 0, RULES_SCORE_MAX), source: 'rules' };
}

/** Kept = shown on the wire: score 40+ or rated HIGH impact. */
export function isKept(score: number, impact: string | null): boolean {
  return score >= 40 || impact === 'HIGH';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
