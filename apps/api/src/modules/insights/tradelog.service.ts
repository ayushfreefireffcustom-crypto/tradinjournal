// Trade log v2: loads an account's positions (rebuilt from stored MT5 deals),
// the trade data (R, stop moves), and the journal, then runs the pure functions in
// tradelog.ts. The graded rows are memoised per (account, dataVersion) in
// process; the journal is joined on every request so a new tag or note shows
// at once. Price paths are fetched through the market candles service and
// cached per trade (a closed trade's path never changes).
import { prisma } from '@tradinjournal/db';
import type {
  MarketTimeframe, TlPath, TradelogDTO, TradelogExportQuery, TradelogPathsDTO, TradelogPathsInput, TradelogQuery,
  TradelogTagDTO, TradelogTagInput, TradelogTradeDTO, TlRow,
} from '@tradinjournal/contracts';
import { NotFoundError } from '../../http/errors.js';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { loadAccountData } from '../sync/account-data.js';
import { createJournalEntry, listJournalEntries, updateJournalEntry } from '../journal/journal.service.js';
import { getCandles } from '../market/market.service.js';
import {
  buildBase, buildPath, exportRows, gradeAll, journalByTrade, pathInput, pathTf, queryLog, tradeDetail, type Graded, type TlBase, type TlTrade,
} from './tradelog.js';
import { rulesKey, type UserRules } from './rules.js';
import { rulesFor } from '../prefs/prefs.service.js';
import { balanceOpsOf, type BalanceOp } from './funding.js';
import { loadTradeExtras, positionLevels } from '../trade-data/trade-data.service.js';

const CLOSING = new Set(['OUT', 'OUT_BY', 'INOUT']);

interface Core { trades: TlTrade[]; grades: Map<string, Graded> | null; startingBalance: number; balanceOps: BalanceOp[]; user: UserRules | null; at: number }
const MAX_CORES = 100;
const CORE_TTL_MS = 5 * 60_000;
const cores = new Map<string, Core>();

async function loadCore(userId: string, accountId: string): Promise<{ core: Core; accountId: string }> {
  // Ownership is checked inside loadAccountData; the memo key is only used after it.
  const [data, rules] = await Promise.all([loadAccountData(userId, accountId), rulesFor(userId)]);
  const key = `${data.account.id}:${data.account.dataVersion}:${rulesKey(rules)}`;
  const hit = cores.get(key);
  if (hit && Date.now() - hit.at < CORE_TTL_MS) return { core: hit, accountId: data.account.id };
  const positions = data.trades();
  // R from the stop at entry (or a stored R) and stop moves (trade-data).
  const { extras } = await loadTradeExtras(data.account, positions);
  const trades: TlTrade[] = positions.map(t => {
    const open = new Date(t.openTime).getTime();
    const closed = t.status === 'CLOSED' && !!t.closeTime;
    const last = closed ? [...(t.deals ?? [])].filter(d => CLOSING.has(d.entry)).sort((a, b) => (a.dealTime < b.dealTime ? -1 : a.dealTime > b.dealTime ? 1 : 0)).at(-1) : undefined;
    return {
      id: t.positionId, symbol: t.symbol, side: t.direction, status: closed ? 'CLOSED' : 'OPEN',
      open, close: closed ? new Date(t.closeTime!).getTime() : null,
      volume: t.volume, entry: t.entryPrice, exit: closed ? t.exitPrice : null,
      net: t.netPnl, gross: t.grossPnl, commission: t.commission, swap: t.swap,
      r: extras.get(t.positionId)?.r ?? null, holdSecs: t.durationSecs, closeComment: last?.comment ?? null,
      stopMove: extras.get(t.positionId)?.move ?? null,
    };
  });
  const startingBalance = data.stats().startingBalance;
  const balanceOps = balanceOpsOf(data.deals);
  const user = rules ? { rules, startingBalance, balanceOps } : null;
  const core: Core = { trades, grades: gradeAll(trades.filter(t => t.status === 'CLOSED'), user), startingBalance, balanceOps, user, at: Date.now() };
  cores.delete(key);
  cores.set(key, core);
  if (cores.size > MAX_CORES) cores.delete(cores.keys().next().value!);
  return { core, accountId: data.account.id };
}

