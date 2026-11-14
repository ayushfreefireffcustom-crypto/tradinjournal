// Analytics v2 numbers: pure functions over an account's closed trades, built
// on the dashboard's helpers in compute.ts (sessions, trade context, leaks,
// grades, behaviour score, R availability) so both pages always agree.
//
// Conventions (also shown on the page, see packages/contracts/src/schema/analytics-v2.ts):
//   • UTC. Hour, weekday and session come from the trade's OPEN; days, weeks
//     (Monday start) and months from its CLOSE.
//   • R only when useR() holds (≥ 10 trades and at least half carry a stored
//     R-multiple); otherwise every R widget is in $.
//   • MAE/MFE widgets (scatter, exit efficiency, break-even what-if) only when
//     maeMfe() holds (≥ 10 trades and ≥ 30% carry stored metric data).
//   • "Rules" = the dashboard's process flags, in this order: after 2 losses
//     that day, within 15 min of a loss, over 1.5× usual size, losing hour,
//     past −1.25R (R only). A trade that broke several counts once, under the
//     first. Needs MIN_TRADES trades (the losing-hour baseline needs history).
//   • What-if uses the dashboard's ranked leaks; any combination is the union
//     of their trades, so a trade is never counted twice.
import type {
  AiLine, AnaAgg, AnaBehaviour, AnaDay, AnaExit, AnaFix, AnaHold, AnaHourCell, AnalyticsV2DTO, AnaMonth,
  AnaNavItem, AnaOverview, AnaPerformance, AnaRisk, AnaRuleBucket, AnaRuleKey, AnaSegment, AnaStats,
  AnaSymbols, AnaSymbolSeries, AnaTime, AnaWeek, AnaWhatIf, DashDistribution, DashMaeMfe, DashRolling, DashSession,
} from '@tradinjournal/contracts';
import {
  agg, applyFilters, baseline, behaviour as dashBehaviour, bestHours, checks, DAY, distribution, findLeaks, fmtMoney,
  grade, hourOf, inWindow, maeMfe, median, MIN_TRADES, OVERSIZE, rolling, sample, SESSION_LABEL, sessionOf,
  symbols as dashSymbols, tradeContext, useR, weekdayOf, dayKey, type Baseline, type ComputeOptions, type InsightTrade,
  type TradeContext,
} from './compute.js';

export interface AnalyticsTrade extends InsightTrade {
  /** Emotion logged in the journal for this trade, if any. */
  emotion?: string | null;
}

const SESSIONS: DashSession[] = ['ASIA', 'LONDON', 'NY'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
const nTrades = (n: number) => `${n} trade${n === 1 ? '' : 's'}`;
const pct0 = (v: number) => `${Math.round(v * 100)}%`;
const fmtDay = (ms: number) => `${MONTHS[new Date(ms).getUTCMonth()]} ${new Date(ms).getUTCDate()}`;
const pf = (ts: InsightTrade[]) => {
  const gp = sum(ts.filter(t => t.net > 0), t => t.net), gl = -sum(ts.filter(t => t.net < 0), t => t.net);
  return gl > 0 ? round(gp / gl) : null;
};
function line(text: string, value: number | null, fmt: AiLine['fmt'], trades: number, tone?: AiLine['tone'], suffix?: string): AiLine {
  return {
    text, value: value == null ? null : round(value, fmt === 'pct' ? 4 : 2), fmt, trades,
    tone: tone ?? (value == null || fmt === 'pct' || fmt === 'int' ? 'flat' : value > 0 ? 'up' : value < 0 ? 'dn' : 'flat'),
    ...(suffix ? { suffix } : {}),
  };
}
function groupBy<K, T>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
  return m;
}
const tone = (v: number): 'up' | 'dn' | 'flat' => (v > 0 ? 'up' : v < 0 ? 'dn' : 'flat');

/** Monday (UTC) of the week a timestamp falls in, as YYYY-MM-DD. */
export function weekStart(ms: number): string {
  const d = new Date(ms);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}
export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/** Round a duration up to a readable step (1m … 1w). */
const STEPS = [60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3.6e6, 2 * 3.6e6, 3 * 3.6e6, 4 * 3.6e6, 6 * 3.6e6, 8 * 3.6e6, 12 * 3.6e6, DAY, 2 * DAY, 3 * DAY, 7 * DAY];
export function niceDuration(ms: number): number { return STEPS.find(s => s >= ms) ?? Math.ceil(ms / (7 * DAY)) * 7 * DAY; }
export function fmtDuration(ms: number): string {
  if (ms < 3.6e6) return `${Math.max(1, Math.round(ms / 60e3))}m`;
  if (ms < DAY) return `${+(ms / 3.6e6).toFixed(1)}h`;
  return `${+(ms / DAY).toFixed(1)}d`;
}

