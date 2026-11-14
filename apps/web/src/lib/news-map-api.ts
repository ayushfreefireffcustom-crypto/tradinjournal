// Client + pure helpers for the News page (the story map). The API derives the
// score, tickers and desk per story (apps/api/src/lib/news/tickers.ts); this
// file turns those plus the 5-minute reaction series into what the page draws:
// moves since publish, the treemap layout, wire groups and the scoreboard.
// The helpers are pure and unit-tested in news-map-api.test.ts.
import type { NewsItem, CalendarEvent } from '@/lib/api';
import { canonicalize } from '@/lib/symbol-match';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';

async function req<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

// ── Types (mirror packages/contracts/src/schema/news-v2.ts) ──────────────────

export type NewsDesk = 'MACRO' | 'RATES' | 'CRYPTO' | 'MARKETS' | 'GEOPOLITICAL' | 'REGULATORY';

export interface NewsStory extends NewsItem {
  tickers: string[];
  desk: NewsDesk | null;
  score: number;
  scoreSource: 'ai' | 'rules';
  sourceCount: number;
  short: string | null;
  line: string | null;
}

export interface NewsCounts { headlines: number; stories: number; kept: number; merged: number; hidden: number; sources: number }
export interface NewsToday { asOf: string; from: string; counts: NewsCounts; stories: NewsStory[] }

export interface ReactionSeries { key: string; unit: 'bp' | 'pct'; dp: number; points: [number, number][] }
export interface NewsReactions { asOf: string; interval: '5m'; series: ReactionSeries[] }

