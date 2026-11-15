// Pure maths behind the "Your trades" chart (E): matching broker symbols to the
// chart, contract specs and lot sizing, R units, event reactions, coach lines,
// event-day stats, replay "after your exit" and the multi-timeframe read.
// No I/O and no React, so every number on the page can be unit-tested.
import { canonicalize } from '@/lib/symbol-match';

export interface Bar { openTime: number; open: number; high: number; low: number; close: number; volume?: number }

/** One of the user's trades, MT5 (Elefin) or exchange, in one shape. */
export interface ChartTrade {
  id: string;
  source: 'mt5' | 'exchange';
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  /** Epoch ms; null when the venue doesn't say (exchange positions). */
  openTime: number | null;
  closeTime: number | null;
  entry: number;
  exit: number | null;
  volume: number;
  /** Realised net P&L in the account currency (closed trades). */
  netPnl: number | null;
  /** Price P&L before costs (MT5 deal profit); used to learn the contract size. */
  grossPnl: number | null;
  /** Unrealised P&L reported by the venue (exchange positions). */
  livePnl?: number | null;
  stop: number | null;
  target: number | null;
  liquidation?: number | null;
  note: string | null;
  connectionId?: string;
}

/** A calendar event as the page uses it. */
export interface CalEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  time: number;
  actual: string | null;
  forecast: string | null;
  unit: string | null;
}

// ─── Symbols ───────────────────────────────────────────────────────────────

/**
 * One key per market so the chart symbol, MT5 names and exchange names meet:
 * XAUUSD.m / GOLD / XAUUSDm → XAUUSD, BTCUSDT / BTC/USDT:USDT → BTCUSD.
 */
export function marketKey(raw: string): string {
  let s = (raw || '').trim();
  const suffix = /^([A-Z0-9]{3,})([a-z]+)$/.exec(s); // XAUUSDm, EURUSDpro
  if (suffix) s = suffix[1]!;
  s = s.split(':')[0]!.toUpperCase();
  s = s.split('.')[0]!.replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{2,12}(USDT|USDC|BUSD|PERP)$/.test(s)) s = s.replace(/(USDT|USDC|BUSD|PERP)$/, 'USD');
  return canonicalize(s);
}

export const sameMarket = (a: string, b: string) => marketKey(a) === marketKey(b);

const FIAT = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'ZAR', 'MXN', 'TRY', 'CNH', 'PLN', 'HUF', 'CZK'];
const METALS: Record<string, number> = { XAU: 100, XAG: 5000, XPT: 100, XPD: 100 };
const ENERGY = new Set(['WTIUSD', 'USOIL', 'UKOIL', 'XTIUSD', 'XBRUSD', 'BRENT', 'WTI', 'CRUDE', 'BRNUSD', 'XNGUSD', 'NGAS']);
const INDEX_CCY: Record<string, string> = {
  US30: 'USD', DJ30: 'USD', US500: 'USD', SPX500: 'USD', US100: 'USD', USTEC: 'USD', NAS100: 'USD', US2000: 'USD',
  GER40: 'EUR', DE40: 'EUR', GER30: 'EUR', DAX40: 'EUR', FRA40: 'EUR', EU50: 'EUR', STOXX50: 'EUR', ESP35: 'EUR',
  UK100: 'GBP', JP225: 'JPY', JPN225: 'JPY', AUS200: 'AUD', HK50: 'HKD',
};

export type AssetKind = 'fx' | 'metal' | 'index' | 'energy' | 'crypto' | 'stock';

export interface SymbolSpec {
  kind: AssetKind;
  base: string;
  quote: string;
  /** Units per 1.0 lot (MT5 convention). Indices vary by broker, so `brokerDependent`. */
  contractSize: number;
  lotStep: number;
  minLot: number;
  brokerDependent: boolean;
  /** Currencies whose calendar moves this market. */
  currencies: string[];
}

