'use client';

// klinecharts v10 wrapper. v10 is data-loader based: we register a DataLoader
// whose getBars() pulls history from our /market/candles API and whose
// subscribeBar() streams the live forming bar over SSE — so the library merges
// history + live for us. klinecharts touches `window` at import, so it's loaded
// dynamically inside useEffect (SSR-safe). The parent drives indicators/drawings
// through the imperative handle.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Chart, KLineData, DataLoader, Period, OverlayCreate } from 'klinecharts';
import { marketApi, streamCandles, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { chartDate, chartStyles, chartXTicks, onThemeChange } from '@/components/v6/markets/chart-theme';
import { heikinAshi, heikinBar } from '@/lib/chart-types';
import type { ChartPattern } from '@/lib/patterns-api';
import { LANE, readPal, registerTlOverlays, SINKS, type LabelSpec, type LabelsExt, type Pal, type TagSpec } from './chart-overlays';
import { hitTest } from './label-layout';

/** Builds the "your trades" overlays (group `tl`) from the chart's bars and colours. */
export interface Layers {
  overlays: OverlayCreate[];
  /** All text, laid out together on top (collision-free, by priority). */
  labels: LabelSpec[];
  tags: TagSpec[];
  obstacles: LabelsExt['obstacles'];
  /** Prices the price axis must show (stops, targets, ruler, nearest levels). */
  extent: number[];
}
export type LayerBuilder = (ctx: { pal: Pal; bars: KLineData[]; width: number; barSpace: number }) => Layers;

export interface KlineChartHandle {
  createIndicator: (name: string) => void;
  createOverlay: (name: string) => void;
  removeIndicators: () => void;
  removeOverlays: () => void;
  /** Draw detected patterns (E8); redrawn after every reload. `selected` is drawn heavier. */
  setPatterns: (patterns: ChartPattern[], selected?: string | null) => void;
  /** Your-trades layers; rebuilt after reloads, theme flips and new bars. Null clears them. */
  setLayers: (build: LayerBuilder | null) => void;
  setVolume: (on: boolean) => void;
  /** Empty space right of the last bar, in px (room for the risk ruler and upcoming events). */
  setRightSpace: (px: number) => void;
  setMagnet: (on: boolean) => void;
  setDrawingsLocked: (on: boolean) => void;
  setDrawingsVisible: (on: boolean) => void;
  /** PNG data URL of the chart with its overlays, or null. */
  snapshot: () => string | null;
  getBars: () => KLineData[];
}

interface Props {
  symbol: string;
  tf: MarketTimeframe;
  accountId?: string;
  /** Latest close + reference close ~24h earlier, after each history load. */
  onQuote?: (q: { last: number; ref: number | null }) => void;
  /** Draw Heikin-Ashi bars instead of candles. */
  heikin?: boolean;
  /** Every time the loaded history changes (first load, older pages). */
  onBars?: (bars: Candle[]) => void;
  /** Each live bar update from the stream. */
  onLive?: (bar: Candle) => void;
  /** OHLC legend always on, bar-close countdown on the price axis, room for the event lane. */
  pro?: boolean;
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

const TF_MS: Partial<Record<MarketTimeframe, number>> = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3, '1w': 604800e3 };
const toCandle = (k: KLineData): Candle => ({ openTime: k.timestamp, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume ?? 0 });

const KlineChart = forwardRef<KlineChartHandle, Props>(function KlineChart({ symbol, tf, accountId, onQuote, heikin = false, onBars, onLive, pro = false }, ref) {
  const onBarsRef = useRef(onBars);
  onBarsRef.current = onBars;
  const onLiveRef = useRef(onLive);
  onLiveRef.current = onLive;
  const proRef = useRef(pro);
  proRef.current = pro;
  const layersRef = useRef<LayerBuilder | null>(null);
  const drawState = useRef({ magnet: false, locked: false, visible: true, volume: false, right: 24 });
  const countdownRef = useRef<HTMLSpanElement>(null);
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

  const drawLayers = () => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    chart.removeOverlay({ groupId: 'tl' });
    const build = layersRef.current;
    const bars = chart.getDataList();
    if (!build || !bars.length) {
      if (extentRef.current.length) { extentRef.current = []; applyRange(chart); }
      SINKS.delete(sinkId);
      return;
    }
    const pal = readPal(el);
    let built: Layers | null = null;
    try { built = build({ pal, bars, width: el.clientWidth, barSpace: chart.getBarSpace().bar }); } catch { built = null; }
    if (!built) return;
    for (const o of built.overlays) chart.createOverlay({ ...o, groupId: 'tl' });
    const last = bars[bars.length - 1]!;
    const span = TF_MS[tfRef.current];
    const labels: LabelsExt = {
      pal, labels: built.labels, tags: built.tags, obstacles: built.obstacles, compact: el.clientWidth < 600, sinkId,
      lastClose: last.close, countdown: !!span && span <= 86400e3,
    };
    chart.createOverlay({ name: 'tlLabels', groupId: 'tl', points: [{ timestamp: last.timestamp, value: last.close }], extendData: labels, zLevel: 20 });
    const next = built.extent.filter(Number.isFinite);
    if (next.join() !== extentRef.current.join()) { extentRef.current = next; applyRange(chart); }
  };
  // The price axis also covers the extent (stops, targets, the ruler), within reason.
  const extentRef = useRef<number[]>([]);
  const sinkId = useRef(`k${Math.random().toString(36).slice(2)}`).current;
  useEffect(() => () => { SINKS.delete(sinkId); }, [sinkId]);
  const createRange = ({ defaultRange: d }: { defaultRange: import('klinecharts').AxisRange }) => {
    const span = d.realTo - d.realFrom;
    const xs = extentRef.current.filter(v => v > d.realFrom - span * 2 && v < d.realTo + span * 2);
    if (!xs.length || !(span > 0)) return d;
    let lo = Math.min(d.realFrom, ...xs), hi = Math.max(d.realTo, ...xs);
    const pad = (hi - lo) * 0.03;
    if (lo < d.realFrom) lo -= pad;
    if (hi > d.realTo) hi += pad;
    if (lo === d.realFrom && hi === d.realTo) return d;
    return { from: lo, to: hi, range: hi - lo, realFrom: lo, realTo: hi, realRange: hi - lo, displayFrom: lo, displayTo: hi, displayRange: hi - lo };
  };
  const applyRange = (chart: Chart) => {
    if (!proRef.current) return;
    chart.overrideYAxis({ paneId: 'candle_pane', gap: { top: 44, bottom: LANE.gap }, createRange });
  };
  // Tap (or hover) a marker to read its text: on phones markers carry no text.
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const tipAt = (clientX: number, clientY: number) => {
    const chart = chartRef.current;
    const el = containerRef.current;
    const main = chart?.getSize('candle_pane', 'main');
    if (!chart || !el || !main) return null;
    const r = el.getBoundingClientRect();
    const h = hitTest(SINKS.get(sinkId) ?? [], clientX - r.left - main.left, clientY - r.top - main.top, 16);
    return h ? { x: h.x + main.left, y: h.y + main.top, text: h.text } : null;
  };
  const emitBars = () => {
    const chart = chartRef.current;
    if (chart) onBarsRef.current?.(chart.getDataList().map(toCandle));
  };
  const placeCountdown = () => {
    const chart = chartRef.current;
    const el = countdownRef.current;
    if (!el) return;
    const bars = chart?.getDataList() ?? [];
    const last = bars[bars.length - 1];
    const span = TF_MS[tfRef.current];
    if (!chart || !proRef.current || !last || !span || span > 86400e3) { el.hidden = true; return; }
    const left = last.timestamp + span - Date.now();
    const y = (chart.convertToPixel({ value: last.close }, { paneId: 'candle_pane' }) as { y?: number }).y;
    const axis = chart.getSize('candle_pane', 'yAxis');
    const main = chart.getSize('candle_pane', 'main');
    if (left <= 0 || left > span || y == null || !axis || !main || y < 8 || y > main.height - 8) { el.hidden = true; return; }
    const s = Math.floor(left / 1000);
    const h = Math.floor(s / 3600);
    el.textContent = h ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.style.left = `${axis.left}px`;
    el.style.width = `${axis.width}px`;
    el.style.top = `${main.top + y + 11}px`;
    el.hidden = false;
  };
  // Pro chrome: an always-on "XAUUSD · 15m  O H L C ±chg" legend, no high/low
  // marks (the legend has them), and room above/below the bars for labels and the event lane.
  const applyPro = (chart: Chart) => {
    if (!proRef.current || !containerRef.current) return;
    const pal = readPal(containerRef.current);
    const fmt = (v: number) => {
      const d = chart.getSymbol()?.pricePrecision ?? 2;
      return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    };
    chart.setStyles({
      candle: {
        priceMark: { high: { show: false }, low: { show: false } },
        tooltip: {
          showRule: 'always', showType: 'standard',
          legend: {
            size: 11, family: pal.font, weight: 500, marginLeft: 8, marginRight: 0,
            template: ({ current, prev }: { current: KLineData | null; prev: KLineData | null }) => {
              if (!current) return [];
              const col = current.close >= current.open ? pal.gTx : pal.rTx;
              const ref = prev?.close ?? current.open;
              const chg = current.close - ref;
              const pct = ref ? (chg / ref) * 100 : 0;
              const v = (n: number) => ({ text: fmt(n), color: col });
              // Phones: just O H L C, so the legend stays on one line.
              if ((containerRef.current?.clientWidth ?? 999) < 520) {
                return (['O', 'H', 'L', 'C'] as const).map(k => ({ title: { text: `${k} `, color: pal.dim }, value: v(k === 'O' ? current.open : k === 'H' ? current.high : k === 'L' ? current.low : current.close) }));
              }
              return [
                { title: '', value: { text: `${symbolRef.current} · ${tfRef.current}`, color: pal.mut } },
                { title: { text: 'O ', color: pal.dim }, value: v(current.open) },
                { title: { text: 'H ', color: pal.dim }, value: v(current.high) },
                { title: { text: 'L ', color: pal.dim }, value: v(current.low) },
                { title: { text: 'C ', color: pal.dim }, value: v(current.close) },
                { title: '', value: { text: `${chg < 0 ? '−' : '+'}${fmt(Math.abs(chg))} (${chg < 0 ? '−' : '+'}${Math.abs(pct).toFixed(2)}%)`, color: col } },
              ];
            },
          },
        },
      },
    });
    applyRange(chart);
  };

  useImperativeHandle(ref, () => ({
    createIndicator: name => { chartRef.current?.createIndicator(name); },
    createOverlay: name => { chartRef.current?.createOverlay({ name, groupId: 'drawings', mode: drawState.current.magnet ? 'weak_magnet' : 'normal', lock: drawState.current.locked, visible: true }); },
    removeIndicators: () => { chartRef.current?.removeIndicator(); if (drawState.current.volume) chartRef.current?.createIndicator('VOL'); },
    // Clearing drawings leaves the detected patterns and your-trades layers in place.
    removeOverlays: () => { chartRef.current?.removeOverlay({ groupId: 'drawings' }); },
    setLayers: build => { layersRef.current = build; drawLayers(); },
    setVolume: on => {
      const chart = chartRef.current;
      drawState.current.volume = on;
      if (!chart) return;
      const has = chart.getIndicators({ name: 'VOL' }).length > 0;
      if (on && !has) chart.createIndicator('VOL');
      if (!on && has) chart.removeIndicator({ name: 'VOL' });
    },
    setRightSpace: px => { drawState.current.right = px; chartRef.current?.setOffsetRightDistance(px); },
    setMagnet: on => { drawState.current.magnet = on; },
    setDrawingsLocked: on => { drawState.current.locked = on; chartRef.current?.overrideOverlay({ groupId: 'drawings', lock: on }); },
    setDrawingsVisible: on => { drawState.current.visible = on; chartRef.current?.overrideOverlay({ groupId: 'drawings', visible: on }); },
    snapshot: () => {
      const chart = chartRef.current;
      if (!chart || !containerRef.current) return null;
      try { return chart.getConvertPictureUrl(true, 'png', readPal(containerRef.current).s1); } catch { return null; }
    },
    getBars: () => chartRef.current?.getDataList() ?? [],
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
    let clock: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      const kc = await import('klinecharts');
      const { init } = kc;
      registerTlOverlays(kc);
      if (disposed || !containerRef.current) return;
      const chart = init(containerRef.current);
      if (!chart) return;
      localChart = chart;
      chartRef.current = chart;
      // Colours come from the v6 tokens and follow the light/dark toggle.
      chart.setStyles(chartStyles(containerRef.current));
      applyPro(chart);
      stopTheme = onThemeChange(() => {
        if (!containerRef.current) return;
        chart.setStyles(chartStyles(containerRef.current));
        applyPro(chart);
        // Token values flip a frame after the attribute; redraw the layers then.
        requestAnimationFrame(() => drawLayers());
      });
      chart.setOffsetRightDistance(drawState.current.right);
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
            setTimeout(() => { emitBars(); drawLayers(); }, 0);
            if (type === 'init') {
              setReady(true);
              setTimeout(drawPatterns, 0); // a reload clears overlays
              if (drawState.current.volume && !chart.getIndicators({ name: 'VOL' }).length) chart.createIndicator('VOL');
              if (last) {
                const dayAgo = last.openTime - 86_400_000;
                const refBar = [...candles].reverse().find(c => c.openTime <= dayAgo) ?? (candles.length > 1 ? candles[candles.length - 2] : undefined);
                onQuoteRef.current?.({ last: last.close, ref: refBar ? refBar.close : null });
              }
            }
          } catch {
            callback([], false);
            if (type === 'init') { setReady(true); onBarsRef.current?.([]); }
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
            onLiveRef.current?.(bar);
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
        // Resize, then rebuild the layers: labels shorten on narrow charts.
        let raf = 0;
        resizeObsRef.current = new ResizeObserver(() => {
          chart.resize();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => { drawLayers(); placeCountdown(); });
        });
        resizeObsRef.current.observe(el);
      }
      chart.subscribeAction('onScroll', () => { placeCountdown(); setTip(null); });
      let zoomRaf = 0;
      chart.subscribeAction('onZoom', () => { placeCountdown(); cancelAnimationFrame(zoomRaf); zoomRaf = requestAnimationFrame(drawLayers); });
      clock = setInterval(placeCountdown, 1000);
    })();

    const mountEl = containerRef.current;
    return () => {
      disposed = true;
      stopTheme();
      if (clock) clearInterval(clock);
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
    <div className="mk-kc" data-testid="kline-chart-wrap"
      onPointerDown={e => { downAt.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={e => {
        const d = downAt.current;
        downAt.current = null;
        if (!pro || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
        setTip(tipAt(e.clientX, e.clientY));
      }}
      onPointerMove={e => {
        if (!pro || e.pointerType !== 'mouse' || e.buttons) return;
        const t = tipAt(e.clientX, e.clientY);
        setTip(prev => (t?.text === prev?.text && t?.x === prev?.x ? prev : t));
      }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setTip(null); }}>
      {!ready && (
        <div className="mk-kc-load" role="status" aria-live="polite">
          <svg width="22" height="22" viewBox="0 0 24 24" className="x-spin" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="2.5" /><circle cx="12" cy="12" r="9" fill="none" stroke="var(--g)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" /></svg>
          <span>Loading chart</span>
        </div>
      )}
      <div ref={containerRef} className="mk-kc-canvas" data-testid="kline-chart" />
      {pro && <span ref={countdownRef} className="tl-countdown m" hidden aria-label="Time left in this bar" />}
      {tip && (
        <div className={`tl-tip ${tip.x > (containerRef.current?.clientWidth ?? 0) / 2 ? 'l' : ''}`} role="tooltip" data-testid="chart-tip"
          style={{ left: tip.x, top: tip.y }}>{tip.text}</div>
      )}
    </div>
  );
});

export default KlineChart;
