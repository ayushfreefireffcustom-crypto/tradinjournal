import { describe, expect, it } from 'vitest';
import {
  afterTheExit, barAt, candleWhatIf, coversTrade, draftPrompt, excursion, noteFacts, reviewWindow, twoSentences, whatIfWord,
  type Bar, type TradeReviewDTO,
} from './trade-review-api';

const M = 60_000, H = 3_600_000;
const T0 = Date.UTC(2026, 10, 13, 14, 0); // Fri 13 Nov 14:00 UTC

/** 5-minute bars from a list of closes; high/low ±1 around open/close. */
function bars(closes: number[], start = T0, tf = 5 * M): Bar[] {
  return closes.map((c, i) => {
    const o = i ? closes[i - 1]! : c;
    return { openTime: start + i * tf, open: o, close: c, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1 };
  });
}

function review(p: Partial<TradeReviewDTO['trade']> = {}, extra: Partial<TradeReviewDTO> = {}): TradeReviewDTO {
  const trade: TradeReviewDTO['trade'] = {
    positionId: '1', symbol: 'NAS100', side: 'SHORT', status: 'CLOSED', openTime: new Date(T0 + 30 * M).toISOString(), closeTime: new Date(T0 + 90 * M).toISOString(),
    entry: 100, exit: 110, volume: 2, gross: -20, commission: -2, swap: 0, net: -22, durationSecs: 3600, deals: [], ...p,
  };
  return {
    asOf: '', trade, nav: { newer: null, older: null }, day: { index: 2, count: 3, net: -40 }, session: 'NY', balanceAtOpen: 10_000,
    size: { median: 1, ratio: 2, trades: 10 }, risk: null, stop: null, exitReason: null, exitLevel: null,
    pointValue: { value: 1, source: 'trade' }, holdMedianSec: null, grade: null, minTrades: 20, closedTrades: 40, whatIf: [], similar: null, sameSetup: null,
    ...extra,
  };
}

describe('review window', () => {
  it('uses 5-minute bars with context either side', () => {
    const w = reviewWindow(T0, T0 + 2 * H, T0 + 30 * 24 * H);
    expect(w.tf).toBe('5m');
    expect(w.from).toBeLessThanOrEqual(T0 - 75 * M);
    expect(w.to).toBe(T0 + 2 * H + 75 * M);
  });
  it('steps up the timeframe for long trades and stops at now for open ones', () => {
    expect(reviewWindow(T0, T0 + 3 * 24 * H, T0 + 30 * 24 * H).tf).toBe('1h');
    expect(reviewWindow(T0, T0 + 6 * 24 * H, T0 + 30 * 24 * H).tf).toBe('4h');
    const open = reviewWindow(T0, null, T0 + 2 * H);
    expect(open.to).toBe(T0 + 2 * H);
  });
  it('needs a bar holding the entry', () => {
    const b = bars([1, 2, 3, 4]);
    expect(coversTrade(b, T0 + 7 * M, 5 * M)).toBe(true);
    expect(coversTrade(b, T0 + 60 * M, 5 * M)).toBe(false);
    expect(coversTrade(b.slice(0, 2), T0, 5 * M)).toBe(false);
    expect(barAt(b, T0 + 12 * M)).toBe(2);
    expect(barAt(b, T0 - M)).toBe(-1);
  });
});

describe('excursion and after the exit', () => {
  // 14:00 … 15:55: price rises to 112 by 15:30 then falls to 90.
  const closes = [100, 100, 100, 100, 100, 100, 98, 96, 97, 101, 104, 108, 110, 112, 108, 100, 95, 90, 92, 91, 90, 90, 90, 90];
  const b = bars(closes);
  it('best and worst while open, in the trade\'s favour (short)', () => {
    const e = excursion({ side: 'SHORT', entry: 100, volume: 2 }, T0 + 30 * M, T0 + 60 * M, b, 5 * M, 1)!;
    expect(e.best).toBe(95); // 14:35 bar low (96 − 1)
    expect(e.bestMove).toBe(5);
    expect(e.bestMoney).toBe(10);
    expect(e.worst).toBe(111); // 15:00 bar high (108 → 110, +1)
    expect(e.worstMove).toBe(-11);
    expect(e.worstMoney).toBe(-22);
  });
  it('what price did after the exit', () => {
    const r = review({ closeTime: new Date(T0 + 65 * M).toISOString(), exit: 112 });
    const a = afterTheExit(r.trade, b, T0 + 24 * 5 * M, 1)!;
    expect(a.best).toBe(89); // lowest low after the exit
    expect(a.extra).toBe(23);
    expect(a.leftMoney).toBe(46);
    expect(afterTheExit({ ...r.trade, status: 'OPEN', closeTime: null, exit: null }, b, T0 + 2 * H, 1)).toBeNull();
  });
});

