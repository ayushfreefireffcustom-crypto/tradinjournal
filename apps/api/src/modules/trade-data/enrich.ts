// Per-position extras for the insights pages, from trade_level, trade_excursion,
// a stored Trade.rMultiple and the value per point. Pure.
//
//   risk$ = |entry − stop at entry| × volume × value per point
//   r     = net ÷ risk$   (closed positions; stop on the losing side of entry)
//   A stored R-multiple (Trade table) is used when there's no stop to measure,
//   and stored TradeMetric MAE/MFE when no excursion was computed.
//   MAE / MFE in money = price distance × volume × value per point.
import type { Trade } from '@tradinjournal/types';
import type { LevelSource, StopMove } from '@tradinjournal/contracts';
import { stopAtEntry, stopMove, targetAtEntry, type LevelRow } from './levels.js';
import { excursionMoney } from './excursion.js';
import type { PointValue } from './point-value.js';
import type { ExcursionRow } from './store.js';

export interface TradeExtra {
  r: number | null;
  rFrom: 'stop' | 'stored' | null;
  /** Money at risk to the stop at entry. */
  risk: number | null;
  stop: number | null;
  stopSource: LevelSource | null;
  target: number | null;
  move: StopMove | null;
  /** Money (≥ 0); null without candles or a value per point. */
  mae: number | null;
  mfe: number | null;
}

const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/** Money at risk to `stop`; null when the stop isn't on the losing side or nothing is known. */
export function riskTo(side: 'LONG' | 'SHORT', entry: number, stop: number, volume: number, pv: number | null): number | null {
  if (pv == null || !(volume > 0) || !(entry > 0) || !(stop > 0)) return null;
  const dist = side === 'LONG' ? entry - stop : stop - entry;
  if (!(dist > 0)) return null;
  const v = dist * volume * pv;
  return v >= 0.01 ? round(v, 2) : null;
}

export interface EnrichInput {
  positions: Trade[];
  levels: Map<string, LevelRow[]>;
  excursions: Map<string, ExcursionRow>;
  /** Stored R-multiple and MAE/MFE (Trade / TradeMetric rows) by position id. */
  stored: Map<string, { r: number | null; mae: number | null; mfe: number | null }>;
  pointValues: Map<string, PointValue>;
}

export function enrichPositions(i: EnrichInput): Map<string, TradeExtra> {
  const out = new Map<string, TradeExtra>();
  for (const t of i.positions) {
    const rows = i.levels.get(t.positionId) ?? [];
    const stopRow = stopAtEntry(rows);
    const targetRow = targetAtEntry(rows);
    const pv = i.pointValues.get(t.positionId)?.value ?? null;
    const closed = t.status === 'CLOSED' && !!t.closeTime;
    const risk = stopRow ? riskTo(t.direction, t.entryPrice, stopRow.sl!, t.volume, pv) : null;
    let r: number | null = null;
    let rFrom: TradeExtra['rFrom'] = null;
    if (closed && risk != null) { r = round(t.netPnl / risk, 4); rFrom = 'stop'; }
    else if (closed) {
      const s = i.stored.get(t.positionId)?.r;
      if (s != null && Number.isFinite(s)) { r = s; rFrom = 'stored'; }
    }
    const x = closed ? i.excursions.get(t.positionId) : undefined;
    const st = closed ? i.stored.get(t.positionId) : undefined;
    const mae = x ? (x.maeMoney ?? excursionMoney(x.maePrice, t.volume, pv)) : (st?.mae ?? null);
    const mfe = x ? (x.mfeMoney ?? excursionMoney(x.mfePrice, t.volume, pv)) : (st?.mfe ?? null);
    out.set(t.positionId, {
      r, rFrom, risk,
      stop: stopRow?.sl ?? null, stopSource: stopRow?.source ?? null, target: targetRow?.tp ?? null,
      move: stopMove(rows, t.direction),
      mae: mae == null || mfe == null ? null : Math.abs(mae), mfe: mae == null || mfe == null ? null : Math.abs(mfe),
    });
  }
  return out;
}