/** Usual (median) volume per symbol over the whole history; symbols with < 3 trades have none. Same rule as tradeContext. */
export function usualSize(all: InsightTrade[]): Map<string, number | null> {
  const m = groupBy(all, t => t.symbol);
  return new Map([...m].map(([s, ts]) => [s, ts.length >= 3 ? median(ts.map(t => t.volume)) : null]));
}

// ─── rules (the dashboard's grade flags) ─────────────────────────────────────

const REASON_KEY: Record<string, AnaRuleKey> = {
  'After 2 losses': 'after-losses', 'Within 15 min of a loss': 'revenge', Oversized: 'oversized', 'Losing hour': 'hour', 'Past −1.25R': 'tail',
};
export const RULE_LABEL: Record<AnaRuleKey, string> = {
  'after-losses': 'After 2 losses', revenge: '≤15m after loss', oversized: 'Over 1.5× size', hour: 'Losing hour', tail: 'Past −1.25R',
};
const RULE_ORDER: AnaRuleKey[] = ['after-losses', 'revenge', 'oversized', 'hour', 'tail'];

/** First rule each trade broke (null = kept every rule). Needs MIN_TRADES trades, else null. */
export function firstRuleBroken(T: InsightTrade[], ctx: Map<string, TradeContext>, b: Baseline = baseline(T)): Map<string, AnaRuleKey | null> | null {
  if (T.length < MIN_TRADES) return null;
  return new Map(T.map(t => { const r = grade(t, ctx.get(t.id), b).reasons[0]; return [t.id, r ? REASON_KEY[r] ?? null : null]; }));
}

export function ruleWaterfall(T: InsightTrade[], first: Map<string, AnaRuleKey | null>): NonNullable<AnaBehaviour['waterfall']> {
  const kept = T.filter(t => first.get(t.id) == null);
  const rules: AnaRuleBucket[] = [];
  for (const key of RULE_ORDER) {
    const ts = T.filter(t => first.get(t.id) === key);
    if (ts.length) rules.push({ key, label: RULE_LABEL[key], ...agg(ts) });
  }
  return { kept: agg(kept), rules, total: agg(T) };
}

// ─── overview ────────────────────────────────────────────────────────────────

export function segments(T: InsightTrade[], R: boolean, max = 16): { rows: AnaSegment[]; hidden: number } {
  const rows: AnaSegment[] = [];
  for (const [k, ts] of groupBy(T, t => `${t.symbol}|${sessionOf(t.open)}`)) {
    if (ts.length < 3) continue;
    const [symbol, session] = k.split('|') as [string, DashSession];
    const rs = ts.filter(t => t.r != null);
    const avg = R ? (rs.length ? sum(rs, t => t.r!) / rs.length : 0) : sum(ts, t => t.net) / ts.length;
    rows.push({ symbol, session, ...agg(ts), avg: round(avg, R ? 3 : 2) });
  }
  rows.sort((a, b) => b.net - a.net);
  if (rows.length <= max) return { rows, hidden: 0 };
  const half = max >> 1;
  return { rows: [...rows.slice(0, half), ...rows.slice(-half)], hidden: rows.length - max };
}

function overview(T: InsightTrade[], first: Map<string, AnaRuleKey | null> | null, R: boolean): AnaOverview {
  const all = agg(T);
  const ses = SESSIONS.map(s => ({ s, ts: T.filter(t => sessionOf(t.open) === s) })).map(x => ({ ...x, a: agg(x.ts) })).filter(x => x.a.n);
  const best = [...ses].sort((a, b) => b.a.net - a.a.net)[0];
  const edge = best && best.a.net > 0 ? { label: SESSION_LABEL[best.s], ...best.a } : null;
  const neg = ses.filter(x => x.a.net < 0).sort((a, b) => a.a.net - b.a.net);
  const bleed = neg.length ? { label: neg.map(x => SESSION_LABEL[x.s]).join(' + '), ...agg(neg.flatMap(x => x.ts)) } : null;
  const broken = first ? T.filter(t => first.get(t.id) != null) : null;
  const seg = segments(T, R);
  let ai: AiLine | null = null;
  if (edge && all.net > 0 && bleed) ai = line(`${edge.label} made ${pct0(edge.net / all.net)} of your net; ${bleed.label} gave back`, bleed.net, 'money', all.n);
  else if (edge && all.net > 0) ai = line(`${edge.label} made`, edge.net / all.net, 'pct', edge.n, 'up', 'of your net');
  else if (seg.rows.length) { const w = seg.rows.at(-1)!; if (w.net < 0) ai = line(`${w.symbol} ${SESSION_LABEL[w.session]}:`, w.net, 'money', w.n, 'dn', `on ${nTrades(w.n)}`); }
  return {
    net: { ...all, profitFactor: pf(T) }, edge, bleed, rulesBroken: broken ? agg(broken) : null,
    segments: seg.rows, segmentsHidden: seg.hidden, segUnit: R ? 'R' : '$', winRate: all.n ? round(all.wins / all.n, 4) : 0, ai,
  };
}

