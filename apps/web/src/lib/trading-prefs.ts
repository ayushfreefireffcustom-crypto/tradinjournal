// Client for trading prefs (GET/PUT /api/me/trading-prefs) and the rules
// preview (POST /api/insights/rules-preview). Types mirror
// packages/contracts/src/schema/prefs.ts — keep them in step.
//
// Until the trading_prefs table exists the API answers GET with defaults and
// persisted:false, and PUT with 503 PREFS_NOT_READY. Rules and the risk cap
// then can't be saved (the settings page says so calmly); dashboard layouts
// fall back to this device's localStorage.
'use client';

import { useCallback, useEffect, useState } from 'react';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

export type RuleKey = 'maxTradesPerDay' | 'tradingHours' | 'maxRiskPct' | 'stopAfterLosses' | 'dailyLossCapPct' | 'maxSizeX';
export const RULE_KEYS: RuleKey[] = ['maxTradesPerDay', 'tradingHours', 'maxRiskPct', 'stopAfterLosses', 'dailyLossCapPct', 'maxSizeX'];
export interface TradingRules {
  maxTradesPerDay?: number | null;
  tradingHours?: { from: string; to: string } | null;
  maxRiskPct?: number | null;
  stopAfterLosses?: number | null;
  dailyLossCapPct?: number | null;
  maxSizeX?: number | null;
}
export interface SavedTab { id: string; name: string; widgets: string[] }
export interface TradingLayouts { dashboard?: { tabs: SavedTab[] } }
export interface TradingPrefsDTO { rules: TradingRules; riskCapPct: number; layouts: TradingLayouts; persisted: boolean; updatedAt: string | null }
export interface TradingPrefsUpdate { rules?: TradingRules; riskCapPct?: number; layouts?: TradingLayouts }
export interface RulePreviewRow { n: number; net: number; checked: number }
export interface RulesPreviewDTO { days: number; trades: number; rules: Partial<Record<RuleKey, RulePreviewRow>>; any: { n: number; net: number } }

export const DEFAULT_RISK_CAP_PCT = 2;
export const NOT_READY = 'PREFS_NOT_READY';
export const LOCAL_LAYOUTS_KEY = 'tl-dash-layouts';

export class PrefsError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${PREFIX}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new PrefsError(json?.error?.message ?? `Request failed: ${res.status}`, res.status, json?.error?.code);
  return json.data as T;
}

export const prefsApi = {
  get: () => call<TradingPrefsDTO>('/me/trading-prefs'),
  put: (body: TradingPrefsUpdate) => call<TradingPrefsDTO>('/me/trading-prefs', { method: 'PUT', body: JSON.stringify(body) }),
  preview: (accountId: string, rules: TradingRules, days = 90, signal?: AbortSignal) =>
    call<RulesPreviewDTO>('/insights/rules-preview', { method: 'POST', body: JSON.stringify({ accountId, rules, days }), signal }),
};
export const isNotReady = (e: unknown) => e instanceof PrefsError && (e.code === NOT_READY || e.status === 503);

// ── rule UI helpers (pure) ──

