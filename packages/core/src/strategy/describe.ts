// Plain-English read-back of a strategy (F9): what it trades, when it enters,
// how it exits and how much it risks, in the order a trader would explain it.
import { describeCondition } from '../indicators/conditions.js';
import { VENUE_INFO, resolveShort, type SignalGroup, type StrategySpec } from './spec.js';

const join = (xs: string[], word = 'and') => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1]}`);
// Lower-case the first letter mid-sentence, but leave acronyms (EMA, RSI, MACD) alone.
const lc = (s: string) => (/^[A-Z][A-Z%]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

function groupText(g: SignalGroup, interval: string): string {
  const parts = g.conditions.map((c) => {
    let t = lc(describeCondition({ left: c.left, operator: c.operator, right: c.right }));
    if (c.timeframe && c.timeframe !== interval) t += ` on the ${c.timeframe} chart`;
    if (c.rightBarsAgo) t += ` (right side as of ${c.rightBarsAgo} bar${c.rightBarsAgo === 1 ? '' : 's'} earlier)`;
    if (c.barsAgo) t += ` ${c.barsAgo} bar${c.barsAgo === 1 ? '' : 's'} ago`;
    return t;
  });
  return g.match === 'all' ? join(parts, 'and') : `any of: ${join(parts, 'or')}`;
}

export function describeStrategy(spec: StrategySpec): string[] {
  const m = spec.market;
  const out: string[] = [];
  const syms = m.symbols.map((s) => s.symbol);
  const dir = m.direction === 'both' ? 'long and short' : m.direction === 'long' ? 'long only' : 'short only';
  out.push(`Trades ${join(syms)} perpetuals on ${VENUE_INFO[m.venue].label}, ${dir}, at ${m.leverage}× ${m.marginMode} margin, on ${spec.session.interval} bars.`);
  if (spec.session.mode === 'windows' && spec.session.windows.length) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    out.push(`New trades only ${join(spec.session.windows.map((w) => `${w.start}–${w.end} on ${w.days.map((d) => days[d]).join(', ')}`), 'or')} (${spec.session.timezone}); exits run around the clock.`);
  }
  const long = m.direction !== 'short' ? spec.entry.long : null;
  const short = m.direction !== 'long' ? resolveShort(spec.entry.short, spec.entry.long) : null;
  const at = spec.entry.atTimes?.length ? ` at ${join(spec.entry.atTimes, 'or')} (${spec.session.timezone})` : '';
  const how = spec.advanced.entryType === 'limit' ? `with a limit ${spec.advanced.limitOffsetPct}% better than the signal close, cancelled after ${spec.advanced.limitExpiryBars} bars` : 'at the next bar’s open';
  if (long?.conditions.length) out.push(`Buys${at} when ${groupText(long, spec.session.interval)}, ${how}.`);
  else if (at && m.direction !== 'short') out.push(`Buys${at}, ${how}.`);
  if (short?.conditions.length) out.push(`Sells short${at} when ${groupText(short, spec.session.interval)}${spec.entry.short === 'mirror' ? ' (the long rules mirrored)' : ''}, ${how}.`);
  const r = spec.risk;
  const exits: string[] = [];
  if (r.stopLoss) exits.push(`a stop ${r.stopLoss.mode === 'pct' ? `${r.stopLoss.value}% away` : r.stopLoss.mode === 'atr' ? `${r.stopLoss.value}× ATR(${r.stopLoss.atrLength ?? 14}) away` : r.stopLoss.mode === 'points' ? `${r.stopLoss.value} points away` : `at ${r.stopLoss.value}`}`);
  if (r.takeProfit) exits.push(`a target ${r.takeProfit.mode === 'rr' ? `at ${r.takeProfit.value}× the risk` : r.takeProfit.mode === 'pct' ? `${r.takeProfit.value}% away` : r.takeProfit.mode === 'points' ? `${r.takeProfit.value} points away` : `at ${r.takeProfit.value}`}`);
  if (r.trailing) exits.push(`a trailing stop ${r.trailing.mode === 'pct' ? `${r.trailing.value}%` : `${r.trailing.value}× ATR`} behind price${r.trailing.activateAtR ? ` once it is ${r.trailing.activateAtR}R in profit` : ''}`);
  if (r.timeStopBars) exits.push(`a time stop after ${r.timeStopBars} bars`);
  if (spec.exit.long?.conditions.length) exits.push(`an exit when ${groupText(spec.exit.long, spec.session.interval)}`);
  if (spec.exit.onOppositeSignal) exits.push('an exit on the opposite signal');
  out.push(exits.length ? `Each trade has ${join(exits)}.` : 'Nothing closes a trade except the end of the test: add a stop or a target.');
  if (r.partials.length) out.push(`Takes partial profit: ${join(r.partials.map((p) => `${p.closePct}% at ${p.atR}R`))}.`);
  if (r.breakEvenAtR) out.push(`Moves the stop to entry once the trade is ${r.breakEvenAtR}R in profit.`);
  const sz = spec.sizing;
  const size = sz.mode === 'risk_pct' ? `risks ${sz.value}% of equity per trade (sized from the stop)` : sz.mode === 'equity_pct' ? `puts ${sz.value}% of equity up as margin per trade` : sz.mode === 'qty' ? `trades ${sz.value} units each time` : sz.mode === 'notional' ? `trades a fixed ${sz.value} USDT position` : sz.mode === 'atr' ? `sizes so one ATR move is ${sz.value}% of equity` : `sizes by ${(sz.kellyFraction ?? 0.5) * 100}% Kelly once there are 20 trades (${sz.value}% of equity before that)`;
  out.push(`Position size: ${size}.`);
  const lim: string[] = [];
  if (spec.advanced.maxTradesPerDay) lim.push(`at most ${spec.advanced.maxTradesPerDay} trades a day`);
  if (spec.advanced.reentryCooldownBars) lim.push(`waits ${spec.advanced.reentryCooldownBars} bars after an exit before re-entering`);
  if (spec.limits.dailyLossPct) lim.push(`pauses for the day after losing ${spec.limits.dailyLossPct}%`);
  if (spec.limits.maxConsecutiveLosses) lim.push(`stops after ${spec.limits.maxConsecutiveLosses} losses in a row`);
  if (lim.length) out.push(`Limits: ${join(lim)}.`);
  return out;
}
