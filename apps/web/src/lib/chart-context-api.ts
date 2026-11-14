'use client';

// Data for the "Your trades" chart (E), from APIs that already exist:
//   • MT5 (Elefin) trades, journal and balance  → /trades/dashboard
//   • exchange trades, positions, stops, equity → /trading/history, /overview, /protection, /quote
//   • economic calendar                          → /calendar
//   • Trader Master levels                       → /trader/history (+ /trader/analyze on request)
//   • estimated liquidation bands (crypto)       → /liquidations/map
// Everything fails soft: a piece that can't load is simply not drawn.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type JournalEntry, type Trade } from '@/lib/api';
import { historyApi, tradingApi, type ExchangeConnection } from '@/lib/copy-api';
import { marketApi } from '@/lib/market-api';
import { traderApi, type TraderAnalysis } from '@/lib/trader-api';
import { liquidationsApi, LIQUIDATION_COINS, type LiquidationCoin, type LiquidationMap } from '@/lib/liquidations-api';
import { marketKey, sameMarket, symbolSpec, usdConversionPair, type CalEvent, type ChartTrade } from '@/components/charts/trade-math';

export interface ChartNote {
  id: string;
  time: number;
  /** Entry price of the trade it belongs to; null → pinned to the bar's high. */
  price: number | null;
  text: string;
  tradeId: string | null;
  /** Market key of the trade or of the plan tag; null when unknown. */
  market: string | null;
  plan: boolean;
}

export interface Balance { value: number; ccy: string; source: 'MT5' | 'exchange'; label: string }

export interface TradesState {
  trades: ChartTrade[];
  notes: ChartNote[];
  mt5Balance: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);


function fromMt5(t: Trade, notes: Map<string, string>): ChartTrade {
  return {
    id: t.positionId,
    source: 'mt5',
    symbol: t.symbol,
    side: t.direction,
    status: t.status,
    openTime: ms(t.openTime),
    closeTime: ms(t.closeTime),
    entry: t.entryPrice,
    exit: t.exitPrice,
    volume: t.volume,
    netPnl: t.status === 'CLOSED' ? t.netPnl : null,
    grossPnl: t.status === 'CLOSED' ? num(t.grossPnl) : null, // deal profit before commission and swap
    stop: null, // MT5 deals don't carry the stop the trade had
    target: null,
    note: notes.get(t.positionId) ?? null,
  };
}

const PLAN_TAG = 'plan';
/** The market a journal entry is about: its trade's, or a plan's symbol tag. */
function noteFor(e: JournalEntry, byId: Map<string, ChartTrade>): ChartNote | null {
  const text = (e.title && !e.body ? e.title : e.body || e.title || '').trim();
  if (!text) return null;
  const t = e.tradeId ? byId.get(e.tradeId) : undefined;
  const plan = e.tags.includes(PLAN_TAG);
  const symTag = e.tags.find(x => x !== PLAN_TAG && /^[A-Z0-9./:]{3,20}$/i.test(x));
  const market = t ? marketKey(t.symbol) : symTag ? marketKey(symTag) : null;
  if (!market) return null;
  return {
    id: e.id,
    time: t?.openTime ?? new Date(e.entryDate || e.createdAt).getTime(),
    price: t ? t.entry : null,
    text: text.replace(/\s+/g, ' '),
    tradeId: e.tradeId,
    market,
    plan,
  };
}

const mt5Cache = new Map<string, { at: number; data: { trades: ChartTrade[]; notes: ChartNote[]; balance: number | null } }>();

async function loadMt5(accountId: string, fresh = false) {
  const hit = mt5Cache.get(accountId);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.data;
  const d = await api.trades.dashboard(accountId);
  const tradeNotes = new Map<string, string>();
  for (const e of d.journal) if (e.tradeId && e.body?.trim()) tradeNotes.set(e.tradeId, e.body.trim().replace(/\s+/g, ' '));
  const trades = d.trades.map(t => fromMt5(t, tradeNotes));
  const byId = new Map(trades.map(t => [t.id, t]));
  const notes = d.journal.map(e => noteFor(e, byId)).filter((n): n is ChartNote => !!n);
  const balance = Number.isFinite(d.stats?.currentEquity) && d.stats.currentEquity > 0 ? d.stats.currentEquity : null;
  const data = { trades, notes, balance };
  mt5Cache.set(accountId, { at: Date.now(), data });
  return data;
}

