// Strategy validation (F10): problems that block a deploy, and things worth
// knowing that don't.
import { validateCondition, conditionWarmup } from '../indicators/conditions.js';
import { INTERVAL_MS, STRATEGY_INTERVALS, VENUE_INFO, resolveShort, type SignalGroup, type StrategySpec } from './spec.js';

export interface Issue { code: string; message: string; path?: string }
export interface Validation { blockers: Issue[]; warnings: Issue[]; /** Extra blockers that only apply to live trading. */ live: Issue[]; warmupBars: number }

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateStrategy(spec: StrategySpec): Validation {
  const blockers: Issue[] = [];
  const warnings: Issue[] = [];
  const live: Issue[] = [];
  let warmup = 0;
  const m = spec.market;
  const venue = VENUE_INFO[m.venue];
  if (!m.symbols.length) blockers.push({ code: 'no_symbols', message: 'Pick at least one market.', path: 'market.symbols' });
  if (new Set(m.symbols.map((s) => s.symbol)).size !== m.symbols.length) blockers.push({ code: 'dup_symbol', message: 'A market is listed twice.', path: 'market.symbols' });
  for (const lev of [m.leverage, ...m.symbols.map((s) => s.leverage).filter((x): x is number => x != null)]) {
    if (!(lev >= 1) || lev > venue.maxLeverage) blockers.push({ code: 'leverage', message: `Leverage must be between 1× and ${venue.maxLeverage}× on ${venue.label}.`, path: 'market.leverage' });
  }
  if (m.leverage > 20) warnings.push({ code: 'high_leverage', message: `${m.leverage}× leverage: a ${(100 / m.leverage).toFixed(1)}% move against you wipes out the margin.` });

  const checkGroup = (g: SignalGroup | null, path: string) => {
    if (!g) return;
    g.conditions.forEach((c, k) => {
      try {
        validateCondition({ left: c.left, operator: c.operator, right: c.right });
        const tfMs = INTERVAL_MS[c.timeframe ?? spec.session.interval];
        const w = conditionWarmup({ left: c.left, operator: c.operator, right: c.right }) + (c.barsAgo ?? 0) + (c.rightBarsAgo ?? 0);
        warmup = Math.max(warmup, Math.ceil((w * tfMs) / INTERVAL_MS[spec.session.interval]));
      } catch (e) {
        blockers.push({ code: 'condition', message: (e as Error).message, path: `${path}.conditions.${k}` });
      }
      if (c.timeframe && INTERVAL_MS[c.timeframe] < INTERVAL_MS[spec.session.interval]) blockers.push({ code: 'lower_tf', message: `A condition can’t use a timeframe (${c.timeframe}) shorter than the strategy’s ${spec.session.interval} bars.`, path: `${path}.conditions.${k}` });
      if (c.rightBarsAgo != null && (c.rightBarsAgo < 0 || c.rightBarsAgo > 200 || !Number.isInteger(c.rightBarsAgo))) blockers.push({ code: 'bars_ago', message: '“Bars ago” must be a whole number from 0 to 200.', path: `${path}.conditions.${k}` });
      if (c.barsAgo != null && (c.barsAgo < 0 || c.barsAgo > 200 || !Number.isInteger(c.barsAgo))) blockers.push({ code: 'bars_ago', message: '“Bars ago” must be a whole number from 0 to 200.', path: `${path}.conditions.${k}` });
    });
  };
  const long = m.direction !== 'short' ? spec.entry.long : null;
  const short = m.direction !== 'long' ? resolveShort(spec.entry.short, spec.entry.long) : null;
  checkGroup(long, 'entry.long');
  if (spec.entry.short !== 'mirror') checkGroup(spec.entry.short, 'entry.short');
  checkGroup(spec.exit.long, 'exit.long');
  if (spec.exit.short !== 'mirror') checkGroup(spec.exit.short, 'exit.short');
  const timeOnly = !!spec.entry.atTimes?.length;
  if (!timeOnly && !(long?.conditions.length) && !(short?.conditions.length)) blockers.push({ code: 'no_entry', message: m.direction === 'short' ? 'Add at least one short entry condition.' : m.direction === 'long' ? 'Add at least one long entry condition.' : 'Add entry conditions for long, short or both.', path: 'entry' });
  if (m.direction === 'both' && timeOnly && !long?.conditions.length && !short?.conditions.length) blockers.push({ code: 'time_both', message: 'A time trigger with no conditions can’t pick long or short: add conditions or choose one direction.', path: 'entry' });
  for (const t of spec.entry.atTimes ?? []) if (!HM.test(t)) blockers.push({ code: 'time', message: `“${t}” isn’t a time like 09:30.`, path: 'entry.atTimes' });

  if (!STRATEGY_INTERVALS.includes(spec.session.interval)) blockers.push({ code: 'interval', message: 'Unknown interval.', path: 'session.interval' });
  if (spec.session.mode === 'windows') {
    if (!spec.session.windows.length) blockers.push({ code: 'no_window', message: 'Add an entry window or trade around the clock.', path: 'session.windows' });
    for (const w of spec.session.windows) {
      if (!HM.test(w.start) || !HM.test(w.end) || w.start === w.end) blockers.push({ code: 'window', message: 'Each window needs a start and end time like 08:00, and they can’t be equal.', path: 'session.windows' });
      if (!w.days.length) blockers.push({ code: 'window_days', message: 'Each window needs at least one day.', path: 'session.windows' });
    }
    try { new Intl.DateTimeFormat('en', { timeZone: spec.session.timezone }); } catch { blockers.push({ code: 'tz', message: `Unknown time zone “${spec.session.timezone}”.`, path: 'session.timezone' }); }
  }

  const r = spec.risk;
  const sl = r.stopLoss;
  if (sl && !(sl.value > 0)) blockers.push({ code: 'stop', message: 'The stop needs a size above zero.', path: 'risk.stopLoss' });
  if (r.takeProfit && !(r.takeProfit.value > 0)) blockers.push({ code: 'target', message: 'The target needs a size above zero.', path: 'risk.takeProfit' });
  if (r.takeProfit?.mode === 'rr' && !sl) blockers.push({ code: 'rr_needs_stop', message: 'A target in R needs a stop to measure R from.', path: 'risk.takeProfit' });
  if (spec.sizing.mode === 'risk_pct' && !sl) blockers.push({ code: 'risk_needs_stop', message: 'Sizing by risk needs a stop loss.', path: 'sizing' });
  if ((r.partials.length || r.breakEvenAtR) && !sl) blockers.push({ code: 'r_needs_stop', message: 'Partial exits and break-even are measured in R, so they need a stop.', path: 'risk' });
  if (r.partials.reduce((a, p) => a + p.closePct, 0) > 100) blockers.push({ code: 'partials', message: 'Partial exits add up to more than 100%.', path: 'risk.partials' });
  if (r.trailing && !(r.trailing.value > 0)) blockers.push({ code: 'trail', message: 'The trailing stop needs a distance above zero.', path: 'risk.trailing' });
  if (!(spec.sizing.value > 0)) blockers.push({ code: 'size', message: 'The position size must be above zero.', path: 'sizing' });
  if (spec.advanced.entryType === 'limit' && (!(spec.advanced.limitOffsetPct >= 0) || !(spec.advanced.limitExpiryBars >= 1))) blockers.push({ code: 'limit', message: 'A limit entry needs an offset of 0% or more and at least one bar before it expires.', path: 'advanced' });

  if (!sl) live.push({ code: 'live_stop', message: 'Live trading needs a stop loss on every trade.', path: 'risk.stopLoss' });
  // Over-leverage: an isolated position is liquidated near a (1/leverage) move.
  if (sl?.mode === 'pct') {
    const liqPct = 100 / m.leverage - 0.5;
    if (sl.value >= liqPct) blockers.push({ code: 'over_leverage', message: `At ${m.leverage}× the position is liquidated about ${liqPct.toFixed(1)}% away, before your ${sl.value}% stop. Lower the leverage or tighten the stop.`, path: 'market.leverage' });
  } else if (sl && m.leverage >= 10) warnings.push({ code: 'liq_check', message: `At ${m.leverage}× liquidation is about ${(100 / m.leverage - 0.5).toFixed(1)}% away; make sure the stop is closer than that.` });
  if (spec.sizing.mode === 'risk_pct' && spec.sizing.value > 3) warnings.push({ code: 'big_risk', message: `${spec.sizing.value}% risk per trade: ten losses in a row would cost about ${Math.round((1 - (1 - spec.sizing.value / 100) ** 10) * 100)}%.` });
  if (!r.takeProfit && !r.trailing && !r.timeStopBars && !spec.exit.long?.conditions.length && !spec.exit.onOppositeSignal) warnings.push({ code: 'stop_only', message: 'Only the stop closes trades: winners are never taken.' });
  if ((sl?.mode === 'price' || r.takeProfit?.mode === 'price') && m.symbols.length > 1) warnings.push({ code: 'price_levels', message: 'A fixed price stop or target only makes sense for one market.' });
  if (m.marginMode === 'cross') warnings.push({ code: 'cross', message: 'Cross margin lets one losing position draw on the whole account.' });
  if (!spec.limits.dailyLossPct && !spec.limits.maxConsecutiveLosses) warnings.push({ code: 'no_limits', message: 'No daily loss cap or losing-streak stop.' });
  return { blockers, warnings, live, warmupBars: warmup };
}
