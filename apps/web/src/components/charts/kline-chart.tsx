'use client';

// klinecharts v10 wrapper. v10 is data-loader based: we register a DataLoader
// whose getBars() pulls history from our /market/candles API and whose
// subscribeBar() streams the live forming bar over SSE — so the library merges
// history + live for us. klinecharts touches `window` at import, so it's loaded
// dynamically inside useEffect (SSR-safe). The parent drives indicators/drawings
// through the imperative handle.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Chart, KLineData, DataLoader, Period } from 'klinecharts';
import { marketApi, streamCandles, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { chartDate, chartStyles, chartXTicks, onThemeChange } from '@/components/v6/markets/chart-theme';
import { heikinAshi, heikinBar } from '@/lib/chart-types';
import type { ChartPattern } from '@/lib/patterns-api';

export interface KlineChartHandle {
  createIndicator: (name: string) => void;
  createOverlay: (name: string) => void;
  removeIndicators: () => void;
  removeOverlays: () => void;
  /** Draw detected patterns (E8); redrawn after every reload. `selected` is drawn heavier. */
  setPatterns: (patterns: ChartPattern[], selected?: string | null) => void;
}

interface Props {
  symbol: string;
  tf: MarketTimeframe;
  accountId?: string;
  /** Latest close + reference close ~24h earlier, after each history load. */
  onQuote?: (q: { last: number; ref: number | null }) => void;
  /** Draw Heikin-Ashi bars instead of candles. */
  heikin?: boolean;
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

const BAR_LIMIT = 500;
// Each Heikin-Ashi bar depends on every bar before it, so that mode loads one
// long window and doesn't page further back (a seam would show at each page).
const HEIKIN_LIMIT = 1000;

const KlineChart = forwardRef<KlineChartHandle, Props>(function KlineChart({ symbol, tf, accountId, onQuote, heikin = false }, ref) {
  const heikinRef = useRef(heikin);
  heikinRef.current = heikin;
  // Heikin-Ashi live updates: the raw bars and their Heikin-Ashi bars so far.
  const haRef = useRef<{ raw: Candle[]; ha: Candle[] }>({ raw: [], ha: [] });
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

  // Patterns to draw; kept so they come back after the chart reloads its bars.
  const patternsRef = useRef<{ list: ChartPattern[]; selected: string | null }>({ list: [], selected: null });
  const drawPatterns = () => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    chart.removeOverlay({ groupId: 'patterns' });
    const cs = getComputedStyle(el);
    const col = (v: string, f: string) => cs.getPropertyValue(v).trim() || f;
    const g = col('--g', '#08C465');
    const r = col('--r', '#FE3A31');
    const mut = col('--mut', '#9A9A9A');
    const { list, selected } = patternsRef.current;
    for (const p of list) {
      const on = p.id === selected;
      const tone = p.family === 'level' ? (p.kind === 'support' ? g : r) : p.bias === 'bullish' ? g : p.bias === 'bearish' ? r : mut;
      for (const l of p.lines) {
        chart.createOverlay({
          name: 'segment', groupId: 'patterns', lock: true,
          points: [{ timestamp: l.a.time, value: l.a.price }, { timestamp: l.b.time, value: l.b.price }],
          styles: { line: { color: tone, size: on ? 2.2 : 1.3, style: l.role === 'pole' || p.family === 'level' ? 'dashed' : 'solid', dashedValue: [4, 4] }, point: { radius: 0, activeRadius: 0, borderSize: 0, activeBorderSize: 0, color: 'transparent', activeColor: 'transparent', borderColor: 'transparent', activeBorderColor: 'transparent' } },
          zLevel: on ? 2 : 1,
        });
      }
      // The measured-move target, drawn short and dashed at the end of the selected pattern.
      if (on && p.target != null) {
        const span = Math.max(p.endTime - p.startTime, 1);
        chart.createOverlay({
          name: 'segment', groupId: 'patterns', lock: true,
          points: [{ timestamp: p.endTime - span * 0.25, value: p.target }, { timestamp: p.endTime, value: p.target }],
          styles: { line: { color: tone, size: 1.4, style: 'dashed', dashedValue: [2, 3] }, point: { radius: 0, activeRadius: 0, borderSize: 0, activeBorderSize: 0, color: 'transparent', activeColor: 'transparent', borderColor: 'transparent', activeBorderColor: 'transparent' } },
        });
      }
    }
  };

  useImperativeHandle(ref, () => ({
    createIndicator: name => { chartRef.current?.createIndicator(name); },
    createOverlay: name => { chartRef.current?.createOverlay(name); },
    removeIndicators: () => { chartRef.current?.removeIndicator(); },
    // Clearing drawings leaves the detected patterns in place.
    removeOverlays: () => { chartRef.current?.removeOverlay(); drawPatterns(); },
    setPatterns: (list, selected = null) => {
      const changed = selected !== patternsRef.current.selected;
      patternsRef.current = { list, selected };
      drawPatterns();
      // Bring a newly selected pattern into view: zoom out until its start fits.
      const chart = chartRef.current;
      const p = list.find(x => x.id === selected);
      if (!changed || !chart || !p || !containerRef.current) return;
      const data = chart.getDataList();
      const start = data.findIndex(d => d.timestamp >= p.startTime);
      if (start < 0 || start >= chart.getVisibleRange().from) return;
      const bars = data.length - start + 12;
      chart.setBarSpace(Math.max(2, (containerRef.current.clientWidth - 90) / bars));
      chart.scrollToRealTime();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // Mount: create the chart + wire the data loader once.
  useEffect(() => {
    let disposed = false;
    let localChart: Chart | null = null;
    let stopTheme = () => {};

    void (async () => {
      const { init } = await import('klinecharts');
      if (disposed || !containerRef.current) return;
      const chart = init(containerRef.current);
      if (!chart) return;
      localChart = chart;
      chartRef.current = chart;
      // Colours come from the v6 tokens and follow the light/dark toggle.
      chart.setStyles(chartStyles(containerRef.current));
      stopTheme = onThemeChange(() => { if (containerRef.current) chart.setStyles(chartStyles(containerRef.current)); });
      chart.setOffsetRightDistance(24);
      chart.setBarSpace(8);
      chart.setFormatter({ formatDate: chartDate });
      chart.overrideXAxis({ createTicks: chartXTicks(chart) });

      const dataLoader: DataLoader = {
        getBars: async ({ type, timestamp, symbol: sym, period, callback }) => {
          const barTf = periodToTf(period);
          const ha = heikinRef.current;
          if (ha && type !== 'init') { callback([], false); return; }
          const params: Parameters<typeof marketApi.candles>[0] = {
            symbol: sym.ticker, tf: barTf, limit: ha ? HEIKIN_LIMIT : BAR_LIMIT, accountId: accountIdRef.current,
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
            const hasMore = !ha && candles.length >= BAR_LIMIT;
            const more =
              type === 'forward'
                ? { forward: hasMore, backward: false }
                : type === 'backward'
                  ? { forward: false, backward: hasMore }
                  : { forward: hasMore, backward: false };
            if (ha) {
              const bars = heikinAshi(candles);
              haRef.current = { raw: candles.slice(-2), ha: bars.slice(-2) };
              callback(bars.map(toKLine), more);
            } else callback(candles.map(toKLine), more);
            if (type === 'init') {
              setReady(true);
              setTimeout(drawPatterns, 0); // a reload clears overlays
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
          // A reload can subscribe again before unsubscribing; never leave the
          // old stream open (each one holds a connection to the API).
          liveUnsubRef.current?.();
          liveUnsubRef.current = null;
          if (disposed) return; // the pane closed while its first load was in flight
          liveUnsubRef.current = streamCandles(sym.ticker, barTf, bar => {
            if (!heikinRef.current) { callback(toKLine(bar)); return; }
            // Same bar updating, or a new bar: either way it builds on the
            // Heikin-Ashi bar before it, which is final once its bar closed.
            const st = haRef.current;
            const lastRaw = st.raw[st.raw.length - 1];
            if (lastRaw && bar.openTime === lastRaw.openTime) { st.raw[st.raw.length - 1] = bar; st.ha.pop(); }
            else { st.raw = [...st.raw.slice(-1), bar]; st.ha = st.ha.slice(-1); }
            const next = heikinBar(bar, st.ha[st.ha.length - 1] ?? null);
            st.ha.push(next);
            callback(toKLine(next));
          }, {
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
      stopTheme();
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

  // Switching between candles and Heikin-Ashi reloads the bars.
  const firstHeikin = useRef(true);
  useEffect(() => {
    if (firstHeikin.current) { firstHeikin.current = false; return; }
    const chart = chartRef.current;
    if (!chart) return;
    setReady(false);
    chart.resetData();
  }, [heikin]);

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
    <div className="mk-kc" data-testid="kline-chart-wrap">
      {!ready && (
        <div className="mk-kc-load" role="status" aria-live="polite">
          <svg width="22" height="22" viewBox="0 0 24 24" className="x-spin" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="2.5" /><circle cx="12" cy="12" r="9" fill="none" stroke="var(--g)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" /></svg>
          <span>Loading chart</span>
        </div>
      )}
      <div ref={containerRef} className="mk-kc-canvas" data-testid="kline-chart" />
    </div>
  );
});

export default KlineChart;
