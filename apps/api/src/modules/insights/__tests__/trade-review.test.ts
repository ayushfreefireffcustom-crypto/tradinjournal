import { describe, expect, it } from 'vitest';
import type { Deal, Trade } from '@tradinjournal/types';
import { grade, baseline, tradeContext } from '../compute.js';
import {
  balanceAt, computeTradeReview, dayPlace, exitFromDeals, navFor, pointValueFor, riskFromR, similarTrades, toInsight,
  tradePointValue, whatIfRows,
} from '../trade-review.js';

const H = 3_600_000, D = 86_400_000, M = 60_000;
const MON = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026 00:00 UTC
let seq = 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function deal(p: Partial<Deal> & { entry: Deal['entry']; dealTime: string }): Deal {
  return { dealTicket: String(++seq), orderTicket: '', positionId: '', symbol: 'XAUUSD', type: 'BUY', volume: '1', price: '0', profit: '0', commission: '0', swap: '0', fee: '0', comment: '', ...p };
}

/** A position with the P&L consistent with 100 $/point/lot (gold). */
function pos(p: { open: number; hold?: number; net?: number; side?: 'LONG' | 'SHORT'; symbol?: string; volume?: number; entry?: number; open_?: boolean; comment?: string }): Trade {
  const id = String(++seq);
  const side = p.side ?? 'LONG', vol = p.volume ?? 1, entry = p.entry ?? 2000, net = p.net ?? 10;
  const pv = (p.symbol ?? 'XAUUSD') === 'XAUUSD' ? 100 : 1;
  const exit = entry + (side === 'LONG' ? 1 : -1) * (net / (vol * pv));
  const close = p.open + (p.hold ?? 30 * M);
  const sym = p.symbol ?? 'XAUUSD';
  const inD = deal({ positionId: id, symbol: sym, type: side === 'LONG' ? 'BUY' : 'SELL', entry: 'IN', dealTime: iso(p.open), price: String(entry), volume: String(vol) });
  const outD = deal({ positionId: id, symbol: sym, type: side === 'LONG' ? 'SELL' : 'BUY', entry: 'OUT', dealTime: iso(close), price: String(exit), volume: String(vol), profit: String(net), comment: p.comment ?? '' });
  return {
    positionId: id, symbol: sym, direction: side, status: p.open_ ? 'OPEN' : 'CLOSED', openTime: iso(p.open), closeTime: p.open_ ? null : iso(close),
    entryPrice: entry, exitPrice: p.open_ ? null : exit, volume: vol, grossPnl: p.open_ ? 0 : net, commission: 0, swap: 0, netPnl: p.open_ ? 0 : net,
    durationSecs: p.open_ ? null : Math.round((close - p.open) / 1000), deals: p.open_ ? [inD] : [inD, outD],
  };
}

/** 24 ordinary trades over two weeks, profitable at 08:00, losing at 15:00 UTC. */
function history(): Trade[] {
  const out: Trade[] = [];
  for (let d = 0; d < 12; d++) {
    out.push(pos({ open: MON + d * D + 8 * H, net: 40 }));
    out.push(pos({ open: MON + d * D + 15 * H, net: -30 }));
  }
  return out;
}

