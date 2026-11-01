// Backtest engine v2 (F12). Pure and deterministic: same spec, candles and
// parameters, same result.
//
// How a bar is processed, per symbol:
//   1. orders from the previous close fill at this bar's open (market, with
//      slippage), or a resting limit fills if the bar trades through it
//   2. an open position checks its exits inside the bar. When a stop and a
//      target could both have been hit in the same bar, the stop is assumed to
//      come first (the worse outcome), and a gap through the stop fills at the
//      open. Liquidation is checked before the stop.
//   3. trailing stops and break-even moves update from this bar's range and
//      apply from the next bar
//   4. at the close: time stops, exit signals and new entry signals. Signal
//      orders execute at the next bar's open.
// Fees use the venue's taker rate for market orders and stops, maker for
// limits, targets and partials. Equity is cash plus open P&L, marked at each
// close.
import type { Candle } from '../trader/types.js';
import { SignalEngine } from './signals.js';
import { INTERVAL_MS, VENUE_INFO, resolveShort, type SignalGroup, type StrategySpec } from './spec.js';
import { planEntry } from './plan.js';

export interface BacktestParams {
  capital: number;
  slippageBps: number;
  /** Override the venue's fees. */
  fees?: { takerBps: number; makerBps: number };
  /** Only trade bars at or after this time (indicators still warm up on earlier bars). */
  from?: number;
  to?: number;
  /** Deployments: leave positions open at the end and report them, with pending orders. */
  keepOpen?: boolean;
  /** Deployments: no new entries for orders that would execute inside these ranges (paused). */
  blocked?: Array<{ from: number; to: number | null }>;
  /** Deployments: size multiplier from a time on (later entries win). */
  sizeSchedule?: Array<{ from: number; multiplier: number }>;
  /** Record each evaluation from this time on (activity feed). */
  traceFrom?: number;
}

export type TraceKind = 'signal' | 'no_signal' | 'blocked' | 'holding' | 'exit_signal' | 'filled' | 'closed' | 'skipped';
export interface TraceEvent { t: number; symbol: string; kind: TraceKind; message: string; conditions?: Array<{ text: string; met: boolean | null }> }
export interface OpenPosition { symbol: string; side: 'long' | 'short'; qty: number; entryPrice: number; entryTime: number; stop: number | null; target: number | null; lastPrice: number; unrealized: number; notional: number; fees: number }

export type ExitReason = 'stop' | 'target' | 'trailing' | 'breakeven' | 'time' | 'signal' | 'opposite' | 'liquidation' | 'end';
export interface BacktestTrade {
  symbol: string;
  side: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  qty: number;
  notional: number;
  pnl: number;
  pnlPct: number;
  rMultiple: number | null;
  fees: number;
  slippage: number;
  barsHeld: number;
  reason: ExitReason;
  partialFills: number;
}
export interface BacktestMetrics {
  startEquity: number;
  endEquity: number;
  totalReturnPct: number;
  cagrPct: number | null;
  trades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  avgTradePct: number | null;
  bestTradePct: number | null;
  worstTradePct: number | null;
  expectancyR: number | null;
  maxDrawdownPct: number;
  sharpe: number | null;
  sortino: number | null;
  exposurePct: number;
  fees: number;
  slippage: number;
  avgSlippageBps: number | null;
  longTrades: number;
  shortTrades: number;
  avgBarsHeld: number | null;
}
export interface BacktestResult {
  metrics: BacktestMetrics;
  equity: Array<{ t: number; equity: number }>;
  trades: BacktestTrade[];
  perSymbol: Array<{ symbol: string; trades: number; pnl: number; winRatePct: number | null }>;
  notes: string[];
  range: { from: number | null; to: number | null; bars: number };
  /** With keepOpen: positions still open, and orders waiting for the next bar. */
  open?: OpenPosition[];
  pending?: Array<{ symbol: string; side: 'long' | 'short'; kind: 'market' | 'limit'; limit?: number }>;
  trace?: TraceEvent[];
  /** Kill switch tripped (losing streak). */
  killed?: boolean;
}