// ─── performance ─────────────────────────────────────────────────────────────

export function streaks(T: InsightTrade[]): { win: number; loss: number } {
  let w = 0, l = 0, bw = 0, bl = 0;
  for (const t of T) {
    if (t.net > 0) { w++; l = 0; } else if (t.net < 0) { l++; w = 0; } else { w = 0; l = 0; }
    bw = Math.max(bw, w); bl = Math.max(bl, l);
  }
  return { win: bw, loss: bl };
}

function performance(T: InsightTrade[], R: boolean): AnaPerformance {
  const days: AnaDay[] = [...groupBy(T, t => dayKey(t.close))].map(([d, ts]) => ({
    d, ...agg(ts), r: R ? round(sum(ts.filter(t => t.r != null), t => t.r!), 3) : null,
  })).sort((a, b) => (a.d < b.d ? -1 : 1));
  const weeks: AnaWeek[] = [...groupBy(T, t => weekStart(t.close))].map(([start, ts]) => ({ start, ...agg(ts) })).sort((a, b) => (a.start < b.start ? -1 : 1));
  const worst = weeks.filter(w => w.net < 0).sort((a, b) => a.net - b.net)[0] ?? null;
  const bestW = weeks.filter(w => w.net > 0).sort((a, b) => b.net - a.net)[0] ?? null;
  const months: AnaMonth[] = [...groupBy(T, t => monthKey(t.close))].map(([key, ts]) => ({ key, ...agg(ts) })).sort((a, b) => (a.key < b.key ? -1 : 1));
  const green = weeks.filter(w => w.net > 0).length;
  const wins = T.filter(t => t.net > 0), losses = T.filter(t => t.net < 0);
  const rs = T.filter(t => t.r != null);
  const st = streaks(T);
  const side = (s: 'LONG' | 'SHORT') => agg(T.filter(t => t.side === s));
  const stats: AnaStats = {
    winRate: round(wins.length / T.length, 4), profitFactor: pf(T),
    expectancy: round(sum(T, t => t.net) / T.length), expectancyR: R ? round(sum(rs, t => t.r!) / rs.length, 3) : null,
    avgWin: wins.length ? round(sum(wins, t => t.net) / wins.length) : 0, avgLoss: losses.length ? round(sum(losses, t => t.net) / losses.length) : 0,
    best: round(Math.max(...T.map(t => t.net))), worst: round(Math.min(...T.map(t => t.net))),
    maxWinStreak: st.win, maxLossStreak: st.loss, medianHoldMs: Math.round(median(T.map(t => Math.max(0, t.close - t.open)))),
    long: side('LONG'), short: side('SHORT'),
  };
  const perTrade = months.filter(m => m.n >= 3).sort((a, b) => a.net / a.n - b.net / b.n)[0];
  const monthName = (k: string) => MONTHS[Number(k.slice(5, 7)) - 1]!;
  return {
    days, weeks, worstWeek: worst?.start ?? null, greenWeeks: green, rUnit: R, months, stats,
    ai: {
      header: weeks.length ? line(`${green} of ${weeks.length} week${weeks.length === 1 ? '' : 's'} green`, null, 'text', T.length) : null,
      calendar: worst ? line(`Worst week ${fmtDay(Date.parse(worst.start))}:`, worst.net, 'money', worst.n)
        : bestW ? line(`Best week ${fmtDay(Date.parse(bestW.start))}:`, bestW.net, 'money', bestW.n) : null,
      months: months.length >= 2 && perTrade ? line(`${monthName(perTrade.key)}: least per trade,`, perTrade.net / perTrade.n, 'money', perTrade.n) : null,
      stats: st.loss >= 2 ? line('Longest losing run:', st.loss, 'int', T.length, 'flat', 'trades') : null,
    },
  };
}

// ─── time ────────────────────────────────────────────────────────────────────

