// "Ask your journal": deterministic, chart-first answers for a small set of
// question types, computed from the same trades the dashboard shows. Anything
// we can't parse returns { kind: 'none' } and the page asks the AI coach.
import type { AskBarDTO, AskIntent, DashboardAskDTO, AiLine } from '@tradinjournal/contracts';
import {
  agg, DAY_LONG, DAY_SHORT, fmtMoney, hourOf, pct0, sessionOf, SESSION_LABEL, weekdayOf,
  type InsightTrade, type TradeContext,
} from './compute.js';

export interface ParsedAsk { intent: AskIntent | null; weekday: number | null; symbol: string | null }

const DAY_RX: Array<[RegExp, number]> = [
  [/\b(sundays?|sun)\b/, 0], [/\b(mondays?|mon)\b/, 1], [/\b(tuesdays?|tues?)\b/, 2], [/\b(wednesdays?|wed)\b/, 3],
  [/\b(thursdays?|thu|thur|thurs)\b/, 4], [/\b(fridays?|fri)\b/, 5], [/\b(saturdays?)\b/, 6],
];
const ALIASES: Record<string, RegExp> = { XAU: /\bgold\b/, XAG: /\bsilver\b/, BTC: /\bbitcoin\b/, ETH: /\bether(eum)?\b/, NAS: /\bnasdaq\b/, US30: /\bdow\b/, OIL: /\b(oil|crude|wti)\b/ };