interface Position {
  side: 1 | -1;
  entry: number;
  entryTime: number;
  entryIdx: number;
  qty: number;
  origQty: number;
  notional: number;
  lev: number;
  risk: number | null; // price distance to the initial stop
  stop: number | null;
  stopKind: 'stop' | 'trailing' | 'breakeven';
  target: number | null;
  trailDist: number | null;
  trailActive: boolean;
  partials: Array<{ price: number; qty: number }>;
  fees: number;
  slippage: number;
  realized: number;
  partialFills: number;
}
interface Pending { kind: 'market' | 'limit'; side: 1 | -1; placedIdx: number; limit?: number; expiryIdx?: number; atr: number | null }

const MAINT = 0.005; // maintenance margin used for the liquidation price

function zonedParts(t: number, tz: string): { day: number; hm: string; date: string } {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
    return { day, hm: `${p.hour}:${p.minute}`, date: `${p.year}-${p.month}-${p.day}` };
  } catch {
    const d = new Date(t);
    return { day: d.getUTCDay(), hm: d.toISOString().slice(11, 16), date: d.toISOString().slice(0, 10) };
  }
}

/** Whether entries are allowed on a bar opening at t. Windows may cross midnight. */
export { zonedParts };
export function inSession(spec: StrategySpec, t: number): boolean {
  const s = spec.session;
  if (s.mode === '24_7') return true;
  const z = zonedParts(t, s.timezone);
  return s.windows.some((w) => {
    if (w.start <= w.end) return w.days.includes(z.day) && z.hm >= w.start && z.hm < w.end;
    // Over midnight: the part after midnight belongs to the previous day's window.
    return (w.days.includes(z.day) && z.hm >= w.start) || (w.days.includes((z.day + 6) % 7) && z.hm < w.end);
  });
}

