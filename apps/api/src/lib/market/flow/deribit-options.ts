// Deribit public options book — put/call open interest plus a near-ATM IV skew.
// BTC and ETH only. No key. Soft-fail to null.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import { noteVendor, readSnap, writeSnap } from './vendor-note.js';
import type { FlowSnap } from './unusual-whales.js';

const TTL = 60;
const SOURCE = 'Deribit';

interface BookRow {
  instrument_name?: string;
  open_interest?: number;
  mark_iv?: number;
  underlying_price?: number;
}

export interface DeribitBook {
  currency: 'BTC' | 'ETH';
  putOi: number;
  callOi: number;
  putIv: number | null;
  callIv: number | null;
}

function currencyOf(symbol: string): 'BTC' | 'ETH' | null {
  const s = symbol.toUpperCase();
  if (s.startsWith('BTC')) return 'BTC';
  if (s.startsWith('ETH')) return 'ETH';
  return null;
}

/** PCR lean plus put-minus-call IV (puts richer = fear = bearish). */
export function scoreDeribitBook(book: DeribitBook): { score: number; rationale: string } | null {
  const oi = book.putOi + book.callOi;
  if (oi <= 0 && book.putIv == null) return null;
  let score = 0;
  let w = 0;
  const parts: string[] = [];
  if (book.callOi > 0) {
    const pcr = book.putOi / book.callOi;
    const pcrScore = Math.max(-1, Math.min(1, (1 - pcr) * 0.8));
    score += pcrScore * 0.6;
    w += 0.6;
    parts.push(`P/C ${pcr.toFixed(2)}`);
  }
  if (book.putIv != null && book.callIv != null) {
    const skew = book.putIv - book.callIv;
    const skewScore = Math.max(-1, Math.min(1, -skew / 8));
    score += skewScore * 0.4;
    w += 0.4;
    parts.push(`skew ${skew >= 0 ? '+' : ''}${skew.toFixed(1)} vol`);
  }
  if (w <= 0) return null;
  return { score: Math.max(-1, Math.min(1, score / w)), rationale: parts.join(' · ') };
}

function nearAtm(rows: BookRow[], spot: number): DeribitBook | null {
  let putOi = 0;
  let callOi = 0;
  let putIvSum = 0;
  let putIvN = 0;
  let callIvSum = 0;
  let callIvN = 0;
  let currency: 'BTC' | 'ETH' | null = null;

  for (const row of rows) {
    const name = row.instrument_name ?? '';
    const m = /^(BTC|ETH)-[\dA-Z]+-(\d+)-([CP])$/.exec(name);
    if (!m) continue;
    currency = m[1] as 'BTC' | 'ETH';
    const strike = Number(m[2]);
    const side = m[3];
    const oi = Number(row.open_interest) || 0;
    if (side === 'P') putOi += oi;
    else callOi += oi;
    if (!spot || !Number.isFinite(strike)) continue;
    const dist = Math.abs(strike - spot) / spot;
    if (dist > 0.12 || dist < 0.02) continue;
    const iv = Number(row.mark_iv);
    if (!Number.isFinite(iv)) continue;
    if (side === 'P' && strike < spot) {
      putIvSum += iv;
      putIvN += 1;
    }
    if (side === 'C' && strike > spot) {
      callIvSum += iv;
      callIvN += 1;
    }
  }
  if (!currency) return null;
  return {
    currency,
    putOi,
    callOi,
    putIv: putIvN > 0 ? putIvSum / putIvN : null,
    callIv: callIvN > 0 ? callIvSum / callIvN : null,
  };
}

export async function fetchDeribitOptions(symbol: string): Promise<FlowSnap | null> {
  const currency = currencyOf(symbol);
  if (!currency) return null;
  const cacheKey = `trader:deribit:${currency}`;
  const cached = await readSnap<Omit<FlowSnap, 'asOf' | 'stale'>>(cacheKey, TTL);

  try {
    const base = env.DERIBIT_REST_URL.replace(/\/$/, '');
    const json = await fetchJson<{ result?: BookRow[] }>(
      `${base}/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
    );
    const rows = json.result ?? [];
    const spot = rows.find((r) => Number(r.underlying_price) > 0)?.underlying_price ?? 0;
    const book = nearAtm(rows, Number(spot));
    const scored = book ? scoreDeribitBook(book) : null;
    if (!scored) {
      await noteVendor('deribit', false);
      return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
    }
    const snap = { score: scored.score, rationale: `${SOURCE} ${scored.rationale}`, source: SOURCE };
    const asOf = await writeSnap(cacheKey, snap);
    await noteVendor('deribit', true);
    return { ...snap, asOf, stale: false };
  } catch (err) {
    logger.warn(`[trader/deribit] ${currency}: ${(err as Error).message}`);
    await noteVendor('deribit', false);
    return cached ? { ...cached.snap, asOf: cached.asOf, stale: true, source: SOURCE } : null;
  }
}
