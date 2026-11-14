import { describe, expect, it } from 'vitest';
import { answerTradeAsk, basisLabel, coachPrompt, parseTradeAsk, shortParagraph, TRADE_ASK_CHIPS } from './trade-ask';
import type { TradeReviewDTO } from './trade-review-api';

const T0 = Date.UTC(2026, 10, 13, 14, 0);
function review(extra: Partial<TradeReviewDTO> = {}, trade: Partial<TradeReviewDTO['trade']> = {}): TradeReviewDTO {
  return {
    asOf: '', nav: { newer: null, older: null }, day: { index: 2, count: 3, net: -40 }, session: 'NY', balanceAtOpen: 10_000,
    trade: { positionId: '1', symbol: 'XAUUSD', side: 'LONG', status: 'CLOSED', openTime: new Date(T0).toISOString(), closeTime: new Date(T0 + 3_600_000).toISOString(), entry: 2000, exit: 1998, volume: 0.8, gross: -160, commission: -4, swap: 0, net: -164, durationSecs: 3600, deals: [], ...trade },
    size: { median: 0.5, ratio: 1.6, trades: 12 }, risk: null, stop: null, exitReason: null, exitLevel: null, pointValue: { value: 100, source: 'trade' }, holdMedianSec: null,
    grade: { grade: 'C', basis: 40, checks: { discipline: false, risk: false, timing: true }, flags: [{ key: 'user-rule', label: 'Your rule · 3rd trade that day', detail: 'Max 2 trades a day: …' }, { key: 'oversized', label: '1.6× size', detail: '' }] },
    minTrades: 20, closedTrades: 40, whatIf: [{ key: 'actual', label: 'You', net: -164, delta: 0, note: '' }, { key: 'normal-size', label: 'Usual size', net: -102.5, delta: 61.5, note: '' }],
    similar: { criteria: ['XAUUSD', 'Longs', 'NY session'], n: 7, wins: 2, net: -310, trades: [] }, sameSetup: null, ...extra,
  };
}
const none = { after: null, candle: [] };

describe('parseTradeAsk', () => {
  it.each([
    ['Why was this graded C?', 'grade'], ['why a D', 'grade'], ['which rules did I break', 'grade'], ['Why this grade?', 'grade'],
    ['What if I held?', 'held'], ['should I have held longer', 'held'], ['did I exit too early', 'held'],
    ['Similar trades?', 'similar'], ['how do trades like this usually go', 'similar'],
    ['Was it oversized?', 'size'], ['was my position size too big', 'size'],
    ['How did I feel about the news?', null], ['', null],
  ])('%s → %s', (q, intent) => { expect(parseTradeAsk(q)).toBe(intent); });
  it('every chip maps to its own intent', () => { for (const c of TRADE_ASK_CHIPS) expect(parseTradeAsk(c.q)).toBe(c.intent); });
});

describe('answerTradeAsk', () => {
  it('grade: the flags, one step each, your rule included', () => {
    const a = answerTradeAsk('why graded C', review(), none, 'facts');
    expect(a).toMatchObject({ kind: 'answer', intent: 'grade', basis: 7 });
    expect(a.kind === 'answer' && a.text).toBe('Graded C: 2 flags, one step down each (Your rule · 3rd trade that day; 1.6× size). The grade is about process, not the result.');
    const clean = answerTradeAsk('grade?', review({ grade: { grade: 'A', basis: 40, checks: { discipline: true, risk: true, timing: true }, flags: [] } }), none, null);
    expect(clean.kind === 'answer' && clean.text).toMatch(/^Graded A: no rules broken/);
    const ungraded = answerTradeAsk('grade?', review({ grade: null, closedTrades: 12 }), none, null);
    expect(ungraded.kind === 'answer' && ungraded.text).toBe('Not graded yet: grades need 20 closed trades as the baseline, and this account has 12.');
  });
  it('held: after-exit run, saved and usual hold; honest when no data', () => {
    const a = answerTradeAsk('what if I held', review(), { after: { best: 2010, extra: 12, worst: 1990, adverse: -8, leftMoney: 960, savedMoney: 0 }, candle: [{ key: 'usual-hold', label: 'Usual hold', net: 40, delta: 204, note: '' }] }, null);
    expect(a.kind === 'answer' && a.text).toBe('After your exit price ran $960 further your way at best; exiting at your usual hold would have made +$40 (+$204 vs what you took). Read from market candles, so to bar precision.');
    expect((answerTradeAsk('held?', review(), none, null) as { text: string }).text).toBe('There’s no XAUUSD price data after the exit, so I can’t say what holding would have done.');
    expect((answerTradeAsk('held?', review(), { ...none, barsLoading: true }, null) as { text: string }).text).toMatch(/^Still loading/);
    expect((answerTradeAsk('held?', review({}, { status: 'OPEN', closeTime: null, exit: null }), none, null) as { text: string }).text).toMatch(/still open/);
    expect((answerTradeAsk('held?', review(), { after: { best: 0, extra: 0, worst: 0, adverse: 0, leftMoney: 0, savedMoney: 0 }, candle: [] }, null) as { text: string }).text).toMatch(/wouldn’t have changed much/);
  });
  it('similar and size', () => {
    expect((answerTradeAsk('similar trades?', review(), none, null) as { text: string }).text).toBe('7 similar trades (XAUUSD, Longs, NY session): 2 won (29%), net −$310. Skipping that setup would have kept the money.');
    expect((answerTradeAsk('similar', review({ similar: null }), none, null) as { text: string; basis: number })).toMatchObject({ basis: 0, text: 'No similar trades yet: nothing else on XAUUSD longs to compare with.' });
    expect((answerTradeAsk('was it oversized', review(), none, null) as { text: string }).text).toBe('Yes: 0.8 lots, 1.6× your usual 0.5 on XAUUSD. At usual size it would have been −$103.');
    const normal = review({ size: { median: 0.8, ratio: 1, trades: 9 }, grade: null, risk: { r: -1, amount: 164 } });
    expect((answerTradeAsk('size ok?', normal, none, null) as { text: string }).text).toBe('No: 0.8 lots, 1.0× your usual 0.8 on XAUUSD. Oversized starts above 1.5×; it risked $164.');
    expect((answerTradeAsk('size', review({ size: { median: null, ratio: null, trades: 2 } }), none, null) as { text: string }).text).toBe('Not enough XAUUSD trades to know your usual size: needs 3, you have 2.');
  });
  it('anything else goes to the coach with the facts', () => {
    const a = answerTradeAsk('Was the news a factor?', review(), none, 'XAUUSD long, opened…');
    expect(a.kind).toBe('coach');
    expect(a.kind === 'coach' && a.prompt).toBe(coachPrompt('Was the news a factor?', 'XAUUSD long, opened…'));
    expect(a.kind === 'coach' && a.prompt).toMatch(/one short paragraph \(at most 3 sentences\)[\s\S]*Facts: XAUUSD long, opened…$/);
  });
});

describe('formatting', () => {
  it('one short paragraph, max 3 sentences, no markdown', () => {
    expect(shortParagraph('**One.** Two! Three? Four.\n\nSecond para.')).toBe('One. Two! Three?');
    expect(shortParagraph('\n\n- just this')).toBe('just this');
    expect(shortParagraph('')).toBe('');
  });
  it('basis label', () => {
    expect(basisLabel(7)).toBe('Based on this trade + 7 similar');
    expect(basisLabel(0)).toBe('Based on this trade');
  });
});