export function runBacktest(spec: StrategySpec, data: Record<string, Candle[]>, params: BacktestParams): BacktestResult {
  const notes: string[] = [];
  const fees = params.fees ?? { takerBps: VENUE_INFO[spec.market.venue].takerBps, makerBps: VENUE_INFO[spec.market.venue].makerBps };
  const slip = params.slippageBps / 1e4;
  const symbols = spec.market.symbols.map((s) => s.symbol).filter((s) => data[s]?.length);
  const missing = spec.market.symbols.map((s) => s.symbol).filter((s) => !data[s]?.length);
  if (missing.length) notes.push(`No data for ${missing.join(', ')}; left out.`);

  const longG = spec.market.direction !== 'short' ? spec.entry.long : null;
  const shortG = spec.market.direction !== 'long' ? resolveShort(spec.entry.short, spec.entry.long) : null;
  const exitLong = spec.exit.long;
  const exitShort = resolveShort(spec.exit.short, spec.exit.long);
  const engines = new Map(symbols.map((s) => [s, new SignalEngine(data[s]!, spec.session.interval)]));
  const idxOf = new Map(symbols.map((s) => [s, new Map(data[s]!.map((c, i) => [c.openTime, i]))]));
  const times = [...new Set(symbols.flatMap((s) => data[s]!.map((c) => c.openTime)))].sort((a, b) => a - b);
  const from = params.from ?? -Infinity;
  const to = params.to ?? Infinity;
  const active = times.filter((t) => t >= from && t <= to);

  let cash = params.capital;
  const pos = new Map<string, Position>();
  const pending = new Map<string, Pending>();
  const pendingExit = new Map<string, ExitReason>();
  const cooldownUntil = new Map<string, number>();
  const trades: BacktestTrade[] = [];
  const equity: Array<{ t: number; equity: number }> = [];
  let dayKey = '';
  let dayStart = cash;
  let pausedToday = false;
  let killed = false;
  let consecutiveLosses = 0;
  let tradesToday = 0;
  let pausedDays = 0;
  let skippedMargin = 0;
  let exposedBars = 0;
  let liquidations = 0;
  const lastClose = new Map<string, number>();
  const trace: TraceEvent[] = [];
  const traceOn = params.traceFrom != null;
  const note = (t: number, symbol: string, kind: TraceKind, message: string, conditions?: TraceEvent['conditions']) => { if (traceOn && t >= params.traceFrom!) trace.push({ t, symbol, kind, message, ...(conditions ? { conditions } : {}) }); };
  const blockedAt = (t: number) => (params.blocked ?? []).some((b) => t >= b.from && (b.to == null || t < b.to));
  const multiplierAt = (t: number) => { let m = 1; for (const x of params.sizeSchedule ?? []) if (x.from <= t) m = x.multiplier; return m; };

  const openPnl = () => [...pos.entries()].reduce((sum, [s, p]) => sum + p.side * p.qty * ((lastClose.get(s) ?? p.entry) - p.entry), 0);
  const equityNow = () => cash + openPnl();
  const marginUsed = () => [...pos.values()].reduce((s, p) => s + (p.qty * p.entry) / p.lev, 0);

  function closePart(s: string, p: Position, qty: number, price: number, t: number, maker: boolean, slipped: number) {
    const fee = (qty * price * (maker ? fees.makerBps : fees.takerBps)) / 1e4;
    const pnl = p.side * qty * (price - p.entry);
    p.realized += pnl;
    p.fees += fee;
    p.slippage += slipped;
    cash += pnl - fee;
    p.qty -= qty;
    void s; void t;
  }

  function finish(s: string, p: Position, price: number, t: number, i: number, reason: ExitReason, maker: boolean, ref: number) {
    const slipped = Math.abs(price - ref) * p.qty;
    closePart(s, p, p.qty, price, t, maker, slipped);
    pos.delete(s);
    const pnl = p.realized - p.fees;
    const trade: BacktestTrade = {
      symbol: s, side: p.side === 1 ? 'long' : 'short', entryTime: p.entryTime, entryPrice: p.entry, exitTime: t, exitPrice: price,
      qty: p.origQty, notional: p.notional, pnl, pnlPct: (pnl / p.notional) * 100 * 1,
      rMultiple: p.risk ? p.realized / (p.risk * p.origQty) : null,
      fees: p.fees, slippage: p.slippage, barsHeld: i - p.entryIdx, reason, partialFills: p.partialFills,
    };
    trades.push(trade);
    note(t, s, 'closed', `Closed ${trade.side} at ${price.toPrecision(6)} (${reason}): ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT.`);
    consecutiveLosses = pnl < 0 ? consecutiveLosses + 1 : 0;
    if (spec.advanced.reentryCooldownBars > 0) cooldownUntil.set(s, i + spec.advanced.reentryCooldownBars);
    if (spec.limits.maxConsecutiveLosses && consecutiveLosses >= spec.limits.maxConsecutiveLosses && !killed) {
      killed = true;
      notes.push(`Kill switch: ${consecutiveLosses} losses in a row on ${new Date(t).toISOString().slice(0, 10)}; no new trades after that.`);
    }
    if (spec.limits.dailyLossPct && !pausedToday && (equityNow() - dayStart) / dayStart <= -spec.limits.dailyLossPct / 100) {
      pausedToday = true;
      pausedDays += 1;
    }
  }

  function open(s: string, side: 1 | -1, price: number, ref: number, t: number, i: number, maker: boolean, atr: number | null) {
    const plan = planEntry({ spec, symbol: s, side, price, atr, equity: equityNow(), marginUsed: marginUsed(), multiplier: multiplierAt(t), history: trades });
    if ('skip' in plan) { skippedMargin += 1; note(t, s, 'skipped', `Signal skipped: ${plan.skip}`); return; }
    const { qty, stop, target, risk: dist, trailDist, leverage: lev } = plan;
    const tr = spec.risk.trailing;
    const notional = qty * price;
    const fee = (notional * (maker ? fees.makerBps : fees.takerBps)) / 1e4;
    cash -= fee;
    const partials = dist ? spec.risk.partials.filter((x) => x.atR > 0 && x.closePct > 0).sort((a, b) => a.atR - b.atR).map((x) => ({ price: price + side * dist! * x.atR, qty: (qty * Math.min(100, x.closePct)) / 100 })) : [];
    pos.set(s, {
      side, entry: price, entryTime: t, entryIdx: i, qty, origQty: qty, notional, lev, risk: dist, stop, stopKind: 'stop', target,
      trailDist, trailActive: !!tr && !tr.activateAtR, partials, fees: fee, slippage: Math.abs(price - ref) * qty, realized: 0, partialFills: 0,
    });
    tradesToday += 1;
    note(t, s, 'filled', `${side === 1 ? 'Bought' : 'Sold short'} ${qty.toPrecision(4)} at ${price.toPrecision(6)}${stop != null ? `, stop ${stop.toPrecision(6)}` : ''}${target != null ? `, target ${target.toPrecision(6)}` : ''}.`);
  }

  for (const t of active) {
    const z = zonedParts(t, spec.session.timezone);
    if (z.date !== dayKey) { dayKey = z.date; dayStart = equityNow(); pausedToday = false; tradesToday = 0; }
    let anyOpen = false;
    for (const s of symbols) {
      const i = idxOf.get(s)!.get(t);
      if (i == null) continue;
      const c = data[s]![i]!;
      const eng = engines.get(s)!;

      // 1. Orders from the last close.
      const ex = pendingExit.get(s);
      const p0 = pos.get(s);
      if (ex && p0) {
        const px = c.open * (1 - p0.side * slip);
        finish(s, p0, px, t, i, ex, false, c.open);
      }
      pendingExit.delete(s);
      const pd = pending.get(s);
      if (pd && !pos.has(s)) {
        if (pd.kind === 'market') {
          pending.delete(s);
          if (!killed && !pausedToday) open(s, pd.side, c.open * (1 + pd.side * slip), c.open, t, i, false, pd.atr);
        } else if (i > pd.expiryIdx!) pending.delete(s);
        else if (pd.side === 1 ? c.low <= pd.limit! : c.high >= pd.limit!) {
          pending.delete(s);
          const px = pd.side === 1 ? Math.min(c.open, pd.limit!) : Math.max(c.open, pd.limit!);
          if (!killed && !pausedToday) open(s, pd.side, px, px, t, i, true, pd.atr);
        }
      }

      // 2. Exits inside the bar.
      const p = pos.get(s);
      if (p) anyOpen = true; // held during this bar, even if it closes in it
      if (p) {
        const liq = p.entry * (1 - p.side * (1 / p.lev - MAINT));
        const hitLiq = p.side === 1 ? c.low <= liq : c.high >= liq;
        const stopFirst = p.stop != null && (p.side === 1 ? p.stop >= liq : p.stop <= liq);
        if (hitLiq && !stopFirst) {
          liquidations += 1;
          // Isolated margin: the margin is lost.
          finish(s, p, liq, t, i, 'liquidation', false, liq);
        } else if (p.stop != null && (p.side === 1 ? c.low <= p.stop : c.high >= p.stop)) {
          const gap = p.side === 1 ? c.open <= p.stop : c.open >= p.stop;
          const ref = gap ? c.open : p.stop;
          finish(s, p, ref * (1 - p.side * slip), t, i, p.stopKind, false, ref);
        } else {
          let lastPartial: number | null = null;
          for (const part of [...p.partials]) {
            if (p.side === 1 ? c.high >= part.price : c.low <= part.price) {
              closePart(s, p, Math.min(part.qty, p.qty), part.price, t, true, 0);
              p.partialFills += 1;
              p.partials.shift();
              lastPartial = part.price;
            }
          }
          if (p.qty <= p.origQty * 1e-9) finish(s, p, lastPartial ?? c.close, t, i, 'target', true, lastPartial ?? c.close);
          else if (p.target != null && (p.side === 1 ? c.high >= p.target : c.low <= p.target)) {
            const px = p.side === 1 ? Math.max(c.open, p.target) : Math.min(c.open, p.target);
            finish(s, p, px, t, i, 'target', true, px);
          }
        }
      }
      // 3. Trailing and break-even, from the next bar.
      const q = pos.get(s);
      if (q) {
        const favour = q.side === 1 ? c.high - q.entry : q.entry - c.low;
        const tr = spec.risk.trailing;
        if (tr && q.trailDist != null) {
          if (!q.trailActive && tr.activateAtR && q.risk && favour >= tr.activateAtR * q.risk) q.trailActive = true;
          if (q.trailActive) {
            // A percent trail follows the latest extreme; an ATR trail keeps the distance set at entry.
            const dist = tr.mode === 'pct' ? ((q.side === 1 ? c.high : c.low) * tr.value) / 100 : q.trailDist;
            const cand = q.side === 1 ? c.high - dist : c.low + dist;
            if (q.stop == null || (q.side === 1 ? cand > q.stop : cand < q.stop)) { q.stop = cand; q.stopKind = 'trailing'; }
          }
        }
        if (spec.risk.breakEvenAtR && q.risk && favour >= spec.risk.breakEvenAtR * q.risk && (q.stop == null || (q.side === 1 ? q.stop < q.entry : q.stop > q.entry))) {
          q.stop = q.entry;
          q.stopKind = 'breakeven';
        }
      }
      lastClose.set(s, c.close);

      // 4. At the close.
      const r = pos.get(s);
      const nextOpen = t + INTERVAL_MS[spec.session.interval];
      if (r) {
        if (spec.risk.timeStopBars && i - r.entryIdx >= spec.risk.timeStopBars) { pendingExit.set(s, 'time'); note(t, s, 'exit_signal', `Time stop: held ${i - r.entryIdx} bars. Closing at the next open.`); }
        else if (eng.group(r.side === 1 ? exitLong : exitShort, i)) { pendingExit.set(s, 'signal'); note(t, s, 'exit_signal', 'Exit signal. Closing at the next open.', eng.explain(r.side === 1 ? exitLong : exitShort, i)); }
        else if (spec.exit.onOppositeSignal && eng.group(r.side === 1 ? shortG : longG, i)) { pendingExit.set(s, 'opposite'); note(t, s, 'exit_signal', 'Opposite signal. Closing at the next open.'); }
        else note(t, s, 'holding', `Holding ${r.side === 1 ? 'long' : 'short'} from ${r.entry.toPrecision(6)}${r.stop != null ? `, stop ${r.stop.toPrecision(6)}` : ''}; no exit yet.`);
      } else if (pending.has(s)) {
        note(t, s, 'holding', 'Limit order waiting to fill.');
      } else {
        const why = killed ? 'Stopped by the losing-streak limit.'
          : pausedToday ? 'Paused for the day: daily loss cap reached.'
          : blockedAt(nextOpen) ? 'Paused.'
          : i < (cooldownUntil.get(s) ?? -1) ? 'Waiting out the re-entry cooldown.'
          : spec.advanced.maxTradesPerDay != null && tradesToday >= spec.advanced.maxTradesPerDay ? 'Reached the maximum trades for the day.'
          : !inSession(spec, nextOpen) ? 'Outside the entry window.'
          : null;
        const timeOk = !spec.entry.atTimes?.length || spec.entry.atTimes.includes(zonedParts(nextOpen, spec.session.timezone).hm);
        if (why) note(t, s, 'blocked', why);
        else if (!timeOk) note(t, s, 'blocked', `Waiting for the trigger time (${spec.entry.atTimes!.join(', ')}).`);
        else {
          const wantLong = longG ? eng.group(longG, i) : !!spec.entry.atTimes?.length && spec.market.direction !== 'short';
          const wantShort = shortG ? eng.group(shortG, i) : !!spec.entry.atTimes?.length && spec.market.direction === 'short';
          if (wantLong !== wantShort) {
            const side: 1 | -1 = wantLong ? 1 : -1;
            const atr = eng.atr(i, spec.risk.stopLoss?.atrLength ?? spec.risk.trailing?.atrLength ?? (spec.sizing.mode === 'atr' ? spec.sizing.atrLength ?? 14 : 14));
            if (spec.advanced.entryType === 'limit') pending.set(s, { kind: 'limit', side, placedIdx: i, limit: c.close * (1 - (side * spec.advanced.limitOffsetPct) / 100), expiryIdx: i + Math.max(1, spec.advanced.limitExpiryBars), atr });
            else pending.set(s, { kind: 'market', side, placedIdx: i, atr });
            note(t, s, 'signal', `${side === 1 ? 'Long' : 'Short'} signal: ${spec.advanced.entryType === 'limit' ? 'limit order placed' : 'entering at the next open'}.`, eng.explain(side === 1 ? longG : shortG, i));
          } else if (wantLong && wantShort) note(t, s, 'no_signal', 'Long and short signals at once: staying out.');
          else {
            const conds = [...eng.explain(longG, i), ...(shortG ? eng.explain(shortG, i) : [])];
            const met = conds.filter((x) => x.met).length;
            note(t, s, 'no_signal', conds.length ? `No entry: ${met} of ${conds.length} conditions met.` : 'No entry.', conds);
          }
        }
      }
    }
    if (anyOpen) exposedBars += 1;
    equity.push({ t, equity: equityNow() });
  }

  const lastT = active[active.length - 1];
  const openOut: OpenPosition[] = [];
  if (params.keepOpen) {
    for (const [s, p] of pos.entries()) {
      const last = lastClose.get(s) ?? p.entry;
      openOut.push({ symbol: s, side: p.side === 1 ? 'long' : 'short', qty: p.qty, entryPrice: p.entry, entryTime: p.entryTime, stop: p.stop, target: p.target, lastPrice: last, unrealized: p.side * p.qty * (last - p.entry), notional: p.notional, fees: p.fees });
    }
  } else {
    // Orders waiting for a bar that never came, then what's still open at the last price.
    for (const [s, p] of pending.entries()) note(lastT ?? 0, s, 'skipped', `${p.side === 1 ? 'Long' : 'Short'} entry cancelled: the run ended before the next open.`);
    for (const [s, p] of [...pos.entries()]) {
      const c = data[s]![data[s]!.length - 1]!;
      finish(s, p, c.close, lastT ?? c.openTime, data[s]!.length - 1, 'end', false, c.close);
    }
    if (equity.length) equity[equity.length - 1] = { t: equity[equity.length - 1]!.t, equity: cash };
  }
  if (pausedDays) notes.push(`Daily loss limit paused new entries on ${pausedDays} day${pausedDays === 1 ? '' : 's'}.`);
  if (skippedMargin) notes.push(`${skippedMargin} signal${skippedMargin === 1 ? ' was' : 's were'} skipped: not enough free margin or no stop to size from.`);
  if (liquidations) notes.push(`${liquidations} position${liquidations === 1 ? ' was' : 's were'} liquidated before the stop. Lower the leverage or tighten the stop.`);

  const out: BacktestResult = { metrics: metricsOf(trades, equity, params.capital, exposedBars, active.length), equity: downsample(equity, 600), trades, perSymbol: perSymbol(trades, symbols), notes, range: { from: active[0] ?? null, to: lastT ?? null, bars: active.length } };
  if (params.keepOpen) {
    out.open = openOut;
    out.pending = [...pending.entries()].map(([symbol, p]) => ({ symbol, side: p.side === 1 ? 'long' : 'short', kind: p.kind, ...(p.limit != null ? { limit: p.limit } : {}) }));
    out.killed = killed;
  }
  if (traceOn) out.trace = trace;
  return out;
}

