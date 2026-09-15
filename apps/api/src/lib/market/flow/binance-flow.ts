// Binance USDT-M futures flow snapshots for the Trader Master Flow lane.
// Public endpoints — no API key. Soft-fail to null when the symbol isn't listed
// on futures or the network blips (lane simply omitted).
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../cache.js';
import { fetchJson } from '../http.js';
import { flowLane, type LaneResult } from '@tradinjournal/core';

const FLOW_TTL = 45; // seconds — funding/OI move slowly enough
const FUTURES_BASE = () => env.BINANCE_FUTURES_REST_URL;

interface PremiumIndex {
  symbol: string;
  lastFundingRate: string;
  markPrice: string;
}

interface OpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

interface AggTrade {
  p: string; // price
  q: string; // qty
  m: boolean; // true = buyer is maker → seller aggressive
  T: number;
}

export interface CryptoFlowSnapshot {
  symbol: string;
  fundingRate: number;
  openInterest: number;
  cvdProxy: number; // net aggressive buy qty − sell qty over recent aggTrades
  score: number; // −1..1
  rationale: string;
}

function toFuturesSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Build a Flow lane for a crypto perpetual-style symbol, or null if unavailable.
 */
export async function fetchCryptoFlowLane(symbol: string): Promise<LaneResult | null> {
  const snap = await fetchCryptoFlow(symbol);
  if (!snap) return null;
  return flowLane(snap.score, snap.rationale, 0.22);
}

export async function fetchCryptoFlow(symbol: string): Promise<CryptoFlowSnapshot | null> {
  const sym = toFuturesSymbol(symbol);
  if (!/(USDT|USDC|BUSD)$/.test(sym) && !/^(BTC|ETH|SOL)/.test(sym)) {
    // Likely not a Binance futures pair we can map cleanly.
    if (!sym.endsWith('USDT')) return null;
  }
  const pair = sym.endsWith('USDT') || sym.endsWith('USDC') ? sym : `${sym}USDT`;
  const cacheKey = `trader:flow:${pair}`;
  const cached = await cacheGet<CryptoFlowSnapshot>(cacheKey);
  if (cached) return cached;

  try {
    const base = FUTURES_BASE();
    const [prem, oi, trades] = await Promise.all([
      fetchJson<PremiumIndex>(`${base}/fapi/v1/premiumIndex?symbol=${pair}`).catch(() => null),
      fetchJson<OpenInterest>(`${base}/fapi/v1/openInterest?symbol=${pair}`).catch(() => null),
      fetchJson<AggTrade[]>(`${base}/fapi/v1/aggTrades?symbol=${pair}&limit=200`).catch(() => []),
    ]);

    if (!prem && !oi && (!trades || trades.length === 0)) return null;

    const fundingRate = prem ? Number(prem.lastFundingRate) : 0;
    const openInterest = oi ? Number(oi.openInterest) : 0;

    let buyVol = 0;
    let sellVol = 0;
    for (const t of trades ?? []) {
      const qty = Number(t.q);
      if (!Number.isFinite(qty)) continue;
      // m=true → buyer is maker → seller was aggressive (market sell)
      if (t.m) sellVol += qty;
      else buyVol += qty;
    }
    const total = buyVol + sellVol;
    const cvdProxy = total > 0 ? (buyVol - sellVol) / total : 0; // −1..1

    // Funding: elevated positive funding = crowded longs → mild bearish lean.
    // Clamp typical funding (~±0.001) into a soft signal.
    const fundingScore = Math.max(-1, Math.min(1, -fundingRate * 250));
    // CVD dominates short horizon; funding is a slower crowding check.
    const score = Math.max(-1, Math.min(1, cvdProxy * 0.7 + fundingScore * 0.3));

    const parts: string[] = [];
    parts.push(`CVD ${(cvdProxy * 100).toFixed(0)}% net aggressive`);
    if (prem) parts.push(`funding ${(fundingRate * 100).toFixed(4)}%`);
    if (oi) parts.push(`OI ${Math.round(openInterest).toLocaleString()}`);

    const snap: CryptoFlowSnapshot = {
      symbol: pair,
      fundingRate,
      openInterest,
      cvdProxy,
      score,
      rationale: parts.join(' · '),
    };
    await cacheSet(cacheKey, snap, FLOW_TTL);
    return snap;
  } catch (err) {
    logger.warn(`[trader/flow] ${pair}: ${(err as Error).message}`);
    return null;
  }
}
