'use client';

// Advanced charting platform — real candles (crypto via Binance, stocks/forex
// via Twelve Data) rendered with klinecharts, with indicators, drawing tools,
// live updates, symbol search, a persisted watchlist, and 1 / 2×1 / 2×2 layouts.
import { useCallback, useRef, useState } from 'react';
import { SquaresFour, Square, Columns, BellRinging } from '@phosphor-icons/react';
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

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p${Math.random()}`);

const LAYOUTS: { n: number; icon: typeof Square; label: string }[] = [
  { n: 1, icon: Square, label: 'Single' },
  { n: 2, icon: Columns, label: 'Two' },
  { n: 4, icon: SquaresFour, label: 'Grid' },
];

export default function ChartsPage() {
  const { accounts, selected, select } = useAccounts();
  const [panes, setPanes] = useState<Pane[]>([{ id: newId(), symbol: 'BTCUSDT', tf: '1h' }]);
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
    // Prefill the threshold with the active symbol's current price.
    try {
      const { candles } = await marketApi.candles({ symbol: active.symbol, tf: '1m', limit: 1, accountId: selected?.id });
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

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Charts"
      pageSubtitle="// LIVE MARKETS"
    >
      <div className="lg:h-[calc(100dvh-104px)] lg:flex lg:flex-col p-2 sm:p-3 lg:p-4 gap-2 sm:gap-3" data-testid="charts-page">
        {/* Toolbar */}
        <div className="tcard p-2 sm:p-2.5 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <SymbolSearch onSelect={symbol => patchActive({ symbol })} />
          <div className="h-5 w-px bg-border-soft hidden sm:block" />
          <TimeframeBar value={active.tf} onChange={tf => patchActive({ tf })} />
          <div className="h-5 w-px bg-border-soft hidden sm:block" />
          <IndicatorMenu onAdd={name => activeChart()?.createIndicator(name)} onClear={() => activeChart()?.removeIndicators()} />
          <DrawingToolbar onDraw={name => activeChart()?.createOverlay(name)} onClear={() => activeChart()?.removeOverlays()} />
          <button
            onClick={openAlert}
            data-testid="add-alert"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] tracking-wide uppercase text-fg-2 border border-border-soft hover:text-profit hover:border-profit/30 transition-colors"
          >
            <BellRinging size={13} weight="bold" /> Alert
          </button>
          <div className="ml-auto flex items-center gap-1">
            {LAYOUTS.map(l => {
              const I = l.icon;
              return (
                <button
                  key={l.n}
                  onClick={() => setLayout(l.n)}
                  title={l.label}
                  data-testid={`layout-${l.n}`}
                  className={`p-1.5 rounded border transition-colors ${
                    panes.length === l.n ? 'text-profit border-profit/30 bg-profit/10' : 'text-fg-3 border-border-soft hover:text-fg'
                  }`}
                >
                  <I size={15} weight="bold" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart grid + watchlist */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-2 sm:gap-3 lg:flex-1 lg:min-h-0">
          <div className="min-h-[420px] lg:min-h-0 order-2 lg:order-1">
            <LayoutGrid
              panes={panes}
              activeId={activeId}
              onActivate={setActiveId}
              onClose={closePane}
              registerRef={registerRef}
            />
          </div>
          <div className="order-1 lg:order-2 min-h-0 lg:max-h-none flex flex-col gap-2 sm:gap-3">
            <div className="max-h-[240px] lg:max-h-none lg:flex-1 min-h-0 flex flex-col">
              <Watchlist activeSymbol={active.symbol} onPick={symbol => patchActive({ symbol })} />
            </div>
            <div className="max-h-[240px] lg:max-h-none lg:flex-1 min-h-0 flex flex-col">
              <AlertsPanel activeSymbol={active.symbol} reloadToken={alertsReload} />
            </div>
          </div>
        </div>
      </div>

      {alertOpen && (
        <AlertDialog
          symbol={active.symbol}
          currentPrice={alertPrice}
          accountId={selected?.id}
          onCreate={createAlert}
          onClose={() => setAlertOpen(false)}
        />
      )}
    </AppShell>
  );
}