export function symbolSpec(symbol: string): SymbolSpec {
  const k = marketKey(symbol);
  const base = k.slice(0, 3);
  const quote = k.slice(3, 6);
  if (METALS[base] && quote.length === 3) {
    return { kind: 'metal', base, quote, contractSize: METALS[base]!, lotStep: 0.01, minLot: 0.01, brokerDependent: false, currencies: [quote] };
  }
  if (ENERGY.has(k)) return { kind: 'energy', base: k, quote: 'USD', contractSize: 1000, lotStep: 0.01, minLot: 0.01, brokerDependent: true, currencies: ['USD'] };
  if (INDEX_CCY[k]) return { kind: 'index', base: k, quote: INDEX_CCY[k]!, contractSize: 1, lotStep: 0.01, minLot: 0.01, brokerDependent: true, currencies: [INDEX_CCY[k]!] };
  if (k.length === 6 && FIAT.includes(base) && FIAT.includes(quote)) {
    return { kind: 'fx', base, quote, contractSize: 100_000, lotStep: 0.01, minLot: 0.01, brokerDependent: false, currencies: [base, quote] };
  }
  const crypto = /^([A-Z0-9]{2,10})(USD)$/.exec(k);
  if (crypto && !FIAT.includes(crypto[1]!)) {
    return { kind: 'crypto', base: crypto[1]!, quote: 'USD', contractSize: 1, lotStep: 0.001, minLot: 0.001, brokerDependent: false, currencies: ['USD'] };
  }
  return { kind: 'stock', base: k, quote: 'USD', contractSize: 1, lotStep: 1, minLot: 1, brokerDependent: true, currencies: ['USD'] };
}

/** Crypto coin for the liquidation map, if the chart symbol is one. */
export function cryptoBase(symbol: string): string | null {
  const s = symbolSpec(symbol);
  return s.kind === 'crypto' ? s.base : null;
}

/**
 * Money per 1.0 price move per 1 lot, in USD, from the standard spec. Needs the
 * quote currency's USD rate unless the quote is USD (or USD is the FX base).
 */
export function specPointValueUsd(spec: SymbolSpec, price: number, quoteToUsd: number | null): number | null {
  if (spec.quote === 'USD') return spec.contractSize;
  if (spec.kind === 'fx' && spec.base === 'USD') return price > 0 ? spec.contractSize / price : null;
  if (quoteToUsd != null && quoteToUsd > 0) return spec.contractSize * quoteToUsd;
  return null;
}