/** Value a rule starts at when switched on. */
export const RULE_DEFAULT: Required<{ [K in RuleKey]: NonNullable<TradingRules[K]> }> = {
  maxTradesPerDay: 3, tradingHours: { from: '07:00', to: '16:00' }, maxRiskPct: 1, stopAfterLosses: 2, dailyLossCapPct: 3, maxSizeX: 1.5,
};
export const RULE_TITLE: Record<RuleKey, string> = {
  maxTradesPerDay: 'Max trades a day', tradingHours: 'Trading hours', maxRiskPct: 'Max risk a trade', stopAfterLosses: 'Stop after losses',
  dailyLossCapPct: 'Daily loss cap', maxSizeX: 'Max size',
};
/** Bounds the API accepts (contracts/prefs.ts). */
export const RULE_BOUNDS: Record<Exclude<RuleKey, 'tradingHours'>, { min: number; max: number; step: number; int: boolean }> = {
  maxTradesPerDay: { min: 1, max: 100, step: 1, int: true },
  maxRiskPct: { min: 0.05, max: 25, step: 0.25, int: false },
  stopAfterLosses: { min: 1, max: 20, step: 1, int: true },
  dailyLossCapPct: { min: 0.1, max: 50, step: 0.5, int: false },
  maxSizeX: { min: 1.1, max: 10, step: 0.1, int: false },
};
export const RISK_CAP_BOUNDS = { min: 0.1, max: 10 };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A number field's text → value within bounds, or null when invalid. */
export function parseRuleValue(key: Exclude<RuleKey, 'tradingHours'>, text: string): number | null {
  const v = Number(text.trim().replace(',', '.'));
  const b = RULE_BOUNDS[key];
  if (!text.trim() || !Number.isFinite(v) || v < b.min || v > b.max) return null;
  if (b.int && !Number.isInteger(v)) return null;
  return Math.round(v * 1000) / 1000;
}
export function validHours(h: { from: string; to: string } | null | undefined): boolean {
  return !!h && HHMM.test(h.from) && HHMM.test(h.to) && h.from !== h.to;
}
export function parseRiskCap(text: string): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(v) && v >= RISK_CAP_BOUNDS.min && v <= RISK_CAP_BOUNDS.max ? Math.round(v * 1000) / 1000 : null;
}
/** Only the rules that are on (what the API stores and the preview checks). */
export function activeOnly(r: TradingRules): TradingRules {
  const out: TradingRules = {};
  for (const k of RULE_KEYS) if (r[k] != null) (out as Record<string, unknown>)[k] = r[k];
  return out;
}
const ruleSig = (r: TradingRules) => RULE_KEYS.map(k => { const v = r[k]; return v == null ? '' : typeof v === 'object' ? `${v.from}-${v.to}` : String(v); }).join('|');
export const sameRules = (a: TradingRules, b: TradingRules) => ruleSig(a) === ruleSig(b);

/** "Last 90 days: you broke this 14 times · −$1,230". */
export function previewLine(row: RulePreviewRow | undefined, days: number, key: RuleKey): string {
  if (!row) return '';
  if (key === 'maxRiskPct' && row.checked === 0) return 'Needs a stop at entry on your trades to check';
  if (row.n === 0) return `Last ${days} days: kept every time`;
  const a = Math.abs(Math.round(row.net));
  const money = `${row.net < 0 ? '−' : row.net > 0 ? '+' : ''}$${a.toLocaleString('en-US')}`;
  return `Last ${days} days: you broke this ${row.n} time${row.n === 1 ? '' : 's'} · ${money}`;
}

// ── shared hook (one fetch per page load, shared by every user of it) ──

type State = { status: 'loading' } | { status: 'ready'; prefs: TradingPrefsDTO } | { status: 'error'; error: string };
let shared: State = { status: 'loading' };
let inflight: Promise<void> | null = null;
const subs = new Set<(s: State) => void>();
const emit = (s: State) => { shared = s; subs.forEach(f => f(s)); };
function load(force = false) {
  if (inflight && !force) return inflight;
  inflight = prefsApi.get().then(p => emit({ status: 'ready', prefs: p }), e => emit({ status: 'error', error: e instanceof Error ? e.message : 'Could not load settings' }));
  return inflight;
}

export interface SaveResult { ok: boolean; local?: boolean; error?: string }

export function useTradingPrefs() {
  const [state, setState] = useState<State>(shared);
  useEffect(() => {
    subs.add(setState);
    if (!inflight) void load();
    else setState(shared);
    return () => { subs.delete(setState); };
  }, []);
  const save = useCallback(async (patch: TradingPrefsUpdate): Promise<SaveResult> => {
    try {
      const p = await prefsApi.put(patch);
      emit({ status: 'ready', prefs: p });
      return { ok: true };
    } catch (e) {
      if (isNotReady(e)) return { ok: false, local: true, error: e instanceof Error ? e.message : 'Settings storage isn’t ready yet' };
      return { ok: false, error: e instanceof Error ? e.message : 'Could not save' };
    }
  }, []);
  const reload = useCallback(() => load(true), []);
  return { state, prefs: state.status === 'ready' ? state.prefs : null, save, reload };
}

/** Test hook. */
export function _resetPrefsCache() { shared = { status: 'loading' }; inflight = null; subs.clear(); }

// ── layouts on this device (used while storage isn't ready) ──

export function readLocalLayouts(): TradingLayouts | null {
  try { const v = localStorage.getItem(LOCAL_LAYOUTS_KEY); return v ? (JSON.parse(v) as TradingLayouts) : null; } catch { return null; }
}
export function writeLocalLayouts(l: TradingLayouts): boolean {
  try { localStorage.setItem(LOCAL_LAYOUTS_KEY, JSON.stringify(l)); return true; } catch { return false; }
}