describe('candle what-ifs', () => {
  it('usual hold: exit where your median hold ended', () => {
    const b = bars([100, 100, 100, 100, 100, 100, 98, 96, 97, 101, 104, 108, 110, 112, 108, 100]);
    // Opened 14:30 (short, 100), held 60 min; usual hold 15 min → exit at the 14:45 bar close (97).
    const rows = candleWhatIf(review({}, { holdMedianSec: 900 }), b, 5 * M);
    expect(rows).toEqual([{ key: 'usual-hold', label: 'Held 15m', net: 4, delta: 26, note: expect.any(String) }]);
  });
  it('no usual-hold row when the hold was close to usual, or no point value', () => {
    const b = bars([100, 100, 100, 100, 100, 100, 98, 96, 97, 101, 104, 108, 110, 112, 108, 100]);
    expect(candleWhatIf(review({}, { holdMedianSec: 3300 }), b, 5 * M)).toEqual([]);
    expect(candleWhatIf(review({}, { holdMedianSec: 900, pointValue: null }), b, 5 * M)).toEqual([]);
    expect(candleWhatIf(review({ status: 'OPEN', closeTime: null, exit: null }, { holdMedianSec: 900 }), b, 5 * M)).toEqual([]);
  });
  it('+1R exit and break-even only with a known stop; stop first on a two-sided bar', () => {
    // Long at 100, stop 95 (1R = 5 → +1R at 105). Path: 100 → 106 → 99 → 94.
    const b = bars([100, 100, 100, 100, 100, 100, 103, 106, 102, 99, 96, 94, 94, 94, 94, 94]);
    const r = review({ side: 'LONG', entry: 100, exit: 94, gross: -12, commission: 0, net: -12, volume: 2, closeTime: new Date(T0 + 75 * M).toISOString() }, { stop: 95 });
    const rows = candleWhatIf(r, b, 5 * M);
    expect(rows.map(x => x.key)).toEqual(['exit-1r', 'be-after-1r']);
    expect(rows[0]!.net).toBe(10); // +5 × 2 lots
    expect(rows[1]!.net).toBe(0); // stopped at entry
    // A bar that spans both the stop and +1R reads as stopped.
    const wide: Bar[] = [{ openTime: T0 + 30 * M, open: 100, close: 100, high: 106, low: 94 }, ...bars([100, 100], T0 + 35 * M)];
    const r2 = candleWhatIf({ ...r, trade: { ...r.trade, net: -12 } }, wide, 5 * M);
    expect(r2[0]!.net).toBe(-10);
  });
});

describe('draft note', () => {
  it('lists only computed facts', () => {
    const r = review({}, {
      exitReason: 'sl',
      grade: { grade: 'D', basis: 40, checks: { discipline: false, risk: false, timing: false }, flags: [{ key: 'after-losses', label: 'After 2 losses', detail: '' }, { key: 'oversized', label: '2.0× size', detail: '' }] },
      similar: { criteria: ['NAS100', 'Shorts', 'NY session'], n: 5, wins: 1, net: -300, trades: [] },
    });
    const f = noteFacts(r, { price: v => v.toFixed(1) });
    expect(f).toContain('NAS100 short, opened Fri 13 Nov 14:30 UTC, 2 lots (2.0× my usual size), entry 100.0.');
    expect(f).toContain('Closed at 110.0 by the stop, net −$22.00, held 1h 00m.');
    expect(f).toContain('Trade 2 of 3 that day.');
    expect(f).toContain('Rules broken: After 2 losses; 2.0× size. Process grade D.');
    expect(f).toContain('Similar trades (NAS100, Shorts, NY session): 5, 1 won, net −$300.00.');
    expect(draftPrompt(f)).toContain('at most 2 short sentences');
  });
  it('keeps two sentences of plain text', () => {
    expect(twoSentences('**Shorted** NAS100 after two losses. Out at the stop. Next time wait.')).toBe('Shorted NAS100 after two losses. Out at the stop.');
    expect(twoSentences('- One line only')).toBe('One line only');
  });
});

describe('what-if wording', () => {
  it('more profit on a winner is "more", never "saves"', () => {
    expect(whatIfWord(4200, 1475)).toBe('more');
  });
  it('a smaller loss "saves"; turning a loss into a win is "more"; worse is "less"', () => {
    expect(whatIfWord(-300, 200)).toBe('saves');
    expect(whatIfWord(-300, 300)).toBe('saves');
    expect(whatIfWord(-300, 500)).toBe('more');
    expect(whatIfWord(4200, -800)).toBe('less');
  });
});
