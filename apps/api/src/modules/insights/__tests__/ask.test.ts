import { describe, expect, it } from 'vitest';
import { answerAsk, parseAsk } from '../ask.js';
import { tradeContext, type InsightTrade } from '../compute.js';

const H = 3_600_000, D = 86_400_000;
const FRI = Date.UTC(2026, 10, 6); // Friday
let seq = 0;
const tr = (open: number, net: number, p: Partial<InsightTrade> = {}): InsightTrade =>
  ({ id: `a${++seq}`, symbol: 'XAUUSD', side: 'LONG', open, close: open + 20 * 60_000, volume: 1, net, r: null, mae: null, mfe: null, tags: [], ...p });

describe('parseAsk', () => {
  const syms = ['XAUUSD', 'GBPJPY', 'US30'];
  it.each([
    ['Why do I lose on Fridays?', 'one-day'],
    ['Which day of the week is best?', 'weekday'],
    ['What time of day do I do best?', 'hour'],
    ['How is my London session?', 'session'],
    ['What happens after a loss?', 'after-loss'],
    ['Do I revenge trade?', 'after-loss'],
    ['Longs or shorts?', 'side'],
    ['Which symbols should I drop?', 'symbol'],
    ['How am I doing on gold?', 'hour'],
    ['Summarise my month', null],
  ])('%s → %s', (q, intent) => { expect(parseAsk(q, syms).intent).toBe(intent); });
  it('finds the symbol and the weekday', () => {
    expect(parseAsk('xauusd on thursdays', syms)).toEqual({ intent: 'one-day', weekday: 4, symbol: 'XAUUSD' });
    expect(parseAsk('gbpjpy by session', syms).symbol).toBe('GBPJPY');
    expect(parseAsk('how do I trade gold', syms).symbol).toBe('XAUUSD');
    expect(parseAsk('US30 longs', syms)).toMatchObject({ intent: 'side', symbol: 'US30' });
  });
});

describe('answerAsk', () => {
  it('weekday question: cut-off hour, split, trades used', () => {
    const T = [
      tr(FRI + 8 * H, 300), tr(FRI + 9 * H, 200), tr(FRI + 10 * H, 50),
      tr(FRI + 15 * H, -400), tr(FRI + 16 * H, -300),
      tr(FRI - D + 9 * H, 999), // Thursday: not used
    ];
    const a = answerAsk('Why do I lose on Fridays?', T, tradeContext(T));
    expect(a.kind).toBe('chart');
    if (a.kind !== 'chart') return;
    expect(a.used).toBe(5);
    expect(a.title).toMatchObject({ text: 'After 15:00 on Fridays:', value: -700, fmt: 'money', tone: 'dn' });
    expect(a.note).toBe('Before 15:00: +$550 · 100% won · UTC');
    expect(a.bars.map(b => b.label)).toEqual(['08', '09', '10', '15', '16']);
    expect(a.bars.filter(b => b.hl === 'dn').map(b => b.label)).toEqual(['15', '16']);
  });
  it('after-loss buckets use same-day streaks', () => {
    const T = [tr(FRI + 8 * H, -10), tr(FRI + 9 * H, -10), tr(FRI + 10 * H, -50), tr(FRI + 11 * H, 30)];
    const a = answerAsk('what happens after losses', T, tradeContext(T));
    if (a.kind !== 'chart') throw new Error('expected chart');
    expect(a.bars.map(b => [b.label, b.n, b.value])).toEqual([['Fresh', 1, -10], ['After 1 loss', 1, -10], ['After 2+', 2, -20]]);
    expect(a.title.text).toBe('After 2+ losses:');
  });
  it('symbol mentioned: answer only from that symbol', () => {
    const T = [tr(FRI + 8 * H, 100), tr(FRI + 9 * H, -40, { symbol: 'GBPJPY' })];
    const a = answerAsk('gold by session', T, tradeContext(T));
    if (a.kind !== 'chart') throw new Error('expected chart');
    expect(a.used).toBe(1);
    expect(a.title.text).toMatch(/^XAUUSD /);
  });
  it('anything else falls back to the coach', () => {
    const T = [tr(FRI, 1)];
    expect(answerAsk('Write me a poem', T, tradeContext(T))).toEqual({ kind: 'none', used: 1 });
  });
});
