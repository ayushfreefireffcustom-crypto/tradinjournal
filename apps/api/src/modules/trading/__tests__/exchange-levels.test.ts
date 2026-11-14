// Stops, targets and R for exchange round trips (pure parts).
import { describe, expect, it } from 'vitest';
import type { HistoricalOrder, OrderInfo } from '@tradinjournal/exchange';
import { GRACE_MS, historyRows, levelsForTrips, protectiveOf, snapshotOf, tripLevels, type ExchangeLevelRow, type TripWindow } from '../exchange-levels.js';
import { changed } from '../../trade-data/levels.js';

const T0 = Date.UTC(2026, 10, 1, 12, 0);
const MIN = 60_000;
const at = (m: number) => new Date(T0 + m * MIN);
let n = 0;
const row = (min: number, sl: number | null, tp: number | null = null, source: ExchangeLevelRow['source'] = 'exchange', symbol = 'BTCUSD'): ExchangeLevelRow =>
  ({ id: `r${++n}`, symbol, sl, tp, trail: null, source, observedAt: T0 + min * MIN });
const trip = (key: string, open: number, close: number, symbol = 'BTCUSD'): TripWindow => ({ key, symbol, openedAt: at(open), closedAt: at(close) });
const ids = (m: Map<string, ExchangeLevelRow[]>, k: string) => (m.get(k) ?? []).map((r) => r.sl ?? r.tp);

describe('matching level rows to round trips', () => {
  it('takes rows inside [openedAt − grace, closedAt] of the same symbol', () => {
    const m = levelsForTrips([trip('a', 0, 30), trip('e', 0, 30, 'ETHUSD')], [
      row(-2, 1), // 2 min before the entry: outside the 60 s grace
      { ...row(0, 2), observedAt: T0 - 30_000 }, // 30 s before: inside the grace
      row(10, 3),
      row(30, 4), // exactly at the close
      row(31, 5), // after the close: never counts
      row(10, 6, null, 'order', 'ETHUSD'),
    ]);
    expect(ids(m, 'a')).toEqual([2, 3, 4]);
    expect(ids(m, 'e')).toEqual([6]);
    expect(GRACE_MS).toBe(60_000);
  });

  it('gives a row in one trip and the next one’s grace to the earlier trip', () => {
    // a: 0–10, b opens 30 s after a closes; c opens far later.
    const m = levelsForTrips([trip('b', 10.5, 20), trip('a', 0, 10), trip('c', 100, 120)], [
      { ...row(0, 1), observedAt: T0 + 10 * MIN - 5_000 }, // inside a, and inside b's grace → a
      { ...row(0, 2), observedAt: T0 + 10 * MIN + 10_000 }, // after a closed, in b's grace → b
      row(50, 3), // between trips: nobody's
    ]);
    expect(ids(m, 'a')).toEqual([1]);
    expect(ids(m, 'b')).toEqual([2]);
    expect(m.get('c')).toBeUndefined();
  });

  it('ignores a stopless snapshot right before the close (the stop just triggered)', () => {
    const m = levelsForTrips([trip('a', 0, 30)], [row(1, 69_000), { ...row(0, null), observedAt: T0 + 30 * MIN - 3_000 }, row(20, null)]);
    expect(m.get('a')!.map((r) => r.sl)).toEqual([69_000, null]); // the one 10 min earlier is a real removal
  });
});

describe('trip levels, risk and R', () => {
  const long = { side: 'LONG' as const, avgEntry: 70_000, qty: 3, pnlUsd: 6 };
  it('measures risk with peak contracts × contract value and R against pnlUsd', () => {
    // 1000 points × 3 contracts × 0.001 BTC = $3 at risk; +$6 = +2R.
    const x = tripLevels([row(0, 69_000, 72_000)], long, 0.001);
    expect(x).toEqual({ stop: 69_000, stopSource: 'exchange', target: 72_000, move: null, risk: 3, r: 2 });
    expect(tripLevels([row(0, 71_000, null, 'order')], { side: 'SHORT', avgEntry: 70_000, qty: 10, pnlUsd: -1.5 }, 0.001)).toMatchObject({ risk: 10, r: -0.15, stopSource: 'order' });
  });

  it('has no R without a contract value or with a stop on the wrong side', () => {
    expect(tripLevels([row(0, 69_000)], long, null)).toMatchObject({ stop: 69_000, risk: null, r: null });
    expect(tripLevels([row(0, 71_000)], long, 0.001)).toMatchObject({ stop: 71_000, risk: null, r: null });
    expect(tripLevels([], long, 0.001)).toEqual({ stop: null, stopSource: null, target: null, move: null, risk: null, r: null });
  });

  it('reads widened / tightened / removed like MT5 levels', () => {
    expect(tripLevels([row(0, 69_000), row(5, 68_000)], long, 0.001).move).toBe('widened');
    expect(tripLevels([row(0, 69_000), row(5, 69_500)], long, 0.001).move).toBe('tightened');
    expect(tripLevels([row(0, 69_000), row(5, null)], long, 0.001).move).toBe('widened'); // snapshot without a stop
    expect(tripLevels([row(0, 69_000, null, 'order'), row(5, null, 72_000, 'order')], long, 0.001).move).toBeNull(); // a target-only order says nothing about the stop
    // R stays against the stop at entry, not the moved one.
    expect(tripLevels([row(0, 69_000), row(5, 69_500)], long, 0.001).risk).toBe(3);
  });
});