function downsample<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = xs.length / n;
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(xs[Math.floor(k * step)]!);
  out[out.length - 1] = xs[xs.length - 1]!;
  return out;
}

function perSymbol(trades: BacktestTrade[], symbols: string[]) {
  return symbols.map((s) => {
    const t = trades.filter((x) => x.symbol === s);
    return { symbol: s, trades: t.length, pnl: t.reduce((a, x) => a + x.pnl, 0), winRatePct: t.length ? (t.filter((x) => x.pnl > 0).length / t.length) * 100 : null };
  });
}

export function metricsOf(trades: BacktestTrade[], equity: Array<{ t: number; equity: number }>, capital: number, exposed: number, bars: number): BacktestMetrics {
  const end = equity.length ? equity[equity.length - 1]!.equity : capital;
  let peak = capital;
  let dd = 0;
  for (const e of equity) { peak = Math.max(peak, e.equity); dd = Math.min(dd, (e.equity / peak - 1) * 100); }
  // Daily returns for Sharpe and Sortino.
  const byDay = new Map<number, number>();
  for (const e of equity) byDay.set(Math.floor(e.t / 86_400_000), e.equity);
  const daily = [...byDay.values()];
  const rets = daily.slice(1).map((v, k) => v / daily[k]! - 1);
  const mean = rets.length ? rets.reduce((a, x) => a + x, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, x) => a + (x - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const down = rets.filter((x) => x < 0);
  const dsd = down.length > 1 ? Math.sqrt(down.reduce((a, x) => a + x ** 2, 0) / down.length) : 0;
  const wins = trades.filter((x) => x.pnl > 0);
  const grossW = wins.reduce((a, x) => a + x.pnl, 0);
  const grossL = trades.filter((x) => x.pnl <= 0).reduce((a, x) => a + x.pnl, 0);
  const span = equity.length > 1 ? (equity[equity.length - 1]!.t - equity[0]!.t) / (365 * 86_400_000) : 0;
  const rs = trades.map((x) => x.rMultiple).filter((x): x is number => x != null);
  const slip = trades.reduce((a, x) => a + x.slippage, 0);
  const traded = trades.reduce((a, x) => a + x.notional, 0);
  return {
    startEquity: capital,
    endEquity: end,
    totalReturnPct: (end / capital - 1) * 100,
    cagrPct: span >= 30 / 365 && end > 0 ? ((end / capital) ** (1 / span) - 1) * 100 : null,
    trades: trades.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : null,
    profitFactor: grossL < 0 ? grossW / Math.abs(grossL) : null,
    avgTradePct: trades.length ? trades.reduce((a, x) => a + x.pnlPct, 0) / trades.length : null,
    bestTradePct: trades.length ? Math.max(...trades.map((x) => x.pnlPct)) : null,
    worstTradePct: trades.length ? Math.min(...trades.map((x) => x.pnlPct)) : null,
    expectancyR: rs.length ? rs.reduce((a, x) => a + x, 0) / rs.length : null,
    maxDrawdownPct: dd,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(365) : null,
    sortino: dsd > 0 ? (mean / dsd) * Math.sqrt(365) : null,
    exposurePct: bars ? (exposed / bars) * 100 : 0,
    fees: trades.reduce((a, x) => a + x.fees, 0),
    slippage: slip,
    avgSlippageBps: traded > 0 ? (slip / traded) * 1e4 : null,
    longTrades: trades.filter((x) => x.side === 'long').length,
    shortTrades: trades.filter((x) => x.side === 'short').length,
    avgBarsHeld: trades.length ? trades.reduce((a, x) => a + x.barsHeld, 0) / trades.length : null,
  };
}

export type { SignalGroup };
