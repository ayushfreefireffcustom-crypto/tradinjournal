// FRED observations client. Fetches the latest 2 points per series so we can
// stamp `prev` without a second DB round-trip. Never throws for a single series
// failure — that series simply contributes nothing.
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import {
  FRED_SERIES,
  NET_LIQUIDITY_DEF,
  NET_LIQUIDITY_KEY,
  NET_LIQUIDITY_PARTS,
} from '../series.js';
import type { FredSeriesDef, NormalizedMacroIndicator } from '../types.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string; // YYYY-MM-DD
  value: string; // "." means missing
}

interface FredObservationsResponse {
  observations?: FredObservation[];
}

/** Parse a FRED observations payload into latest + prev (exported for unit tests). */
export function parseFredObservations(
  def: FredSeriesDef,
  observations: FredObservation[],
): NormalizedMacroIndicator | null {
  const valid = observations.filter(o => o && o.date && o.value && o.value !== '.');
  if (valid.length === 0) return null;
  const latest = valid[0]!;
  const prevObs = valid[1];
  const value = Number(latest.value);
  if (!Number.isFinite(value)) return null;
  const prevRaw = prevObs ? Number(prevObs.value) : NaN;
  return {
    key: def.id,
    label: def.label,
    value,
    prev: Number.isFinite(prevRaw) ? prevRaw : null,
    unit: def.unit,
    source: 'fred',
    asOf: new Date(`${latest.date}T00:00:00.000Z`),
  };
}

/** NET_LIQUIDITY = WALCL − WTREGEN − RRPONTSYD (RRP is bn$; convert to mn$). */
export function computeNetLiquidity(
  parts: Map<string, NormalizedMacroIndicator>,
): NormalizedMacroIndicator | null {
  const walcl = parts.get('WALCL');
  const tga = parts.get('WTREGEN');
  const rrp = parts.get('RRPONTSYD');
  if (!walcl || !tga || !rrp) return null;

  // RRPONTSYD is published in billions; WALCL/WTREGEN in millions.
  const rrpMn = rrp.value * 1000;
  const rrpPrevMn = rrp.prev != null ? rrp.prev * 1000 : null;
  const value = walcl.value - tga.value - rrpMn;
  const prev =
    walcl.prev != null && tga.prev != null && rrpPrevMn != null
      ? walcl.prev - tga.prev - rrpPrevMn
      : null;

  // Use the oldest of the three asOf dates so we don't claim a fresher print
  // than any component actually has.
  const asOfMs = Math.min(walcl.asOf.getTime(), tga.asOf.getTime(), rrp.asOf.getTime());

  return {
    key: NET_LIQUIDITY_KEY,
    label: NET_LIQUIDITY_DEF.label,
    value,
    prev,
    unit: NET_LIQUIDITY_DEF.unit,
    source: 'fred',
    asOf: new Date(asOfMs),
  };
}

async function fetchSeries(
  def: FredSeriesDef,
  apiKey: string,
  signal?: AbortSignal,
): Promise<NormalizedMacroIndicator | null> {
  const url =
    `${FRED_BASE}?series_id=${encodeURIComponent(def.id)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=2`;
  try {
    const json = await fetchJson<FredObservationsResponse>(url, signal);
    return parseFredObservations(def, json.observations ?? []);
  } catch (err) {
    logger.warn(`[macro/fred] ${def.id} failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Pull every catalogued FRED series + derive NET_LIQUIDITY. Parallel fetches;
 * individual failures are logged and skipped.
 */
export async function fetchFredIndicators(
  apiKey: string,
  signal?: AbortSignal,
): Promise<NormalizedMacroIndicator[]> {
  const settled = await Promise.all(
    FRED_SERIES.map(def => fetchSeries(def, apiKey, signal)),
  );
  const out: NormalizedMacroIndicator[] = [];
  const byKey = new Map<string, NormalizedMacroIndicator>();
  for (const row of settled) {
    if (!row) continue;
    out.push(row);
    byKey.set(row.key, row);
  }

  // Ensure we only compute net liquidity when all three parts landed this tick.
  const parts = new Map<string, NormalizedMacroIndicator>();
  for (const id of NET_LIQUIDITY_PARTS) {
    const row = byKey.get(id);
    if (row) parts.set(id, row);
  }
  const net = computeNetLiquidity(parts);
  if (net) out.push(net);

  return out;
}