async function loadExchange(connections: ExchangeConnection[]) {
  const trades: ChartTrade[] = [];
  const notes: ChartNote[] = [];
  const live = connections.filter(c => c.status === 'ACTIVE');
  const journals = await Promise.allSettled(live.map(c => historyApi.journal(c.id)));
  journals.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const t of r.value.trades) {
      const id = `${live[i]!.id}:${t.key}`;
      trades.push({
        id, source: 'exchange', symbol: t.symbol, side: t.side, status: 'CLOSED',
        openTime: ms(t.openedAt), closeTime: ms(t.closedAt), entry: t.avgEntry, exit: t.avgExit, volume: t.qty,
        netPnl: t.pnlUsd, grossPnl: null, stop: null, target: null, note: t.note?.body?.trim() || null, connectionId: live[i]!.id,
      });
      if (t.note?.body?.trim()) notes.push({ id: t.note.id, time: ms(t.openedAt)!, price: t.avgEntry, text: t.note.body.trim(), tradeId: id, market: marketKey(t.symbol), plan: false });
    }
  });
  if (live.length) {
    try {
      const o = await tradingApi.overview();
      for (const p of o.positions) {
        trades.push({
          id: `${p.connectionId}:${p.symbol}:open`, source: 'exchange', symbol: p.symbol, side: p.side, status: 'OPEN',
          openTime: null, closeTime: null, entry: p.avgEntry, exit: null, volume: p.size, netPnl: null, grossPnl: null,
          livePnl: p.unrealizedPnl, stop: null, target: null, liquidation: p.liquidationPrice, note: null, connectionId: p.connectionId,
        });
      }
    } catch { /* positions are optional */ }
  }
  return { trades, notes };
}

