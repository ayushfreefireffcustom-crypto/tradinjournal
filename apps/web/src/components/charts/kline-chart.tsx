'use client';

// klinecharts v10 wrapper. v10 is data-loader based: we register a DataLoader
// whose getBars() pulls history from our /market/candles API and whose
// subscribeBar() streams the live forming bar over SSE — so the library merges
// history + live for us. klinecharts touches `window` at import, so it's loaded
// dynamically inside useEffect (SSR-safe). The parent drives indicators/drawings
// through the imperative handle.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Chart, KLineData, DataLoader, Period, Styles, DeepPartial } from 'klinecharts';
import { marketApi, streamCandles, type Candle, type MarketTimeframe } from '@/lib/market-api';

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

// Obsidian dark theme (partial Styles — every field is optional).
const OBSIDIAN_STYLES: DeepPartial<Styles> = {
  grid: { horizontal: { color: '#181818' }, vertical: { color: '#181818' } },
  candle: {
    bar: {
      upColor: '#08C465', downColor: '#FE3A31',
      upBorderColor: '#08C465', downBorderColor: '#FE3A31',
      upWickColor: '#08C465', downWickColor: '#FE3A31',
    },
  },
  xAxis: { tickText: { color: '#71717A' } },
  yAxis: { tickText: { color: '#71717A' } },
};

const KlineChart = forwardRef<KlineChartHandle, Props>(function KlineChart({ symbol, tf, accountId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const accountIdRef = useRef<string | undefined>(accountId);
  const precisionForRef = useRef<string | null>(null);
  const liveUnsubRef = useRef<(() => void) | null>(null);

  accountIdRef.current = accountId;

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
      chart.setStyles(OBSIDIAN_STYLES);

      const dataLoader: DataLoader = {
        getBars: async ({ type, timestamp, symbol: sym, period, callback }) => {
          const barTf = periodToTf(period);
          const params: Parameters<typeof marketApi.candles>[0] = {
            symbol: sym.ticker, tf: barTf, limit: 500, accountId: accountIdRef.current,
          };
          if (type === 'backward' && timestamp) params.to = Math.floor(timestamp / 1000) - 1;
          try {
            const { candles } = await marketApi.candles(params);
            // One-time precision fit for this ticker (avoids trailing-zero prices).
            const last = candles[candles.length - 1];
            if (type === 'init' && last && precisionForRef.current !== sym.ticker) {
              precisionForRef.current = sym.ticker;
              chart.setSymbol({ ticker: sym.ticker, pricePrecision: derivePrecision(last.close), volumePrecision: 2 });
            }
            callback(candles.map(toKLine), candles.length > 0);
          } catch {
            callback([], false);
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
      chart.setDataLoader(dataLoader);
      chart.setSymbol({ ticker: symbol });
      chart.setPeriod(tfPeriod(tf));
    })();

    return () => {
      disposed = true;
      liveUnsubRef.current?.();
      chartRef.current = null;
      if (localChart && containerRef.current) {
        void import('klinecharts').then(({ dispose }) => {
          if (containerRef.current) dispose(containerRef.current);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Symbol / timeframe changes → re-point the chart (triggers a fresh load).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    precisionForRef.current = null; // re-fit precision for the new symbol
    chart.setSymbol({ ticker: symbol });
    chart.setPeriod(tfPeriod(tf));
  }, [symbol, tf, accountId]);

  return <div ref={containerRef} className="w-full h-full" data-testid="kline-chart" />;
});

export default KlineChart;