/** The pair that converts `ccy` into USD and whether to invert its price. */
export function usdConversionPair(ccy: string): { symbol: string; invert: boolean } | null {
  if (ccy === 'USD') return null;
  if (['EUR', 'GBP', 'AUD', 'NZD'].includes(ccy)) return { symbol: `${ccy}USD`, invert: false };
  return { symbol: `USD${ccy}`, invert: true };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Money per 1.0 price move per 1 lot learned from the user's own closed trades
 * (deal profit ÷ price move ÷ volume), in the account currency. This is what
 * the broker actually paid, so it covers index contract sizes and conversion.
 * Needs two trades that agree within 25 % of their median.
 */
export function learnedPointValue(trades: ChartTrade[]): number | null {
  const vals: number[] = [];
  for (const t of trades) {
    if (t.status !== 'CLOSED' || t.exit == null || t.grossPnl == null || !(t.volume > 0)) continue;
    const move = (t.exit - t.entry) * (t.side === 'LONG' ? 1 : -1);
    if (Math.abs(move) < Math.abs(t.entry) * 1e-5 || Math.abs(t.grossPnl) < 0.01) continue;
    const v = t.grossPnl / (move * t.volume);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return null;
  const m = median(vals);
  const agree = vals.filter(v => Math.abs(v - m) <= m * 0.25);
  return agree.length >= 2 ? median(agree) : null;
}

export type RiskInput = { mode: 'pct'; pct: number } | { mode: 'usd'; usd: number };

export interface Sizing {
  budget: number;
  lots: number;
  riskMoney: number;
  rewardMoney: number | null;
  r: number | null;
  belowMin: boolean;
  /** The smallest tradable size and what it would risk at this stop. */
  minLot: number;
  minRiskMoney: number;
}

/** Decimals of a lot step (0.01 → 2). */
export const stepDecimals = (step: number) => Math.max(0, Math.min(8, Math.round(-Math.log10(step))));

/** Why a long/short plan can't be sized, or null when it can. */
export function planError(side: 'LONG' | 'SHORT', entry: number, stop: number, target: number | null): string | null {
  if (!(entry > 0) || !(stop > 0)) return 'Enter an entry and a stop.';
  if (side === 'LONG' && stop >= entry) return 'A long needs its stop below the entry.';
  if (side === 'SHORT' && stop <= entry) return 'A short needs its stop above the entry.';
  if (target != null && target > 0) {
    if (side === 'LONG' && target <= entry) return 'A long needs its target above the entry.';
    if (side === 'SHORT' && target >= entry) return 'A short needs its target below the entry.';
  }
  return null;
}

/** Lots for a risk budget, rounded DOWN to the lot step (never risks more than asked). */
export function sizePosition(p: {
  balance: number | null; risk: RiskInput; entry: number; stop: number; target: number | null;
  pointValue: number; lotStep: number; minLot: number;
}): Sizing | null {
  const dist = Math.abs(p.entry - p.stop);
  if (!(dist > 0) || !(p.pointValue > 0) || !(p.lotStep > 0)) return null;
  const budget = p.risk.mode === 'usd' ? p.risk.usd : p.balance != null ? (p.balance * p.risk.pct) / 100 : NaN;
  if (!(budget > 0)) return null;
  const raw = budget / (dist * p.pointValue);
  const d = stepDecimals(p.lotStep);
  const lots = Number((Math.floor(raw / p.lotStep + 1e-9) * p.lotStep).toFixed(d));
  const tgt = p.target != null && p.target > 0 ? Math.abs(p.target - p.entry) : null;
  return {
    budget,
    lots,
    riskMoney: lots * dist * p.pointValue,
    rewardMoney: tgt != null ? lots * tgt * p.pointValue : null,
    r: tgt != null ? tgt / dist : null,
    belowMin: lots < p.minLot,
    minLot: p.minLot,
    minRiskMoney: p.minLot * dist * p.pointValue,
  };
}

/**
 * A neutral note for a risk too small for the smallest size, saying what that
 * size would risk: "Smallest size 0.01 lot risks $7.30 (13%)."
 */
export function minSizeHint(s: Sizing, o: { unit: string; lotDecimals: number; balance: number | null; ccy?: string }): string | null {
  if (!s.belowMin) return null;
  const share = o.balance && o.balance > 0 ? (s.minRiskMoney / o.balance) * 100 : null;
  const pct = share == null ? '' : ` (${share >= 10 ? Math.round(share) : Number(share.toFixed(1))}%)`;
  return `Smallest size ${s.minLot.toFixed(o.lotDecimals)} ${o.unit} risks ${money(s.minRiskMoney, o.ccy ?? 'USD')}${pct}.`;
}

// ─── R ────────────────────────────────────────────────────────────────────

/**
 * Your 1R in money: the average loss of your closed losing trades. MT5 deals
 * don't carry the stop you had, so R is measured against what a loss usually
 * costs you. Needs three losers.
 */
export function rUnit(trades: ChartTrade[]): number | null {
  const losses = trades.filter(t => t.status === 'CLOSED' && t.netPnl != null && t.netPnl < 0).map(t => -t.netPnl!);
  if (losses.length < 3) return null;
  return losses.reduce((a, b) => a + b, 0) / losses.length;
}

// ─── Indicators ───────────────────────────────────────────────────────────

export function ema(values: number[], n: number): number[] {
  if (!values.length) return [];
  const k = 2 / (n + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) out.push(values[i]! * k + out[i - 1]! * (1 - k));
  return out;
}

/** Average true range of the last `n` bars of `bars` (simple mean of TR). */
export function atr(bars: Bar[], n = 14): number | null {
  if (bars.length < 2) return null;
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!, pc = bars[i - 1]!.close;
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  const last = tr.slice(-n);
  if (last.length < Math.min(n, 5)) return null;
  const v = last.reduce((a, b) => a + b, 0) / last.length;
  return v > 0 ? v : null;
}

/** Wilder RSI of closes (last value). */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i]! - closes[i - 1]!; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (l === 0) return g === 0 ? 50 : 100;
  return 100 - 100 / (1 + g / l);
}

// ─── Multi-timeframe read ─────────────────────────────────────────────────

export interface TrendRead { dir: 'up' | 'down' | 'range'; reason: string }

