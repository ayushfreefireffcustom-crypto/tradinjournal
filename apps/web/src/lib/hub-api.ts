// Client for the market hub: overview (E10), correlation (E14), symbol stats
// (E12), weekly market brief (E15) and derivatives (E11/E17).
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export interface UniverseRow { symbol: string; base: string; price: number; change24h: number; volume24h: number }
export interface SectorRow { sector: string; count: number; change24h: number | null; change7d: number | null; change30d: number | null; volume24h: number; vsBtc7d: number | null; vsBtc30d: number | null; leaders: string[] }
export interface Overview {
  asOf: string;
  breadth: { up: number; down: number; flat: number; advanceRatio: number | null; medianChange: number | null; avgChange: number | null };
  gainers: UniverseRow[];
  losers: UniverseRow[];
  heatmap: Array<UniverseRow & { sector: string }>;
  sectors: SectorRow[];
  fearGreed: { value: number; label: string; history: Array<{ time: number; value: number }> } | null;
  altSeason: { index: number | null; label: 'altcoin season' | 'bitcoin season' | 'neither'; counted: number; btc90: number | null; window: number };
  macro: Array<{ symbol: string; name: string; group: string; price: number | null; change1d: number | null; spark: number[] }>;
  week: { btc7d: number | null; eth7d: number | null; gainers: Array<{ base: string; change7d: number }>; losers: Array<{ base: string; change7d: number }> };
}
export interface Correlation { asOf: string; days: number; symbols: string[]; matrix: Array<Array<number | null>> }
export interface MarketBrief { weekEnding: string; source: 'ai' | 'rules'; headline: string; summary: string; bullets: string[]; watch: string }
export interface SymbolStats {
  symbol: string; crypto: boolean; bars: number; asOf: string;
  returns: { d7: number | null; d30: number | null; d90: number | null; ytd: number | null };
  realisedVol30: number | null; maxDrawdown90: number | null; upDayRatio90: number | null; beta90: number | null; corr90: number | null;
  volume24h: number | null; benchmark: string;
  funding: { funding: number | null; nextFundingTime: number | null; fundingIntervalH: number; oiValue: number | null; annualised: number | null } | null;
}
export type SqueezeKind = 'short_squeeze' | 'long_squeeze' | 'short_build' | 'long_build';
export interface DerivRow {
  symbol: string; base: string; price: number; change24h: number; turnover24h: number; oiValue: number | null;
  funding: number | null; lastFunding: number | null; fundingIntervalH: number; annualised: number | null; nextFundingTime: number | null;
  oiChange24h: number | null; longRatio: number | null; squeeze: SqueezeKind | null;
}
export interface Derivatives { asOf: string; source: 'bybit' | null; rows: DerivRow[]; totals: { oiValue: number; weightedFunding: number | null; positiveShare: number | null }; detailFor: number; liquidations: null; note: string | null }

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { credentials: 'include' });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  return json!.data as T;
}

export const hubApi = {
  overview: () => call<Overview>('/overview'),
  correlation: (days: 30 | 90 | 180) => call<Correlation>(`/overview/correlation?days=${days}`),
  stats: (symbol: string) => call<SymbolStats>(`/overview/stats?symbol=${encodeURIComponent(symbol)}`),
  brief: () => call<MarketBrief>('/overview/brief'),
  derivatives: () => call<Derivatives>('/derivatives'),
};

// ── Formatting shared by the hub pages ────────────────────────────────────────
export const fmtPrice = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
export const fmtPct = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
export const fmtUsd = (v: number | null | undefined) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`);
export const toneOf = (v: number | null | undefined) => (v == null || Math.abs(v) < 1e-12 ? '' : v > 0 ? 'pos' : 'neg');