/** Which question is this? Pure; `symbols` are the account's traded symbols. */
export function parseAsk(q: string, symbols: string[]): ParsedAsk {
  const s = q.toLowerCase();
  let symbol: string | null = null;
  for (const sym of [...symbols].sort((a, b) => b.length - a.length)) {
    const base = sym.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (base.length >= 3 && s.replace(/[^a-z0-9 ]/g, '').split(/\s+/).some(w => w === base || (base.length >= 6 && w.startsWith(base.slice(0, 6))))) { symbol = sym; break; }
  }
  if (!symbol) {
    for (const [key, rx] of Object.entries(ALIASES)) {
      if (!rx.test(s)) continue;
      const hit = symbols.find(x => x.toUpperCase().includes(key));
      if (hit) { symbol = hit; break; }
    }
  }
  const weekday = DAY_RX.find(([rx]) => rx.test(s))?.[1] ?? null;
  let intent: AskIntent | null = null;
  if (/\bafter (a |my |two |2 |\d+ )?(loss|losses|losing|losers?)\b|\brevenge\b|\btilt|\blosing streak|\bloss(es)? in a row/.test(s)) intent = 'after-loss';
  else if (weekday != null) intent = 'one-day';
  else if (/\b(week ?days?|day of (the )?week|which days?|what days?|by day|(best|worst) days?)\b/.test(s)) intent = 'weekday';
  else if (/\b(sessions?|asia|asian|london|new york|ny)\b/.test(s)) intent = 'session';
  else if (/\b(hours?|time of day|what time|when|morning|afternoon|evening|night|o'?clock|\d{1,2}:\d{2})\b/.test(s)) intent = 'hour';
  else if (/\b(longs?|shorts?|buys?|sells?|direction|side|long vs short)\b/.test(s)) intent = 'side';
  else if (/\b(symbols?|pairs?|instruments?|markets?|assets?|tickers?|what (should i|to) trade)\b/.test(s)) intent = 'symbol';
  else if (symbol) intent = 'hour';
  return { intent, weekday, symbol };
}

const line = (text: string, value: number, trades: number, suffix?: string): AiLine => ({
  text: text.charAt(0).toUpperCase() + text.slice(1), value: Math.round(value * 100) / 100, fmt: 'money', trades, tone: value > 0 ? 'up' : value < 0 ? 'dn' : 'flat', ...(suffix ? { suffix } : {}),
});
const bar = (label: string, ts: InsightTrade[]): AskBarDTO => { const a = agg(ts); return { label, value: a.net, n: a.n, wins: a.wins }; };
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const FOLLOW: Record<AskIntent, string> = {
  weekday: 'By weekday', 'one-day': 'By weekday', hour: 'By hour', session: 'By session', 'after-loss': 'After losses', side: 'Long vs short', symbol: 'By symbol',
};

function mark(bars: AskBarDTO[], pick: 'worst' | 'best'): AskBarDTO | null {
  const elig = bars.filter(b => b.n > 0 && (pick === 'worst' ? b.value < 0 : b.value > 0));
  const b = elig.sort((x, y) => (pick === 'worst' ? x.value - y.value : y.value - x.value))[0] ?? null;
  if (b) b.hl = pick === 'worst' ? 'dn' : 'up';
  return b;
}

export function answerAsk(q: string, trades: InsightTrade[], ctx: Map<string, TradeContext>): DashboardAskDTO {
  const symbols = [...new Set(trades.map(t => t.symbol))];
  const p = parseAsk(q, symbols);
  if (!p.intent) return { kind: 'none', used: trades.length };
  const T = p.symbol ? trades.filter(t => t.symbol === p.symbol) : trades;
  if (!T.length) return { kind: 'none', used: 0 };
  const pre = p.symbol ? `${p.symbol} ` : '';
  const follow = (['session', 'after-loss', 'hour', 'weekday', 'side'] as AskIntent[]).filter(i => i !== p.intent && !(p.intent === 'one-day' && i === 'weekday')).slice(0, 2).map(i => FOLLOW[i]);
  const chart = (intent: AskIntent, title: AiLine, bars: AskBarDTO[], note: string | null): DashboardAskDTO =>
    ({ kind: 'chart', intent, title, note, bars, used: bars.reduce((a, b) => a + b.n, 0), followups: follow });

  switch (p.intent) {
    case 'one-day': {
      const d = p.weekday!;
      const D = T.filter(t => weekdayOf(t.open) === d);
      const name = `${DAY_LONG[d]}s`;
      if (!D.length) return chart('one-day', line(`${pre}${name}: no trades`, 0, 0), [], null);
      const hrs = [...new Set(D.map(t => hourOf(t.open)))].sort((a, b) => a - b);
      const bars = hrs.map(h => bar(hh(h).slice(0, 2), D.filter(t => hourOf(t.open) === h)));
      // The cut-off after which this weekday loses the most.
      let cut: { h: number; net: number } | null = null;
      for (const h of hrs.slice(1)) {
        const late = D.filter(t => hourOf(t.open) >= h);
        const net = agg(late).net;
        if (late.length >= 2 && net < 0 && (!cut || net < cut.net)) cut = { h, net };
      }
      if (cut) {
        const before = agg(D.filter(t => hourOf(t.open) < cut!.h));
        const after = D.filter(t => hourOf(t.open) >= cut!.h);
        for (const b of bars) if (Number(b.label) >= cut.h) b.hl = 'dn';
        return chart('one-day', line(`${pre}after ${hh(cut.h)} on ${name}:`, cut.net, after.length),
          bars, `Before ${hh(cut.h)}: ${fmtMoney(before.net)} · ${before.n ? pct0(before.wins / before.n) : '0%'} won · UTC`);
      }
      const a = agg(D);
      return chart('one-day', line(`${pre}${name}: ${a.wins} of ${a.n} won ·`, a.net, a.n), bars, 'Net by open hour, UTC');
    }
    case 'weekday': {
      const days = [1, 2, 3, 4, 5, 6, 0].filter(d => T.some(t => weekdayOf(t.open) === d));
      const bars = days.map(d => bar(DAY_SHORT[d]!, T.filter(t => weekdayOf(t.open) === d)));
      const w = mark(bars, 'worst'), b = mark(bars, 'best');
      const lead = w ?? b ?? bars[0]!;
      return chart('weekday', line(`${pre}${w ? 'Worst' : 'Best'} day ${lead.label}:`, lead.value, lead.n),
        bars, b && w ? `Best day ${b.label}: ${fmtMoney(b.value)} · ${pct0(b.wins / b.n)} won` : null);
    }
    case 'hour': {
      const hrs = [...new Set(T.map(t => hourOf(t.open)))].sort((a, b) => a - b);
      const bars = hrs.map(h => bar(hh(h).slice(0, 2), T.filter(t => hourOf(t.open) === h)));
      const w = mark(bars, 'worst'), b = mark(bars, 'best');
      const lead = w ?? b ?? bars[0]!;
      return chart('hour', line(`${pre}${w ? 'Worst' : 'Best'} hour ${lead.label}:00 UTC:`, lead.value, lead.n),
        bars, b && w ? `Best hour ${b.label}:00: ${fmtMoney(b.value)} · ${pct0(b.wins / b.n)} won` : 'Net by open hour, UTC');
    }
    case 'session': {
      const bars = (['ASIA', 'LONDON', 'NY'] as const).map(s => bar(SESSION_LABEL[s], T.filter(t => sessionOf(t.open) === s)));
      const w = mark(bars, 'worst'), b = mark(bars, 'best');
      const lead = w ?? b ?? bars[0]!;
      return chart('session', line(`${pre}${w ? 'Worst' : 'Best'} session ${lead.label}:`, lead.value, lead.n),
        bars, b && w ? `${b.label}: ${fmtMoney(b.value)} · ${pct0(b.wins / b.n)} won` : 'Asia 22–07 · London 07–13 · NY 13–22 UTC');
    }
    case 'after-loss': {
      const k = (t: InsightTrade) => Math.min(2, ctx.get(t.id)?.priorLosses ?? 0);
      const bars = [bar('Fresh', T.filter(t => k(t) === 0)), bar('After 1 loss', T.filter(t => k(t) === 1)), bar('After 2+', T.filter(t => k(t) === 2))];
      const a2 = bars[2]!, a0 = bars[0]!;
      if (a2.value < 0) a2.hl = 'dn';
      return chart('after-loss', line(`${pre}after 2+ losses:`, a2.value, a2.n, a2.n ? `· ${pct0(a2.wins / a2.n)} won` : undefined),
        bars, a0.n ? `Fresh: ${fmtMoney(a0.value)} · ${pct0(a0.wins / a0.n)} won · same UTC day` : null);
    }
    case 'side': {
      const bars = [bar('Long', T.filter(t => t.side === 'LONG')), bar('Short', T.filter(t => t.side === 'SHORT'))];
      const w = [...bars].filter(b => b.n).sort((a, b) => a.value - b.value)[0]!;
      const o = bars.find(b => b !== w)!;
      if (w.value < 0) w.hl = 'dn';
      return chart('side', line(`${pre}${w.label}s:`, w.value, w.n, `· ${pct0(w.wins / w.n)} won`), bars,
        o.n ? `${o.label}s: ${fmtMoney(o.value)} · ${pct0(o.wins / o.n)} won` : null);
    }
    case 'symbol': {
      const syms = [...new Set(T.map(t => t.symbol))];
      const bars = syms.map(s => bar(s, T.filter(t => t.symbol === s))).sort((a, b) => b.value - a.value);
      const shown = bars.length > 8 ? [...bars.slice(0, 4), ...bars.slice(-4)] : bars;
      const w = mark(shown, 'worst'), b = mark(shown, 'best');
      const lead = w ?? b ?? shown[0]!;
      return chart('symbol', line(`${w ? 'Worst' : 'Best'} symbol ${lead.label}:`, lead.value, lead.n), shown,
        b && w ? `Best ${b.label}: ${fmtMoney(b.value)} · ${pct0(b.wins / b.n)} won` : null);
    }
  }
}