/** Direction from EMA 20/50 stacking plus one reason (RSI extreme, a break, swing shape, EMA). */
export function classifyTrend(bars: Bar[], fmt: (n: number) => string): TrendRead | null {
  if (bars.length < 30) return null;
  const closes = bars.map(b => b.close);
  const last = closes[closes.length - 1]!;
  const slowN = bars.length >= 50 ? 50 : 30;
  const e20 = ema(closes, 20).at(-1)!;
  const eSlow = ema(closes, slowN).at(-1)!;
  const dir: TrendRead['dir'] = last > e20 && e20 > eSlow ? 'up' : last < e20 && e20 < eSlow ? 'down' : 'range';
  const r = rsi(closes, 14);
  const prior = bars.slice(-23, -3);
  const hi = Math.max(...prior.map(b => b.high));
  const lo = Math.min(...prior.map(b => b.low));
  if (r != null && (r <= 30 || r >= 70)) return { dir, reason: `RSI ${Math.round(r)}` };
  if (dir === 'down' && last < lo) return { dir, reason: `broke ${fmt(lo)}` };
  if (dir === 'up' && last > hi) return { dir, reason: `broke ${fmt(hi)}` };
  const recent = bars.slice(-10), before = bars.slice(-20, -10);
  if (dir === 'down' && Math.max(...recent.map(b => b.high)) < Math.max(...before.map(b => b.high))) return { dir, reason: 'lower high' };
  if (dir === 'up' && Math.min(...recent.map(b => b.low)) > Math.min(...before.map(b => b.low))) return { dir, reason: 'higher low' };
  if (dir === 'up') return { dir, reason: `above ${slowN} EMA` };
  if (dir === 'down') return { dir, reason: `below ${slowN} EMA` };
  return { dir, reason: `${fmt(lo)}–${fmt(hi)}` };
}

// ─── Events ───────────────────────────────────────────────────────────────

const KINDS: Array<[RegExp, string, string]> = [
  [/\bcpi\b|consumer price/i, 'CPI', 'CPI'],
  [/non[- ]?farm|\bnfp\b/i, 'NFP', 'NFP'],
  [/\bpce\b/i, 'PCE', 'PCE'],
  [/\bppi\b|producer price/i, 'PPI', 'PPI'],
  [/fomc.*minutes|meeting minutes/i, 'Minutes', 'Mins'],
  [/fomc|fed(eral)? funds|interest rate decision|rate decision|refinancing rate|bank rate|cash rate/i, 'Rate decision', 'Rates'],
  [/\bgdp\b|gross domestic/i, 'GDP', 'GDP'],
  [/retail sales/i, 'Retail sales', 'Retail'],
  [/\bpmi\b|\bism\b/i, 'PMI', 'PMI'],
  [/unemployment|jobless|claims|employment change|payroll/i, 'Jobs', 'Jobs'],
  [/crude|\beia\b|oil inventor/i, 'EIA crude', 'EIA'],
];
const SPEAKERS: Array<[RegExp, string]> = [[/fed|fomc|powell/i, 'Fed'], [/ecb|lagarde/i, 'ECB'], [/boe|bailey/i, 'BoE'], [/boj|ueda/i, 'BoJ'], [/rba/i, 'RBA'], [/boc|macklem/i, 'BoC']];

/** The family an event belongs to ("CPI" for core and headline CPI, m/m and y/y). */
export function eventKind(title: string): string {
  for (const [re, kind] of KINDS) if (re.test(title)) return kind;
  if (/speak|speech|testif|press conference|remarks/i.test(title)) {
    for (const [re, who] of SPEAKERS) if (re.test(title)) return `${who} speech`;
    return 'Speech';
  }
  return title.replace(/\s*\((?:[^)]*)\)\s*/g, ' ').replace(/\s+(m\/m|y\/y|q\/q)\b.*$/i, '').trim().slice(0, 28);
}

/** Two-to-six letter lane label: CPI, Fed, EIA, GDP. */
export function eventShort(title: string): string {
  for (const [re, , short] of KINDS) if (re.test(title)) return short;
  for (const [re, who] of SPEAKERS) if (re.test(title)) return who;
  return eventKind(title).split(' ')[0]!.slice(0, 6);
}

export interface Reaction { move: number; atrMult: number | null; barTime: number }

/** How the bar that held the release moved: close − open, and that as a multiple of the ATR before it. */
export function eventReaction(bars: Bar[], time: number, tfMs: number): Reaction | null {
  const i = bars.findIndex(b => time >= b.openTime && time < b.openTime + tfMs);
  if (i < 0) return null;
  const b = bars[i]!;
  const a = atr(bars.slice(Math.max(0, i - 15), i), 14);
  const move = b.close - b.open;
  return { move, atrMult: a ? Math.abs(move) / a : null, barTime: b.openTime };
}

