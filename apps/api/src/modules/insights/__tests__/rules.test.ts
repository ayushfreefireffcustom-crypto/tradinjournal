import { describe, expect, it } from 'vitest';
import type { Deal, Trade } from '@tradinjournal/types';
import type { TradingRules } from '@tradinjournal/contracts';
import { activeRules, hasRules, inHours, ruleName, rulesKey, rulesPreview, userRuleHits, USER_RULE_PREFIX } from '../rules.js';
import { baseline, behaviour, checks, computeDashboard, grade, plan, tradeContext, type InsightTrade } from '../compute.js';
import { computeAnalytics, firstRuleBroken, ruleWaterfall } from '../analytics-compute.js';
import { buildBase, gradeAll, queryLog, tradeDetail, type TlTrade } from '../tradelog.js';
import { computeTradeReview, preEntryFlags } from '../trade-review.js';
import { tradelogQuerySchema } from '@tradinjournal/contracts';
import { genTrades } from './tradelog.fixtures.js';

const H = 3_600_000, D = 86_400_000, M = 60_000;
const MON = Date.UTC(2026, 10, 2); // Mon 2 Nov 2026 00:00 UTC
let seq = 0;
const tr = (open: number, net: number, p: Partial<InsightTrade> = {}): InsightTrade =>
  ({ id: `r${++seq}`, symbol: 'XAUUSD', side: 'LONG', open, close: open + 20 * M, volume: 1, net, r: null, mae: null, mfe: null, tags: [], ...p });
const R = (r: Partial<TradingRules>): TradingRules => ({ ...r });

describe('rule helpers', () => {
  it('active rules, names and keys', () => {
    expect(hasRules(null)).toBe(false);
    expect(hasRules({ maxTradesPerDay: null })).toBe(false);
    const r = R({ maxTradesPerDay: 3, tradingHours: { from: '07:00', to: '16:00' }, maxRiskPct: 1, stopAfterLosses: 2, dailyLossCapPct: 2.5, maxSizeX: 1.5 });
    expect(activeRules(r)).toEqual(['maxTradesPerDay', 'tradingHours', 'maxRiskPct', 'stopAfterLosses', 'dailyLossCapPct', 'maxSizeX']);
    expect(activeRules(r).map(k => ruleName(k, r))).toEqual(['Max 3 trades a day', '07:00–16:00 UTC only', 'Risk ≤ 1% a trade', 'Stop after 2 losses', 'Daily loss cap 2.5%', 'Max 1.5× usual size']);
    expect(ruleName('maxTradesPerDay', R({ maxTradesPerDay: 1 }))).toBe('Max 1 trade a day');
    expect(rulesKey(null)).toBe('-');
    expect(rulesKey(R({ maxSizeX: 2 }))).toBe('maxSizeX=2');
    expect(rulesKey(R({ maxSizeX: 2 }))).not.toBe(rulesKey(R({ maxSizeX: 3 })));
  });
  it('trading hours wrap past midnight', () => {
    expect(inHours(7 * 60, '07:00', '16:00')).toBe(true);
    expect(inHours(16 * 60, '07:00', '16:00')).toBe(false);
    expect(inHours(6 * 60 + 59, '07:00', '16:00')).toBe(false);
    expect(inHours(23 * 60, '22:00', '02:00')).toBe(true);
    expect(inHours(1 * 60, '22:00', '02:00')).toBe(true);
    expect(inHours(3 * 60, '22:00', '02:00')).toBe(false);
  });
});

