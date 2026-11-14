// Mock mode only (NEXT_PUBLIC_USE_MOCKS=true): the /data/insights/* routes run
// the API's real pure compute (apps/api/src/modules/insights) over the seeded
// synthetic book in mock-data.ts — the same trades /data/trades returns — so a
// backend-free preview shows exactly what the live pages would compute.
//
// What is synthetic here (and only here): a stored R-multiple on ~85% of trades
// (net ÷ the symbol's typical loss, scaled by size) and MAE/MFE in $, both
// seeded from the position id so they're stable between reloads; and candle
// paths for the trade log's mini charts (a bridge from entry to exit).
// Every handler 404s unless mock mode is on, so none of this can serve real users.
import { createJournal, listJournal, statsFor, updateJournal, type Deal, type Trade } from './mock-data';
import {
  applyFilters, computeDashboard, inWindow, tradeContext, windowFor, type InsightTrade,
} from '../../../api/src/modules/insights/compute';
import { answerAsk } from '../../../api/src/modules/insights/ask';
import { computeAnalytics, type AnalyticsTrade } from '../../../api/src/modules/insights/analytics-compute';
import { computeTradeReview } from '../../../api/src/modules/insights/trade-review';
import {
  buildBase, buildPath, exportRows, journalByTrade, pathInput, pathTf, queryLog, tradeDetail,
  type PathCandle, type TlTrade,
} from '../../../api/src/modules/insights/tradelog';
import { dashboardAskSchema, dashboardV2QuerySchema } from '../../../../packages/contracts/src/schema/dashboard-v2';
import { tradeReviewQuerySchema } from '../../../../packages/contracts/src/schema/trade-review';
import {
  tradelogExportSchema, tradelogPathsSchema, tradelogQuerySchema, tradelogTagSchema, tradelogTradeQuerySchema,
} from '../../../../packages/contracts/src/schema/tradelog-v2';

/** The API's own request schemas, so mock routes accept and default exactly the same params. */
export const schemas = {
  dashboard: dashboardV2QuerySchema, ask: dashboardAskSchema, analytics: dashboardV2QuerySchema, review: tradeReviewQuerySchema,
  tradelog: tradelogQuerySchema, export: tradelogExportSchema, trade: tradelogTradeQuerySchema, paths: tradelogPathsSchema, tag: tradelogTagSchema,
};

export const MOCKS_ON = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

/** 404 outside mock mode; null when the handler may run. */
export function mockGate(): Response | null {
  return MOCKS_ON ? null : Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}

export function okJson<T>(data: T): Response {
  return Response.json({ data });
}

export function badRequest(message: string, details?: unknown): Response {
  return Response.json({ error: { code: 'VALIDATION_ERROR', message, details } }, { status: 422 });
}

export function notFound(message: string, code = 'NOT_FOUND'): Response {
  return Response.json({ error: { code, message } }, { status: 404 });
}

/** URL query → plain object for zod (last value wins, like Express). */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => { fieldErrors: unknown } } } };

/** Validate like the API's validateQuery / validateBody: 422 with field errors, else the parsed value. */
export function parseWith<T>(schema: Schema<T>, input: unknown): { data: T } | { error: Response } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: badRequest('Invalid request', r.error.flatten().fieldErrors) };
}

// ─── seeded extras ───────────────────────────────────────────────────────────