/** The "after HH:00" cut-off (08–21 UTC by open) after which trading loses the most. Same rule as findLeaks. */
export function lateCut(T: InsightTrade[]): (AnaAgg & { from: number }) | null {
  let best: (AnaAgg & { from: number }) | null = null;
  for (let h = 8; h <= 21; h++) {
    const ts = T.filter(t => hourOf(t.open) >= h);
    const a = agg(ts);
    if (ts.length >= 3 && ts.length < T.length && a.net < 0 && (!best || a.net < best.net)) best = { from: h, ...a };
  }
  return best;
}

function time(T: InsightTrade[]): AnaTime {
  const days = [1, 2, 3, 4, 5];
  if (T.some(t => weekdayOf(t.open) === 6)) days.push(6);
  if (T.some(t => weekdayOf(t.open) === 0)) days.push(0);
  const cells: AnaHourCell[] = [...groupBy(T, t => `${weekdayOf(t.open)}|${hourOf(t.open)}`)].map(([k, ts]) => {
    const [day, hour] = k.split('|').map(Number) as [number, number];
    return { day, hour, ...agg(ts) };
  });
  const sessions = SESSIONS.map(session => ({ session, ...agg(T.filter(t => sessionOf(t.open) === session)) }));
  const late = lateCut(T);
  const bh = bestHours(T);
  const weakest = sessions.filter(s => s.n >= 3).sort((a, b) => a.wins / a.n - b.wins / b.n)[0];
  const worstSes = [...sessions].filter(s => s.n).sort((a, b) => a.net - b.net)[0];
  return {
    days, cells,
    dayTotals: days.map(day => ({ day, ...agg(T.filter(t => weekdayOf(t.open) === day)) })),
    hourTotals: Array.from({ length: 24 }, (_, hour) => ({ hour, ...agg(T.filter(t => hourOf(t.open) === hour)) })),
    late, bestHours: bh, sessions,
    ai: {
      header: late ? line(`After ${hh(late.from)}:`, late.wins / late.n, 'pct', late.n, 'dn', 'won')
        : worstSes && worstSes.net < 0 ? line(`${SESSION_LABEL[worstSes.session]}:`, worstSes.net, 'money', worstSes.n) : null,
      heat: bh ? line(`Best hours ${hh(bh.from)}–${hh(bh.to)}:`, bh.inside.net, 'money', bh.inside.n) : late ? line(`After ${hh(late.from)}:`, late.net, 'money', late.n) : null,
      sessions: weakest ? line(`${SESSION_LABEL[weakest.session]}:`, weakest.wins / weakest.n, 'pct', weakest.n, weakest.wins / weakest.n < 0.4 ? 'dn' : 'flat', 'won') : null,
    },
  };
}

// ─── symbols ─────────────────────────────────────────────────────────────────