describe('userRuleHits', () => {
  it('no rules → no hits', () => {
    expect(userRuleHits([tr(MON, 1)], {}, 1000).size).toBe(0);
  });
  it('max trades a day: the (N+1)th open of a UTC day', () => {
    const ts = [tr(MON + 8 * H, 1), tr(MON + 9 * H, 1), tr(MON + 10 * H, 1), tr(MON + D + 8 * H, 1)];
    const h = userRuleHits(ts, R({ maxTradesPerDay: 2 }), 1000);
    expect([...h.keys()]).toEqual([ts[2]!.id]);
    expect(h.get(ts[2]!.id)![0]).toMatchObject({ key: 'maxTradesPerDay', part: 'discipline', label: '3rd trade that day', rule: 'Max 2 trades a day' });
  });
  it('trading hours (UTC open)', () => {
    const ts = [tr(MON + 6 * H + 59 * M, 1), tr(MON + 7 * H, 1), tr(MON + 15 * H + 59 * M, 1), tr(MON + 16 * H, 1)];
    const h = userRuleHits(ts, R({ tradingHours: { from: '07:00', to: '16:00' } }), 1000);
    expect([...h.keys()].sort()).toEqual([ts[0]!.id, ts[3]!.id].sort());
    expect(h.get(ts[0]!.id)![0]).toMatchObject({ part: 'timing', label: 'Opened 06:59 UTC' });
  });
  it('max risk %: |net ÷ R| vs the balance before the open; trades without R are not checked', () => {
    const a = tr(MON + 8 * H, 100); // balance 10,000 → 10,100
    const b = tr(MON + 9 * H, -303, { r: -1 }); // risk 303 / 10,100 = 3%
    const c = tr(MON + 10 * H, 98, { r: 1 }); // risk 98 / 9,797 = 1.0003% (> 1)
    const d = tr(MON + 11 * H, 50, { r: 1 }); // 0.5%
    const e = tr(MON + 12 * H, -900); // no R: not checked
    const h = userRuleHits([a, b, c, d, e], R({ maxRiskPct: 1 }), 10_000);
    expect(h.get(b.id)![0]).toMatchObject({ key: 'maxRiskPct', part: 'risk', label: 'Risked 3.0%' });
    expect(h.has(c.id)).toBe(true);
    expect(h.has(d.id)).toBe(false);
    expect(h.has(e.id)).toBe(false);
    expect(h.has(a.id)).toBe(false);
  });
  it('max risk %: the balance counts deposits and withdrawals at their own times', () => {
    // $1,000 in, then $900 out before b: b risked 30 of a $200 balance (15%), not of $1,100.
    const a = tr(MON + 8 * H, 100);
    const b = tr(MON + 10 * H, -30, { r: -1 });
    const ops = [{ t: MON, amount: 1000 }, { t: MON + 9 * H, amount: -900 }];
    expect(userRuleHits([a, b], R({ maxRiskPct: 5 }), 100, ops).get(b.id)![0]).toMatchObject({ label: 'Risked 15.0%' });
    // Without the flows the legacy single starting balance is used.
    expect(userRuleHits([a, b], R({ maxRiskPct: 5 }), 1000).has(b.id)).toBe(false);
  });
  it('stop after N losses: losing trades closed earlier that UTC day', () => {
    const a = tr(MON + 8 * H, -10), b = tr(MON + 9 * H, 20), c = tr(MON + 10 * H, -10);
    const d = tr(MON + 11 * H, 5); // 2 losses before
    const e = tr(MON + D + 1 * H, 5); // next day resets
    const h = userRuleHits([a, b, c, d, e], R({ stopAfterLosses: 2 }), 1000);
    expect([...h.keys()]).toEqual([d.id]);
    expect(h.get(d.id)![0]!.label).toBe('After 2 losses');
  });
  it('daily loss cap: day P&L before the open vs the balance at the start of the day', () => {
    const y = tr(MON - D + 8 * H, 1000); // yesterday: start of day balance 11,000
    const a = tr(MON + 8 * H, -200); // −1.8%
    const b = tr(MON + 9 * H, -20); // opened at −1.82% → ok with cap 2
    const c = tr(MON + 10 * H, 10); // day −2.0% → breaks
    const h = userRuleHits([y, a, b, c], R({ dailyLossCapPct: 2 }), 10_000);
    expect([...h.keys()]).toEqual([c.id]);
    expect(h.get(c.id)![0]!.label).toBe('Day at −2.0%');
  });
  it('max size ×: volume over X × median on that symbol (3+ trades)', () => {
    const ts = [tr(MON, 1, { volume: 1 }), tr(MON + H, 1, { volume: 1 }), tr(MON + 2 * H, 1, { volume: 2.1 }), tr(MON + 3 * H, 1, { symbol: 'EURUSD', volume: 9 })];
    const h = userRuleHits(ts, R({ maxSizeX: 1.5 }), 1000);
    expect([...h.keys()]).toEqual([ts[2]!.id]);
    expect(h.get(ts[2]!.id)![0]!.label).toBe('2.1× size');
  });
  it('several rules on one trade', () => {
    const a = tr(MON + 8 * H, -10), b = tr(MON + 23 * H, -10, { volume: 5 }), c = tr(MON + 9 * H, -10);
    const h = userRuleHits([a, b, c], R({ maxTradesPerDay: 2, tradingHours: { from: '07:00', to: '16:00' }, stopAfterLosses: 2, maxSizeX: 1.5 }), 1000);
    expect(h.get(b.id)!.map(x => x.key)).toEqual(['maxTradesPerDay', 'tradingHours', 'stopAfterLosses', 'maxSizeX']);
  });
});