describe('levels and point value', () => {
  it('reads how the position closed from the broker comment', () => {
    const t = pos({ open: MON, comment: '[sl 1995.50]' });
    expect(exitFromDeals(t.deals)).toEqual({ reason: 'sl', level: 1995.5 });
    expect(exitFromDeals(pos({ open: MON, comment: '[tp 2010]' }).deals)).toEqual({ reason: 'tp', level: 2010 });
    expect(exitFromDeals(pos({ open: MON, comment: 'so: 48.1%/2000.0/4100.2' }).deals)).toEqual({ reason: 'stopout', level: null });
    expect(exitFromDeals(pos({ open: MON, comment: 'closed by hand' }).deals)).toEqual({ reason: null, level: null });
  });
  it('point value comes from the trade itself, else agreeing trades on the symbol', () => {
    const t = pos({ open: MON, net: 250, volume: 0.5 });
    expect(tradePointValue(t)).toBeCloseTo(100, 6);
    const open = pos({ open: MON + D, open_: true });
    expect(pointValueFor(open, [open, t, pos({ open: MON + 2 * D, net: -80 })])).toEqual({ value: 100, source: 'symbol' });
    expect(pointValueFor(open, [open, t])).toBeNull(); // one trade isn't enough
  });
  it('risk and stop only from a stored R', () => {
    const t = pos({ open: MON, net: -500, volume: 2, side: 'SHORT', entry: 2000 });
    expect(riskFromR(t, null, 100)).toEqual({ risk: null, stop: null });
    const r = riskFromR(t, -1.25, 100);
    expect(r.risk).toEqual({ r: -1.25, amount: 400 });
    expect(r.stop).toBeCloseTo(2002, 6); // short: stop above entry by 400 / (2 lots × 100)
  });
});

describe('navigation, day and balance', () => {
  it('orders like the trade log (open first, newest close first)', () => {
    const a = pos({ open: MON }), b = pos({ open: MON + H }), o = pos({ open: MON + 2 * H, open_: true });
    expect(navFor([a, b, o], b.positionId).newer?.positionId).toBe(o.positionId);
    expect(navFor([a, b, o], b.positionId).older?.positionId).toBe(a.positionId);
    expect(navFor([a, b, o], o.positionId).newer).toBeNull();
  });
  it('places the trade in its UTC day', () => {
    const a = pos({ open: MON + 8 * H, net: -20 }), b = pos({ open: MON + 9 * H, net: 50 }), c = pos({ open: MON + D });
    expect(dayPlace([c, b, a], b)).toEqual({ index: 2, count: 2, net: 30 });
  });
  it('balance at open = deposits + closed P&L before it', () => {
    const closed = [toInsight(pos({ open: MON, net: 100 })), toInsight(pos({ open: MON + D, net: -40 }))];
    expect(balanceAt([{ t: MON - D, amount: 1000 }], closed, MON + 2 * D)).toBe(1060);
    expect(balanceAt([], closed, MON + 2 * D)).toBeNull();
  });
});