function symbolsView(T: InsightTrade[], maxSeries = 9, maxGrid = 8): AnaSymbols {
  const dash = new Map(dashSymbols(T).map(r => [r.symbol, r]));
  const groups = [...groupBy(T, t => t.symbol)].map(([symbol, ts]) => ({ symbol, ts, a: agg(ts) })).sort((a, b) => b.a.n - a.a.n || b.a.net - a.a.net);
  const series: AnaSymbolSeries[] = groups.slice(0, maxSeries).map(({ symbol, ts, a }) => {
    let c = 0;
    const pts = sample([{ t: ts[0]!.open, v: 0 }, ...ts.map(t => ({ t: t.close, v: round((c += t.net)) }))], 80);
    const months = [...groupBy(ts, t => monthKey(t.close)).values()];
    const tag = dash.get(symbol)?.tag?.kind ?? null;
    return { symbol, ...a, profitFactor: pf(ts), pts, monthsLost: months.filter(m => sum(m, t => t.net) < 0).length, monthsTraded: months.length, flag: tag };
  });
  const gridSyms = groups.slice(0, maxGrid).map(g => g.symbol);
  const cells = gridSyms.flatMap(symbol => SESSIONS.map(session => ({ symbol, session, ...agg(T.filter(t => t.symbol === symbol && sessionOf(t.open) === session)) })));
  const paused = groups.find(g => dash.get(g.symbol)?.tag?.kind === 'pause');
  const worst = [...groups].filter(g => g.a.n >= 3 && g.a.net < 0).sort((a, b) => a.a.net - b.a.net)[0];
  const flagged = paused && gridSyms.includes(paused.symbol) ? paused.symbol : null;
  const share = [...dash.values()].find(r => r.tag?.kind === 'share');
  const focus = paused ?? worst;
  let seriesAi: AiLine | null = null;
  if (focus) {
    const s = series.find(x => x.symbol === focus.symbol);
    seriesAi = s && s.monthsTraded >= 2 && s.monthsLost >= 2
      ? line(`${focus.symbol} lost in ${s.monthsLost === s.monthsTraded ? `all ${s.monthsTraded}` : `${s.monthsLost} of ${s.monthsTraded}`} months`, null, 'text', focus.a.n)
      : line(`${focus.symbol}:`, focus.a.net, 'money', focus.a.n, 'dn', `on ${nTrades(focus.a.n)}`);
  }
  let gridAi: AiLine | null = null;
  if (focus && gridSyms.includes(focus.symbol)) {
    const pos = cells.filter(c => c.symbol === focus.symbol && c.n && c.net > 0);
    gridAi = pos.length === 1 ? line(`${focus.symbol}: only ${SESSION_LABEL[pos[0]!.session]} is positive`, null, 'text', focus.a.n)
      : pos.length === 0 ? line(`${focus.symbol}: no session is positive`, null, 'text', focus.a.n) : null;
  }
  if (!gridAi) {
    const best = cells.filter(c => c.n >= 3 && c.net > 0).sort((a, b) => b.net - a.net)[0];
    if (best) gridAi = line(`Best: ${best.symbol} ${SESSION_LABEL[best.session]}`, best.net, 'money', best.n);
  }
  return {
    series, hidden: Math.max(0, groups.length - maxSeries),
    grid: { symbols: gridSyms, cells, flagged },
    ai: {
      header: share?.tag?.pct != null ? line(share.symbol, share.tag.pct, 'pct', share.trades, 'up', 'of profit')
        : worst ? line(`${worst.symbol}:`, worst.a.net, 'money', worst.a.n) : null,
      series: seriesAi, grid: gridAi,
    },
  };
}

// ─── risk & R ────────────────────────────────────────────────────────────────

export function holdView(T: InsightTrade[], R: boolean): AnaHold | null {
  const ts = R ? T.filter(t => t.r != null) : T;
  if (ts.length < 10) return null;
  const ms = (t: InsightTrade) => Math.max(1000, t.close - t.open);
  const wins = ts.filter(t => t.net > 0).map(ms).sort((a, b) => a - b), lossT = ts.filter(t => t.net < 0);
  const ratio = wins.length >= 3 && lossT.length >= 3 ? round(median(lossT.map(ms)) / median(wins), 1) : null;
  let longLosers: AnaHold['longLosers'] = null;
  if (wins.length >= 3) {
    const thr = niceDuration(wins[Math.min(wins.length - 1, Math.round(0.75 * (wins.length - 1)))]!);
    const long = lossT.filter(t => ms(t) > thr);
    if (long.length >= 3) longLosers = { thresholdMs: thr, n: long.length, net: round(sum(long, t => t.net)) };
  }
  return { unit: R ? 'R' : '$', points: sample(ts, 1500).map(t => ({ ms: ms(t), v: round(R ? t.r! : t.net, R ? 3 : 2), win: t.net > 0 })), longLosers, ratio };
}

export function exitEfficiency(T: InsightTrade[]): AnaExit | null {
  const ws = T.filter(t => t.net > 0 && t.mfe != null && Math.abs(t.mfe) > 0);
  if (ws.length < 5) return null;
  const kept = ws.map(t => Math.max(0, Math.min(1, t.net / Math.abs(t.mfe!))));
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: 0 }));
  for (const k of kept) bins[Math.min(9, Math.floor(k * 10))]!.n++;
  return { bins, avg: round(sum(kept, k => k) / kept.length, 4), n: ws.length };
}

/** Exact rolling-window high (rolling() only returns a sampled line). */
function rollingHigh(T: InsightTrade[], R: boolean, window: number): number | null {
  const ts = R ? T.filter(t => t.r != null) : T;
  if (ts.length < window + 10) return null;
  const v = (t: InsightTrade) => (R ? t.r! : t.net);
  let s = 0, hi = -Infinity;
  ts.forEach((t, i) => { s += v(t); if (i >= window) s -= v(ts[i - window]!); if (i >= window - 1) hi = Math.max(hi, s / window); });
  return round(hi, R ? 3 : 2);
}