describe('rulesPreview', () => {
  it('counts breaks and net over the last N days, each trade once in any', () => {
    const NOW = MON + 30 * D;
    const old = tr(MON - 100 * D, -500, { open: MON - 100 * D + 23 * H });
    const a = tr(MON + 23 * H, -100); // outside hours
    const b = tr(MON + D + 8 * H, 50);
    const c = tr(MON + D + 9 * H, -70, { r: -1 }); // 2nd trade + 70/1050 = 6.7% risk
    const p = rulesPreview([old, a, b, c], R({ tradingHours: { from: '07:00', to: '16:00' }, maxTradesPerDay: 1, maxRiskPct: 2 }), 1000, NOW, 90);
    expect(p.trades).toBe(3);
    expect(p.rules.tradingHours).toEqual({ n: 1, net: -100, checked: 3 });
    expect(p.rules.maxTradesPerDay).toEqual({ n: 1, net: -70, checked: 3 });
    expect(p.rules.maxRiskPct).toEqual({ n: 1, net: -70, checked: 1 });
    expect(p.any).toEqual({ n: 2, net: -170 });
    expect(p.rules.stopAfterLosses).toBeUndefined();
  });
});

describe('hooks: with no rules nothing changes', () => {
  const ts = Array.from({ length: 30 }, (_, i) => tr(MON + Math.floor(i / 3) * D + (8 + (i % 3) * 7) * H, i % 3 === 2 ? -40 : 25, { volume: i % 7 === 0 ? 3 : 1 }));
  const opts = { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 5000 };
  it('dashboard and analytics are identical with rules null/empty', () => {
    expect(computeDashboard(ts, { ...opts, rules: null })).toEqual(computeDashboard(ts, opts));
    expect(computeDashboard(ts, { ...opts, rules: {} })).toEqual(computeDashboard(ts, opts));
    expect(computeAnalytics(ts, { ...opts, rules: { maxSizeX: null } })).toEqual(computeAnalytics(ts, opts));
  });
  it('tradeContext has no userRules key without rules', () => {
    const ctx = tradeContext(ts, { rules: {}, startingBalance: 0 });
    expect([...ctx.values()].every(c => !('userRules' in c))).toBe(true);
  });
});

