'use client';

// Charts · "Your trades" (E). The klinecharts chart (indicators, drawings,
// patterns, alerts, 1 / 2 / 4 layouts, live candles) with the layers only
// TRADElogs has: your trades and open position, journal notes on their bars,
// the economic calendar with each release's price reaction, Trader Master
// levels, a risk ruler sized from your real balance, estimated liquidation
// bands for crypto, a replay of your trades and your record on event days.
// Every figure comes from your data or the market feed; when a piece is
// missing it is hidden, never filled in.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OverlayCreate } from 'klinecharts';
import { ArrowsIn, ArrowsOut, Bell, Camera, CheckSquare, ClockCounterClockwise, Ruler, Square, SquaresFour } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount } from '@/lib/api';
import { MARKET_SYMBOL_NAMES, MARKET_TIMEFRAMES, marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { alertsApi, type CreateAlertBody } from '@/lib/alerts-api';
import { useExchangeConnections } from '@/lib/use-exchange-connections';
import { liquidationCoin, useAiLevels, useChartEvents, useChartTrades, useExchangeProtection, useExchangeSizing, useLiquidations, useUsdRate } from '@/lib/chart-context-api';
import LayoutGrid, { type Pane } from '@/components/charts/layout-grid';
import type { KlineChartHandle, LayerBuilder, Layers as ChartLayers } from '@/components/charts/kline-chart';
import { alpha, ICON, LANE, mix, type LabelSpec, type TagSpec } from '@/components/charts/chart-overlays';
import type { Cand } from '@/components/charts/label-layout';
import SymbolSearch from '@/components/charts/symbol-search';
import WatchStar from '@/components/v6/ui/watch-star';
import TimeframeBar from '@/components/charts/timeframe-bar';
import IndicatorMenu from '@/components/charts/indicator-menu';
import Watchlist from '@/components/charts/watchlist';
import AlertsPanel from '@/components/charts/alerts-panel';
import AlertDialog from '@/components/charts/alert-dialog';
import ChartTypeMenu from '@/components/charts/chart-type-menu';
import PatternsPanel from '@/components/charts/patterns-panel';
import StatsPanel from '@/components/charts/stats-panel';
import MtfStrip from '@/components/charts/mtf-strip';
import DrawingRail from '@/components/charts/drawing-rail';
import OpenTradeCard from '@/components/charts/open-trade-card';
import RiskRuler from '@/components/charts/risk-ruler';
import { DEFAULT_RISK_CAP_PCT, useTradingPrefs } from '@/lib/trading-prefs';
import { tradeDataApi } from '@/lib/trade-data-api';
import ReplayPanel from '@/components/charts/replay-panel';
import EventDays from '@/components/charts/event-days';
import { fmtChg, fmtQuote } from '@/components/charts/quote';
import { useHideMoney } from '@/components/v6/use-hide-money';
import { useScrollFade } from '@/components/charts/use-scroll-fade';
import {
  atr, coachFor, eventDayStats, eventKind, eventReaction, eventShort, learnedPointValue, marketKey, money, openExcursion, pickReviewKind,
  planError, px, sameMarket, sizePosition, specPointValueUsd, stepDecimals, symbolSpec,
  type CalEvent, type ChartTrade, type RiskInput,
} from '@/components/charts/trade-math';
import { PATTERN_TFS, patternsApi, type PatternsResult } from '@/lib/patterns-api';
import '@/styles/v6/markets.css';
import '@/components/charts/charts-e.css';

const DEFAULT_SYMBOLS = ['XAUUSD', 'BTCUSDT', 'ETHUSDT', 'EURUSD'];
const LAYOUT_KEY = 'tradelogs.charts.layout';
const LAYERS_KEY = 'tradelogs.charts.layers';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Math.random()}`);
const TF_MS: Record<MarketTimeframe, number> = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3, '1M': 2592000e3 };

const LAYOUTS: { n: number; label: string; icon: React.ReactNode }[] = [
  { n: 1, label: 'Single chart', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /></svg> },
  { n: 2, label: 'Two charts', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 4v16" /></svg> },
  { n: 4, label: 'Four charts', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 4v16M4 12h16" /></svg> },
];

type LayerId = 'trades' | 'notes' | 'news' | 'ai' | 'ruler' | 'volume' | 'liq';
type Layers = Record<LayerId, boolean>;
const DEFAULT_LAYERS: Layers = { trades: true, notes: true, news: true, ai: true, ruler: true, volume: false, liq: false };
const LAYER_LABEL: Record<LayerId, string> = { trades: 'Trades', notes: 'Notes', news: 'News', ai: 'AI levels', ruler: 'Ruler', volume: 'Volume', liq: 'Liquidations (est.)' };

interface Plan { symbol: string; side: 'LONG' | 'SHORT'; entry: number | null; stop: number | null; target: number | null }

/** Price decimals for inputs: gold and indices 1, JPY pairs 3, FX 5. */
const decimalsFor = (p: number | null) => (p == null ? 2 : p >= 1000 ? 1 : p >= 100 ? 2 : p >= 10 ? 3 : 5);
const roundTo = (v: number, d: number) => Number(v.toFixed(d));

function useClock(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Latest saved plan's stop for an open trade: same market and side, saved up to 24h before it opened. */
function planStop(notes: ReturnType<typeof useChartTrades>['notes'], t: ChartTrade): number | null {
  if (t.openTime == null) return null;
  const key = marketKey(t.symbol);
  const plans = notes
    .filter(n => n.plan && n.market === key && n.time <= t.openTime! + 5 * 60e3 && t.openTime! - n.time <= 24 * 3_600_000)
    .sort((a, b) => b.time - a.time);
  for (const n of plans) {
    const side = /^\s*(long|short)\b/i.exec(n.text)?.[1]?.toUpperCase();
    const stop = /\bstop\s+([\d,]+(?:\.\d+)?)/i.exec(n.text)?.[1];
    if (side === t.side && stop) { const v = Number(stop.replace(/,/g, '')); if (v > 0) return v; }
  }
  return null;
}

export default function ChartsPage() {
  const { accounts, selected, select, loading: accountsLoading } = useAccounts();
  const connections = useExchangeConnections();
  const [moneyHidden] = useHideMoney();
  const [panes, setPanes] = useState<Pane[]>(() => DEFAULT_SYMBOLS.slice(0, 1).map((symbol, i) => ({ id: `p${i}`, symbol, tf: '15m' as MarketTimeframe })));
  const [activeId, setActiveId] = useState<string>(() => panes[0]!.id);
  const chartRefs = useRef<Map<string, KlineChartHandle>>(new Map());
  const cardRef = useRef<HTMLElement>(null);
  const layRef = useRef<HTMLDetailsElement>(null);
  const layersRowRef = useScrollFade<HTMLDivElement>();
  const toolbarRef = useScrollFade<HTMLDivElement>();
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const d = layRef.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, []);
  const bodyRef = useRef<HTMLDivElement>(null);

  const active = panes.find(p => p.id === activeId) ?? panes[0]!;
  const symbol = active.symbol;
  const activeChart = () => chartRefs.current.get(activeId);
  const timeBased = (active.chartType ?? 'candles') === 'candles' || active.chartType === 'heikin';
  const now = useClock(30_000);

  // ── Layers (remembered on this device) ──
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  useEffect(() => { try { const raw = localStorage.getItem(LAYERS_KEY); if (raw) setLayers({ ...DEFAULT_LAYERS, ...(JSON.parse(raw) as Partial<Layers>) }); } catch { /* storage off */ } }, []);
  const toggleLayer = (id: LayerId) => setLayers(l => { const next = { ...l, [id]: !l[id] }; try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });

  // ── Bars and live price of the active pane ──
  // Bars per pane (key = pane + symbol + timeframe + type), so panes don't overwrite each other.
  const [bars, setBars] = useState<Record<string, Candle[]>>({});
  const barsKey = `${activeId}:${symbol}:${active.tf}:${active.chartType ?? 'candles'}`;
  const curBars = useMemo(() => bars[barsKey] ?? [], [bars, barsKey]);
  const barsLoaded = barsKey in bars;
  const [live, setLive] = useState<{ key: string; price: number } | null>(null);
  const liveAt = useRef(0);
  const [quote, setQuote] = useState<{ key: string; last: number; ref: number | null } | null>(null);
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const paneKey = (id: string) => { const p = panesRef.current.find(x => x.id === id); return p ? { p, key: `${id}:${p.symbol}:${p.tf}:${p.chartType ?? 'candles'}` } : null; };
  const onBars = useCallback((id: string, list: Candle[]) => {
    const k = paneKey(id);
    if (k) setBars(prev => {
      const live = new Set(panesRef.current.map(p => p.id));
      const next: Record<string, Candle[]> = {};
      for (const [key, v] of Object.entries(prev)) if (live.has(key.split(':')[0]!) && key.split(':')[0] !== id) next[key] = v;
      next[k.key] = list;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onLive = useCallback((id: string, bar: Candle) => {
    if (Date.now() - liveAt.current < 1000) return;
    liveAt.current = Date.now();
    const k = paneKey(id);
    if (k) setLive({ key: `${id}:${k.p.symbol}`, price: bar.close });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onQuote = useCallback((id: string, v: { last: number; ref: number | null }) => {
    const k = paneKey(id);
    if (k) setQuote({ key: `${id}:${k.p.symbol}:${k.p.tf}`, ...v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const q = quote?.key === `${activeId}:${symbol}:${active.tf}` ? quote : null;
  const price = (live?.key === `${activeId}:${symbol}` ? live.price : null) ?? curBars.at(-1)?.close ?? q?.last ?? null;
  const chg = price != null && q?.ref ? ((price - q.ref) / q.ref) * 100 : null;

  // ── Your data ──
  const tr = useChartTrades(selected?.id ?? null, connections);
  const tradesLoading = tr.status === 'loading' || tr.status === 'idle' || (accountsLoading && !selected);
  const symTrades = useMemo(() => tr.trades.filter(t => sameMarket(t.symbol, symbol)), [tr.trades, symbol]);
  const openTrade = useMemo(() => symTrades.filter(t => t.status === 'OPEN').sort((a, b) => (b.openTime ?? 0) - (a.openTime ?? 0))[0] ?? null, [symTrades]);
  const earliest = useMemo(() => tr.trades.reduce<number | null>((m, t) => (t.openTime != null && (m == null || t.openTime < m) ? t.openTime : m), null), [tr.trades]);
  const ev = useChartEvents(symbol, earliest);
  const allEvents = useMemo(() => { const seen = new Set<string>(); return [...ev.history, ...ev.window].filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true))); }, [ev.history, ev.window]);
  const ai = useAiLevels(symbol, layers.ai);
  const crypto = liquidationCoin(symbol) != null;
  const liq = useLiquidations(symbol, layers.liq && crypto);
  const protection = useExchangeProtection(openTrade);
  const exSizing = useExchangeSizing(symbol, connections);

  // ── Money per point, balance, R ──
  const spec = useMemo(() => symbolSpec(symbol), [symbol]);
  const acctCcy = selected?.baseCurrency || 'USD';
  const usesExchange = !!exSizing;
  const ccy = usesExchange ? 'USD' : acctCcy;
  const needsRate = spec.quote !== 'USD' && !(spec.kind === 'fx' && spec.base === 'USD');
  const usdRate = useUsdRate(needsRate ? spec.quote : null);
  const learned = useMemo(() => learnedPointValue(symTrades.filter(t => t.source === 'mt5')), [symTrades]);
  const specPv = price != null ? specPointValueUsd(spec, price, usdRate) : null;
  const mt5Pv = learned ?? (acctCcy === 'USD' ? specPv : null);
  const pointValue = usesExchange ? exSizing!.multiplier : mt5Pv;
  const tradePv = (t: ChartTrade) => (t.source === 'exchange' ? 1 : mt5Pv);
  const balance = usesExchange
    ? { value: exSizing!.equity, ccy: 'USD', label: `${exSizing!.label} equity` }
    : tr.mt5Balance != null && selected ? { value: tr.mt5Balance, ccy: acctCcy, label: `MT5 ${selected.mt5Login} balance` } : null;
  // No R here: MT5 deals carry no stop at entry, and an "R" from the average loss
  // isn't the R the rest of the app shows (that needs a real stop). Money only.

  // ── Open trade ──
  const plannedStop = openTrade && openTrade.source === 'mt5' ? planStop(tr.notes, openTrade) : null;
  const openStop = openTrade ? (protection.stop ?? openTrade.stop ?? plannedStop) : null;
  const openTarget = openTrade ? (protection.target ?? openTrade.target) : null;
  const openPnl = openTrade
    ? openTrade.source === 'exchange' && openTrade.livePnl != null && price == null ? openTrade.livePnl
      : price != null && tradePv(openTrade) != null ? (price - openTrade.entry) * (openTrade.side === 'LONG' ? 1 : -1) * openTrade.volume * tradePv(openTrade)!
        : openTrade.livePnl ?? null
    : null;
  const excursion = useMemo(() => (openTrade ? openExcursion(openTrade, curBars) : null), [openTrade, curBars]);
  const coach = useMemo(() => (openTrade ? coachFor(openTrade, allEvents, tr.trades) : null), [openTrade, allEvents, tr.trades]);
  const openNote = openTrade?.note ?? null;

  // ── Event-day review ──
  const review = useMemo(() => (now ? pickReviewKind(allEvents, spec.currencies, now) : null), [allEvents, spec.currencies, now]);
  const reviewScope = symTrades.filter(t => t.status === 'CLOSED').length >= 5 ? symTrades : tr.trades;
  const dayStats = useMemo(() => (review ? eventDayStats(reviewScope, ev.history, review.kind, null) : null), [review, reviewScope, ev.history]);

  // ── Risk ruler ──
  const [plan, setPlan] = useState<Plan>({ symbol: '', side: 'LONG', entry: null, stop: null, target: null });
  const [risk, setRisk] = useState<RiskInput>({ mode: 'pct', pct: 0.5 });
  const dec = decimalsFor(price);
  useEffect(() => {
    if (plan.symbol === symbol || !curBars.length) return;
    const last = curBars.at(-1)!.close;
    const d = decimalsFor(last);
    const a = atr(curBars.slice(-60), 14) ?? last * 0.004;
    const supports = (ai.data?.support ?? []).map(l => l.price).filter(p => p < last && last - p <= a * 3).sort((x, y) => y - x);
    const entry = roundTo(last, d);
    const stop = roundTo(supports[0] != null && entry - supports[0] >= a * 0.5 ? supports[0] : entry - a * 1.5, d);
    const res = (ai.data?.resistance ?? []).map(l => l.price).filter(p => p - entry >= (entry - stop) * 1.5).sort((x, y) => x - y)[0];
    setPlan({ symbol, side: 'LONG', entry, stop, target: roundTo(res ?? entry + (entry - stop) * 2.5, d) });
  }, [curBars, symbol, plan.symbol, ai.data]);
  const planOk = plan.symbol === symbol;
  const problem = !planOk ? null : planError(plan.side, plan.entry ?? 0, plan.stop ?? 0, plan.target);
  const lotStep = usesExchange ? exSizing!.qtyStep : spec.kind === 'crypto' ? 0.01 : spec.lotStep;
  const minLot = usesExchange ? exSizing!.minQty : spec.kind === 'crypto' ? 0.01 : spec.minLot;
  const sizing = planOk && !problem && pointValue && plan.entry != null && plan.stop != null
    ? sizePosition({ balance: balance?.value ?? null, risk: risk.mode === 'pct' && !balance ? { mode: 'usd', usd: 0 } : risk, entry: plan.entry, stop: plan.stop, target: plan.target, pointValue, lotStep, minLot })
    : null;
  const rulerProblem = !planOk ? (barsLoaded && !curBars.length ? `No ${symbol} prices to size from right now.` : 'Loading prices…')
    : problem ?? (!pointValue ? (acctCcy !== 'USD' ? `Lot size needs a closed ${symbol} trade on this account to learn its ${acctCcy} value per point.` : `No contract value for ${symbol} yet: it’s learned from your fills.`)
      : !balance && risk.mode === 'pct' ? 'Your balance isn’t available. Pick a fixed amount ($) to size.' : null);
  const basis = usesExchange ? `${exSizing!.symbol} on ${exSizing!.label}: ${exSizing!.multiplier} per contract, step ${exSizing!.qtyStep}.`
    : learned != null ? `Point value ${money(learned, acctCcy)} per lot, learned from your ${symbol} fills.`
      : specPv != null ? `Standard spec: ${spec.contractSize.toLocaleString('en-US')} per lot${spec.brokerDependent ? '. Contract sizes vary by broker, so check yours.' : '.'}` : null;
  const unit = usesExchange ? 'contracts' : 'lot';
  const lotDecimals = stepDecimals(lotStep);

  // Day risk cap: Settings › Trading rules (default 2% of the balance).
  const riskCapPct = useTradingPrefs().prefs?.riskCapPct ?? DEFAULT_RISK_CAP_PCT;
  const dayRisk = useMemo(() => {
    if (!balance || !now) return null;
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const src = usesExchange ? 'exchange' : 'mt5';
    const todays = tr.trades.filter(t => t.source === src && t.status === 'CLOSED' && t.closeTime != null && t.closeTime >= start.getTime());
    const realised = Math.max(0, -todays.reduce((a, t) => a + (t.netPnl ?? 0), 0));
    const opens = tr.trades.filter(t => t.source === src && t.status === 'OPEN');
    let open = 0, openKnown = true;
    for (const t of opens) {
      const s = t.id === openTrade?.id ? openStop : t.stop;
      const pv = tradePv(t);
      if (s != null && pv) open += Math.abs(t.entry - s) * t.volume * pv; else openKnown = false;
    }
    return { realised, open, openKnown, cap: balance.value * (riskCapPct / 100) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance?.value, now, tr.trades, usesExchange, openTrade?.id, openStop, mt5Pv, riskCapPct]);
  const nextEvent = useMemo(() => {
    if (!now) return null;
    const e = ev.window.find(x => x.impact === 'HIGH' && x.time > now && x.time - now < 24 * 3_600_000);
    return e ? { label: eventKind(e.title), at: e.time } : null;
  }, [ev.window, now]);

  const [alertState, setAlertState] = useState<{ key: string; state: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ key: '', state: 'idle' });
  const alertKey = `${symbol}:${plan.entry}`;
  const [alertsReload, setAlertsReload] = useState(0);
  const alertAtEntry = async () => {
    if (plan.entry == null) return;
    setAlertState({ key: alertKey, state: 'busy' });
    try {
      await alertsApi.create({ symbol, direction: price != null && plan.entry < price ? 'below' : 'above', threshold: plan.entry, seedPrice: price ?? undefined, note: 'Risk ruler entry' });
      setAlertState({ key: alertKey, state: 'done' });
      setAlertsReload(t => t + 1);
    } catch (e) { setAlertState({ key: alertKey, state: 'error', message: e instanceof Error ? e.message : 'Could not create the alert' }); }
  };
  const [saveState, setSaveState] = useState<{ key: string; state: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ key: '', state: 'idle' });
  const planKey = `${symbol}:${plan.side}:${plan.entry}:${plan.stop}:${plan.target}`;
  const savePlan = async () => {
    if (!sizing || plan.entry == null || plan.stop == null) return;
    setSaveState({ key: planKey, state: 'busy' });
    const riskTxt = risk.mode === 'pct' ? ` (${risk.pct}%)` : '';
    const body = `${plan.side === 'LONG' ? 'Long' : 'Short'} ${symbol} · entry ${plan.entry} · stop ${plan.stop}${plan.target != null ? ` · target ${plan.target}` : ''} · ${sizing.lots.toFixed(lotDecimals)} ${unit} · risk ${money(sizing.riskMoney, ccy)}${riskTxt}${sizing.r != null ? ` · ${sizing.r.toFixed(1)}R` : ''}`;
    try {
      await api.journal.create({ title: `Plan · ${symbol}`, body, tags: ['plan', symbol], ...(selected ? { brokerAccountId: selected.id } : {}) });
      // The open MT5 position on this symbol and side gets the plan's stop / target as its levels (R, stop moves).
      const pos = selected && openTrade?.source === 'mt5' && openTrade.side === plan.side ? openTrade : null;
      let level: 'saved' | 'skipped' | null = null;
      if (pos && selected) {
        level = await tradeDataApi.add(selected.id, pos.id, { sl: plan.stop, tp: plan.target }, 'plan').then(() => 'saved' as const, () => 'skipped' as const);
      }
      setSaveState({
        key: planKey, state: 'done',
        message: level === 'saved' ? 'Saved to your journal and as the stop of your open trade.'
          : level === 'skipped' ? 'Saved to your journal. The stop didn’t fit your open trade, so it wasn’t attached.'
            : 'Saved to your journal. It shows as a note on the chart.',
      });
      tr.reload();
    } catch (e) { setSaveState({ key: planKey, state: 'error', message: e instanceof Error ? e.message : 'Could not save the plan' }); }
  };
  const copyLevels = async () => {
    if (plan.entry == null || plan.stop == null) return false;
    const text = `${symbol} ${plan.side === 'LONG' ? 'long' : 'short'} · Entry ${plan.entry.toFixed(dec)} · Stop ${plan.stop.toFixed(dec)}${plan.target != null ? ` · Target ${plan.target.toFixed(dec)}` : ''}${sizing && !sizing.belowMin ? ` · ${sizing.lots.toFixed(lotDecimals)} ${unit}` : ''}`;
    try { await navigator.clipboard.writeText(text); return true; } catch {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch { return false; }
    }
  };
  const setSide = (side: 'LONG' | 'SHORT') => setPlan(p => {
    if (p.side === side || p.entry == null) return { ...p, side };
    const mirror = (v: number | null) => (v == null ? null : roundTo(p.entry! * 2 - v, dec));
    return { ...p, side, stop: mirror(p.stop), target: mirror(p.target) };
  });
  const onRulerDrag = useCallback((v: { entry: number; stop: number; target: number }) => {
    setPlan(p => { const d = decimalsFor(v.entry); return { ...p, entry: roundTo(v.entry, d), stop: roundTo(v.stop, d), target: roundTo(v.target, d) }; });
  }, []);

  // ── Chart patterns (existing E8) ──
  const [patternsOn, setPatternsOn] = useState(false);
  useEffect(() => { try { setPatternsOn(localStorage.getItem('tradelogs.charts.patterns') === '1'); } catch { /* ignore */ } }, []);
  const [pat, setPat] = useState<{ key: string; data: PatternsResult | null; error: string | null; loading: boolean }>({ key: '', data: null, error: null, loading: false });
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const patternTfOk = (PATTERN_TFS as readonly string[]).includes(active.tf);
  const patKey = `${active.symbol}:${active.tf}`;
  useEffect(() => {
    if (!patternsOn || !timeBased || !patternTfOk) return;
    let alive = true;
    const load = () => {
      setPat(s => ({ key: patKey, data: s.key === patKey ? s.data : null, error: null, loading: true }));
      patternsApi.find(active.symbol, active.tf)
        .then(d => { if (alive) setPat({ key: patKey, data: d, error: null, loading: false }); })
        .catch(e => { if (alive) setPat({ key: patKey, data: null, error: e instanceof Error ? e.message : 'Could not find patterns', loading: false }); });
    };
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternsOn, timeBased, patternTfOk, patKey]);
  useEffect(() => { setSelectedPattern(null); }, [patKey]);
  const patternsOnPane = useRef<string | null>(null);
  useEffect(() => {
    const list = patternsOn && timeBased && pat.key === patKey ? pat.data?.patterns ?? [] : [];
    if (patternsOnPane.current && patternsOnPane.current !== activeId) chartRefs.current.get(patternsOnPane.current)?.setPatterns([]);
    chartRefs.current.get(activeId)?.setPatterns(list, selectedPattern);
    patternsOnPane.current = activeId;
  }, [patternsOn, timeBased, pat, patKey, activeId, selectedPattern]);
  const togglePatterns = () => setPatternsOn(v => { try { localStorage.setItem('tradelogs.charts.patterns', v ? '0' : '1'); } catch { /* ignore */ } return !v; });

  // ── Chart size (room on the right for the ruler and upcoming events) ──
  const [bodyW, setBodyW] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBodyW(el.clientWidth));
    ro.observe(el);
    setBodyW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const narrow = bodyW > 0 && bodyW < 560;
  const rightSpace = panes.length > 1 ? 40 : layers.ruler ? Math.round(Math.max(110, Math.min(260, bodyW * (narrow ? 0.3 : 0.2)))) : 48;

  // ── The layers, built from state and drawn on the active pane ──
  const builder = useMemo<LayerBuilder | null>(() => {
    if (!timeBased) return null;
    const tfMs = TF_MS[active.tf];
    const m = (v: number, signed = true) => (moneyHidden ? '•••' : money(v, ccy, signed));
    // Spots a label may take around its anchor, in order of preference.
    const AROUND: Cand[] = [{ dx: 0, dy: -13, align: 'center' }, { dx: 0, dy: 15, align: 'center' }, { dx: 10, dy: -13, align: 'left' }, { dx: -10, dy: -13, align: 'right' }, { dx: 10, dy: 15, align: 'left' }, { dx: -10, dy: 15, align: 'right' }];
    const SIDE: Cand[] = [{ dx: 12, dy: 0, align: 'left' }, { dx: -12, dy: 0, align: 'right' }, { dx: 12, dy: -18, align: 'left' }, { dx: -12, dy: -18, align: 'right' }, { dx: 12, dy: 18, align: 'left' }, { dx: -12, dy: 18, align: 'right' }];
    return ({ pal, bars: kbars, width, barSpace }) => {
      const overlays: OverlayCreate[] = [];
      const labels: LabelSpec[] = [];
      const tags: TagSpec[] = [];
      const obstacles: ChartLayers['obstacles'] = [];
      const extent: number[] = [];
      const first = kbars[0]!.timestamp;
      const last = kbars[kbars.length - 1]!;
      const end = last.timestamp + tfMs;
      const thin = width < 560;
      const lastPx = price ?? last.close;
      const d = decimalsFor(lastPx);

      if (layers.liq && liq.data) {
        overlays.push({ name: 'tlLiq', points: [{ timestamp: last.timestamp, value: liq.data.price }], extendData: { pal, bands: liq.data.bands, step: liq.data.step, price: lastPx } });
        labels.push({ id: 'liq', prio: 2, x: 'left', y: 'plotBottom', text: 'Liquidations · Estimated', short: 'Liq. · Est.', color: pal.tx, bg: pal.s2, border: pal.line2, weight: 700, cands: [{ dx: 0, dy: 0, align: 'left' }], hit: false });
      }
      if (layers.ai && ai.data) {
        const sup = ai.data.support.filter(l => l.price < lastPx).sort((a, b) => b.price - a.price).slice(0, 2);
        const res = ai.data.resistance.filter(l => l.price > lastPx).sort((a, b) => a.price - b.price).slice(0, 2);
        if (sup[0]) extent.push(sup[0].price);
        if (res[0]) extent.push(res[0].price);
        for (const [k, l] of [...sup.map(l => ['S', l] as const), ...res.map(l => ['R', l] as const)]) {
          overlays.push({ name: 'tlHLine', points: [{ timestamp: first, value: l.price }], extendData: { pal, color: pal.mut, dashed: true, opacity: 0.8 } });
          const full = `${k} ${px(l.price, d)} · ${l.label}`;
          labels.push({ id: `ai${k}${l.price}`, prio: 5, x: 'left', v: l.price, text: thin ? `${k} ${px(l.price, d)} · AI` : full, short: `${k} ${px(l.price, d)}`, tip: `AI level ${full}`, color: pal.mut, cands: [{ dx: 0, dy: -10, align: 'left' }, { dx: 0, dy: 10, align: 'left' }] });
        }
      }
      if (layers.news) {
        // One marker per release time; the strongest event names it. All event text lives in the lane.
        const inView = ev.window.filter(e => e.time >= first && e.time <= end + 3 * 86_400_000);
        const groups = new Map<number, CalEvent[]>();
        for (const e of inView) { const k = Math.floor(e.time / 60e3); groups.set(k, [...(groups.get(k) ?? []), e]); }
        const list = [...groups.values()].slice(-40);
        const pastHigh = list.filter(g => g.some(e => e.impact === 'HIGH') && g[0]!.time <= last.timestamp + tfMs).slice(-2).map(g => g[0]!.time);
        list.forEach((g, i) => {
          const lead = g.find(e => e.impact === 'HIGH') ?? g[0]!;
          const high = lead.impact === 'HIGH';
          const future = lead.time > Date.now();
          const shorts = [...new Set(g.filter(e => e.impact === lead.impact).map(e => eventShort(e.title)))].slice(0, 2).join('·');
          overlays.push({ name: 'tlEvent', points: [{ timestamp: lead.time, value: lastPx }], extendData: { pal, high } });
          const t = new Date(lead.time);
          const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          let tip = `${hhmm} ${g.map(e => e.title).slice(0, 3).join(', ')}`;
          let row2: string | null = null, row2short: string | null = null;
          if (high && pastHigh.includes(lead.time)) {
            const r = eventReaction(kbars.map(b => ({ openTime: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close })), lead.time, tfMs);
            const withNum = g.find(e => e.actual && e.forecast);
            if (r) {
              const mv = `${r.move < 0 ? '−' : '+'}${px(Math.abs(r.move), d)}`;
              const atrTxt = r.atrMult != null ? ` · ${r.atrMult.toFixed(1)}× ATR` : '';
              row2short = `${mv}${atrTxt}`;
              row2 = withNum ? `${eventShort(withNum.title)} ${withNum.actual}${withNum.unit ?? ''} vs ${withNum.forecast}${withNum.unit ?? ''} · ${row2short}` : row2short;
              tip = `${tip} · ${row2}`;
            }
          } else if (future && high) {
            row2 = `${hhmm} ${eventKind(lead.title)}`;
            row2short = `${hhmm} ${shorts}`;
          }
          labels.push({ id: `ev${lead.time}`, prio: high ? 7 : 8, t: lead.time, region: 'lane1', text: shorts, color: high ? pal.rTx : pal.mut, bg: 'transparent', cands: [{ dx: 0, dy: 0, align: 'center' }], hit: false });
          if (row2) labels.push({ id: `evr${lead.time}`, prio: 7, t: lead.time, region: 'lane2', text: row2, short: row2short ?? undefined, color: high ? pal.rTx : pal.mut, bg: mix(pal.bg, pal.r, 0.1), border: alpha(pal.r, 0.45), weight: 700, icon: future ? undefined : ICON.bolt, cands: [{ dx: -6, dy: 0, align: 'right' }, { dx: 6, dy: 0, align: 'left' }], hit: false });
          // Markers in the lane open their event on tap.
          labels.push({ id: `evh${lead.time}${i}`, prio: 99, t: lead.time, region: 'plot', y: 'plotBottom', oy: LANE.plotPad + 10 - LANE.marker, text: '', tip, color: pal.mut, cands: [] });
        });
      }
      if (layers.trades) {
        const closed = symTrades
          .filter(t => t.status === 'CLOSED' && t.openTime != null && t.closeTime != null && t.exit != null && t.netPnl != null && t.closeTime >= first - tfMs && t.openTime <= end)
          .sort((a, b) => a.closeTime! - b.closeTime!);
        closed.forEach((t, i) => {
          const recent = i >= closed.length - 3;
          overlays.push({ name: 'tlTrade', points: [{ timestamp: t.openTime!, value: t.entry }, { timestamp: t.closeTime!, value: t.exit! }], extendData: { pal, side: t.side, win: t.netPnl! >= 0 } });
          const up = (t.side === 'LONG') === (t.netPnl! >= 0);
          const hi = Math.max(t.entry, t.exit!), lo = Math.min(t.entry, t.exit!);
          labels.push({
            id: `tr${t.id}`, prio: recent ? 3 : 6, t: Math.round((t.openTime! + t.closeTime!) / 2), v: up ? hi : lo,
            text: m(t.netPnl!), short: m(t.netPnl!), tip: `${t.side === 'LONG' ? 'Long' : 'Short'} ${t.volume} · ${px(t.entry, d)} → ${px(t.exit!, d)} · ${m(t.netPnl!)}${t.note ? ` · “${t.note}”` : ''}`,
            color: t.netPnl! >= 0 ? pal.gTx : pal.rTx, weight: 800, cands: up ? AROUND : [AROUND[1]!, AROUND[0]!, ...AROUND.slice(2)],
          });
        });
        if (openTrade) {
          const timed = openTrade.openTime != null && openTrade.openTime >= first;
          const at = timed ? openTrade.openTime! : last.timestamp;
          overlays.push({ name: 'tlOpen', points: [{ timestamp: at, value: openTrade.entry }], extendData: { pal, side: openTrade.side, timed } });
          const head = `${openTrade.side === 'LONG' ? 'Long' : 'Short'} ${openTrade.volume}${openPnl != null ? ` · ${m(openPnl)}` : ''}`;
          labels.push({
            id: 'open', prio: 0, t: at, v: openTrade.entry, text: head, short: openPnl != null ? m(openPnl) : undefined, tip: `Open ${head} @ ${px(openTrade.entry, d)}`,
            color: openPnl == null ? pal.tx : openPnl < 0 ? pal.rTx : pal.gTx, weight: 800,
            cands: [{ dx: -10, dy: -12, align: 'right' }, { dx: 10, dy: -12, align: 'left' }, { dx: -10, dy: 13, align: 'right' }, { dx: 10, dy: 13, align: 'left' }, { dx: -10, dy: -30, align: 'right' }, { dx: 10, dy: -30, align: 'left' }],
          });
          if (coach?.flag) {
            labels.push({
              id: 'flag', prio: 1, t: at, v: openTrade.entry, text: coach.flag, short: coach.flag.replace('Opened ', ''), tip: coach.line ? `${coach.flag}. ${coach.line}` : coach.flag,
              color: pal.rTx, bg: mix(pal.bg, pal.r, 0.1), border: alpha(pal.r, 0.45), icon: ICON.warn, hit: false,
              cands: [{ dx: -10, dy: 34, align: 'right' }, { dx: 10, dy: 34, align: 'left' }, { dx: -10, dy: 54, align: 'right' }, { dx: 10, dy: 54, align: 'left' }, { dx: -10, dy: -34, align: 'right' }, { dx: 10, dy: -34, align: 'left' }, { dx: -10, dy: 74, align: 'right' }],
            });
          }
          const from = timed ? openTrade.openTime! : first;
          tags.push({ id: 'L', prio: 1, v: openTrade.entry, text: `${openTrade.side === 'LONG' ? 'L' : 'S'} ${px(openTrade.entry, d)}`, kind: 'neutral' });
          if (openStop != null) { extent.push(openStop); overlays.push({ name: 'tlHLine', points: [{ timestamp: from, value: openStop }], extendData: { pal, color: pal.r, dashed: true, fromPoint: timed } }); tags.push({ id: 'SL', prio: 0, v: openStop, text: `SL ${px(openStop, d)}`, kind: 'downSolid' }); }
          if (openTarget != null) { extent.push(openTarget); overlays.push({ name: 'tlHLine', points: [{ timestamp: from, value: openTarget }], extendData: { pal, color: pal.g, dashed: true, fromPoint: timed } }); tags.push({ id: 'TP', prio: 2, v: openTarget, text: `TP ${px(openTarget, d)}`, kind: 'up' }); }
          if (openTrade.liquidation != null) { overlays.push({ name: 'tlHLine', points: [{ timestamp: first, value: openTrade.liquidation }], extendData: { pal, color: pal.dim, dashed: true } }); tags.push({ id: 'LIQ', prio: 4, v: openTrade.liquidation, text: `Liq ${px(openTrade.liquidation, d)}`, kind: 'muted' }); }
        }
      }
      if (layers.notes) {
        const key = marketKey(symbol);
        const notes = tr.notes.filter(n => n.market === key && n.time >= first - tfMs && n.time <= end).slice(-30);
        for (const n of notes) {
          let value = n.price;
          let ts = n.time;
          if (value == null) {
            const b = [...kbars].reverse().find(x => x.timestamp <= n.time) ?? last;
            value = b.high; ts = b.timestamp;
          }
          const text = n.plan ? `Plan: ${n.text.replace(new RegExp(`\\s*${symbol}\\b`, 'i'), '').replace(/\bentry /i, 'E ').replace(/\bstop /i, 'SL ').replace(/\btarget /i, 'TP ')}` : n.text;
          // The open trade's note sits under its line (its label is above); plans sit higher.
          const dy = openTrade && n.tradeId === openTrade.id ? 12 : n.plan ? -48 : -26;
          overlays.push({ name: 'tlNote', points: [{ timestamp: ts, value }], extendData: { pal, dy } });
          obstacles.push({ t: ts, v: value, ox: -8, oy: dy, w: 16, h: 16 });
          const quoted = `“${text.length > 34 ? `${text.slice(0, 33).trimEnd()}…` : text}”`;
          labels.push({ id: `n${n.id}`, prio: 4, t: ts, v: value, oy: dy + 8, minY: 32, text: quoted, short: `“${text.slice(0, 12).trimEnd()}…”`, tip: text, color: pal.mut, cands: SIDE });
        }
      }
      if (layers.ruler && planOk && !problem && plan.entry != null && plan.stop != null && plan.target != null && panes.length === 1) {
        const ts = last.timestamp + Math.max(2, Math.round((rightSpace / 2) / Math.max(1, barSpace))) * tfMs;
        const lots = sizing && !sizing.belowMin ? `${sizing.lots.toFixed(lotDecimals)} ${unit}` : null;
        extent.push(plan.entry, plan.stop, plan.target);
        overlays.push({
          name: 'tlRuler',
          points: [{ timestamp: ts, value: plan.entry }, { timestamp: ts, value: plan.stop }, { timestamp: ts, value: plan.target }],
          extendData: { pal, bell: alertState.key === alertKey && alertState.state === 'done', onChange: onRulerDrag },
        });
        const long = plan.side === 'LONG';
        const inZone = (id: string, v: number, text: string, color: string, below: boolean, weight = 700): LabelSpec => ({ id, prio: 2, t: ts, x: 'ruler', v, text, color, weight, bg: 'transparent', tip: `Risk ruler · ${text}`, cands: below ? [{ dx: 0, dy: 11, align: 'left' }, { dx: 0, dy: -10, align: 'left' }] : [{ dx: 0, dy: -10, align: 'left' }, { dx: 0, dy: 11, align: 'left' }] });
        if (sizing?.rewardMoney != null) labels.push(inZone('rr-reward', plan.target, `${m(sizing.rewardMoney)}${sizing.r != null ? ` · ${sizing.r.toFixed(1)}R` : ''}`, pal.gTx, long));
        if (lots) labels.push(inZone('rr-lots', plan.entry, lots, pal.tx, false, 800));
        if (sizing) labels.push(inZone('rr-risk', plan.stop, m(-sizing.riskMoney, false), pal.rTx, !long));
        tags.push({ id: 'rTP', prio: 3, v: plan.target, text: `TP ${px(plan.target, d)}`, kind: 'up' });
        tags.push({ id: 'rSL', prio: 3, v: plan.stop, text: `SL ${px(plan.stop, d)}`, kind: 'down' });
        tags.push({ id: 'rE', prio: 3, v: plan.entry, text: `E ${px(plan.entry, d)}`, kind: 'muted' });
      }
      return { overlays, labels, tags, obstacles, extent };
    };
  }, [timeBased, active.tf, moneyHidden, ccy, price, layers, liq.data, ai.data, ev.window, symTrades, openTrade, openPnl, coach, openStop, openTarget, tr.notes, symbol, planOk, problem, plan, panes.length, rightSpace, sizing, lotDecimals, unit, alertState, alertKey, onRulerDrag]);

  const layersOnPane = useRef<string | null>(null);
  useEffect(() => {
    if (layersOnPane.current && layersOnPane.current !== activeId) {
      const prev = chartRefs.current.get(layersOnPane.current);
      prev?.setLayers(null);
      prev?.setRightSpace(40);
    }
    const h = chartRefs.current.get(activeId);
    h?.setLayers(builder);
    h?.setVolume(layers.volume);
    h?.setRightSpace(rightSpace);
    layersOnPane.current = activeId;
  }, [builder, activeId, layers.volume, rightSpace, curBars.length]);

  // ── Price alerts (dialog) ──
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState<number | null>(null);
  const openAlert = async () => {
    setAlertPrice(price);
    setAlertOpen(true);
    if (price != null) return;
    try {
      const { candles } = await marketApi.candles({ symbol: active.symbol, tf: '1m', limit: 1 });
      setAlertPrice(candles.length ? candles[candles.length - 1]!.close : null);
    } catch { setAlertPrice(null); }
  };
  const createAlert = async (body: CreateAlertBody) => { await alertsApi.create(body); setAlertsReload(t => t + 1); };

  const registerRef = useCallback((id: string, handle: KlineChartHandle | null) => {
    if (handle) chartRefs.current.set(id, handle);
    else chartRefs.current.delete(id);
  }, []);

  // Deep link: /charts?symbol=ETHUSDT&tf=1h opens that symbol in the active pane.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const sym = qs.get('symbol');
    const tf = qs.get('tf');
    if (sym && sym.trim()) {
      const s = sym.trim().toUpperCase();
      const frame = tf && (MARKET_TIMEFRAMES as readonly string[]).includes(tf) ? (tf as MarketTimeframe) : undefined;
      setPanes(prev => prev.map((p, i) => (i === 0 ? { ...p, symbol: s, ...(frame ? { tf: frame } : {}) } : p)));
    }
  }, []);
  // Restore / persist the pane layout across visits.
  const restored = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      const saved = raw ? (JSON.parse(raw) as Pane[]) : null;
      if (saved?.length && !new URLSearchParams(window.location.search).get('symbol')) { setPanes(saved); setActiveId(saved[0]!.id); }
    } catch { /* ignore */ }
    restored.current = true;
  }, []);
  useEffect(() => { if (restored.current) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(panes)); } catch { /* ignore */ } } }, [panes]);

  const patchActive = (patch: Partial<Pane>) => setPanes(prev => prev.map(p => (p.id === activeId ? { ...p, ...patch } : p)));
  const setLayout = (n: number) => {
    setPanes(prev => {
      if (n === prev.length) return prev;
      if (n < prev.length) {
        const next = prev.slice(0, n);
        if (!next.some(p => p.id === activeId)) setActiveId(next[0]!.id);
        return next;
      }
      const next = [...prev];
      for (let i = prev.length; i < n; i++) next.push({ id: newId(), symbol: DEFAULT_SYMBOLS.find(s => !next.some(p => p.symbol === s)) ?? 'BTCUSDT', tf: '1h' });
      return next;
    });
  };
  const closePane = (id: string) => {
    setPanes(prev => {
      const next = prev.filter(p => p.id !== id);
      if (id === activeId && next.length) setActiveId(next[0]!.id);
      return next.length ? next : prev;
    });
  };

  // ── Snapshot + full screen ──
  const snapshot = () => {
    const url = activeChart()?.snapshot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = `${symbol}-${active.tf}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = async () => {
    const el = cardRef.current;
    if (!el) return;
    if (full) { setFull(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); return; }
    setFull(true);
    if (el.requestFullscreen) await el.requestFullscreen().catch(() => { /* CSS full-window fallback stays on */ });
  };
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [full]);

  const subtitle = now ? new Date(now).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).replace(',', ' ·').replace(/,/, '') : '';
  const layerIds: LayerId[] = ['trades', 'notes', 'news', 'ai', 'ruler', 'volume', ...(crypto ? (['liq'] as LayerId[]) : [])];
  const closedOnSymbol = symTrades.filter(t => t.status === 'CLOSED').length;
  const venue = openTrade ? (openTrade.source === 'mt5' ? 'MT5' : connections.find(c => c.id === openTrade.connectionId)?.label ?? 'Exchange') : null;
  const aiChip = layers.ai && timeBased ? (
    ai.status === 'running' ? <span className="tl-float-chip" role="status">Trader Master is reading {symbol}…</span>
      : ai.status === 'error' ? <span className="tl-float-chip neg" role="status">AI levels: {ai.error}</span>
        : ai.status === 'ready' && !ai.data ? <button type="button" className="tl-float-chip" onClick={() => void ai.run()} data-testid="ai-run">No AI levels for {symbol} today · Get them</button>
          : null
  ) : null;
  const liqChip = layers.liq && crypto ? (
    liq.status === 'error' ? <span className="tl-float-chip neg" role="status">Liquidation estimate unavailable</span>
      : liq.status === 'loading' && !liq.data ? <span className="tl-float-chip" role="status">Loading liquidation estimate…</span> : null
  ) : null;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Charts" pageSubtitle={subtitle}
      actions={<div className="tl-search"><SymbolSearch value={symbol} onSelect={s => patchActive({ symbol: s })} /></div>}>
      <div className="tl-page" data-testid="charts-page">
        <MtfStrip symbol={symbol} active={active.tf} onPick={tf => patchActive({ tf })} />

        <div className="tl-cw">
          <section ref={cardRef} className={`tl-card tl-chart ${full ? 'is-full' : ''}`} aria-label={`${symbol} chart`}>
            <header className="tl-wh tl-chart-hd">
              <h2 data-testid="chart-symbol">{symbol}</h2>
              <WatchStar symbol={symbol} size="md" />
              {MARKET_SYMBOL_NAMES[symbol] && <span className="tl-st">· {MARKET_SYMBOL_NAMES[symbol]}</span>}
              {price != null && <span className="tl-n14" data-testid="chart-price">{fmtQuote(price)}</span>}
              {chg != null && <span className={`tl-chg ${chg < 0 ? 'neg' : 'pos'}`}>{fmtChg(chg)}</span>}
              <div ref={layersRowRef} className="tl-r tl-layers" role="group" aria-label="Chart layers">
                {layerIds.map(id => (
                  <button key={id} type="button" className={`tl-chip ${layers[id] ? 'on' : 'off'}`} aria-pressed={layers[id]} onClick={() => toggleLayer(id)} data-testid={`layer-${id}`} disabled={!timeBased && id !== 'volume'}>
                    {layers[id] ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />}{LAYER_LABEL[id]}
                  </button>
                ))}
                {timeBased && (
                  <button type="button" className={`tl-chip ${patternsOn ? 'on' : 'off'}`} aria-pressed={patternsOn} onClick={togglePatterns} data-testid="patterns-toggle">
                    {patternsOn ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />}Patterns
                  </button>
                )}
              </div>
            </header>
            <div ref={toolbarRef} className="tl-ctb" role="toolbar" aria-label="Chart tools">
              <TimeframeBar value={active.tf} onChange={tf => patchActive({ tf })} />
              <span className="tl-sep" aria-hidden />
              <ChartTypeMenu value={{ type: active.chartType ?? 'candles', size: active.size, reversal: active.reversal }} onChange={v => patchActive({ chartType: v.type, size: v.size, reversal: v.reversal })} />
              {timeBased && <IndicatorMenu onAdd={name => activeChart()?.createIndicator(name)} onClear={() => activeChart()?.removeIndicators()} />}
              <button type="button" className="tl-ib" aria-label="Replay your trades" title="Replay your trades" onClick={() => document.getElementById('tl-replay')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><ClockCounterClockwise size={16} aria-hidden /><span className="tl-ibl">Replay</span></button>
              <button type="button" className="tl-ib" onClick={openAlert} data-testid="add-alert" aria-label={`New price alert for ${symbol}`}><Bell size={16} aria-hidden /><span className="tl-ibl">Alert</span></button>
              {timeBased && <button type="button" className={`tl-ib ${layers.ruler ? 'on' : ''}`} aria-pressed={layers.ruler} onClick={() => toggleLayer('ruler')} aria-label="Risk ruler" title="Risk ruler"><Ruler size={16} aria-hidden /><span className="tl-ibl">Risk ruler</span></button>}
              <span className="tl-sp" />
              <details className="tl-lay" ref={layRef}>
                <summary className="tl-ib tl-ico" title="Layout" aria-label={`Layout: ${panes.length} chart${panes.length === 1 ? '' : 's'}`} data-testid="layout-menu"><SquaresFour size={16} /></summary>
                <div className="tl-lay-pop" role="group" aria-label="Layout">
                  {LAYOUTS.map(l => <button key={l.n} type="button" aria-pressed={panes.length === l.n} onClick={() => { setLayout(l.n); if (layRef.current) layRef.current.open = false; }} data-testid={`layout-${l.n}`}>{l.icon}{l.label}</button>)}
                </div>
              </details>
              {timeBased && <button type="button" className="tl-ib tl-ico" onClick={snapshot} title="Save a picture of the chart" aria-label="Save a picture of the chart"><Camera size={16} /></button>}
              <button type="button" className="tl-ib tl-ico" onClick={() => void toggleFull()} title={full ? 'Exit full screen' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'} data-testid="fullscreen">{full ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}</button>
            </div>
            {(aiChip || liqChip) && <div className="tl-floats">{aiChip}{liqChip}</div>}
            {!timeBased && <p className="tl-ct-note">Renko, Kagi and P&amp;F ignore time, so indicators, drawings and your-trades layers are off.</p>}
            <div className={`tl-cbx ${timeBased ? '' : 'no-rail'}`}>
              {timeBased && (
                <DrawingRail ruler={layers.ruler} onRuler={() => toggleLayer('ruler')}
                  onDraw={n => activeChart()?.createOverlay(n)} onClear={() => activeChart()?.removeOverlays()}
                  onMagnet={on => activeChart()?.setMagnet(on)} onLock={on => activeChart()?.setDrawingsLocked(on)} onHide={h => activeChart()?.setDrawingsVisible(!h)} />
              )}
              <div ref={bodyRef} className={`tl-cbody n${panes.length}`}>
                <LayoutGrid panes={panes} activeId={activeId} onActivate={setActiveId} onClose={closePane} registerRef={registerRef}
                  onBars={onBars} onLive={onLive} onQuote={onQuote} pro />
                {timeBased && barsLoaded && !curBars.length && <div className="tl-chart-empty" role="status" data-testid="chart-empty">No {active.tf} candles for {symbol} right now. Try another timeframe.</div>}
              </div>
            </div>
          </section>

          <div className="tl-col">
            <OpenTradeCard symbol={symbol} trade={openTrade} loading={tradesLoading} error={tr.error} venue={venue}
              price={price} pnl={openPnl} ccy={openTrade?.source === 'exchange' ? 'USD' : acctCcy} stop={openStop}
              stopSource={openTrade && openStop == null && openTrade.source === 'exchange' ? 'No stop order on the exchange for this position.' : null}
              worstMove={excursion?.worstMove ?? null} decimals={dec} pointValue={openTrade ? tradePv(openTrade) : null} coach={coach} note={openNote} closedCount={closedOnSymbol} />
            {timeBased && (
              <RiskRuler symbol={symbol} side={plan.side} onSide={setSide} entry={planOk ? plan.entry : null} stop={planOk ? plan.stop : null} target={planOk ? plan.target : null}
                onLevels={v => setPlan(p => ({ ...p, ...v }))} risk={risk} onRisk={setRisk} balance={balance} sizing={rulerProblem ? null : sizing} problem={rulerProblem}
                unit={unit} lotDecimals={lotDecimals} basis={basis} dayRisk={dayRisk} nextEvent={nextEvent}
                alert={alertState.key === alertKey ? alertState : { state: 'idle' }} onAlert={() => void alertAtEntry()}
                save={saveState.key === planKey ? saveState : { state: 'idle' }} onSave={() => void savePlan()} onCopy={copyLevels} decimals={dec} />
            )}
          </div>
        </div>

        <div className="tl-g">
          <div id="tl-replay" className="tl-s2">
            <ReplayPanel symbol={symbol} trades={symTrades} decimals={dec} ccy={openTrade?.source === 'exchange' || usesExchange ? 'USD' : acctCcy} pointValue={symTrades.some(t => t.source === 'mt5') ? mt5Pv : 1} loading={tradesLoading} error={tr.status === 'error' ? tr.error : null} />
          </div>
          <EventDays kind={review?.kind ?? null} stats={dayStats} scope={reviewScope === symTrades ? `${symbol} trades` : 'trades, all symbols'} ccy={acctCcy}
            loading={ev.status === 'loading' || tradesLoading} unitKnown={false}
            error={ev.status === 'error' ? 'The calendar didn’t load, so event days can’t be matched right now.' : tr.status === 'error' ? `Your trades didn’t load: ${tr.error}` : null} />
        </div>

        <div className="tl-more">
          {patternsOn && timeBased && (
            <PatternsPanel symbol={symbol} tf={active.tf} selected={selectedPattern} onSelect={setSelectedPattern}
              state={pat.key === patKey ? pat : { data: null, error: null, loading: true }}
              unsupported={patternTfOk ? undefined : `Patterns work on ${PATTERN_TFS.join(', ')} charts.`} />
          )}
          <Watchlist activeSymbol={symbol} onPick={s => patchActive({ symbol: s })} />
          <AlertsPanel activeSymbol={symbol} reloadToken={alertsReload} onNew={openAlert} />
          <StatsPanel symbol={symbol} />
        </div>
      </div>

      {alertOpen && <AlertDialog symbol={symbol} currentPrice={alertPrice} onCreate={createAlert} onClose={() => setAlertOpen(false)} />}
    </AppShell>
  );
}