function risk(T: InsightTrade[], R: boolean, dist: DashDistribution | null, mm: DashMaeMfe | null, r20: DashRolling | null, r50: DashRolling | null): AnaRisk {
  const wins = T.filter(t => t.net > 0), losses = T.filter(t => t.net < 0);
  const avgWin = wins.length ? round(sum(wins, t => t.net) / wins.length) : 0, avgLoss = losses.length ? round(sum(losses, t => t.net) / losses.length) : 0;
  const hold = holdView(T, R);
  const exit = mm ? exitEfficiency(T) : null;
  const high = r20 ? rollingHigh(T, r20.unit === 'R', 20) : null;
  const fmtV = (v: number) => (r20?.unit === 'R' ? `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}R` : fmtMoney(v));
  return {
    unit: R ? 'R' : '$', withR: T.filter(t => t.r != null).length, withMae: T.filter(t => t.mae != null && t.mfe != null).length,
    distribution: dist, hold, maeMfe: mm, rolling20: r20, rolling50: r50, exit, avgWin, avgLoss,
    ai: {
      header: wins.length && losses.length ? line(`Avg loss ${fmtMoney(avgLoss)} vs win`, avgWin, 'money', T.length) : null,
      distribution: dist?.tail
        ? dist.unit === 'R' ? line('Keep the −1R stop:', dist.tail.excess, 'money', dist.tail.trades, 'up') : line('Cap losses at 1.5× avg:', dist.tail.excess, 'money', dist.tail.trades, 'up')
        : null,
      hold: hold?.ratio != null && hold.ratio !== 1
        ? line(`Losers held ${hold.ratio > 1 ? `${hold.ratio.toFixed(1)}× longer` : `${(1 / hold.ratio).toFixed(1)}× shorter`}`, null, 'text', hold.points.length)
        : null,
      maeMfe: mm?.gaveBack ? line(`${mm.gaveBack.trades} losers green first:`, mm.gaveBack.net, 'money', mm.gaveBack.trades) : null,
      rolling: r20 ? line('Now', r20.now, r20.unit === 'R' ? 'r' : 'money', 20, undefined, high != null ? `· high ${fmtV(high)}` : undefined) : null,
      exit: exit ? line('Winners keep', exit.avg, 'pct', exit.n, 'flat', 'of the move') : null,
    },
  };
}

// ─── behaviour ───────────────────────────────────────────────────────────────

function behaviourView(T: InsightTrade[], ctx: Map<string, TradeContext>, usual: Map<string, number | null>, first: Map<string, AnaRuleKey | null> | null, R: boolean): AnaBehaviour {
  const waterfall = first ? ruleWaterfall(T, first) : null;
  const score = dashBehaviour(T, ctx);
  let strips: AnaBehaviour['strips'] = null;
  if (score) {
    const b = baseline(T);
    const res = T.map(t => checks(t, ctx.get(t.id), b));
    const last = res.slice(-300);
    strips = (['discipline', 'risk', 'timing'] as const).map(key => ({
      key, label: key[0]!.toUpperCase() + key.slice(1), failed: res.filter(r => !r[key]).length, bits: last.map(r => (r[key] ? '1' : '0')).join(''),
    }));
  }
  const rel = (t: InsightTrade) => { const u = usual.get(t.symbol); return u && u > 0 ? t.volume / u : null; };
  const byLosses: AnaBehaviour['byLosses'] = T.length < 10 ? [] : (['0', '1', '2', '3+'] as const).map(key => {
    const ts = T.filter(t => { const p = ctx.get(t.id)?.priorLosses ?? 0; return key === '3+' ? p >= 3 : p === Number(key); });
    const sizes = ts.map(rel).filter((x): x is number => x != null);
    return { key, ...agg(ts), size: sizes.length ? round(sum(sizes, x => x) / sizes.length) : null };
  });
  let bySize: AnaBehaviour['bySize'] = null;
  if (T.length >= 10) {
    const defs = [
      { key: 'normal' as const, label: 'Usual size (≤1.2×)', test: (x: number) => x <= 1.2 },
      { key: 'up' as const, label: '1.2–1.5× usual', test: (x: number) => x > 1.2 && x <= OVERSIZE },
      { key: 'big' as const, label: `Over ${OVERSIZE}× usual`, test: (x: number) => x > OVERSIZE },
    ];
    const rows = defs.map(d => {
      const ts = T.filter(t => { const x = rel(t); return x != null && d.test(x); });
      const rs = ts.filter(t => t.r != null);
      const avg = R ? (rs.length ? sum(rs, t => t.r!) / rs.length : 0) : ts.length ? sum(ts, t => t.net) / ts.length : 0;
      return { key: d.key, label: d.label, ...agg(ts), avg: round(avg, R ? 3 : 2) };
    }).filter(r => r.n > 0);
    if (rows.filter(r => r.n >= 3).length >= 2) bySize = { unit: R ? 'R' : '$', rows };
  }
  const tagRows = [...groupBy(T.flatMap(t => t.tags.map(tag => ({ tag, t }))), x => x.tag)].map(([label, xs]) => ({ label, ...agg(xs.map(x => x.t)) })).sort((a, b) => b.net - a.net).slice(0, 8);
  const emoRows = [...groupBy((T as AnalyticsTrade[]).filter(t => t.emotion), t => t.emotion!)].map(([label, ts]) => ({ label, ...agg(ts) })).sort((a, b) => b.net - a.net);
  const two = byLosses.find(x => x.key === '2');
  const big = bySize?.rows.find(r => r.key === 'big');
  const drop = score ? [...score.parts].sort((a, b) => (a.last30 - a.score) - (b.last30 - b.score))[0]! : null;
  const unitFmt: AiLine['fmt'] = R ? 'r' : 'money';
  return {
    waterfall, score, strips, byLosses, bySize, tags: tagRows, emotions: emoRows,
    ai: {
      header: score ? line(`Score ${score.score}/100 · last 30:`, score.last30, 'int', T.length, score.last30 < score.score ? 'dn' : score.last30 > score.score ? 'up' : 'flat') : null,
      waterfall: waterfall && waterfall.kept.n ? line('Rules kept:', waterfall.kept.net, 'money', waterfall.kept.n, undefined, `on ${nTrades(waterfall.kept.n)}`) : null,
      score: drop ? (drop.last30 < drop.score ? line(`${drop.label} fell most lately`, null, 'text', Math.min(30, T.length)) : line('All three held up lately', null, 'text', Math.min(30, T.length))) : null,
      losses: two && two.n >= 3 ? line('After 2 losses:', two.wins / two.n, 'pct', two.n, two.wins / two.n < 0.4 ? 'dn' : 'flat', 'won') : null,
      size: big && big.n >= 3 ? line(`Over ${OVERSIZE}× size:`, big.avg, unitFmt, big.n, undefined, 'per trade') : null,
    },
  };
}

