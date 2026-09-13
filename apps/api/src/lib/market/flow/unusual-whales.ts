// Unusual Whales options-volume lane for US stocks.
// Missing key or a bad response omits the lane — never invents a score.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import { noteVendor, readSnap, writeSnap } from './vendor-note.js';

const TTL = 45;
const SOURCE = 'Unusual Whales';

export interface UwVolumeRow {
  bullish_premium?: string | number;
  bearish_premium?: string | number;
  call_volume?: string | number;
  put_volume?: string | number;
  avg_30_day_call_volume?: string | number;
  avg_30_day_put_volume?: string | number;
  net_call_premium?: string | number;
  net_put_premium?: string | number;
}

export interface FlowSnap {
  score: number;
  rationale: string;
  source: string;
  asOf: string;
  stale: boolean;
}

function num(v: string | number | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Net bullish premium, nudged when today's volume is unusual vs the 30-day average. */
export function scoreUwVolume(row: UwVolumeRow): { score: number; rationale: string } | null {
  const bull = num(row.bullish_premium);
  const bear = num(row.bearish_premium);
  const prem = bull + bear;
  if (prem <= 0) return null;
  const premiumScore = (bull - bear) / prem;
  const vol = num(row.call_volume) + num(row.put_volume);
  const avg = num(row.avg_30_day_call_volume) + num(row.avg_30_day_put_volume);
  const volRatio = avg > 0 ? vol / avg : 1;
  const unusual = volRatio >= 1.5 ? Math.min(0.2, (volRatio - 1) * 0.12) * Math.sign(premiumScore || 1) : 0;
  const score = Math.max(-1, Math.min(1, premiumScore * 0.85 + unusual));
  const parts = [
    `net premium ${premiumScore >= 0 ? '+' : ''}${(premiumScore * 100).toFixed(0)}%`,
  ];
  if (avg > 0) parts.push(`vol ${volRatio.toFixed(1)}x 30d`);
  return { score, rationale: parts.join(' · ') };
}

function stockTicker(symbol: string): string | null {
  const s = symbol.trim().toUpperCase().replace(/[^A-Z.]/g, '');
  if (!s || s.length > 6) return null;
  if (/USDT$|USDC$/.test(s)) return null;
  return s;
}

export async function fetchUnusualWhales(symbol: string): Promise<FlowSnap | null> {
  const ticker = stockTicker(symbol);
  const key = env.UNUSUAL_WHALES_API_KEY;
  if (!ticker || !key) return null;

  const cacheKey = `trader:uw:${ticker}`;
  const cached = await readSnap<Omit<FlowSnap, 'asOf' | 'stale'>>(cacheKey, TTL);

  try {
    const json = await fetchJson<{ data?: UwVolumeRow[] }>(
      `https://api.unusualwhales.com/api/stock/${encodeURIComponent(ticker)}/options-volume?limit=1`,
      undefined,
      { Authorization: `Bearer ${key}` },
    );
    const row = json.data?.[0];
    const scored = row ? scoreUwVolume(row) : null;
    if (!scored) {
      await noteVendor('unusual_whales', false);
      return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
    }
    const snap = { score: scored.score, rationale: `${SOURCE} ${scored.rationale}`, source: SOURCE };
    const asOf = await writeSnap(cacheKey, snap);
    await noteVendor('unusual_whales', true);
    return { ...snap, asOf, stale: false };
  } catch (err) {
    logger.warn(`[trader/uw] ${ticker}: ${(err as Error).message}`);
    await noteVendor('unusual_whales', false);
    return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
  }
}
