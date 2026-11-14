// Client for the estimated liquidation map + max pain (Macro page, later
// Charts). Types mirror packages/contracts/src/schema/liquidations.ts and
// apps/api/src/modules/liquidations. Every figure is a MODEL estimate: label it
// "Estimated" wherever it's shown.
import { ApiError } from '@/lib/copy-api';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');
const PREFIX = USE_MOCKS ? '/data' : '/api';

export const LIQUIDATION_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'] as const;
export type LiquidationCoin = (typeof LIQUIDATION_COINS)[number];
export const LIQUIDATION_WINDOWS = ['24h', '48h', '7d'] as const;
export type LiquidationWindow = (typeof LIQUIDATION_WINDOWS)[number];

/** One price bucket: USD notional that would be liquidated there. */
export interface LiquidationBand { price: number; longUsd: number; shortUsd: number }

export interface MaxPain {
  /** Biggest long-liquidation cluster below price (band ± 1 neighbour). */
  longPrice: number;
  longUsd: number;
  /** Signed % from price (negative). 0 with longUsd 0 when nothing is resting below. */
  longPct: number;
  /** Biggest short-liquidation cluster above price. */
  shortPrice: number;
  shortUsd: number;
  /** Signed % from price (positive). */
  shortPct: number;
  /** Chance (0..100) price touches each side within 24h, from realised vol. */
  touchDownPct: number | null;
  touchUpPct: number | null;
}

export interface LiquidationMap {
  coin: LiquidationCoin;
  symbol: string;
  price: number;
  asOf: string;
  estimated: true;
  window: LiquidationWindow;
  /** Bucket size in price units. */
  step: number;
  /** Ascending by price, contiguous across ±15 % of price. */
  bands: LiquidationBand[];
  maxPain: MaxPain;
  /** Close per bar over the window (15m bars for 24h/48h, 1h for 7d). */
  path: { t: string; p: number }[];
  /**
   * Realised liquidations in the last hour from the relay's live Binance + Bybit
   * sockets; null when the feed is down or hasn't covered the whole hour.
   * longShare (0..1) is null when nothing was liquidated.
   */
  lastHour: { totalUsd: number; longShare: number | null } | null;
  sources: string[];
}

export interface MaxPainRow extends MaxPain { coin: LiquidationCoin; price: number }
export interface MaxPainBoard { asOf: string; estimated: true; rows: MaxPainRow[] }

/** Error code the API uses when no exchange answered (HTTP 503); show a retry state. */
export const LIQUIDATIONS_UNAVAILABLE = 'LIQUIDATIONS_UNAVAILABLE';

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${PREFIX}${path}`, { ...(USE_MOCKS ? {} : { credentials: 'include' as const }), headers: { accept: 'application/json' } });
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { message?: string; code?: string; details?: Record<string, string[]> } };
  if (!res.ok) throw new ApiError(json.error?.message ?? `Request failed: ${res.status}`, res.status, json.error?.code, json.error?.details);
  return json.data as T;
}

export const liquidationsApi = {
  /** Estimated liquidation ladder for one coin. */
  map: (coin: LiquidationCoin = 'BTC', window: LiquidationWindow = '48h') =>
    call<LiquidationMap>(`/liquidations/map?coin=${coin}&window=${window}`),
  /** Max pain for every supported coin (48h window); coins with no data are left out. */
  maxPain: () => call<MaxPainBoard>('/liquidations/max-pain'),
};