/** All of the user's trades and notes (every symbol), MT5 + exchanges. */
export function useChartTrades(accountId: string | null, connections: ExchangeConnection[]) {
  const [state, setState] = useState<TradesState>({ trades: [], notes: [], mt5Balance: null, status: 'idle', error: null });
  const [tick, setTick] = useState(0);
  const connKey = connections.map(c => `${c.id}:${c.status}`).join(',');
  const keyRef = useRef('');
  useEffect(() => {
    let alive = true;
    if (!accountId && !connections.length) { keyRef.current = ''; setState({ trades: [], notes: [], mt5Balance: null, status: 'ready', error: null }); return; }
    // A different account starts from scratch; a reload of the same one keeps what's shown.
    const key = `${accountId}|${connKey}`;
    const fresh = keyRef.current !== key;
    keyRef.current = key;
    setState(s => (fresh ? { trades: [], notes: [], mt5Balance: null, status: 'loading', error: null } : { ...s, error: null }));
    void (async () => {
      const [m, x] = await Promise.allSettled([
        accountId ? loadMt5(accountId, tick > 0) : Promise.resolve({ trades: [], notes: [], balance: null }),
        loadExchange(connections),
      ]);
      if (!alive) return;
      const trades = [...(m.status === 'fulfilled' ? m.value.trades : []), ...(x.status === 'fulfilled' ? x.value.trades : [])];
      const notes = [...(m.status === 'fulfilled' ? m.value.notes : []), ...(x.status === 'fulfilled' ? x.value.notes : [])];
      const failed = m.status === 'rejected' && accountId;
      setState({
        trades, notes,
        mt5Balance: m.status === 'fulfilled' ? m.value.balance : null,
        status: failed && !trades.length ? 'error' : 'ready',
        error: failed ? (m.reason instanceof Error ? m.reason.message : 'Could not load your trades') : null,
      });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, connKey, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

/** Stop and target of an open exchange position, from its resting TP/SL orders. */
export function useExchangeProtection(trade: ChartTrade | null): { stop: number | null; target: number | null } {
  const [v, setV] = useState<{ key: string; stop: number | null; target: number | null }>({ key: '', stop: null, target: null });
  const key = trade?.source === 'exchange' && trade.status === 'OPEN' && trade.connectionId ? `${trade.connectionId}:${trade.symbol}` : '';
  useEffect(() => {
    if (!key || !trade?.connectionId) return;
    let alive = true;
    tradingApi.protection(trade.connectionId, trade.symbol)
      .then(p => { if (alive) setV({ key, stop: p.stopLoss[0]?.price ?? null, target: p.takeProfit[0]?.price ?? null }); })
      .catch(() => { if (alive) setV({ key, stop: null, target: null }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return v.key === key ? v : { stop: null, target: null };
}

export interface ExchangeSizing { equity: number; multiplier: number; qtyStep: number; minQty: number; label: string; connectionId: string; symbol: string }

/** Equity and contract details for sizing a crypto symbol on the user's exchange account. */
export function useExchangeSizing(symbol: string, connections: ExchangeConnection[]): ExchangeSizing | null {
  const [v, setV] = useState<{ key: string; data: ExchangeSizing | null }>({ key: '', data: null });
  const crypto = symbolSpec(symbol).kind === 'crypto';
  const live = connections.filter(c => c.status === 'ACTIVE');
  const key = crypto && live.length ? `${symbol}:${live.map(c => c.id).join(',')}` : '';
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void (async () => {
      try {
        const accounts = await tradingApi.instruments();
        for (const a of accounts) {
          const ins = a.instruments.find(i => sameMarket(i.symbol, symbol));
          if (!ins) continue;
          const q = await tradingApi.quote(a.connectionId, ins.symbol);
          if (!alive) return;
          setV({ key, data: { equity: q.equityUsd, multiplier: q.contractMultiplier || 1, qtyStep: q.qtyStep || 1, minQty: q.minQty || q.qtyStep || 1, label: a.label, connectionId: a.connectionId, symbol: ins.symbol } });
          return;
        }
        if (alive) setV({ key, data: null });
      } catch { if (alive) setV({ key, data: null }); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return v.key === key ? v.data : null;
}

/** USD value of one unit of `ccy` (for crosses like EURGBP), from the market feed. */
export function useUsdRate(ccy: string | null): number | null {
  const [v, setV] = useState<{ ccy: string | null; rate: number | null }>({ ccy: null, rate: null });
  useEffect(() => {
    const pair = ccy ? usdConversionPair(ccy) : null;
    if (!ccy || !pair) { setV({ ccy, rate: ccy === 'USD' ? 1 : null }); return; }
    let alive = true;
    marketApi.candles({ symbol: pair.symbol, tf: '1h', limit: 2 })
      .then(({ candles }) => {
        const c = candles.at(-1)?.close;
        if (alive) setV({ ccy, rate: c && c > 0 ? (pair.invert ? 1 / c : c) : null });
      })
      .catch(() => { if (alive) setV({ ccy, rate: null }); });
    return () => { alive = false; };
  }, [ccy]);
  return v.ccy === ccy ? v.rate : null;
}

// ─── Calendar ───────────────────────────────────────────────────────────────

const toEvent = (e: { id: string; title: string; currency: string; impact: CalEvent['impact']; eventTime: string; actual: string | null; forecast: string | null; unit: string | null }): CalEvent => ({
  id: e.id, title: e.title, currency: e.currency, impact: e.impact, time: new Date(e.eventTime).getTime(), actual: e.actual, forecast: e.forecast, unit: e.unit,
});

/**
 * Calendar events for a symbol's currencies: medium + high around the chart
 * (3 weeks back, 3 days ahead), and high-impact history back to `since` for
 * the coach and the event-day review (one year at most).
 */
export function useChartEvents(symbol: string, since: number | null) {
  const currencies = useMemo(() => symbolSpec(symbol).currencies, [symbol]);
  const ccyKey = currencies.join(',');
  const [state, setState] = useState<{ key: string; window: CalEvent[]; history: CalEvent[]; status: 'loading' | 'ready' | 'error' }>({ key: '', window: [], history: [], status: 'loading' });
  const sinceDay = since ? Math.floor(since / 86_400_000) : null;
  const key = `${ccyKey}:${sinceDay}`;
  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const iso = (t: number) => new Date(t).toISOString();
    const winFrom = now - 21 * 86_400_000;
    const histFrom = Math.max(now - 365 * 86_400_000, sinceDay != null ? sinceDay * 86_400_000 - 86_400_000 : now - 90 * 86_400_000);
    setState(s => ({ ...s, key, status: 'loading' }));
    void (async () => {
      const win = await Promise.allSettled(currencies.map(c => api.calendar.list({ from: iso(winFrom), to: iso(now + 3 * 86_400_000), impacts: ['HIGH', 'MEDIUM'], currency: c })));
      const hist = await Promise.allSettled(currencies.map(c => api.calendar.list({ from: iso(histFrom), to: iso(now + 7 * 86_400_000), impacts: ['HIGH'], currency: c })));
      if (!alive) return;
      const pick = (rs: typeof win) => {
        const seen = new Set<string>();
        const out: CalEvent[] = [];
        for (const r of rs) if (r.status === 'fulfilled') for (const e of r.value) if (!seen.has(e.id)) { seen.add(e.id); out.push(toEvent(e)); }
        return out.sort((a, b) => a.time - b.time);
      };
      const allFailed = win.every(r => r.status === 'rejected');
      setState({ key, window: pick(win), history: pick(hist), status: allFailed ? 'error' : 'ready' });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { key, window: [], history: [], status: 'loading' as const };
}

// ─── Trader Master levels ───────────────────────────────────────────────────

const LEVELS_FRESH_MS = 24 * 3_600_000;
const levelCache = new Map<string, TraderAnalysis | null>();

/**
 * The latest Trader Master read for this symbol (from your history, under 24h
 * old). Running a new one is a button press: it uses the analyse quota.
 */
export function useAiLevels(symbol: string, enabled: boolean) {
  const k = marketKey(symbol);
  const [state, setState] = useState<{ key: string; data: TraderAnalysis | null; status: 'idle' | 'loading' | 'ready' | 'error' | 'running'; error: string | null }>({ key: '', data: null, status: 'idle', error: null });
  useEffect(() => {
    if (!enabled) return;
    if (levelCache.has(k)) { setState({ key: k, data: levelCache.get(k) ?? null, status: 'ready', error: null }); return; }
    let alive = true;
    setState({ key: k, data: null, status: 'loading', error: null });
    traderApi.history()
      .then(rows => {
        const fresh = rows
          .filter(r => sameMarket(r.symbol, symbol) && Date.now() - new Date(r.asOf).getTime() < LEVELS_FRESH_MS)
          .sort((a, b) => new Date(b.asOf).getTime() - new Date(a.asOf).getTime())[0] ?? null;
        levelCache.set(k, fresh);
        if (alive) setState({ key: k, data: fresh, status: 'ready', error: null });
      })
      .catch(e => { if (alive) setState({ key: k, data: null, status: 'error', error: e instanceof Error ? e.message : 'Could not load AI levels' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled]);
  const run = useCallback(async () => {
    setState(s => ({ ...s, key: k, status: 'running', error: null }));
    try {
      const a = await traderApi.analyze(symbol, ['1h', '4h']);
      levelCache.set(k, a);
      setState({ key: k, data: a, status: 'ready', error: null });
    } catch (e) {
      setState(s => ({ ...s, status: 'error', error: e instanceof Error ? e.message : 'Trader Master could not read this symbol' }));
    }
  }, [k, symbol]);
  const cur = state.key === k ? state : { key: k, data: null, status: enabled ? ('loading' as const) : ('idle' as const), error: null };
  return { ...cur, run };
}

// ─── Liquidations (estimated) ──────────────────────────────────────────────

export function liquidationCoin(symbol: string): LiquidationCoin | null {
  const s = symbolSpec(symbol);
  return s.kind === 'crypto' && (LIQUIDATION_COINS as readonly string[]).includes(s.base) ? (s.base as LiquidationCoin) : null;
}

export function useLiquidations(symbol: string, enabled: boolean) {
  const coin = liquidationCoin(symbol);
  const [state, setState] = useState<{ coin: string | null; data: LiquidationMap | null; status: 'idle' | 'loading' | 'ready' | 'error'; error: string | null }>({ coin: null, data: null, status: 'idle', error: null });
  useEffect(() => {
    if (!enabled || !coin) return;
    let alive = true;
    const load = () => liquidationsApi.map(coin, '48h')
      .then(d => { if (alive) setState({ coin, data: d, status: 'ready', error: null }); })
      .catch(e => { if (alive) setState(s => ({ coin, data: s.coin === coin ? s.data : null, status: 'error', error: e instanceof Error ? e.message : 'Liquidation estimate unavailable' })); });
    setState(s => ({ coin, data: s.coin === coin ? s.data : null, status: 'loading', error: null }));
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [coin, enabled]);
  return state.coin === coin ? state : { coin, data: null, status: enabled && coin ? ('loading' as const) : ('idle' as const), error: null };
}
