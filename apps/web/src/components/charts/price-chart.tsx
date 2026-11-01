'use client';

// Price-only charts (E2): Renko bricks, Kagi lines and Point & Figure columns.
// Time isn't an axis here: an element appears only when price moves a full box
// (or reversal), so these get their own SVG renderer instead of klinecharts.
// Built from the last 1000 bars of the pane's timeframe; refreshed every 30 s.
import { useEffect, useMemo, useRef, useState } from 'react';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { kagi, pointFigure, renko, resolveSize, type SizeSetting } from '@/lib/chart-types';

export type PriceChartType = 'renko' | 'kagi' | 'pnf';
interface Props {
  symbol: string;
  tf: MarketTimeframe;
  type: PriceChartType;
  size: SizeSetting;
  /** Boxes needed to start a new Point & Figure column. */
  reversal?: number;
  onQuote?: (q: { last: number; ref: number | null }) => void;
}

const LIMIT = 1000;
const REFRESH_MS = 30_000;
const AXIS_W = 64;
const DATE_H = 22;
const PAD = 10;
const TOP = 26; // room for the info line

const fmtPx = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
const intraday = (tf: MarketTimeframe) => !['1d', '1w', '1M'].includes(tf);
const fmtTime = (t: number, tf: MarketTimeframe) => new Date(t).toLocaleString(undefined, intraday(tf) ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { year: '2-digit', month: 'short', day: 'numeric' });
/** Short axis label: "Oct 22 18:30" intraday, "Oct 22" otherwise. */
const axisTime = (t: number, tf: MarketTimeframe) => {
  const d = new Date(t);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return intraday(tf) ? `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : day;
};
const LABEL_GAP = 120; // px between date labels
const sizeText = (s: SizeSetting, v: number) => `${fmtPx(v)} (${s.mode === 'atr' ? `ATR ${s.value}` : s.mode === 'percent' ? `${s.value}%` : 'fixed'})`;

/** A few round price ticks between lo and hi. */
function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export default function PriceChart({ symbol, tf, type, size, reversal = 3, onQuote }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const onQuoteRef = useRef(onQuote);
  onQuoteRef.current = onQuote;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDim({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    setCandles(null);
    setErr(null);
    const load = async () => {
      try {
        const { candles: c } = await marketApi.candles({ symbol, tf, limit: LIMIT });
        if (!alive) return;
        setCandles(c);
        const last = c[c.length - 1];
        if (last) {
          const refBar = [...c].reverse().find(b => b.openTime <= last.openTime - 86_400_000);
          onQuoteRef.current?.({ last: last.close, ref: refBar ? refBar.close : null });
        }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Could not load prices');
      }
    };
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [symbol, tf]);

  const box = useMemo(() => (candles ? resolveSize(candles, size) : null), [candles, size]);
  const model = useMemo(() => {
    if (!candles || box == null) return null;
    if (type === 'renko') return { kind: 'renko' as const, items: renko(candles, box) };
    if (type === 'kagi') return { kind: 'kagi' as const, items: kagi(candles, box) };
    return { kind: 'pnf' as const, items: pointFigure(candles, box, reversal) };
  }, [candles, box, type, reversal]);

  const plotW = Math.max(0, dim.w - AXIS_W - PAD);
  const plotH = Math.max(0, dim.h - DATE_H - TOP - PAD);
  const n = model?.items.length ?? 0;
  // Slot per element: wide when there are few, never thinner than 5 px; show the newest that fit.
  // Point & Figure uses square cells, as tall as one box (up to 40 px).
  let slot = n ? Math.max(5, Math.min(18, plotW / n)) : 10;
  if (model?.kind === 'pnf' && n && box != null) {
    const rows = Math.max(...model.items.map(c => c.high)) - Math.min(...model.items.map(c => c.low)) + 3;
    slot = Math.max(5, Math.min(40, plotW / n, plotH / rows));
  }
  const visible = Math.max(1, Math.floor(plotW / slot));
  const first = Math.max(0, n - visible);
  const last = candles?.[candles.length - 1]?.close ?? null;

  const view = useMemo(() => {
    if (!model || !n || box == null) return null;
    const items = model.items.slice(first);
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      const [a, b] = 'open' in it ? [it.open, it.close] : 'from' in it ? [it.from, it.to] : [it.low * box - box / 2, it.high * box + box / 2];
      lo = Math.min(lo, a, b);
      hi = Math.max(hi, a, b);
    }
    if (last != null) { lo = Math.min(lo, last); hi = Math.max(hi, last); }
    const padY = (hi - lo) * 0.04 || box;
    return { items, lo: lo - padY, hi: hi + padY };
  }, [model, n, first, box, last]);

  const y = (p: number) => (view ? TOP + ((view.hi - p) / (view.hi - view.lo)) * plotH : 0);
  // Newest element at the right edge, like a candle chart.
  const shown = view?.items.length ?? 0;
  const left = PAD / 2 + Math.max(0, plotW - shown * slot);
  const xAt = (i: number) => left + i * slot;

  const label = model?.kind === 'renko' ? 'bricks' : model?.kind === 'kagi' ? 'lines' : 'columns';
  const status = err ? err
    : !candles ? null
    : !candles.length ? `No ${tf} candles for ${symbol}.`
    : box == null ? (size.mode === 'atr' ? `Not enough bars for ATR ${size.value}.` : 'Choose a size above zero.')
    : !n ? `Price hasn’t moved ${type === 'kagi' ? 'a full reversal' : 'a full box'} (${fmtPx(box)}) in the last ${candles.length} bars. Try a smaller size.`
    : null;

  const tip = (() => {
    if (hover == null || !view) return null;
    const it = view.items[hover];
    if (!it) return null;
    const t = fmtTime(it.time, tf);
    if ('open' in it) return `${it.up ? 'Up' : 'Down'} brick ${fmtPx(it.open)} → ${fmtPx(it.close)} · ${t}`;
    if ('from' in it) return `${it.up ? 'Rising' : 'Falling'} line ${fmtPx(it.from)} → ${fmtPx(it.to)} · ${it.pieces.some(p => p.yang) ? (it.pieces.every(p => p.yang) ? 'thick (yang)' : 'turns thick') : 'thin (yin)'} · from ${t}`;
    return `${it.x ? 'X' : 'O'} column ${fmtPx(it.low * box!)} – ${fmtPx(it.high * box!)} · ${it.high - it.low + 1} boxes · from ${t}`;
  })();

  return (
    <div className="mk-pc" ref={wrap} data-testid="price-chart" data-type={type}>
      {candles && box != null && (
        <div className="mk-pc-info" data-testid="price-chart-info">
          {type === 'renko' ? 'Renko' : type === 'kagi' ? 'Kagi' : 'Point & figure'} · {type === 'kagi' ? 'reversal' : 'box'} {sizeText(size, box)}{type === 'pnf' ? ` · ${reversal}-box reversal` : ''} · {n} {label} from {candles.length} {tf} bars
        </div>
      )}
      {status ? <div className="mk-pc-empty" role="status" data-testid="price-chart-empty">{status}</div>
        : !candles ? <div className="mk-kc-load" role="status"><span>Loading chart</span></div>
        : view && dim.w > 0 && (
          <svg width={dim.w} height={dim.h} role="img" aria-label={`${symbol} ${type} chart`}
            onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - left) / slot); setHover(i >= 0 && i < view.items.length ? i : null); }}
            onMouseLeave={() => setHover(null)}>
            {ticks(view.lo, view.hi).map(v => (
              <g key={v}>
                <line x1={0} x2={plotW + PAD} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
                <text x={plotW + PAD + 6} y={y(v) + 4} className="mk-pc-axis">{fmtPx(v)}</text>
              </g>
            ))}
            {hover != null && <rect x={xAt(hover)} y={TOP} width={slot} height={plotH} fill="var(--line)" />}
            {model!.kind === 'renko' && (view.items as ReturnType<typeof renko>).map((b, i) => (
              <rect key={i} x={xAt(i) + 1} width={Math.max(1, slot - 2)} y={y(Math.max(b.open, b.close))} height={Math.max(1, Math.abs(y(b.open) - y(b.close)))} fill={b.up ? 'var(--g)' : 'var(--r)'} rx={1} data-testid="renko-brick" />
            ))}
            {model!.kind === 'kagi' && (view.items as ReturnType<typeof kagi>).map((l, i, arr) => {
              const x = xAt(i) + slot / 2;
              const nx = xAt(i + 1) + slot / 2;
              const endYang = l.pieces[l.pieces.length - 1]!.yang;
              return (
                <g key={i} data-testid="kagi-leg">
                  {l.pieces.map((p, k) => <line key={k} x1={x} x2={x} y1={y(p.from)} y2={y(p.to)} stroke={p.yang ? 'var(--g)' : 'var(--r)'} strokeWidth={p.yang ? 3 : 1.4} strokeLinecap="square" />)}
                  {i < arr.length - 1 && <line x1={x} x2={nx} y1={y(l.to)} y2={y(l.to)} stroke={endYang ? 'var(--g)' : 'var(--r)'} strokeWidth={endYang ? 3 : 1.4} />}
                </g>
              );
            })}
            {model!.kind === 'pnf' && (view.items as ReturnType<typeof pointFigure>).map((c, i) => {
              const cell = Math.max(3, Math.min(slot, Math.abs(y(0) - y(box!)))) * 0.8;
              const cx = xAt(i) + slot / 2;
              const glyphs = [];
              for (let b = c.low; b <= c.high; b++) {
                const cy = y(b * box!);
                glyphs.push(c.x
                  ? <path key={b} d={`M${cx - cell / 2} ${cy - cell / 2}L${cx + cell / 2} ${cy + cell / 2}M${cx + cell / 2} ${cy - cell / 2}L${cx - cell / 2} ${cy + cell / 2}`} stroke="var(--g)" strokeWidth={1.4} />
                  : <circle key={b} cx={cx} cy={cy} r={cell / 2} fill="none" stroke="var(--r)" strokeWidth={1.4} />);
              }
              return <g key={i} data-testid="pnf-column">{glyphs}</g>;
            })}
            {last != null && (
              <g>
                <line x1={0} x2={plotW + PAD} y1={y(last)} y2={y(last)} stroke="var(--mut)" strokeDasharray="3 3" />
                <rect x={plotW + PAD + 2} y={y(last) - 9} width={AXIS_W - 4} height={18} rx={4} fill="var(--hi)" />
                <text x={plotW + PAD + 6} y={y(last) + 4} className="mk-pc-axis mk-pc-last">{fmtPx(last)}</text>
              </g>
            )}
            {view.items.map((it, i) => {
              // Count back from the newest so the right-hand label is always there.
              const step = Math.max(1, Math.ceil(LABEL_GAP / slot));
              const fromEnd = view.items.length - 1 - i;
              const x = xAt(i) + slot / 2;
              return fromEnd % step === 0 && x > 50 ? <text key={`d${i}`} x={x} y={dim.h - 6} className="mk-pc-axis" textAnchor="middle">{axisTime(it.time, tf)}</text> : null;
            })}
          </svg>
        )}
      {tip && <div className="mk-pc-tip" role="tooltip" data-testid="price-chart-tip">{tip}</div>}
    </div>
  );
}