export const newsMapApi = {
  today: () => req<NewsToday>(`${PREFIX}/news/today`),
  reactions: () => req<NewsReactions>(`${PREFIX}/news/reactions`),
  /** The full feed for "Everything" (paginated, newest first). */
  feed: async (cursor?: string | null) => {
    const p = await req<{ items: Partial<NewsStory>[]; nextCursor: string | null }>(`${PREFIX}/news?limit=60${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    return { items: p.items.map(asStory), nextCursor: p.nextCursor };
  },
};

/** Fill the derived fields if a server (or the mock feed) didn't send them. */
export function asStory(i: Partial<NewsStory>): NewsStory {
  const n = Math.max(1, i.sourceCount ?? i.outlets?.length ?? 1);
  return {
    ...(i as NewsItem),
    tickers: i.tickers ?? [],
    desk: i.desk ?? (i.category ?? null),
    score: typeof i.score === 'number' ? i.score : (i.relevance ?? 0),
    scoreSource: i.scoreSource ?? (typeof i.relevance === 'number' ? 'ai' : 'rules'),
    sourceCount: n,
    short: i.short ?? null,
    line: i.line ?? null,
  };
}

// ── Moves ───────────────────────────────────────────────────────────────────

export type Dir = 'up' | 'dn' | 'flat';
export interface Move { key: string; v: number; unit: 'bp' | 'pct'; dir: Dir; price: number; dp: number; base: number; baseAt: number; lastAt: number }

export const HOT = 80;
export const isHot = (score: number) => score >= HOT;

/**
 * The move of `s` since `t` (ms): from the last bar at or before `t` to the
 * latest bar. Null when the series starts after `t` or nothing traded since
 * (a closed market), so stale prices never show as a 0% move.
 */
export function moveSince(s: ReactionSeries | undefined, t: number): Move | null {
  if (!s || s.points.length < 2) return null;
  let bi = -1;
  for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i]![0] <= t) { bi = i; break; }
  if (bi === -1) return null;
  const [baseAt, base] = s.points[bi]!;
  const [lastAt, last] = s.points[s.points.length - 1]!;
  if (lastAt <= baseAt || !base) return null;
  const v = s.unit === 'bp' ? (last - base) * 100 : (last / base - 1) * 100;
  const shown = s.unit === 'bp' ? Math.round(v) : Math.round(v * 10) / 10;
  return { key: s.key, v, unit: s.unit, dir: shown > 0 ? 'up' : shown < 0 ? 'dn' : 'flat', price: last, dp: s.dp, base, baseAt, lastAt };
}

const MINUS = '−';
/** "+9bp", "−0.9%", "0.0%". */
export function fmtMove(m: Pick<Move, 'v' | 'unit'>): string {
  if (m.unit === 'bp') {
    const r = Math.round(m.v);
    return `${r > 0 ? '+' : r < 0 ? MINUS : ''}${Math.abs(r)}bp`;
  }
  const r = Math.round(m.v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? MINUS : ''}${Math.abs(r).toFixed(1)}%`;
}

export function fmtPrice(v: number, dp: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** A yield shows as "4.12%"; a price as "4,182". */
export function fmtLevel(m: Move): string {
  return m.unit === 'bp' ? `${m.price.toFixed(2)}%` : fmtPrice(m.price, m.dp);
}

export function fmtMoney(v: number): string {
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? MINUS : ''}$${Math.abs(r).toLocaleString('en-US')}`;
}

/** Ticker → reaction-series key (only WTI/BRENT etc. differ from the story keys today). */
export function seriesIndex(r: NewsReactions | null): Map<string, ReactionSeries> {
  return new Map((r?.series ?? []).map(s => [s.key, s]));
}

/** The story's tickers that have a move since it was published (order kept). */
export function storyMoves(story: Pick<NewsStory, 'tickers' | 'publishedAt'>, idx: Map<string, ReactionSeries>): Move[] {
  const t = Date.parse(story.publishedAt);
  const out: Move[] = [];
  for (const k of story.tickers) {
    const m = moveSince(idx.get(k), t);
    if (m) out.push(m);
  }
  return out;
}

// ── Time ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
/** "13:42" in UTC. */
export function hhmm(iso: string | number): string {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** "1h 18m" / "18m" / "now". */
export function countdown(ms: number): string {
  if (ms < 60_000) return 'now';
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${pad(m % 60)}m` : `${m}m`;
}

// ── Picking stories ─────────────────────────────────────────────────────────

export type Scope = 'top' | 'important' | 'all';
export type Tab = 'ALL' | 'MACRO' | 'RATES' | 'CRYPTO' | 'MARKETS' | 'GEOPOLITICAL';
export const TABS: { id: Tab; label: string }[] = [
  { id: 'ALL', label: 'All' }, { id: 'MACRO', label: 'Macro' }, { id: 'RATES', label: 'Rates' },
  { id: 'CRYPTO', label: 'Crypto' }, { id: 'MARKETS', label: 'Markets' }, { id: 'GEOPOLITICAL', label: 'Geopolitical' },
];
export const DESK_LABEL: Record<NewsDesk, string> = {
  MACRO: 'Macro', RATES: 'Rates', CRYPTO: 'Crypto', MARKETS: 'Markets', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory',
};

export function inTab<T extends Pick<NewsStory, 'desk'>>(s: T, tab: Tab): boolean {
  return tab === 'ALL' || s.desk === tab;
}

/** Highest score first; ties go to the newer story. */
export function byScore(a: NewsStory, b: NewsStory): number {
  return b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}
export function byTime(a: NewsStory, b: NewsStory): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

export const WIRE_TOP = 12;
/** The wire for Top (the 12 best, newest first) or Important (every kept story). */
export function pickWire(stories: NewsStory[], scope: Scope): { rows: NewsStory[]; more: number } {
  if (scope !== 'top') return { rows: [...stories].sort(byTime), more: 0 };
  const best = [...stories].sort(byScore).slice(0, WIRE_TOP);
  return { rows: best.sort(byTime), more: Math.max(0, stories.length - best.length) };
}

/** Newest first, grouped under "13:00"-style UTC hour headers. */
export function groupByHour<T extends Pick<NewsStory, 'publishedAt'>>(rows: T[]): { hour: string; key: string; rows: T[] }[] {
  const out: { hour: string; key: string; rows: T[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.publishedAt);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ hour: `${pad(d.getUTCHours())}:00`, key, rows: [r] });
  }
  return out;
}