async function loadBase(userId: string, accountId: string, tz: string | undefined): Promise<TlBase> {
  const { core, accountId: acc } = await loadCore(userId, accountId);
  const journal = journalByTrade(await listJournalEntries(userId, acc));
  return buildBase(core.trades, journal, { tz, startingBalance: core.startingBalance, balanceOps: core.balanceOps, grades: core.grades, user: core.user });
}

export async function tradelog(userId: string, q: TradelogQuery, now = Date.now()): Promise<TradelogDTO> {
  return queryLog(await loadBase(userId, q.accountId, q.tz), q, now);
}

export async function tradelogExport(userId: string, q: TradelogExportQuery, now = Date.now()): Promise<{ rows: TlRow[] }> {
  return { rows: exportRows(await loadBase(userId, q.accountId, q.tz), q, now) };
}

export async function tradelogTrade(userId: string, accountId: string, id: string, tz?: string): Promise<TradelogTradeDTO> {
  const d = tradeDetail(await loadBase(userId, accountId, tz), id);
  if (!d) throw new NotFoundError('Trade not found');
  // Ownership was checked by loadBase; the stop / target editor in the panel.
  return { ...d, levels: await positionLevels(accountId, { positionId: id, direction: d.row.side }) };
}

// ─── price paths ─────────────────────────────────────────────────────────────

const PATH_TTL_S = 7 * 86_400;
const PATH_MISS_TTL_S = 15 * 60;
const CONCURRENCY = 4;

export async function tradelogPaths(userId: string, input: TradelogPathsInput): Promise<TradelogPathsDTO> {
  const { core, accountId } = await loadCore(userId, input.accountId);
  const byId = new Map(core.trades.map(t => [t.id, t]));
  const ids = [...new Set(input.ids)];
  const out: Record<string, TlPath | null> = {};
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++]!;
      const t = byId.get(id);
      if (!t || t.status !== 'CLOSED' || t.close == null || t.exit == null || t.symbol.length > 32) { out[id] = null; continue; }
      const key = `insights:tlpath:v1:${accountId}:${id}:${t.close}`;
      const hit = await cacheGet<{ p: TlPath | null }>(key);
      if (hit) { out[id] = hit.p; continue; }
      const tf = pathTf(t.open, t.close);
      let p: TlPath | null = null;
      try {
        const { candles } = await getCandles({
          symbol: t.symbol, tf: tf.tf as MarketTimeframe, accountId,
          from: Math.floor((t.open - tf.ms) / 1000), to: Math.ceil((t.close + tf.ms) / 1000), limit: 200,
        }, userId);
        p = buildPath(pathInput(t), candles, tf);
      } catch { p = null; }
      out[id] = p;
      await cacheSet(key, { p }, p ? PATH_TTL_S : PATH_MISS_TTL_S);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return { paths: out };
}

// ─── bulk tag (journal) ──────────────────────────────────────────────────────

export async function tradelogTag(userId: string, input: TradelogTagInput): Promise<TradelogTagDTO> {
  const { core, accountId } = await loadCore(userId, input.accountId);
  const known = new Set(core.trades.map(t => t.id));
  const ids = [...new Set(input.ids)].filter(id => known.has(id));
  const entries = await prisma.journalEntry.findMany({
    where: { userId, brokerAccountId: accountId, tradeId: { in: ids } },
    orderBy: { entryDate: 'desc' },
  });
  const latest = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (e.tradeId && !latest.has(e.tradeId)) latest.set(e.tradeId, e);
  let updated = 0, created = 0;
  for (const id of ids) {
    const e = latest.get(id);
    if (e) {
      if (e.tags.includes(input.tag)) continue;
      await updateJournalEntry(userId, e.id, { tags: [...e.tags, input.tag].slice(0, 30) });
      updated++;
    } else {
      await createJournalEntry(userId, { body: '', tags: [input.tag], tradeId: id, brokerAccountId: accountId });
      created++;
    }
  }
  return { updated, created };
}

/** Test hook. */
export function clearTradelogCache(): void { cores.clear(); }