describe('hooks: rules flow into grades, checks, plan and the waterfall', () => {
  // 30 trades over 10 days; the third trade of each day opens at 22:00 (outside 07–16) and loses.
  const ts = Array.from({ length: 30 }, (_, i) => tr(MON + Math.floor(i / 3) * D + (i % 3 === 2 ? 22 : 8 + (i % 3)) * H, i % 3 === 2 ? -40 : 25));
  const rules = R({ tradingHours: { from: '07:00', to: '16:00' }, maxTradesPerDay: 2 });
  const user = { rules, startingBalance: 5000 };
  const ctx = tradeContext(ts, user);
  const b = baseline(ts);
  const late = ts[2]!;
  it('grade reasons start with "Your rule: …" and count toward the grade', () => {
    const g = grade(late, ctx.get(late.id), b);
    expect(g.reasons.slice(0, 2)).toEqual([`${USER_RULE_PREFIX}Max 2 trades a day`, `${USER_RULE_PREFIX}07:00–16:00 UTC only`]);
    const without = grade(late, tradeContext(ts).get(late.id), b);
    expect(g.reasons.length).toBe(without.reasons.length + 2);
  });
  it('checks fail the matching part', () => {
    const c = checks(late, ctx.get(late.id), b);
    expect(c.discipline).toBe(false);
    expect(c.timing).toBe(false);
    expect(checks(ts[0]!, ctx.get(ts[0]!.id), b)).toEqual({ discipline: true, risk: true, timing: true });
    expect(behaviour(ts, ctx)!.parts.find(p => p.key === 'discipline')!.score).toBeLessThan(behaviour(ts, tradeContext(ts))!.parts.find(p => p.key === 'discipline')!.score);
  });
  it('plan lists the costliest of your rules first', () => {
    const p = plan(ts, ctx, []);
    expect(p[0]).toMatchObject({ text: 'Your rule · Max 2 trades a day', value: -400, fmt: 'money', tone: 'dn' });
    expect(p[1]!.text).toBe('Your rule · 07:00–16:00 UTC only');
    expect(plan(ts, tradeContext(ts), []).some(x => x.text.startsWith('Your rule'))).toBe(false);
  });
  it('analytics waterfall buckets them as "Your rules", first', () => {
    const first = firstRuleBroken(ts, ctx, b)!;
    expect(first.get(late.id)).toBe('user-rule');
    const w = ruleWaterfall(ts, first);
    expect(w.rules[0]).toMatchObject({ key: 'user-rule', label: 'Your rules', n: 10, net: -400 });
    const a = computeAnalytics(ts, { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 5000, rules });
    expect(a.behaviour!.waterfall!.rules[0]!.key).toBe('user-rule');
  });
  it('dashboard recent grades and plan include them', () => {
    const d = computeDashboard(ts, { now: MON + 20 * D, window: { from: null, to: null }, filters: {}, startingBalance: 5000, rules });
    expect(d.plan[0]!.text).toMatch(/^Your rule/);
    const lateRecent = d.recent.find(r => r.id === ts[29]!.id)!;
    expect(lateRecent.reasons[0]).toBe('Your rule: Max 2 trades a day');
  });
});