// ── Treemap ─────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

/** Squarified treemap; `vals` sorted descending; rects come back in input order. */
export function squarify(vals: number[], x: number, y: number, w: number, h: number): Rect[] {
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total || w <= 0 || h <= 0) return vals.map(() => ({ x, y, w: 0, h: 0 }));
  const items = vals.map((v, i) => ({ i, a: (v / total) * w * h }));
  const out: Rect[] = [];
  let rect = { x, y, w, h };
  let row: typeof items = [];
  const worst = (r: typeof items, side: number) => {
    const s = r.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...r.map(q => q.a)), mn = Math.min(...r.map(q => q.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const place = (r: typeof items, rc: Rect): Rect => {
    const s = r.reduce((a, b) => a + b.a, 0);
    if (rc.w >= rc.h) {
      const cw = s / rc.h; let yy = rc.y;
      for (const q of r) { const qh = q.a / cw; out[q.i] = { x: rc.x, y: yy, w: cw, h: qh }; yy += qh; }
      return { x: rc.x + cw, y: rc.y, w: rc.w - cw, h: rc.h };
    }
    const rh = s / rc.w; let xx = rc.x;
    for (const q of r) { const qw = q.a / rh; out[q.i] = { x: xx, y: rc.y, w: qw, h: rh }; xx += qw; }
    return { x: rc.x, y: rc.y + rh, w: rc.w, h: rc.h - rh };
  };
  let i = 0;
  while (i < items.length) {
    const side = Math.min(rect.w, rect.h);
    const it = items[i]!;
    if (!row.length || worst([...row, it], side) <= worst(row, side)) { row.push(it); i++; }
    else { rect = place(row, rect); row = []; }
  }
  if (row.length) place(row, rect);
  return out;
}

export type TileSize = 'l' | 'm' | 's';
export interface MapTile { rect: Rect; size: TileSize }

const MIN_W = 128;
const MIN_H = 84;
/** Area weight: the score, sharpened so the order reads at a glance. */
const weight = (score: number) => Math.pow(Math.max(score, 1), 2.6);

export function tileSize(r: Rect): TileSize {
  return r.w >= 200 && r.h >= 200 ? 'l' : r.w >= 150 && r.h >= 118 ? 'm' : 's';
}

/**
 * Lay the stories after the anchor into a W×H box. Drops the lowest-scored
 * stories until every tile is at least MIN_W×MIN_H, so no tile is too small
 * to read at any container width.
 */
export function layoutTiles(scores: number[], w: number, h: number): MapTile[] {
  for (let n = scores.length; n > 0; n--) {
    const rects = squarify(scores.slice(0, n).map(weight), 0, 0, w, h);
    if (rects.every(r => r.w >= MIN_W && r.h >= MIN_H)) return rects.map(rect => ({ rect, size: tileSize(rect) }));
  }
  return [];
}

/**
 * The wide map: an anchor column for #1 and the treemap beside it. Tries a few
 * anchor widths around 47% and keeps the one that fits the most readable tiles
 * (ties go to the share nearest 47%).
 */
export function layoutMap(scores: number[], w: number, h: number): { anchorW: number; tiles: MapTile[] } {
  let best = { anchorW: Math.round(w * 0.47), tiles: layoutTiles(scores, w - Math.round(w * 0.47), h) };
  for (const share of [0.44, 0.5, 0.41, 0.38]) {
    if (best.tiles.length === scores.length) break;
    const aw = Math.round(w * share);
    if (aw < Math.min(300, w * 0.47)) continue; // keep the anchor wide enough for its chart
    const tiles = layoutTiles(scores, w - aw, h);
    if (tiles.length > best.tiles.length) best = { anchorW: aw, tiles };
  }
  return best;
}

// ── Personal ────────────────────────────────────────────────────────────────

export interface TradeLite { symbol: string; direction: 'LONG' | 'SHORT'; status: 'OPEN' | 'CLOSED'; openTime: string; closeTime: string | null; netPnl: number }
export interface Mine {
  /** canonical symbol → the open position (first one). */
  open: Map<string, TradeLite>;
  /** canonical symbol → trades in the last 30 days. */
  recent: Map<string, number>;
}

export function mineFrom(trades: TradeLite[], now = Date.now()): Mine {
  const open = new Map<string, TradeLite>();
  const recent = new Map<string, number>();
  for (const t of trades) {
    const s = canonicalize(t.symbol);
    if (!s) continue;
    if (t.status === 'OPEN' && !open.has(s)) open.set(s, t);
    if (now - Date.parse(t.openTime) <= 30 * 86_400_000) recent.set(s, (recent.get(s) ?? 0) + 1);
  }
  return { open, recent };
}

/** The canonical form of a story ticker (WTI → WTIUSD) for matching against trades. */
export const canonTicker = (t: string) => canonicalize(t);

/** "Open trade · XAUUSD" / "You trade · BTCUSD" / null for a story. */
export function youTag(story: Pick<NewsStory, 'tickers'>, mine: Mine): { kind: 'open' | 'trade'; symbol: string } | null {
  for (const t of story.tickers) { const c = canonTicker(t); if (mine.open.has(c)) return { kind: 'open', symbol: t }; }
  for (const t of story.tickers) { const c = canonTicker(t); if (mine.recent.has(c)) return { kind: 'trade', symbol: t }; }
  return null;
}

export interface Hit { symbol: string; title: string; sub: string; value: string; dir: Dir; story: NewsStory }

/**
 * "Hits your trades": open positions first (with their P&L), then symbols
 * traded in the last 30 days (with the move since the story). Each symbol once.
 */
export function hitsFor(stories: NewsStory[], mine: Mine, idx: Map<string, ReactionSeries>, rankOf: (s: NewsStory) => string, max = 4): Hit[] {
  const ranked = [...stories].sort(byScore);
  const out: Hit[] = [];
  const seen = new Set<string>();
  const find = (sym: string) => ranked.find(s => s.tickers.some(t => canonTicker(t) === sym));
  const deskOf = (s: NewsStory) => (s.desk ? DESK_LABEL[s.desk] : 'News');
  for (const [sym, tr] of mine.open) {
    const st = find(sym);
    if (!st || seen.has(sym)) continue;
    seen.add(sym);
    const tk = st.tickers.find(t => canonTicker(t) === sym)!;
    const mv = moveSince(idx.get(tk), Date.parse(st.publishedAt));
    const pnl = tr.netPnl;
    const value = pnl ? fmtMoney(pnl) : mv ? fmtMove(mv) : '';
    const dir: Dir = pnl ? (pnl > 0 ? 'up' : 'dn') : mv?.dir ?? 'flat';
    out.push({ symbol: sym, title: `${sym} ${tr.direction === 'LONG' ? 'long' : 'short'}, open`, sub: `${rankOf(st)} · ${deskOf(st)}`, value, dir, story: st });
  }
  const recent = [...mine.recent].sort((a, b) => b[1] - a[1]);
  for (const [sym, n] of recent) {
    if (out.length >= max) break;
    if (seen.has(sym)) continue;
    const st = find(sym);
    if (!st) continue;
    seen.add(sym);
    const tk = st.tickers.find(t => canonTicker(t) === sym)!;
    const mv = moveSince(idx.get(tk), Date.parse(st.publishedAt));
    out.push({ symbol: sym, title: sym, sub: `${rankOf(st)} · traded ${n}× this month`, value: mv ? fmtMove(mv) : '', dir: mv?.dir ?? 'flat', story: st });
  }
  return out.slice(0, max);
}

// ── Calendar ────────────────────────────────────────────────────────────────

const KEY_TERMS = ['cpi', 'ppi', 'pce', 'gdp', 'payrolls', 'nonfarm', 'claims', 'unemployment', 'retail sales', 'pmi', 'ism', 'inflation', 'jolts', 'sentiment', 'housing', 'durable'];

/**
 * Released calendar prints behind a story: same key term in both titles,
 * released within 30 minutes before (or 10 after) the story. Up to two.
 */
export function printsFor(story: Pick<NewsStory, 'title' | 'publishedAt'>, events: CalendarEvent[]): CalendarEvent[] {
  const t = Date.parse(story.publishedAt);
  const title = story.title.toLowerCase();
  const terms = KEY_TERMS.filter(k => title.includes(k));
  if (!terms.length) return [];
  return events
    .filter(e => e.actual != null && e.actual !== '')
    .filter(e => { const et = Date.parse(e.eventTime); return et <= t + 10 * 60_000 && et >= t - 30 * 60_000; })
    .filter(e => terms.some(k => e.title.toLowerCase().includes(k)))
    .sort((a, b) => (a.impact === b.impact ? 0 : a.impact === 'HIGH' ? -1 : 1))
    .slice(0, 2);
}

/** Currency → the canonical symbols it moves, for the "Your XAUUSD long" chip on a calendar row. */
export function eventHitsTrade(e: Pick<CalendarEvent, 'currency'>, mine: Mine): string | null {
  const cur = (e.currency || '').toUpperCase();
  if (!cur) return null;
  const usdLinked = new Set(['XAUUSD', 'XAGUSD', 'US500', 'US100', 'US30', 'WTIUSD']);
  for (const sym of mine.open.keys()) {
    if (sym.includes(cur) || (cur === 'USD' && usdLinked.has(sym))) return sym;
  }
  return null;
}

// ── Scoreboard ──────────────────────────────────────────────────────────────

export const BOARD = ['US10Y', 'DXY', 'EURUSD', 'XAUUSD', 'US500', 'US100', 'BTCUSD', 'ETHUSD', 'WTI'];

const GROUP: Record<string, string> = {
  US10Y: 'yields', DXY: 'dollar', EURUSD: 'euro', XAUUSD: 'gold', US500: 'stocks', US100: 'stocks',
  BTCUSD: 'crypto', ETHUSD: 'crypto', WTI: 'oil',
};

/**
 * One line (≤ 8 words) for the scoreboard, from the signs of the moves:
 * "Dollar and yields up, everything else down".
 */
export function boardLine(moves: Pick<Move, 'key' | 'dir'>[]): string | null {
  if (moves.length < 2) return null;
  const vote = new Map<string, number>();
  for (const m of moves) {
    const g = GROUP[m.key];
    if (!g) continue;
    vote.set(g, (vote.get(g) ?? 0) + (m.dir === 'up' ? 1 : m.dir === 'dn' ? -1 : 0));
  }
  const ups = [...vote].filter(([, v]) => v > 0).map(([g]) => g);
  const dns = [...vote].filter(([, v]) => v < 0).map(([g]) => g);
  const flat = vote.size - ups.length - dns.length;
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const list = (xs: string[]) => (xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  if (!ups.length && !dns.length) return 'Little moved';
  if (!dns.length) return ups.length > 2 && !flat ? 'Everything up' : `${cap(list(ups.slice(0, 3)))} up`;
  if (!ups.length) return dns.length > 2 && !flat ? 'Everything down' : `${cap(list(dns.slice(0, 3)))} down`;
  const [few, many, fewDir, manyDir] = ups.length <= dns.length ? [ups, dns, 'up', 'down'] : [dns, ups, 'down', 'up'];
  const lead = `${cap(list(few.slice(0, 2)))} ${fewDir}`;
  const rest = !flat && few.length <= 2 ? `everything else ${manyDir}` : `${list(many.slice(0, 2))} ${manyDir}`;
  const line = `${lead}, ${rest}`;
  return line.split(/\s+/).length <= 8 ? line : lead;
}
