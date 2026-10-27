'use client';

// klinecharts v10 wrapper. v10 is data-loader based: we register a DataLoader
// whose getBars() pulls history from our /market/candles API and whose
// subscribeBar() streams the live forming bar over SSE — so the library merges
// history + live for us. klinecharts touches `window` at import, so it's loaded
// dynamically inside useEffect (SSR-safe). The parent drives indicators/drawings
// through the imperative handle.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Chart, KLineData, DataLoader, Period, Styles, DeepPartial } from 'klinecharts';
import { marketApi, streamCandles, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { Loader } from '@/components/loader';

export interface KlineChartHandle {
  createIndicator: (name: string) => void;
  createOverlay: (name: string) => void;
  removeIndicators: () => void;
  removeOverlays: () => void;
}

interface Props {
  symbol: string;
  tf: MarketTimeframe;
  accountId?: string;
  /** Latest close + reference close ~24h earlier, after each history load. */
  onQuote?: (q: { last: number; ref: number | null }) => void;
}

const TF_PERIOD: Record<MarketTimeframe, Period> = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '30m': { type: 'minute', span: 30 },
  '1h': { type: 'hour', span: 1 },
  '4h': { type: 'hour', span: 4 },
  '1d': { type: 'day', span: 1 },
  '1w': { type: 'week', span: 1 },
  '1M': { type: 'month', span: 1 },
};

const PERIOD_TF: Record<string, MarketTimeframe> = {
  'minute:1': '1m', 'minute:5': '5m', 'minute:15': '15m', 'minute:30': '30m',
  'hour:1': '1h', 'hour:4': '4h', 'day:1': '1d', 'week:1': '1w', 'month:1': '1M',
};
function periodToTf(p: Period): MarketTimeframe {
  return PERIOD_TF[`${p.type}:${p.span}`] ?? '1h';
}
function tfPeriod(tf: MarketTimeframe): Period {
  return TF_PERIOD[tf] ?? { type: 'hour', span: 1 };
}

