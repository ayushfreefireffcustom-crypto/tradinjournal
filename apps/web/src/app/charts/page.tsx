'use client';

// Advanced charting platform — real candles (crypto via Binance, stocks/forex
// via Twelve Data) rendered with klinecharts, with indicators, drawing tools,
// live updates, symbol search, a persisted watchlist, and 1 / 2×1 / 2×2 layouts.
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import { marketApi, type MarketTimeframe } from '@/lib/market-api';
import { alertsApi, type CreateAlertBody } from '@/lib/alerts-api';
import LayoutGrid, { type Pane } from '@/components/charts/layout-grid';
import type { KlineChartHandle } from '@/components/charts/kline-chart';
import SymbolSearch from '@/components/charts/symbol-search';
import TimeframeBar from '@/components/charts/timeframe-bar';
import IndicatorMenu from '@/components/charts/indicator-menu';
import DrawingToolbar from '@/components/charts/drawing-toolbar';
import Watchlist from '@/components/charts/watchlist';
import AlertsPanel from '@/components/charts/alerts-panel';
import AlertDialog from '@/components/charts/alert-dialog';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XAUUSD', 'EURUSD'];
const LAYOUT_KEY = 'tradelogs.charts.layout';
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Math.random()}`);

const LAYOUTS: { n: number; label: string; icon: React.ReactNode }[] = [
  { n: 1, label: 'Single chart', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /></svg> },
  { n: 2, label: 'Two charts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 4v16" /></svg> },
  { n: 4, label: 'Four charts', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 4v16M4 12h16" /></svg> },
];

export default function ChartsPage() {
  const { accounts, selected, select } = useAccounts();
  const [panes, setPanes] = useState<Pane[]>(() => DEFAULT_SYMBOLS.map((symbol, i) => ({ id: `p${i}`, symbol, tf: '1h' as MarketTimeframe })));
  const [activeId, setActiveId] = useState<string>(() => panes[0]!.id);
  const chartRefs = useRef<Map<string, KlineChartHandle>>(new Map());

  const active = panes.find(p => p.id === activeId) ?? panes[0]!;
  const activeChart = () => chartRefs.current.get(activeId);

  // Price alerts.
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState<number | null>(null);
  const [alertsReload, setAlertsReload] = useState(0);

  const openAlert = async () => {
    setAlertPrice(null);
    setAlertOpen(true);
    // Prefill the threshold with the active symbol's current price. /charts only
    // charts public symbols (crypto/stocks/forex) — no accountId (that would
    // route a crypto ticker to the broker).
    try {
      const { candles } = await marketApi.candles({ symbol: active.symbol, tf: '1m', limit: 1 });
      setAlertPrice(candles.length ? candles[candles.length - 1]!.close : null);
    } catch {
      setAlertPrice(null);
    }
  };
  const createAlert = async (body: CreateAlertBody) => {
    await alertsApi.create(body);
    setAlertsReload(t => t + 1);
  };

  const registerRef = useCallback((id: string, handle: KlineChartHandle | null) => {
    if (handle) chartRefs.current.set(id, handle);
    else chartRefs.current.delete(id);
  }, []);

  // Deep-link support: /charts?symbol=ETHUSDT (e.g. from a price-alert notification)
  // opens that symbol in the active pane. Read after mount to avoid an SSR/hydration
  // mismatch from reading window during render.
  useEffect(() => {
    const sym = new URLSearchParams(window.location.search).get('symbol');
    if (sym && sym.trim()) {
      const symbol = sym.trim().toUpperCase();
      setPanes(prev => prev.map((p, i) => (i === 0 ? { ...p, symbol } : p)));
    }
  }, []);

  // Restore / persist the pane layout (symbols + timeframes) across visits.
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

  const patchActive = (patch: Partial<Pane>) =>
    setPanes(prev => prev.map(p => (p.id === activeId ? { ...p, ...patch } : p)));

  const setLayout = (n: number) => {
    setPanes(prev => {
      if (n === prev.length) return prev;
      if (n < prev.length) {
        const next = prev.slice(0, n);
        if (!next.some(p => p.id === activeId)) setActiveId(next[0]!.id);
        return next;
      }
      const next = [...prev];
      for (let i = prev.length; i < n; i++) {
        next.push({ id: newId(), symbol: DEFAULT_SYMBOLS[i] ?? 'BTCUSDT', tf: '1h' });
      }
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

  const layoutSeg = (
    <>
      <div className="v3-seg ch-layout" role="group" aria-label="Layout">
        {LAYOUTS.map(l => <button key={l.n} aria-pressed={panes.length === l.n} onClick={() => setLayout(l.n)} title={l.label} aria-label={l.label} data-testid={`layout-${l.n}`}>{l.icon}</button>)}
      </div>
      <button onClick={openAlert} data-testid="add-alert" className="v3-btn v3-btn--o ch-alert" aria-label={`New price alert for ${active.symbol}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></svg><span>Alert</span>
      </button>
    </>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} pageTitle="Charts" actions={layoutSeg}>
      <div className="v3-page ch-page" data-testid="charts-page">
        <div className="ch-main">
          <div className="v3-card ch-bar">
            <SymbolSearch value={active.symbol} onSelect={symbol => patchActive({ symbol })} />
            <TimeframeBar value={active.tf} onChange={tf => patchActive({ tf })} />
            <IndicatorMenu onAdd={name => activeChart()?.createIndicator(name)} onClear={() => activeChart()?.removeIndicators()} />
            <DrawingToolbar onDraw={name => activeChart()?.createOverlay(name)} onClear={() => activeChart()?.removeOverlays()} />
          </div>
          <LayoutGrid panes={panes} activeId={activeId} onActivate={setActiveId} onClose={closePane} registerRef={registerRef} />
        </div>
        <div className="ch-rail">
          <Watchlist activeSymbol={active.symbol} onPick={symbol => patchActive({ symbol })} />
          <AlertsPanel activeSymbol={active.symbol} reloadToken={alertsReload} onNew={openAlert} />
        </div>
      </div>

      {alertOpen && (
        <AlertDialog symbol={active.symbol} currentPrice={alertPrice} onCreate={createAlert} onClose={() => setAlertOpen(false)} />
      )}
    </AppShell>
  );
}
