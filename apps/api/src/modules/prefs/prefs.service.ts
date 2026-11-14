// Trading prefs: the trader's own rules, risk cap and saved dashboard layouts
// (one trading_prefs row per user). Until the 20261114130000_trading_data
// migration is applied the table doesn't exist: reads return the defaults with
// persisted:false and writes fail with a calm 503, logged once per process.
//
// Stored shape (schema.prisma comment): rules are flat
//   { maxTradesPerDay?, hoursFrom?, hoursTo?, maxRiskPct?, stopAfterLosses?, dailyLossCapPct?, maxSizeX? }
// and the API exposes tradingHours as { from, to }. Layouts are stored as the
// API sends them ({ dashboard: { tabs: [...] } }).
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import {
  DEFAULT_RISK_CAP_PCT, tradingLayoutsSchema, tradingRulesSchema,
  type TradingLayouts, type TradingPrefsDTO, type TradingPrefsUpdate, type TradingRules,
} from '@tradinjournal/contracts';
import { AppError } from '../../http/errors.js';

/** Prisma "table/column does not exist" (migration not applied yet). */
export const storageMissing = (err: unknown) => {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2021' || code === 'P2022';
};
let warned = false;
function warnOnce(err: unknown) {
  if (warned) return;
  warned = true;
  logger.warn(`trading_prefs unavailable (migration not applied?): ${(err as Error).message?.split('\n')[0] ?? err}`);
}

export const EMPTY_RULES: TradingRules = {
  maxTradesPerDay: null, tradingHours: null, maxRiskPct: null, stopAfterLosses: null, dailyLossCapPct: null, maxSizeX: null,
};

/** Every rule key present (null = off), invalid stored values dropped. */
export function normalizeRules(r: TradingRules | null | undefined): TradingRules {
  const out: TradingRules = { ...EMPTY_RULES };
  if (!r) return out;
  for (const k of Object.keys(EMPTY_RULES) as Array<keyof TradingRules>) {
    const one = tradingRulesSchema.safeParse({ [k]: r[k] ?? null });
    if (one.success) (out as Record<string, unknown>)[k] = one.data[k] ?? null;
  }
  return out;
}

/** DB JSON → API rules. Tolerates junk (drops what doesn't validate). */
export function rulesFromDb(json: unknown): TradingRules {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  const from = s(j.hoursFrom), to = s(j.hoursTo);
  return normalizeRules({
    maxTradesPerDay: n(j.maxTradesPerDay), tradingHours: from && to ? { from, to } : null, maxRiskPct: n(j.maxRiskPct),
    stopAfterLosses: n(j.stopAfterLosses), dailyLossCapPct: n(j.dailyLossCapPct), maxSizeX: n(j.maxSizeX),
  });
}

/** API rules → DB JSON (only the rules that are on). */
export function rulesToDb(r: TradingRules): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  if (r.maxTradesPerDay != null) out.maxTradesPerDay = r.maxTradesPerDay;
  if (r.tradingHours) { out.hoursFrom = r.tradingHours.from; out.hoursTo = r.tradingHours.to; }
  if (r.maxRiskPct != null) out.maxRiskPct = r.maxRiskPct;
  if (r.stopAfterLosses != null) out.stopAfterLosses = r.stopAfterLosses;
  if (r.dailyLossCapPct != null) out.dailyLossCapPct = r.dailyLossCapPct;
  if (r.maxSizeX != null) out.maxSizeX = r.maxSizeX;
  return out;
}

export function layoutsFromDb(json: unknown): TradingLayouts {
  const p = tradingLayoutsSchema.safeParse(json ?? {});
  return p.success ? p.data : {};
}

function capFromDb(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x * 1000) / 1000 : DEFAULT_RISK_CAP_PCT;
}

export const defaultPrefs = (persisted: boolean): TradingPrefsDTO => ({
  rules: { ...EMPTY_RULES }, riskCapPct: DEFAULT_RISK_CAP_PCT, layouts: {}, persisted, updatedAt: null,
});

type Row = { rules: unknown; riskCapPct: unknown; layouts: unknown; updatedAt: Date };
const toDto = (row: Row): TradingPrefsDTO => ({
  rules: rulesFromDb(row.rules), riskCapPct: capFromDb(row.riskCapPct), layouts: layoutsFromDb(row.layouts), persisted: true, updatedAt: row.updatedAt.toISOString(),
});

export async function getPrefs(userId: string): Promise<TradingPrefsDTO> {
  try {
    const row = await prisma.tradingPrefs.findUnique({ where: { userId } });
    return row ? toDto(row) : defaultPrefs(true);
  } catch (err) {
    if (!storageMissing(err)) throw err;
    warnOnce(err);
    return defaultPrefs(false);
  }
}

export async function updatePrefs(userId: string, input: TradingPrefsUpdate): Promise<TradingPrefsDTO> {
  const data: { rules?: Record<string, number | string>; riskCapPct?: number; layouts?: TradingLayouts } = {};
  if (input.rules !== undefined) data.rules = rulesToDb(normalizeRules(input.rules));
  if (input.riskCapPct !== undefined) data.riskCapPct = input.riskCapPct;
  if (input.layouts !== undefined) data.layouts = input.layouts;
  try {
    const row = await prisma.tradingPrefs.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    rulesCache.delete(userId);
    return toDto(row);
  } catch (err) {
    if (!storageMissing(err)) throw err;
    warnOnce(err);
    throw new AppError(503, 'PREFS_NOT_READY', "Settings storage isn't ready yet");
  }
}

// ── rules for the insights compute (read on every dashboard/analytics/log call) ──

const RULES_TTL_MS = 30_000;
const rulesCache = new Map<string, { at: number; rules: TradingRules | null }>();

/** The user's rules, or null when none are set or storage isn't ready. Never throws. */
export async function rulesFor(userId: string): Promise<TradingRules | null> {
  const hit = rulesCache.get(userId);
  if (hit && Date.now() - hit.at < RULES_TTL_MS) return hit.rules;
  let rules: TradingRules | null = null;
  try {
    const row = await prisma.tradingPrefs.findUnique({ where: { userId }, select: { rules: true } });
    const r = row ? rulesFromDb(row.rules) : null;
    rules = r && Object.values(r).some(v => v != null) ? r : null;
  } catch (err) {
    if (!storageMissing(err)) { logger.warn(`trading rules read failed: ${(err as Error).message}`); return null; }
    warnOnce(err);
    rules = null;
  }
  rulesCache.set(userId, { at: Date.now(), rules });
  if (rulesCache.size > 5000) rulesCache.delete(rulesCache.keys().next().value!);
  return rules;
}

/** Test hook. */
export function resetPrefsState(): void { rulesCache.clear(); warned = false; }