describe('hooks: trade log and trade review', () => {
  const trades: TlTrade[] = genTrades({ n: 60, seed: 11 });
  const rules = R({ maxTradesPerDay: 1 });
  const closed = trades.filter(t => t.status === 'CLOSED');
  it('gradeAll flags "Your rule" and the rule filter / Rule broken view count them', () => {
    const user = { rules, startingBalance: 10_000 };
    const g = gradeAll(closed, user)!;
    const flagged = [...g.values()].filter(x => x.flags.some(f => f.key === 'user-rule'));
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0]!.flags[0]).toMatchObject({ key: 'user-rule', short: 'Your rule' });
    expect(flagged[0]!.flags[0]!.label).toMatch(/trade that day$/);
    const base = buildBase(trades, new Map(), { startingBalance: 10_000, user });
    const now = Date.UTC(2026, 10, 14);
    const q = (rule: string) => queryLog(base, tradelogQuerySchema.parse({ accountId: 'a', rule, limit: 200 }), now);
    expect(q('user-rule').counts.matching).toBe(flagged.length);
    const plain = buildBase(trades, new Map(), { startingBalance: 10_000 });
    expect(q('any').views.ruleBroken!).toBeGreaterThanOrEqual(queryLog(plain, tradelogQuerySchema.parse({ accountId: 'a', limit: 200 }), now).views.ruleBroken!);
    expect(queryLog(plain, tradelogQuerySchema.parse({ accountId: 'a', rule: 'user-rule', limit: 200 }), now).counts.matching).toBe(0);
    const d = tradeDetail(base, flagged.length ? [...g.entries()].find(([, x]) => x.flags.some(f => f.key === 'user-rule'))![0] : '')!;
    expect(d.reasons[0]).toMatchObject({ key: 'user-rule' });
    expect(d.reasons[0]!.label).toMatch(/^Your rule · /);
  });
  it('trade review: flag first, counts as pre-entry, grade drops', () => {
    const iso = (ms: number) => new Date(ms).toISOString();
    let n = 5000;
    const deal = (p: Partial<Deal> & { entry: Deal['entry']; dealTime: string }): Deal => ({ dealTicket: String(++n), orderTicket: '', positionId: '', symbol: 'XAUUSD', type: 'BUY', volume: '1', price: '2000', profit: '0', commission: '0', swap: '0', fee: '0', comment: '', ...p });
    const pos = (open: number, net: number): Trade => {
      const id = String(++n);
      return {
        positionId: id, symbol: 'XAUUSD', direction: 'LONG', status: 'CLOSED', openTime: iso(open), closeTime: iso(open + 30 * M), entryPrice: 2000, exitPrice: 2000 + net / 100,
        volume: 1, grossPnl: net, commission: 0, swap: 0, netPnl: net, durationSecs: 1800,
        deals: [deal({ positionId: id, entry: 'IN', dealTime: iso(open) }), deal({ positionId: id, entry: 'OUT', type: 'SELL', dealTime: iso(open + 30 * M), profit: String(net) })],
      };
    };
    const positions: Trade[] = [];
    for (let d = 0; d < 12; d++) { positions.push(pos(MON + d * D + 8 * H, 40)); positions.push(pos(MON + d * D + 9 * H, -30)); }
    const target = positions[3]!; // 2nd trade of day 2
    const base = { now: MON + 30 * D, positions, positionId: target.positionId, storedR: null, cash: [] };
    const plain = computeTradeReview(base)!;
    const withRules = computeTradeReview({ ...base, user: { rules, startingBalance: 10_000 } })!;
    expect(plain.grade!.flags.some(f => f.key === 'user-rule')).toBe(false);
    expect(withRules.grade!.flags[0]).toMatchObject({ key: 'user-rule', label: 'Your rule · 2nd trade that day' });
    expect(withRules.grade!.flags[0]!.detail).toMatch(/^Max 1 trade a day: /);
    expect('ABCDF'.indexOf(withRules.grade!.grade)).toBe('ABCDF'.indexOf(plain.grade!.grade) + 1);
    expect(withRules.grade!.checks.discipline).toBe(false);
    expect(withRules.whatIf.some(w => w.key === 'skip')).toBe(true);
    const ctx = tradeContext(positions.map(p => ({ id: p.positionId, symbol: p.symbol, side: p.direction, open: Date.parse(p.openTime), close: Date.parse(p.closeTime!), volume: p.volume, net: p.netPnl, r: null, mae: null, mfe: null, tags: [] })), { rules, startingBalance: 10_000 });
    const me = { id: target.positionId, symbol: 'XAUUSD', side: 'LONG' as const, open: Date.parse(target.openTime), close: Date.parse(target.closeTime!), volume: 1, net: -30, r: null, mae: null, mfe: null, tags: [] };
    expect(preEntryFlags(me, ctx.get(me.id), baseline([]))[0]).toBe('user-rule');
  });
});