function toKLine(c: Candle): KLineData {
  return { timestamp: c.openTime, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

/** Reasonable price decimals from magnitude (gold→2, FX→5, small alts→6). */
function derivePrecision(price: number): number {
  const a = Math.abs(price);
  if (a >= 100) return 2;
  if (a >= 1) return 5;
  if (a >= 0.01) return 6;
  return 8;
}

// v5 black + signal-green theme (partial Styles — every field is optional).
// Canvas-drawn, so colours are literal here rather than CSS variables.
const V3_STYLES: DeepPartial<Styles> = {
  grid: { horizontal: { color: '#161616', style: 'solid' }, vertical: { show: false } },
  candle: {
    bar: {
      upColor: '#08C465', downColor: '#FE3A31',
      upBorderColor: '#08C465', downBorderColor: '#FE3A31',
      upWickColor: '#08C465', downWickColor: '#FE3A31',
    },
    priceMark: {
      high: { color: '#6E6E76' }, low: { color: '#6E6E76' },
      last: { upColor: '#08C465', downColor: '#FE3A31', line: { style: 'dashed', dashedValue: [4, 4] } },
    },
    // OHLC legend only while the crosshair is active — the pane header shows price.
    tooltip: { showRule: 'follow_cross', showType: 'standard', title: { show: false }, legend: { color: '#A1A1AA' } },
  },
  indicator: { tooltip: { showRule: 'follow_cross', legend: { color: '#A1A1AA' } } },
  xAxis: { axisLine: { color: '#1E1E1E' }, tickLine: { color: '#1E1E1E' }, tickText: { color: '#6E6E76', size: 11 } },
  yAxis: { axisLine: { color: '#1E1E1E' }, tickLine: { color: '#1E1E1E' }, tickText: { color: '#6E6E76', size: 11 } },
  separator: { color: '#1E1E1E' },
  crosshair: {
    horizontal: { line: { color: '#3A3A3A' }, text: { backgroundColor: '#F4F4F5', borderColor: '#F4F4F5', color: '#030303' } },
    vertical: { line: { color: '#3A3A3A' }, text: { backgroundColor: '#F4F4F5', borderColor: '#F4F4F5', color: '#030303' } },
  },
};

const BAR_LIMIT = 500;

const KlineChart = forwardRef<KlineChartHandle, Props>(function KlineChart({ symbol, tf, accountId, onQuote }, ref) {
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const accountIdRef = useRef<string | undefined>(accountId);
  const symbolRef = useRef(symbol);
  const tfRef = useRef(tf);
  const precisionForRef = useRef<string | null>(null);
  const liveUnsubRef = useRef<(() => void) | null>(null);
  const resizeObsRef = useRef<ResizeObserver | null>(null);
  const [ready, setReady] = useState(false);

  accountIdRef.current = accountId;
  symbolRef.current = symbol;
  tfRef.current = tf;

  useImperativeHandle(ref, () => ({
    createIndicator: name => { chartRef.current?.createIndicator(name); },
    createOverlay: name => { chartRef.current?.createOverlay(name); },
    removeIndicators: () => { chartRef.current?.removeIndicator(); },
    removeOverlays: () => { chartRef.current?.removeOverlay(); },
  }), []);

  // Mount: create the chart + wire the data loader once.
  useEffect(() => {
    let disposed = false;
    let localChart: Chart | null = null;

    void (async () => {
      const { init } = await import('klinecharts');
      if (disposed || !containerRef.current) return;
      const chart = init(containerRef.current);
      if (!chart) return;
      localChart = chart;
      chartRef.current = chart;
      chart.setStyles(V3_STYLES);
      chart.setOffsetRightDistance(24);
      chart.setBarSpace(8);

      const dataLoader: DataLoader = {
        getBars: async ({ type, timestamp, symbol: sym, period, callback }) => {
          const barTf = periodToTf(period);
          const params: Parameters<typeof marketApi.candles>[0] = {
            symbol: sym.ticker, tf: barTf, limit: BAR_LIMIT, accountId: accountIdRef.current,
          };
          // v10: forward = older bars (left edge), backward = newer bars (right edge).
          if (type === 'forward' && timestamp) params.to = Math.floor(timestamp / 1000) - 1;
          else if (type === 'backward' && timestamp) params.from = Math.floor(timestamp / 1000) + 1;
          try {
            const { candles } = await marketApi.candles(params);
            // One-time precision fit for this ticker (avoids trailing-zero prices).
            const last = candles[candles.length - 1];
            if (type === 'init' && last && precisionForRef.current !== sym.ticker) {
              precisionForRef.current = sym.ticker;
              chart.setSymbol({ ticker: sym.ticker, pricePrecision: derivePrecision(last.close), volumePrecision: 2 });
            }
            const hasMore = candles.length >= BAR_LIMIT;
            const more =
              type === 'forward'
                ? { forward: hasMore, backward: false }
                : type === 'backward'
                  ? { forward: false, backward: hasMore }
                  : { forward: hasMore, backward: false };
            callback(candles.map(toKLine), more);
            if (type === 'init') {
              setReady(true);
              if (last) {
                const dayAgo = last.openTime - 86_400_000;
                const refBar = [...candles].reverse().find(c => c.openTime <= dayAgo) ?? (candles.length > 1 ? candles[candles.length - 2] : undefined);
                onQuoteRef.current?.({ last: last.close, ref: refBar ? refBar.close : null });
              }
            }
          } catch {
            callback([], false);
            if (type === 'init') setReady(true);
          }
        },
        subscribeBar: ({ symbol: sym, period, callback }) => {
          const barTf = periodToTf(period);
          liveUnsubRef.current = streamCandles(sym.ticker, barTf, bar => callback(toKLine(bar)), {
            accountId: accountIdRef.current,
          });
        },
        unsubscribeBar: () => {
          liveUnsubRef.current?.();
          liveUnsubRef.current = null;
        },
      };
      chart.setSymbol({ ticker: symbolRef.current });
      chart.setPeriod(tfPeriod(tfRef.current));
      chart.setDataLoader(dataLoader);
      chart.resize();

      const el = containerRef.current;
      if (el && typeof ResizeObserver !== 'undefined') {
        resizeObsRef.current = new ResizeObserver(() => chart.resize());
        resizeObsRef.current.observe(el);
      }
    })();

    const mountEl = containerRef.current;
    return () => {
      disposed = true;
      liveUnsubRef.current?.();
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      chartRef.current = null;
      if (localChart && mountEl) {
        void import('klinecharts').then(({ dispose }) => dispose(mountEl));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Symbol / timeframe changes → re-point the chart (triggers a fresh load).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    setReady(false);
    precisionForRef.current = null; // re-fit precision for the new symbol
    chart.setSymbol({ ticker: symbol });
    chart.setPeriod(tfPeriod(tf));
    chart.resize();
  }, [symbol, tf, accountId]);

  return (
    <div className="relative w-full h-full" data-testid="kline-chart-wrap">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 pointer-events-none">
          <Loader size={24} label="Loading chart" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" data-testid="kline-chart" />
    </div>
  );
});

export default KlineChart;