/** Deterministic 0..1 stream from a string seed (mulberry32 over an FNV-1a hash). */
export function seeded(key: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface Extras { r: number | null; mae: number | null; mfe: number | null }

/**
 * Seeded R and MAE/MFE per position. Planned risk = the symbol's median loss
 * (mock P&L isn't scaled by size, so neither is risk) ±30%, so R tracks the $
 * result: most losers land near −1R, a few run past −1.25R.
 */
export function mockExtras(trades: Trade[]): Map<string, Extras> {
  const bySym = new Map<string, Trade[]>();
  for (const t of trades) bySym.set(t.symbol, [...(bySym.get(t.symbol) ?? []), t]);
  const out = new Map<string, Extras>();
  for (const [, ts] of bySym) {
    const losses = ts.filter(t => t.netPnl < 0).map(t => -t.netPnl);
    const typicalLoss = median(losses.length >= 2 ? losses : ts.map(t => Math.abs(t.netPnl))) || 1;
    for (const t of ts) {
      const rnd = seeded(`x:${t.positionId}`);
      const risk = Math.max(typicalLoss * (0.7 + rnd() * 0.6), 1);
      const hasR = rnd() < 0.85;
      const net = t.netPnl;
      const mae = net < 0 ? -Math.abs(net) * (1 + rnd() * 0.25) : -risk * (0.1 + rnd() * 0.7);
      const mfe = net > 0 ? net * (1.05 + rnd() * 0.7) : risk * rnd() * 0.9;
      out.set(t.positionId, { r: hasR ? r2(net / risk) : null, mae: r2(mae), mfe: r2(mfe) });
    }
  }
  return out;
}

// ─── the book ────────────────────────────────────────────────────────────────

interface Book {
  accountId: string;
  startingBalance: number;
  trades: Trade[];
  deals: Deal[];
  extras: Map<string, Extras>;
  /** Journal per trade: the seeded tags/emotion plus anything saved in the mock journal. */
  journal: Array<{ id: string; tradeId: string | null; body: string; emotion: string | null; tags: string[]; entryDate: string }>;
}

export function mockBook(accountId: string): Book {
  const { account, trades, deals, stats } = statsFor(accountId);
  const seededNotes = trades.map(t => ({
    id: `seed-${t.positionId}`, tradeId: t.positionId, body: '', emotion: t.emotion ?? null, tags: t.tags ?? [],
    entryDate: t.closeTime ?? t.openTime,
  }));
  const saved = listJournal(account.id).map(e => ({ id: e.id, tradeId: e.tradeId, body: e.body, emotion: e.emotion, tags: e.tags, entryDate: e.entryDate }));
  return { accountId: account.id, startingBalance: stats.startingBalance, trades, deals, extras: mockExtras(trades), journal: [...saved, ...seededNotes] };
}

const closed = (b: Book) => b.trades.filter(t => t.status === 'CLOSED' && t.closeTime);

function tagsByTrade(b: Book): Map<string, { tags: string[]; emotion: string | null }> {
  const out = new Map<string, { tags: string[]; emotion: string | null }>();
  // Newest entries first, like the API's journal list.
  for (const e of [...b.journal].sort((x, y) => +new Date(y.entryDate) - +new Date(x.entryDate))) {
    if (!e.tradeId) continue;
    const prev = out.get(e.tradeId) ?? { tags: [], emotion: null };
    for (const g of e.tags) if (!prev.tags.includes(g)) prev.tags.push(g);
    if (!prev.emotion && e.emotion) prev.emotion = e.emotion;
    out.set(e.tradeId, prev);
  }
  return out;
}

/** Closed trades as the dashboard / analytics services build them. */
export function insightTrades(b: Book): AnalyticsTrade[] {
  const notes = tagsByTrade(b);
  return closed(b).map(t => {
    const x = b.extras.get(t.positionId);
    const n = notes.get(t.positionId);
    const it: InsightTrade = {
      id: t.positionId, symbol: t.symbol, side: t.direction, open: new Date(t.openTime).getTime(), close: new Date(t.closeTime!).getTime(),
      volume: t.volume, net: t.netPnl, r: x?.r ?? null, mae: x?.mae ?? null, mfe: x?.mfe ?? null, tags: n?.tags ?? [],
    };
    return { ...it, emotion: n?.emotion ?? null };
  });
}

/** Positions as the trade log service builds them. */
export function tlTrades(b: Book): TlTrade[] {
  return b.trades.map(t => {
    const isClosed = t.status === 'CLOSED' && !!t.closeTime;
    const last = isClosed ? [...t.deals].filter(d => d.entry !== 'IN').sort((a, c) => (a.dealTime < c.dealTime ? -1 : 1)).at(-1) : undefined;
    return {
      id: t.positionId, symbol: t.symbol, side: t.direction, status: isClosed ? 'CLOSED' : 'OPEN',
      open: new Date(t.openTime).getTime(), close: isClosed ? new Date(t.closeTime!).getTime() : null,
      volume: t.volume, entry: t.entryPrice, exit: isClosed ? t.exitPrice : null,
      net: t.netPnl, gross: t.grossPnl, commission: t.commission, swap: t.swap,
      r: b.extras.get(t.positionId)?.r ?? null, holdSecs: t.durationSecs, closeComment: last?.comment ?? null,
    };
  });
}

// ─── endpoints ───────────────────────────────────────────────────────────────

export interface WindowQuery {
  accountId: string; range: '7D' | '30D' | '90D' | '1Y' | 'ALL'; from?: number; to?: number;
  symbol?: string; session?: 'ASIA' | 'LONDON' | 'NY'; side?: 'LONG' | 'SHORT'; tag?: string;
}
const filtersOf = (q: WindowQuery) => ({ symbol: q.symbol, session: q.session, side: q.side, tag: q.tag });

export function mockDashboard(q: WindowQuery, now = Date.now()) {
  const b = mockBook(q.accountId);
  return computeDashboard(insightTrades(b), { now, window: windowFor(q.range, q.from, q.to, now), filters: filtersOf(q), startingBalance: b.startingBalance });
}

export function mockAsk(q: WindowQuery & { q: string }, now = Date.now()) {
  const trades = insightTrades(mockBook(q.accountId));
  const ctx = tradeContext(trades);
  const T = applyFilters(inWindow(trades, windowFor(q.range, q.from, q.to, now)), filtersOf(q)).sort((a, c) => a.close - c.close);
  return answerAsk(q.q, T, ctx);
}

export function mockAnalytics(q: WindowQuery, now = Date.now()) {
  const b = mockBook(q.accountId);
  return computeAnalytics(insightTrades(b), { now, window: windowFor(q.range, q.from, q.to, now), filters: filtersOf(q), startingBalance: b.startingBalance });
}

export function mockTradeReview(accountId: string, positionId: string, now = Date.now()) {
  const b = mockBook(accountId);
  const target = b.trades.find(t => t.positionId === positionId);
  if (!target) return null;
  const first = Math.min(...b.trades.map(t => new Date(t.openTime).getTime()));
  return computeTradeReview({
    now, positions: b.trades, positionId,
    cash: [{ t: first - 86_400_000, amount: b.startingBalance }],
    storedR: target.status === 'CLOSED' ? b.extras.get(positionId)?.r ?? null : null,
  });
}

function tlBase(accountId: string, tz: string | undefined) {
  const b = mockBook(accountId);
  return { b, base: buildBase(tlTrades(b), journalByTrade(b.journal), { tz, startingBalance: b.startingBalance }) };
}

type TradelogQ = Parameters<typeof queryLog>[1];
type ExportQ = Parameters<typeof exportRows>[1];

export const mockTradelog = (q: TradelogQ, now = Date.now()) => queryLog(tlBase(q.accountId, q.tz).base, q, now);
export const mockTradelogExport = (q: ExportQ, now = Date.now()) => ({ rows: exportRows(tlBase(q.accountId, q.tz).base, q, now) });
export const mockTradelogTrade = (accountId: string, id: string, tz?: string) => tradeDetail(tlBase(accountId, tz).base, id);

/** A seeded candle path from entry (at the open) to exit (at the close), one tf either side. */
export function mockPathCandles(t: TlTrade, tf: { tf: string; ms: number }): PathCandle[] {
  if (t.close == null || t.exit == null) return [];
  const rnd = seeded(`p:${t.id}`);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
  const start = Math.floor((t.open - tf.ms) / tf.ms) * tf.ms;
  const end = t.close + tf.ms;
  const n = Math.max(2, Math.ceil((end - start) / tf.ms));
  const sig = Math.max(Math.abs(t.exit - t.entry), Math.abs(t.entry) * 0.0008) / Math.sqrt(n) * 0.9;
  const w = [0];
  for (let i = 1; i <= n; i++) w.push(w[i - 1]! + gauss() * sig);
  const out: PathCandle[] = [];
  let prev = t.entry;
  for (let i = 0; i < n; i++) {
    const at = start + i * tf.ms;
    const k = Math.min(1, Math.max(0, (at - t.open) / Math.max(1, t.close - t.open)));
    const close = t.entry + (w[i + 1]! - k * w[n]!) + k * (t.exit - t.entry);
    const hi = Math.max(prev, close) + Math.abs(gauss()) * sig * 0.4;
    const lo = Math.min(prev, close) - Math.abs(gauss()) * sig * 0.4;
    out.push({ openTime: at, high: hi, low: lo, close });
    prev = close;
  }
  return out;
}

export function mockTradelogPaths(accountId: string, ids: string[]) {
  const b = mockBook(accountId);
  const byId = new Map(tlTrades(b).map(t => [t.id, t]));
  const paths: Record<string, ReturnType<typeof buildPath>> = {};
  for (const id of [...new Set(ids)]) {
    const t = byId.get(id);
    if (!t || t.status !== 'CLOSED' || t.close == null || t.exit == null) { paths[id] = null; continue; }
    const tf = pathTf(t.open, t.close);
    paths[id] = buildPath(pathInput(t), mockPathCandles(t, tf), tf);
  }
  return { paths };
}

/** Bulk tag into the in-memory mock journal (same rules as the API: newest entry per trade gets the tag). */
export function mockTradelogTag(accountId: string, ids: string[], tag: string) {
  const b = mockBook(accountId);
  const known = new Set(b.trades.map(t => t.positionId));
  let updated = 0, created = 0;
  for (const id of [...new Set(ids)].filter(i => known.has(i))) {
    const latest = listJournal(b.accountId).filter(e => e.tradeId === id).sort((x, y) => +new Date(y.entryDate) - +new Date(x.entryDate))[0];
    if (latest) {
      if (latest.tags.includes(tag)) continue;
      updateJournal(latest.id, { tags: [...latest.tags, tag].slice(0, 30) });
      updated++;
    } else {
      createJournal({ body: '', tags: [tag], tradeId: id, brokerAccountId: b.accountId });
      created++;
    }
  }
  return { updated, created };
}

// ─── trade-anchored candles (/data/market/candles with an accountId) ────────

const TF_MS: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

/**
 * Bars over [fromSec, toSec] for one symbol of a mock account that pass through
 * the account's own fills (entry at the open, exit at the close), so trade
 * review / replay charts line up with the trades. [] when no trade on the
 * symbol is near the window (the page then shows its "no candles" state).
 */
export function mockTradeCandles(accountId: string, symbol: string, tf: string, fromSec: number, toSec: number, limit = 500) {
  const step = TF_MS[tf];
  if (!step || !(toSec > fromSec)) return [];
  const from = Math.floor((fromSec * 1000) / step) * step, to = toSec * 1000;
  const sym = symbol.toUpperCase();
  const trades = mockBook(accountId).trades.filter(t => t.symbol.toUpperCase() === sym && t.closeTime && t.exitPrice != null);
  const pad = 3 * 86_400_000;
  const anchors = trades
    .flatMap(t => [{ t: new Date(t.openTime).getTime(), p: t.entryPrice }, { t: new Date(t.closeTime!).getTime(), p: t.exitPrice! }])
    .filter(a => a.t >= from - pad && a.t <= to + pad)
    .sort((a, b) => a.t - b.t);
  if (!anchors.length) return [];
  const n = Math.min(limit, Math.max(2, Math.floor((to - from) / step) + 1));
  const times = Array.from({ length: n }, (_, i) => from + i * step);
  const rnd = seeded(`c:${accountId}:${sym}:${tf}:${from}`);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd());
  const sig = anchors[0]!.p * 0.0011 * Math.sqrt(step / 3_600_000);
  // Random walk, then bend it through every anchor (a bridge between neighbours).
  const walk = [0];
  for (let i = 1; i < n; i++) walk.push(walk[i - 1]! + gauss() * sig);
  const at = (ms: number) => Math.max(0, Math.min(n - 1, (ms - from) / step));
  const wAt = (x: number) => { const i = Math.floor(x), f = x - i; return walk[i]! + (walk[Math.min(n - 1, i + 1)]! - walk[i]!) * f; };
  const close = times.map((ms, i) => {
    const prev = [...anchors].reverse().find(a => a.t <= ms), next = anchors.find(a => a.t > ms);
    if (prev && next) {
      const k = (ms - prev.t) / Math.max(1, next.t - prev.t);
      const off = walk[i]! - (wAt(at(prev.t)) * (1 - k) + wAt(at(next.t)) * k);
      return prev.p + (next.p - prev.p) * k + off;
    }
    const a = prev ?? next!;
    return a.p + walk[i]! - wAt(at(a.t));
  });
  return times.map((ms, i) => {
    const c = close[i]!, o = i ? close[i - 1]! : c - gauss() * sig * 0.5;
    return {
      openTime: ms, open: o, close: c,
      high: Math.max(o, c) + Math.abs(gauss()) * sig * 0.45, low: Math.min(o, c) - Math.abs(gauss()) * sig * 0.45,
      volume: Math.round(500 + rnd() * 4000),
    };
  });
}