const fmtGap = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.max(1, Math.round(min))} min`);
export { fmtGap };

/** The first high-impact event within `windowMin` after the trade opened, for its currencies. */
export function eventAfterOpen(trade: ChartTrade, events: CalEvent[], windowMin = 120): { event: CalEvent; minutes: number } | null {
  if (trade.openTime == null) return null;
  const ccy = symbolSpec(trade.symbol).currencies;
  let best: { event: CalEvent; minutes: number } | null = null;
  for (const e of events) {
    if (e.impact !== 'HIGH' || !ccy.includes(e.currency)) continue;
    const min = (e.time - trade.openTime) / 60_000;
    if (min > 0 && min <= windowMin && (!best || min < best.minutes)) best = { event: e, minutes: min };
  }
  return best;
}

export interface Coach { flag: string | null; line: string | null; kind: string | null }

/**
 * The open trade's coach flag ("Opened 40 min before CPI") and one line from
 * history ("You lost 6 of 7 trades opened before CPI"), both deterministic.
 * The line needs at least three past trades opened up to 2h before that kind.
 */
export function coachFor(open: ChartTrade, events: CalEvent[], history: ChartTrade[]): Coach {
  const hit = eventAfterOpen(open, events);
  if (!hit) return { flag: null, line: null, kind: null };
  const kind = eventKind(hit.event.title);
  const short = eventShort(hit.event.title);
  const flag = `Opened ${fmtGap(hit.minutes)} before ${short}`;
  const sample = history.filter(t => {
    if (t.status !== 'CLOSED' || t.netPnl == null || t.id === open.id) return false;
    const h = eventAfterOpen(t, events);
    return !!h && eventKind(h.event.title) === kind;
  });
  if (sample.length < 3) return { flag, line: null, kind };
  const losses = sample.filter(t => t.netPnl! < 0).length;
  const wins = sample.length - losses;
  const line = losses > wins
    ? `You lost ${losses} of ${sample.length} trades opened before ${kind}`
    : `You won ${wins} of ${sample.length} trades opened before ${kind}`;
  return { flag, line, kind };
}

export interface EventDayStats {
  kind: string;
  n: number;
  winPct: number;
  net: number;
  avgR: number | null;
  /** Per trade, oldest first: R when known, else the money result. */
  bars: Array<{ id: string; v: number; time: number }>;
  before: { w: number; l: number };
  after: { w: number; l: number };
  advice: string | null;
  firstTime: number;
}

const utcDay = (t: number) => Math.floor(t / 86_400_000);

/**
 * Your closed trades on days with a `kind` release in one of the trade's
 * currencies: win %, net, average R, and opened before the print vs 30+ min after.
 */
export function eventDayStats(trades: ChartTrade[], events: CalEvent[], kind: string, unit: number | null): EventDayStats | null {
  const ofKind = events.filter(e => e.impact === 'HIGH' && eventKind(e.title) === kind);
  if (!ofKind.length) return null;
  const rows: Array<{ t: ChartTrade; when: 'before' | 'after' | 'during' }> = [];
  for (const t of trades) {
    if (t.status !== 'CLOSED' || t.netPnl == null || t.openTime == null) continue;
    const ccy = symbolSpec(t.symbol).currencies;
    const e = ofKind.find(ev => ccy.includes(ev.currency) && utcDay(ev.time) === utcDay(t.openTime!));
    if (!e) continue;
    const when = t.openTime < e.time ? 'before' : t.openTime >= e.time + 30 * 60_000 ? 'after' : 'during';
    rows.push({ t, when });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.t.openTime! - b.t.openTime!);
  const wins = rows.filter(r => r.t.netPnl! > 0).length;
  const net = rows.reduce((a, r) => a + r.t.netPnl!, 0);
  const tally = (w: 'before' | 'after') => {
    const xs = rows.filter(r => r.when === w);
    const won = xs.filter(r => r.t.netPnl! > 0).length;
    return { w: won, l: xs.length - won };
  };
  const before = tally('before');
  const after = tally('after');
  const rate = (x: { w: number; l: number }) => (x.w + x.l ? x.w / (x.w + x.l) : 0);
  let advice: string | null = null;
  if (before.w + before.l >= 3 && after.w + after.l >= 3) {
    if (rate(after) - rate(before) >= 0.2) advice = 'Wait 30 min after the print';
    else if (rate(before) - rate(after) >= 0.2) advice = 'Your entries before the print do better';
  }
  return {
    kind,
    n: rows.length,
    winPct: (wins / rows.length) * 100,
    net,
    avgR: unit ? net / rows.length / unit : null,
    bars: rows.slice(-16).map(r => ({ id: r.t.id, v: unit ? r.t.netPnl! / unit : r.t.netPnl!, time: r.t.openTime! })),
    before,
    after,
    advice,
    firstTime: rows[0]!.t.openTime!,
  };
}

/** Which event family to review: one that printed in the last 48h, else the next one coming. */
export function pickReviewKind(events: CalEvent[], currencies: string[], now: number): { kind: string; event: CalEvent } | null {
  const high = events.filter(e => e.impact === 'HIGH' && currencies.includes(e.currency));
  const recent = high.filter(e => e.time <= now && now - e.time <= 48 * 3_600_000).sort((a, b) => b.time - a.time)[0];
  const next = high.filter(e => e.time > now).sort((a, b) => a.time - b.time)[0];
  const e = recent ?? next;
  return e ? { kind: eventKind(e.title), event: e } : null;
}

// ─── Replay ───────────────────────────────────────────────────────────────

export interface AfterExit {
  /** Best price in the trade's favour after the exit, and how far past the exit it went. */
  best: number;
  extra: number;
  /** Worst price against the trade after the exit, and how far (≤ 0). */
  worst: number;
  adverse: number;
  leftMoney: number | null;
  savedMoney: number | null;
}

export function afterExit(t: ChartTrade, bars: Bar[], until: number, pointValue: number | null): AfterExit | null {
  if (t.exit == null || t.closeTime == null) return null;
  const after = bars.filter(b => b.openTime > t.closeTime! && b.openTime <= until);
  if (!after.length) return null;
  const long = t.side === 'LONG';
  const best = long ? Math.max(...after.map(b => b.high)) : Math.min(...after.map(b => b.low));
  const worst = long ? Math.min(...after.map(b => b.low)) : Math.max(...after.map(b => b.high));
  const dir = long ? 1 : -1;
  const extra = Math.max(0, (best - t.exit) * dir);
  const adverse = Math.min(0, (worst - t.exit) * dir);
  return {
    best, extra, worst, adverse,
    leftMoney: pointValue ? extra * t.volume * pointValue : null,
    savedMoney: pointValue ? -adverse * t.volume * pointValue : null,
  };
}

/** One chip per replayed trade: "Left $199", "Exit saved $80", "Clean exit", "Open". */
export function verdict(t: ChartTrade, a: AfterExit | null, money: (n: number) => string): { text: string; tone: '' | 'neg' | 'pos' } {
  if (t.status === 'OPEN') return { text: 'Open', tone: '' };
  if (!a || a.leftMoney == null || a.savedMoney == null) return { text: 'Closed', tone: '' };
  const ref = Math.max(Math.abs(t.netPnl ?? 0), 1);
  if (a.leftMoney >= ref * 0.25 && a.leftMoney >= a.savedMoney) return { text: `Left ${money(a.leftMoney)}`, tone: '' };
  if (a.savedMoney >= ref * 0.25) return { text: `Exit saved ${money(a.savedMoney)}`, tone: 'pos' };
  return { text: 'Clean exit', tone: '' };
}

/** Max adverse excursion of an open trade from the bars since it opened (≤ 0, in price). */
export function openExcursion(t: ChartTrade, bars: Bar[]): { worst: number; worstMove: number } | null {
  if (t.openTime == null) return null;
  const since = bars.filter(b => b.openTime + 1 >= t.openTime! - 60_000);
  if (!since.length) return null;
  const long = t.side === 'LONG';
  const worst = long ? Math.min(...since.map(b => b.low)) : Math.max(...since.map(b => b.high));
  return { worst, worstMove: Math.min(0, (worst - t.entry) * (long ? 1 : -1)) };
}

// ─── Formatting ───────────────────────────────────────────────────────────

const CCY: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', USDT: '$', USDC: '$' };

/** "−$186", "+$490" (sign optional), whole units at and above 100. */
export function money(v: number, ccy = 'USD', signed = false): string {
  const sym = CCY[ccy] ?? `${ccy} `;
  const a = Math.abs(v);
  const whole = a >= 100 || Math.abs(a - Math.round(a)) < 0.005;
  const s = whole ? Math.round(a).toLocaleString('en-US') : a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  return `${sign}${sym}${s}`;
}

/** Price with sensible decimals for its size, grouped. */
export function px(v: number, decimals?: number): string {
  const a = Math.abs(v);
  const d = decimals ?? (a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : 5);
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export const signedR = (r: number) => `${r < 0 ? '−' : r > 0 ? '+' : ''}${Math.abs(r).toFixed(r !== 0 && Math.abs(r) < 1 ? 2 : 1)}R`;

export function heldFor(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