describe('grade and flags (same rules as the dashboard)', () => {
  it('matches compute.grade for a closed trade and explains each flag', () => {
    const hist = history();
    const l1 = pos({ open: MON + 13 * D + 9 * H, net: -30 });
    const l2 = pos({ open: MON + 13 * D + 10 * H, net: -30 });
    const t = pos({ open: MON + 13 * D + 15 * H, net: -90, volume: 3 }); // after 2 losses, 3× size, losing hour
    const positions = [...hist, l1, l2, t];
    const r = computeTradeReview({ now: MON + 20 * D, positions, positionId: t.positionId, storedR: null, cash: [{ t: MON - D, amount: 5000 }] })!;
    const closed = positions.map(p => toInsight(p)).sort((a, b) => a.close - b.close);
    const want = grade(closed.find(c => c.id === t.positionId)!, tradeContext(closed).get(t.positionId), baseline(closed));
    expect(r.grade!.grade).toBe(want.grade);
    expect(r.grade!.grade).toBe('D');
    expect(r.grade!.flags.map(f => f.key)).toEqual(['after-losses', 'oversized', 'losing-hour']);
    expect(r.grade!.flags[0]!.label).toBe('After 2 losses');
    expect(r.grade!.flags[1]!.label).toBe('3.0× size');
    expect(r.grade!.flags[2]!.label).toBe('Losing hour · 15:00');
    expect(r.grade!.checks).toEqual({ discipline: false, risk: false, timing: false });
    expect(r.session).toBe('NY');
    expect(r.day).toEqual({ index: 3, count: 3, net: -150 });
    expect(r.balanceAtOpen).toBe(5000 + 12 * 10 - 60);
    // What I would have done: usual size (1 lot) and skipping it.
    expect(r.whatIf).toEqual([
      { key: 'actual', label: 'You', net: -90, delta: 0, note: expect.any(String) },
      { key: 'normal-size', label: 'Usual size', net: -30, delta: 60, note: expect.any(String) },
      { key: 'skip', label: 'Skipped', net: 0, delta: 90, note: expect.any(String) },
    ]);
  });
  it('no grade, no skip row below 20 closed trades', () => {
    const ts = [pos({ open: MON, net: -10 }), pos({ open: MON + H, net: 5 })];
    const r = computeTradeReview({ now: MON + D, positions: ts, positionId: ts[1]!.positionId, storedR: null, cash: [] })!;
    expect(r.grade).toBeNull();
    expect(r.whatIf.map(w => w.key)).toEqual(['actual']);
    expect(r.closedTrades).toBe(2);
  });
  it('open positions get pre-entry flags but no what-if', () => {
    const hist = history();
    const o = pos({ open: MON + 13 * D + 15 * H + 5 * M, open_: true, volume: 1 });
    const r = computeTradeReview({ now: MON + 13 * D + 16 * H, positions: [...hist, o], positionId: o.positionId, storedR: null, cash: [] })!;
    expect(r.trade.status).toBe('OPEN');
    expect(r.grade!.flags.map(f => f.key)).toEqual(['losing-hour']);
    expect(r.whatIf).toEqual([]);
    expect(r.exitReason).toBeNull();
  });
  it('a clean trade grades A and offers no skip', () => {
    const hist = history();
    const t = pos({ open: MON + 13 * D + 8 * H, net: 40 });
    const r = computeTradeReview({ now: MON + 20 * D, positions: [...hist, t], positionId: t.positionId, storedR: null, cash: [] })!;
    expect(r.grade!.grade).toBe('A');
    expect(r.grade!.flags).toEqual([]);
    expect(whatIfRows(hist[0]!, [], null).map(w => w.key)).toEqual(['actual']);
  });
  it('unknown position → null', () => {
    expect(computeTradeReview({ now: MON, positions: history(), positionId: 'nope', storedR: null, cash: [] })).toBeNull();
  });
});

describe('similar trades and same setup', () => {
  it('relaxes from flags to session to symbol + side', () => {
    const hist = history();
    const t = pos({ open: MON + 13 * D + 15 * H, net: -30 });
    const closed = [...hist, t].map(p => toInsight(p)).sort((a, b) => a.close - b.close);
    const me = closed.find(c => c.id === t.positionId)!;
    const s = similarTrades(me, ['losing-hour'], closed, tradeContext(closed), baseline(closed))!;
    expect(s.criteria).toEqual(['XAUUSD', 'Longs', 'NY session', 'Losing hour']);
    expect(s.n).toBe(12);
    expect(s.wins).toBe(0);
    expect(s.net).toBe(-360);
    expect(s.trades).toHaveLength(12);
    expect(s.trades[0]!.openTime < s.trades[11]!.openTime).toBe(true);
    // Shorts: none on file → null; one trade on a fresh symbol → symbol + side.
    const sh = toInsight(pos({ open: MON + 14 * D, side: 'SHORT' }));
    expect(similarTrades(sh, [], [...closed, sh], tradeContext([...closed, sh]), null)).toBeNull();
  });
  it('same symbol and side by UTC hour', () => {
    const hist = history();
    const t = pos({ open: MON + 13 * D + 15 * H + 30 * M, net: -30 });
    const r = computeTradeReview({ now: MON + 20 * D, positions: [...hist, t], positionId: t.positionId, storedR: null, cash: [] })!;
    expect(r.sameSetup!.points).toHaveLength(24);
    expect(r.sameSetup!.hour).toBe(15.5);
    expect(r.sameSetup!.inHour).toEqual({ n: 12, wins: 0, net: -360 });
    expect(r.sameSetup!.other).toEqual({ n: 12, wins: 12, net: 480 });
    expect(r.holdMedianSec).toBe(1800);
    expect(r.pointValue).toEqual({ value: 100, source: 'trade' });
  });
});
