// CFTC Commitments of Traders (COT) positioning — free public Socrata API.
// We surface the net non-commercial ("large speculator") position for the macro
// futures we already track, ingested as COT_* indicators so no new table/migration
// is needed. Weekly data (Tuesday snapshot, released Friday).
import { logger } from '@tradinjournal/logger';
import { fetchJson } from '../http.js';
import type { NormalizedMacroIndicator } from '../types.js';

const CFTC_LEGACY_FUTS = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';

interface CotTarget {
  key: string;
  label: string;
  /** Exact CFTC market_and_exchange_names (verified against the live API). */
  market: string;
}

const TARGETS: readonly CotTarget[] = [
  { key: 'COT_SPX', label: 'S&P 500 Net Specs', market: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE' },
  { key: 'COT_BTC', label: 'Bitcoin Net Specs', market: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE' },
  { key: 'COT_XAU', label: 'Gold Net Specs', market: 'GOLD - COMMODITY EXCHANGE INC.' },
  { key: 'COT_USD', label: 'USD Index Net Specs', market: 'USD INDEX - ICE FUTURES U.S.' },
  { key: 'COT_UST10', label: '10Y Note Net Specs', market: 'UST 10Y NOTE - CHICAGO BOARD OF TRADE' },
] as const;

interface CotRow {
  report_date_as_yyyy_mm_dd?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
}

function netPosition(r: CotRow): number {
  return Number(r.noncomm_positions_long_all) - Number(r.noncomm_positions_short_all);
}

async function fetchOne(t: CotTarget, signal?: AbortSignal): Promise<NormalizedMacroIndicator | null> {
  try {
    const params = new URLSearchParams({
      $where: `market_and_exchange_names='${t.market}'`,
      $order: 'report_date_as_yyyy_mm_dd DESC',
      $limit: '2',
      $select: 'report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all',
    });
    const rows = await fetchJson<CotRow[]>(`${CFTC_LEGACY_FUTS}?${params}`, signal);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const latest = rows[0]!;
    const value = netPosition(latest);
    if (!Number.isFinite(value)) return null;
    const prevRaw = rows[1] ? netPosition(rows[1]) : NaN;

    return {
      key: t.key,
      label: t.label,
      value,
      prev: Number.isFinite(prevRaw) ? prevRaw : null,
      unit: 'contracts',
      source: 'cftc',
      asOf: latest.report_date_as_yyyy_mm_dd ? new Date(latest.report_date_as_yyyy_mm_dd) : new Date(),
    };
  } catch (err) {
    logger.warn(`[macro/cot] ${t.key} failed: ${(err as Error).message}`);
    return null;
  }
}

/** Fetch net-spec positioning for all tracked markets. Individual failures skip. */
export async function fetchCotPositioning(signal?: AbortSignal): Promise<NormalizedMacroIndicator[]> {
  const settled = await Promise.all(TARGETS.map(t => fetchOne(t, signal)));
  return settled.filter((r): r is NormalizedMacroIndicator => r !== null);
}