describe('snapshots of live protection', () => {
  const o = (over: Partial<OrderInfo>): OrderInfo => ({ exchangeOrderId: 'x', clientOrderId: null, symbol: 'BTCUSD', side: 'SELL', type: 'STOP_MARKET', status: 'PENDING', qty: 2, filledQty: 0, avgFillPrice: null, limitPrice: null, stopPrice: 69_000, trailAmount: null, reduceOnly: true, createdAt: null, ...over });

  it('keeps reduce-only stops and targets only', () => {
    expect(protectiveOf(o({}))).toMatchObject({ kind: 'SL', price: 69_000, qty: 2 });
    expect(protectiveOf(o({ type: 'TAKE_PROFIT_LIMIT', stopPrice: null, limitPrice: 72_000 }))).toMatchObject({ kind: 'TP', price: 72_000 });
    expect(protectiveOf(o({ reduceOnly: false }))).toBeNull(); // a stop entry
    expect(protectiveOf(o({ type: 'LIMIT' }))).toBeNull();
  });

  it('takes the order covering the most contracts, and starts a trailing stop at mark ∓ trail', () => {
    const prot = [o({ exchangeOrderId: 's1', qty: 1, stopPrice: 69_500 }), o({ exchangeOrderId: 's2', qty: 3, stopPrice: 69_000 }), o({ exchangeOrderId: 't', type: 'TAKE_PROFIT_MARKET', stopPrice: 72_000 })].map((x) => protectiveOf(x)!);
    expect(snapshotOf(prot, 'LONG', 70_000)).toEqual({ sl: 69_000, tp: 72_000, trail: null, exchangeOrderId: 's2' });
    const trail = [protectiveOf(o({ stopPrice: null, trailAmount: 250 }))!];
    expect(snapshotOf(trail, 'LONG', 70_000)).toMatchObject({ sl: 69_750, trail: 250 });
    expect(snapshotOf(trail, 'SHORT', 70_000)).toMatchObject({ sl: 70_250, trail: 250 });
    expect(snapshotOf(trail, 'LONG', null)).toMatchObject({ sl: null, trail: 250 });
    expect(snapshotOf([], 'LONG', 70_000)).toEqual({ sl: null, tp: null, trail: null, exchangeOrderId: null });
  });

  it('dedupes a repeated snapshot against the latest row', () => {
    expect(changed({ sl: 69_000, tp: 72_000 }, { sl: 69_000, tp: 72_000 })).toBe(false);
    expect(changed({ sl: 69_000, tp: 72_000 }, { sl: 69_000, tp: null })).toBe(true);
    expect(changed(null, { sl: null, tp: null })).toBe(false); // nothing to say
  });
});

describe('order history rows', () => {
  const h = (over: Partial<HistoricalOrder>): HistoricalOrder => ({
    exchangeOrderId: '1', clientOrderId: null, symbol: 'BTCUSD', side: 'SELL', type: 'STOP_MARKET', status: 'CANCELLED', qty: 2, filledQty: 0, avgFillPrice: null,
    limitPrice: null, stopPrice: 69_000, trailAmount: null, reduceOnly: true, createdAt: at(5), bracketStopLoss: null, bracketTakeProfit: null, bracketTrailAmount: null, bracketOrder: false, ...over,
  });

  it('one row per stop / target order at its creation time', () => {
    const rows = historyRows([
      h({}),
      h({ exchangeOrderId: '2', type: 'TAKE_PROFIT_MARKET', stopPrice: 72_000, status: 'FILLED' }),
      h({ exchangeOrderId: '3', reduceOnly: false, bracketOrder: true }), // a bracket child
      h({ exchangeOrderId: '4', createdAt: null }),
    ]);
    expect(rows.map((r) => [r.exchangeOrderId, r.sl, r.tp, r.trail, r.source, r.observedAt.toISOString()])).toEqual([
      ['1', 69_000, null, null, 'order', at(5).toISOString()],
      ['2', null, 72_000, null, 'order', at(5).toISOString()],
      ['3', 69_000, null, null, 'order', at(5).toISOString()],
    ]);
  });

  it('a stop entry counts only for its bracket; a trailing stop keeps only its trail', () => {
    const rows = historyRows([
      h({ exchangeOrderId: 'entry', reduceOnly: false, side: 'BUY', stopPrice: 71_000, bracketStopLoss: 70_000, bracketTakeProfit: 74_000 }),
      h({ exchangeOrderId: 'plain-entry', reduceOnly: false, side: 'BUY', stopPrice: 71_000 }),
      h({ exchangeOrderId: 'trail', stopPrice: 69_800, trailAmount: 200 }),
      h({ exchangeOrderId: 'btrail', type: 'LIMIT', reduceOnly: false, stopPrice: null, bracketStopLoss: 69_000, bracketTrailAmount: 300 }),
    ]);
    expect(rows.map((r) => [r.exchangeOrderId, r.sl, r.tp, r.trail])).toEqual([
      ['entry', 70_000, 74_000, null],
      ['trail', null, null, 200],
      ['btrail', null, null, 300],
    ]);
  });
});