// ─── what-if ─────────────────────────────────────────────────────────────────

export function fixLabel(key: string, label: string): string {
  if (key === 'late') return `No trades ${label.toLowerCase()}`;
  if (key === 'after-losses') return 'Day ends after 2 losses';
  if (key === 'revenge') return 'Wait 15 min after a loss';
  if (key === 'oversized') return `Max ${OVERSIZE}× usual size`;
  if (key.startsWith('sym:')) return `No ${label}`;
  if (key.startsWith('ses:')) return `Skip the ${label}`;
  if (key.startsWith('day:')) return `No trades on ${label}`;
  return label;
}

/** gains[mask] / removed[mask] for every combination of fixes (union of trades, each counted once). */
export function combinations(T: InsightTrade[], sets: string[][]): { gains: number[]; removed: number[] } {
  const net = new Map(T.map(t => [t.id, t.net]));
  const gains: number[] = [], removed: number[] = [];
  for (let mask = 0; mask < 1 << sets.length; mask++) {
    const ids = new Set<string>();
    sets.forEach((s, i) => { if (mask & (1 << i)) for (const id of s) ids.add(id); });
    gains.push(round(-sum([...ids], id => net.get(id) ?? 0)) || 0);
    removed.push(ids.size);
  }
  return { gains, removed };
}

function whatIf(T: InsightTrade[], ctx: Map<string, TradeContext>, R: boolean, mm: DashMaeMfe | null): AnaWhatIf {
  const leaks = findLeaks(T, ctx);
  const fixes: AnaFix[] = leaks.map(l => ({ key: l.key, label: fixLabel(l.key, l.label), alone: round(-l.net), trades: l.trades }));
  const { gains, removed } = combinations(T, leaks.map(l => l.ids));
  // Default: the top fix, then whichever other fix adds the most on top of it (if anything).
  let defaultMask = fixes.length ? 1 : 0;
  let bestAdd = 0;
  for (let i = 1; i < fixes.length; i++) {
    const add = gains[1 | (1 << i)]! - gains[1]!;
    if (add > bestAdd + 1e-9) { bestAdd = add; defaultMask = 1 | (1 << i); }
  }
  const chosen = fixes.filter((_, i) => defaultMask & (1 << i)).length;
  const base = round(sum(T, t => t.net));
  let breakEven: AnaWhatIf['breakEven'] = null;
  const needs: AnaWhatIf['breakEvenNeeds'] = !mm ? 'mae' : !R ? 'r' : null;
  if (!needs) {
    const hits = T.filter(t => t.net < 0 && t.r != null && t.r < 0 && t.mfe != null && Math.abs(t.mfe) >= Math.abs(t.net / t.r));
    if (hits.length) breakEven = { gain: round(-sum(hits, t => t.net)), trades: hits.length };
  }
  const full = gains[gains.length - 1] ?? 0;
  const extra = round(full - (gains[defaultMask] ?? 0));
  return {
    base, fixes, gains, removed, defaultMask, breakEven, breakEvenNeeds: needs,
    ai: {
      header: fixes.length ? line(`${chosen === 2 ? 'Two rules' : 'One rule'}:`, base + gains[defaultMask]!, 'money', T.length) : null,
      steps: fixes.length ? line(`${removed[defaultMask]} trades removed`, null, 'text', removed[defaultMask]!) : null,
      rules: fixes.length > chosen ? line(`Adding the other ${fixes.length - chosen}:`, extra, 'money', T.length) : null,
    },
  };
}

