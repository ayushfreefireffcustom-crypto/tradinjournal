// "Ask about this trade" (trade review): common questions are answered from
// the review's own numbers, deterministically; anything else goes to the coach
// with the trade's computed facts (conversation kind 'ask'). One short
// paragraph either way, "based on this trade + N similar".
import type { AfterExit } from '@/components/charts/trade-math';
import type { CandleWhatIf, TradeReviewDTO } from '@/lib/trade-review-api';

export type TradeAskIntent = 'grade' | 'held' | 'similar' | 'size';
export type TradeAskAnswer =
  | { kind: 'answer'; intent: TradeAskIntent; text: string; basis: number }
  | { kind: 'coach'; prompt: string; basis: number };

export const TRADE_ASK_CHIPS: Array<{ q: string; intent: TradeAskIntent }> = [
  { q: 'Why this grade?', intent: 'grade' },
  { q: 'What if I held?', intent: 'held' },
  { q: 'Similar trades?', intent: 'similar' },
  { q: 'Was it oversized?', intent: 'size' },
];

/** Which of the common questions this is (null = let the coach answer). */
export function parseTradeAsk(q: string): TradeAskIntent | null {
  const s = q.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/\b(grade[ds]?|graded|grading|flag(s|ged)?|rules? (did )?(i )?(broke|break)|broken rules?|why (an? |the )?[abcdf]\b|why .*\b[abcdf]\b ?\??$)/.test(s)) return 'grade';
  if (/\b(held|hold(ing)?|kept it|let it run|stay(ed)? in|longer|didn't close|not closed|exit(ed)? (too )?(early|late)|left on the table|ran further)\b/.test(s)) return 'held';
  if (/\b(oversi[sz]ed?|too (big|large)|size|sizing|lots?|volume|position size)\b/.test(s)) return 'size';
  if (/\b(similar|like this|same setup|other trades|others|usually|history|before|track record)\b/.test(s)) return 'similar';
  return null;
}

const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const signed = (v: number) => `${v < 0 ? '−' : v > 0 ? '+' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
const lots = (v: number) => String(Math.round(v * 100) / 100);

export interface TradeAskExtra {
  after: AfterExit | null;
  /** Candle what-ifs (usual hold, +1R exit…) when the bars allow them. */
  candle: CandleWhatIf[];
  /** Bars are still loading. */
  barsLoading?: boolean;
}

function gradeAnswer(r: TradeReviewDTO): string {
  if (!r.grade) return `Not graded yet: grades need ${r.minTrades} closed trades as the baseline, and this account has ${r.closedTrades}.`;
  const g = r.grade;
  if (!g.flags.length) return `Graded ${g.grade}: no rules broken against your last ${g.basis} trades. The grade is about process, not the result.`;
  const list = g.flags.map(f => f.label).join('; ');
  return `Graded ${g.grade}: ${g.flags.length} flag${g.flags.length === 1 ? '' : 's'}, one step down each (${list}). The grade is about process, not the result.`;
}

function heldAnswer(r: TradeReviewDTO, x: TradeAskExtra): string {
  const t = r.trade;
  if (t.status !== 'CLOSED') return 'It’s still open, so there’s no exit to compare yet.';
  const hold = x.candle.find(c => c.key === 'usual-hold');
  const a = x.after;
  const parts: string[] = [];
  if (a?.leftMoney != null && a.extra > 0 && a.leftMoney >= 1) parts.push(`after your exit price ran ${usd(a.leftMoney)} further your way at best`);
  if (a?.savedMoney != null && a.savedMoney >= 1) parts.push(`it also went ${usd(a.savedMoney)} against you, which your exit avoided`);
  if (hold) parts.push(`exiting at your usual hold would have made ${signed(hold.net)} (${signed(hold.delta)} vs what you took)`);
  if (!parts.length) {
    if (x.barsLoading) return 'Still loading the price data for this trade. Ask again in a moment.';
    if (!a) return `There’s no ${t.symbol} price data after the exit, so I can’t say what holding would have done.`;
    return 'Holding wouldn’t have changed much: price didn’t run far either way after your exit.';
  }
  const s = parts.join('; ');
  return `${s[0]!.toUpperCase()}${s.slice(1)}. Read from market candles, so to bar precision.`;
}

function similarAnswer(r: TradeReviewDTO): string {
  const s = r.similar;
  if (!s || !s.n) return `No similar trades yet: nothing else on ${r.trade.symbol} ${r.trade.side === 'LONG' ? 'longs' : 'shorts'} to compare with.`;
  const wr = Math.round((s.wins / s.n) * 100);
  return `${s.n} similar trade${s.n === 1 ? '' : 's'} (${s.criteria.join(', ')}): ${s.wins} won (${wr}%), net ${signed(s.net)}.${s.n >= 3 && s.net < 0 ? ' Skipping that setup would have kept the money.' : ''}`;
}

function sizeAnswer(r: TradeReviewDTO): string {
  const { median, ratio, trades } = r.size;
  const t = r.trade;
  if (median == null || ratio == null) return `Not enough ${t.symbol} trades to know your usual size: needs 3, you have ${trades}.`;
  const over = r.grade?.flags.find(f => f.key === 'oversized');
  const own = r.grade?.flags.find(f => f.key === 'user-rule' && /× size/.test(f.label));
  const at = r.whatIf.find(w => w.key === 'normal-size');
  const base = `${lots(t.volume)} lots, ${ratio.toFixed(1)}× your usual ${lots(median)} on ${t.symbol}`;
  if (over || own || ratio > 1.5) return `Yes: ${base}${own ? `, past your own max (${own.label.replace(/^Your rule · /, '')})` : ''}.${at ? ` At usual size it would have been ${signed(at.net)}.` : ''}`;
  return `No: ${base}. Oversized starts above 1.5×${r.risk ? `; it risked ${usd(r.risk.amount)}` : ''}.`;
}

export function answerTradeAsk(q: string, r: TradeReviewDTO, x: TradeAskExtra, facts: string | null): TradeAskAnswer {
  const basis = r.similar?.n ?? 0;
  const intent = parseTradeAsk(q);
  switch (intent) {
    case 'grade': return { kind: 'answer', intent, text: gradeAnswer(r), basis };
    case 'held': return { kind: 'answer', intent, text: heldAnswer(r, x), basis };
    case 'similar': return { kind: 'answer', intent, text: similarAnswer(r), basis };
    case 'size': return { kind: 'answer', intent, text: sizeAnswer(r), basis };
    default: return { kind: 'coach', prompt: coachPrompt(q, facts ?? ''), basis };
  }
}

export const coachPrompt = (q: string, facts: string) =>
  `Question about this one trade: ${q.trim().slice(0, 400)}\n\nAnswer as my trading coach in one short paragraph (at most 3 sentences). Use only these facts; if they don't answer it, say so. No headings, lists or markdown.\n\nFacts: ${facts}`;

/** One short paragraph: the first paragraph, at most 3 sentences, plain text. */
export function shortParagraph(text: string): string {
  const first = text.replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).find(Boolean) ?? '';
  const plain = first.replace(/[#*_`>]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  const parts = plain.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [plain];
  return parts.slice(0, 3).join('').trim();
}

export const basisLabel = (n: number) => `Based on this trade${n ? ` + ${n} similar` : ''}`;
