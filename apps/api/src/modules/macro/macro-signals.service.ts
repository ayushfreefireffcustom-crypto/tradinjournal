// TradeAI signal compute + persist + gated read.
import { prisma } from '@tradinjournal/db';
import {
  ENGINE_VER,
  MACRO_ASSETS,
  computeSignal,
  scoreAll,
  type MacroAsset,
  type SignalResult,
} from '@tradinjournal/core';
import type { MacroSignalDto } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';
import { resolveAtrMap } from '../../lib/macro/atr.js';
import { toEngineInput } from '../../lib/macro/engine-input.js';

function toDto(
  row: {
    id: string;
    asset: string;
    direction: string;
    entryLow: { toNumber(): number } | number;
    entryHigh: { toNumber(): number } | number;
    stop: { toNumber(): number } | number;
    t1: { toNumber(): number } | number;
    t2: { toNumber(): number } | number;
    t3: { toNumber(): number } | number;
    confidence: number;
    rationale: string;
    invalidation: string;
    accountSize: { toNumber(): number } | number;
    qty: ({ toNumber(): number } | number) | null;
    asOf: Date;
    engineVer: string;
  },
): MacroSignalDto {
  const num = (v: { toNumber(): number } | number) => (typeof v === 'number' ? v : v.toNumber());
  return {
    id: row.id,
    asset: row.asset,
    direction: row.direction as MacroSignalDto['direction'],
    entryLow: num(row.entryLow),
    entryHigh: num(row.entryHigh),
    stop: num(row.stop),
    t1: num(row.t1),
    t2: num(row.t2),
    t3: num(row.t3),
    confidence: row.confidence,
    rationale: row.rationale,
    invalidation: row.invalidation,
    accountSize: num(row.accountSize),
    qty: row.qty == null ? null : num(row.qty),
    asOf: row.asOf.toISOString(),
    engineVer: row.engineVer,
  };
}

function trendFromChange(changePct: number | null | undefined): -1 | 0 | 1 {
  if (changePct == null || !Number.isFinite(changePct)) return 0;
  if (changePct > 0.15) return 1;
  if (changePct < -0.15) return -1;
  return 0;
}

/**
 * Compute signals for MVP assets from latest quotes + bias, persist rows.
 * Returns how many signals were written.
 */
export async function computeAndPersistSignals(args: {
  indicators: { key: string; value: number; prev: number | null }[];
  quotes: { symbol: string; price: number; changePct: number | null }[];
  asOf: Date;
}): Promise<{ written: number; signals: SignalResult[] }> {
  const prices: Partial<Record<MacroAsset, number>> = {};
  const changes: Partial<Record<MacroAsset, number | null>> = {};
  for (const q of args.quotes) {
    if ((MACRO_ASSETS as readonly string[]).includes(q.symbol)) {
      const a = q.symbol as MacroAsset;
      prices[a] = q.price;
      changes[a] = q.changePct;
    }
  }
  // DXY fallback from DTWEXBGS
  if (prices.DXY == null) {
    const dtw = args.indicators.find(i => i.key === 'DTWEXBGS');
    if (dtw) prices.DXY = dtw.value;
  }

  const atrMap = await resolveAtrMap(prices);
  const engineInput = toEngineInput(args.indicators, args.quotes);
  const biasList = scoreAll(engineInput);
  const biasByAsset = new Map(biasList.map(b => [b.asset, b]));

  const signals: SignalResult[] = [];
  let written = 0;

  for (const asset of MACRO_ASSETS) {
    const price = prices[asset];
    const atr = atrMap[asset];
    const bias = biasByAsset.get(asset);
    if (price == null || atr == null || !bias) continue;

    const signal = computeSignal({
      asset,
      price,
      atr,
      bias,
      trend: trendFromChange(changes[asset]),
    });
    signals.push(signal);

    try {
      await prisma.macroSignal.create({
        data: {
          asset: signal.asset,
          direction: signal.direction,
          entryLow: signal.entryLow,
          entryHigh: signal.entryHigh,
          stop: signal.stop,
          t1: signal.t1,
          t2: signal.t2,
          t3: signal.t3,
          confidence: signal.confidence,
          rationale: signal.rationale,
          invalidation: signal.invalidation,
          accountSize: signal.accountSize,
          qty: signal.qty,
          asOf: args.asOf,
          engineVer: ENGINE_VER,
        },
      });
      written += 1;
    } catch (err) {
      logger.warn(`[macro] signal persist failed ${asset}: ${(err as Error).message}`);
    }
  }

  return { written, signals };
}

/** Latest signal per asset (for gated GET /api/macro/signals). */
export async function listLatestSignals(): Promise<MacroSignalDto[]> {
  // DISTINCT ON (asset) → latest signal per asset regardless of history size
  // (a plain take+dedup would drop later assets once history grew past the limit).
  const rows = await prisma.macroSignal.findMany({
    distinct: ['asset'],
    orderBy: [{ asset: 'asc' }, { asOf: 'desc' }],
    take: 40,
  });
  const seen = new Set<string>();
  const out: MacroSignalDto[] = [];
  for (const r of rows) {
    if (seen.has(r.asset)) continue;
    seen.add(r.asset);
    out.push(toDto(r));
  }
  return out;
}