// ─── the one call ────────────────────────────────────────────────────────────

const nav = (view: AnaNavItem['view'], value: number | null, fmt: AnaNavItem['fmt'], den?: number): AnaNavItem => ({
  view, value: value == null ? null : round(value, fmt === 'r' ? 3 : 2), fmt, ...(den != null ? { den } : {}),
  tone: value == null || fmt === 'weeks' ? 'flat' : tone(value),
});

export function computeAnalytics(allTrades: AnalyticsTrade[], o: ComputeOptions): AnalyticsV2DTO {
  const all = [...allTrades].sort((a, b) => a.close - b.close);
  const ctx = tradeContext(all);
  const usual = usualSize(all);
  const win = inWindow(all, o.window);
  const T = applyFilters(win, o.filters) as AnalyticsTrade[];
  const symCount = new Map<string, number>();
  for (const t of win) symCount.set(t.symbol, (symCount.get(t.symbol) ?? 0) + 1);
  const base: AnalyticsV2DTO = {
    asOf: new Date(o.now).toISOString(), window: o.window,
    options: { symbols: [...symCount].sort((a, b) => b[1] - a[1]).map(([symbol, trades]) => ({ symbol, trades })), tags: [...new Set(win.flatMap(t => t.tags))].sort() },
    counts: { trades: T.length, inWindow: win.length, allClosed: all.length, withR: T.filter(t => t.r != null).length, withMae: T.filter(t => t.mae != null && t.mfe != null).length },
    minTrades: MIN_TRADES,
    nav: (['overview', 'performance', 'time', 'symbols', 'risk', 'behaviour', 'whatif'] as const).map(v => nav(v, null, 'money')),
    overview: null, performance: null, time: null, symbols: null, risk: null, behaviour: null, whatif: null,
  };
  if (!T.length) return base;

  const R = useR(T);
  const first = firstRuleBroken(T, ctx);
  const mm = maeMfe(T);
  const ov = overview(T, first, R);
  const perf = performance(T, R);
  const tm = time(T);
  const sy = symbolsView(T);
  const rk = risk(T, R, distribution(T), mm, rolling(T, 20), rolling(T, 50));
  const bh = behaviourView(T, ctx, usual, first, R);
  const wi = whatIf(T, ctx, R, mm);

  const worstSym = [...groupBy(T, t => t.symbol)].map(([, ts]) => agg(ts)).filter(a => a.n >= 3).sort((a, b) => a.net - b.net)[0];
  const bestSym = [...groupBy(T, t => t.symbol)].map(([, ts]) => agg(ts)).sort((a, b) => b.net - a.net)[0];
  const worstSes = [...tm.sessions].filter(s => s.n).sort((a, b) => a.net - b.net)[0];
  const exp = R ? perf.stats.expectancyR : perf.stats.expectancy;
  return {
    ...base,
    nav: [
      nav('overview', ov.net.net, 'money'),
      nav('performance', perf.greenWeeks, 'weeks', perf.weeks.length),
      nav('time', tm.late?.net ?? (worstSes && worstSes.net < 0 ? worstSes.net : null), 'kmoney'),
      nav('symbols', worstSym && worstSym.net < 0 ? worstSym.net : bestSym?.net ?? null, 'kmoney'),
      nav('risk', exp, R ? 'r' : 'money'),
      nav('behaviour', ov.rulesBroken?.net ?? null, 'kmoney'),
      nav('whatif', wi.fixes.length ? wi.gains[wi.defaultMask]! : null, 'kmoney'),
    ],
    overview: ov, performance: perf, time: tm, symbols: sy, risk: rk, behaviour: bh, whatif: wi,
  };
}
