'use client';

// The builder's Chart layout (F11): recent bars of one market with the
// strategy drawn on them. Fixed-number thresholds and the stop and target are
// lines you drag (or nudge with the arrow keys); "Draw a level" adds a price
// level as a rule. Where the signals fired and the trades a backtest of these
// bars takes refresh after each change.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { useToast } from '@/components/toast';
import { ApiError } from '@/lib/copy-api';
import { fmtPrice } from '@/lib/hub-api';
import { strategiesApi, tone, usd, type ChartGroup, type ChartPreview, type ChartThreshold, type SignalGroup, type StrategyCondition, type StrategySpec } from '@/lib/strategies-api';
import { IClose } from '@/components/v6/icons';
import '@/styles/v6/strategy.css';

const OPS: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', crosses_above: 'crosses above', crosses_below: 'crosses below' };
const GROUP_TEXT: Record<ChartGroup, string> = { long: 'Long entry', short: 'Short entry', exitLong: 'Exit long', exitShort: 'Exit short' };
const COLORS = ['var(--sc-1)', 'var(--sc-2)', 'var(--sc-3)', 'var(--sc-4)'];
const BARS = [100, 200, 400] as const;
const AXIS_W = 84;
const PRICE_H = 320;
const PANE_H = 110;
const GAP = 12;
const TIME_H = 22;

type Drag = { id: string; value: number };
type Level = { price: number; x: number; y: number };
const sig = (v: number, n = 6) => Number(v.toPrecision(n));
const r2 = (v: number) => Math.round(v * 100) / 100;
const groupOf = (s: StrategySpec, g: ChartGroup): SignalGroup | 'mirror' | null =>
  g === 'long' ? s.entry.long : g === 'short' ? s.entry.short : g === 'exitLong' ? s.exit.long : s.exit.short;

function priceRange(d: ChartPreview): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of d.candles) { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); }
  for (const s of d.series) if (s.pane === 'price') for (const v of s.values) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (d.risk) for (const v of [d.risk.stop, d.risk.target]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
  return [lo - pad, hi + pad];
}
function paneRange(d: ChartPreview, pane: string): [number, number] {
  const ss = d.series.filter(s => s.pane === pane);
  if (ss.some(s => s.scale === 'percent')) return [0, 100];
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of ss) for (const v of s.values) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const t of d.thresholds) if (t.pane === pane) { lo = Math.min(lo, t.value); hi = Math.max(hi, t.value); }
  if (!Number.isFinite(lo)) return [0, 1];
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
  return [lo - pad, hi + pad];
}
const fmtAxis = (v: number, span: number) => (Math.abs(v) >= 1000 || span >= 50 ? v.toLocaleString('en-US', { maximumFractionDigits: span >= 50 ? 0 : 1 }) : v.toLocaleString('en-US', { maximumFractionDigits: span >= 1 ? 2 : 4 }));

export default function StrategyChart({ spec, set }: { spec: StrategySpec; set: (fn: (s: StrategySpec) => StrategySpec) => void }) {
  const toast = useToast();
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(0);
  const [symbol, setSymbol] = useState<string | undefined>(undefined);
  const [bars, setBars] = useState<number>(200);
  const [d, setD] = useState<ChartPreview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [level, setLevel] = useState<Level | null>(null);
  const seq = useRef(0);
  const specKey = JSON.stringify(spec);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Refetch after edits settle; only the newest answer is kept.
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      setBusy(true);
      strategiesApi.chart(JSON.parse(specKey) as StrategySpec, symbol, bars).then(
        x => { if (n === seq.current) { setD(x); setErr(null); } },
        e => { if (n === seq.current) setErr(e instanceof ApiError ? e.message : 'Could not load the chart.'); },
      ).finally(() => { if (n === seq.current) setBusy(false); });
    }, d ? 450 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, symbol, bars]);

  const plotW = Math.max(0, w - AXIS_W);
  const lower = d ? d.panes.filter(p => p !== 'price') : [];
  const H = PRICE_H + lower.reduce(acc => acc + GAP + PANE_H, 0) + TIME_H;
  const paneTop = (pane: string) => (pane === 'price' ? 0 : PRICE_H + GAP + lower.indexOf(pane) * (PANE_H + GAP));
  const paneH = (pane: string) => (pane === 'price' ? PRICE_H : PANE_H);
  const ranges = useMemo(() => {
    const m = new Map<string, [number, number]>();
    if (!d) return m;
    m.set('price', priceRange(d));
    for (const p of d.panes) if (p !== 'price') m.set(p, paneRange(d, p));
    return m;
  }, [d]);
  const Y = (pane: string, v: number) => { const [lo, hi] = ranges.get(pane) ?? [0, 1]; return paneTop(pane) + 4 + ((hi - v) / (hi - lo || 1)) * (paneH(pane) - 8); };
  const V = (pane: string, y: number) => { const [lo, hi] = ranges.get(pane) ?? [0, 1]; return hi - ((y - paneTop(pane) - 4) / (paneH(pane) - 8)) * (hi - lo); };
  const n = d?.candles.length ?? 0;
  const bw = n ? plotW / n : 0;
  const X = (i: number) => (i + 0.5) * bw;
  const idxOf = useMemo(() => new Map((d?.candles ?? []).map((c, i) => [c.t, i])), [d]);
  const seriesColor = useMemo(() => new Map((d?.series ?? []).filter(s => s.values.length).map((s, k) => [s.key, COLORS[k % COLORS.length]!])), [d]);

  // ── Edits ──
  const roundFor = (pane: string, v: number) => {
    const scale = d?.series.find(s => s.pane === pane)?.scale ?? (pane === 'price' ? 'price' : 'centered');
    return scale === 'percent' ? Math.round(v * 10) / 10 : scale === 'price' ? sig(v, 6) : sig(v, 4);
  };
  function setThreshold(t: ChartThreshold, v: number) {
    set(s => {
      const n2 = structuredClone(s);
      const g = groupOf(n2, t.group);
      if (!g || g === 'mirror') return s;
      const c = g.conditions[t.index];
      if (!c || c.right.kind !== 'value') return s;
      c.right = { kind: 'value', value: roundFor(t.pane, v) };
      return n2;
    });
  }
  function removeThreshold(t: ChartThreshold) {
    set(s => {
      const n2 = structuredClone(s);
      const g = groupOf(n2, t.group);
      if (!g || g === 'mirror') return s;
      g.conditions.splice(t.index, 1);
      // An exit with no rules left is no exit rule at all.
      if (!g.conditions.length && t.group === 'exitLong') n2.exit.long = null;
      if (!g.conditions.length && t.group === 'exitShort') n2.exit.short = null;
      return n2;
    });
  }
  /** A dragged stop or target price as the number its mode stores. */
  function riskValue(kind: 'stop' | 'target', p: number): number | null {
    const r = d?.risk;
    if (!r) return null;
    const side = r.side === 'long' ? 1 : -1;
    const dist = Math.abs(p - r.entry);
    if (kind === 'stop') {
      const m = spec.risk.stopLoss;
      if (!m) return null;
      return m.mode === 'pct' ? Math.max(0.01, r2((dist / r.entry) * 100)) : m.mode === 'points' ? Math.max(1e-8, sig(dist, 5)) : m.mode === 'price' ? sig(p, 6) : r.atr ? Math.max(0.1, r2(dist / r.atr)) : null;
    }
    const m = spec.risk.takeProfit;
    if (!m) return null;
    if (m.mode === 'rr') return r.stop != null ? Math.max(0.1, r2(dist / Math.abs(r.entry - r.stop))) : null;
    void side;
    return m.mode === 'pct' ? Math.max(0.01, r2((dist / r.entry) * 100)) : m.mode === 'points' ? Math.max(1e-8, sig(dist, 5)) : sig(p, 6);
  }
  /** Keep the stop below a long's entry and the target above it (mirrored for shorts). */
  const clampRisk = (kind: 'stop' | 'target', p: number) => {
    const r = d!.risk!;
    const side = r.side === 'long' ? 1 : -1;
    const minGap = r.entry * 0.0005;
    const away = kind === 'stop' ? -side : side;
    return away * (p - r.entry) < minGap ? r.entry + away * minGap : p;
  };
  function setRisk(kind: 'stop' | 'target', p: number) {
    const v = riskValue(kind, clampRisk(kind, p));
    if (v == null) return;
    set(s => {
      const n2 = structuredClone(s);
      if (kind === 'stop' && n2.risk.stopLoss) n2.risk.stopLoss.value = v;
      if (kind === 'target' && n2.risk.takeProfit) n2.risk.takeProfit.value = v;
      return n2;
    });
  }
  function addLevel(group: ChartGroup, operator: 'crosses_above' | 'crosses_below') {
    if (!level) return;
    const c: StrategyCondition = { left: { kind: 'indicator', id: 'price', output: 'close' }, operator, right: { kind: 'value', value: sig(level.price, 6) } };
    set(s => {
      const n2 = structuredClone(s);
      const add = (g: SignalGroup | 'mirror' | null): SignalGroup => (g && g !== 'mirror' ? { ...g, conditions: [...g.conditions, c] } : { match: 'all', conditions: [c] });
      if (group === 'long') n2.entry.long = add(n2.entry.long);
      else if (group === 'short') n2.entry.short = add(n2.entry.short);
      else if (group === 'exitLong') n2.exit.long = add(n2.exit.long);
      else n2.exit.short = add(n2.exit.short);
      return n2;
    });
    const g = groupOf(spec, group);
    toast.success(`${GROUP_TEXT[group]}: close ${OPS[operator]} ${fmtPrice(sig(level.price, 6))}${g && g !== 'mirror' && g.conditions.length ? (g.match === 'all' ? ', with your other rules' : ', or your other rules') : ''}`);
    setLevel(null);
    setDrawing(false);
  }

  // ── Pointer handling ──
  const local = (e: { clientX: number; clientY: number }) => { const b = svg.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const dragPane = (id: string) => (id === 'stop' || id === 'target' ? 'price' : d?.thresholds.find(t => `${t.group}:${t.index}` === id)?.pane ?? 'price');
  function onMove(e: RPointerEvent<SVGSVGElement>) {
    const { x, y } = local(e);
    if (drag) {
      const pane = dragPane(drag.id);
      const top = paneTop(pane);
      const v = V(pane, Math.max(top, Math.min(top + paneH(pane), y)));
      setDrag({ id: drag.id, value: drag.id === 'stop' || drag.id === 'target' ? clampRisk(drag.id, v) : v });
      return;
    }
    setHover(x >= 0 && x < plotW && n ? Math.min(n - 1, Math.floor(x / bw)) : null);
  }
  function onUp() {
    if (!drag) return;
    if (drag.id === 'stop' || drag.id === 'target') setRisk(drag.id, drag.value);
    else { const t = d?.thresholds.find(x => `${x.group}:${x.index}` === drag.id); if (t) setThreshold(t, drag.value); }
    setDrag(null);
  }
  function onClick(e: RMouseEvent<SVGSVGElement>) {
    if (!drawing || !d) return;
    const { x, y } = local(e);
    if (y > PRICE_H || x > plotW) return;
    setLevel({ price: V('price', y), x, y });
  }
  const startDrag = (id: string, value: number) => (e: RPointerEvent) => { e.stopPropagation(); svg.current?.setPointerCapture?.(e.pointerId); setDrag({ id, value }); };
  const nudge = (pane: string, apply: (v: number) => void, now: number) => (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const [lo, hi] = ranges.get(pane) ?? [0, 1];
    apply(now + (e.key === 'ArrowUp' ? 1 : -1) * (hi - lo) * (e.shiftKey ? 0.05 : 0.01));
  };

  // ── Drawing helpers ──
  const pathOf = (vals: Array<number | null>, pane: string) => {
    let p = '';
    let pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } p += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(pane, v).toFixed(1)}`; pen = true; });
    return p;
  };
  const handle = (opts: { id: string; pane: string; value: number; label: string; color: string; ariaLabel: string; draggable: boolean; onKey?: (e: KeyboardEvent) => void }) => {
    const top = paneTop(opts.pane);
    const raw = Y(opts.pane, opts.value);
    const y = Math.max(top + 9, Math.min(top + paneH(opts.pane) - 9, raw));
    const ly = labelY.get(opts.id) ?? y;
    const off = raw < top ? '↑ ' : raw > top + paneH(opts.pane) ? '↓ ' : '';
    return (
      <g key={opts.id} className={`sc-line ${opts.draggable ? 'is-drag' : ''} ${drag?.id === opts.id ? 'is-active' : ''}`}>
        <line x1={0} x2={plotW} y1={y} y2={y} stroke={opts.color} strokeDasharray="5 4" strokeWidth={1.2} opacity={opts.draggable ? 0.95 : 0.45} />
        {opts.draggable && <line x1={0} x2={plotW} y1={y} y2={y} stroke="transparent" strokeWidth={12} style={{ cursor: 'ns-resize' }} onPointerDown={startDrag(opts.id, opts.value)} />}
        {ly !== y && <line x1={plotW - 6} x2={plotW + 3} y1={y} y2={ly} stroke={opts.color} strokeWidth={1} />}
        <g transform={`translate(${plotW + 3} ${ly - 9})`} role={opts.draggable ? 'slider' : undefined} tabIndex={opts.draggable ? 0 : undefined} aria-label={opts.ariaLabel}
          aria-valuenow={opts.draggable ? Number(opts.value.toPrecision(6)) : undefined} onPointerDown={opts.draggable ? startDrag(opts.id, opts.value) : undefined} onKeyDown={opts.onKey}
          style={{ cursor: opts.draggable ? 'ns-resize' : 'default' }} data-testid={`sc-h-${opts.id}`}>
          <rect width={AXIS_W - 6} height={18} rx={5} fill={opts.color} opacity={opts.draggable ? 1 : 0.5} />
          <text x={(AXIS_W - 6) / 2} y={12.5} textAnchor="middle" className="sc-hl">{off}{opts.label}</text>
        </g>
      </g>
    );
  };

  // Labels on the right axis, nudged apart when their lines sit close together.
  const labelY = new Map<string, number>();
  if (d) {
    const items = [
      ...d.thresholds.map(t => ({ id: `${t.group}:${t.index}`, pane: t.pane, value: t.value })),
      ...(d.risk?.stop != null ? [{ id: 'stop', pane: 'price', value: d.risk.stop }] : []),
      ...(d.risk?.target != null ? [{ id: 'target', pane: 'price', value: d.risk.target }] : []),
    ].map(i => (drag?.id === i.id ? { ...i, value: drag.value } : i));
    for (const pane of new Set(items.map(i => i.pane))) {
      const top = paneTop(pane);
      const bot = top + paneH(pane) - 9;
      const list = items.filter(i => i.pane === pane).map(i => ({ id: i.id, y: Math.max(top + 9, Math.min(bot, Y(pane, i.value))) })).sort((a, b) => a.y - b.y);
      for (let k = 1; k < list.length; k++) list[k]!.y = Math.max(list[k]!.y, list[k - 1]!.y + 20);
      const over = list.length ? list[list.length - 1]!.y - bot : 0;
      if (over > 0) { list[list.length - 1]!.y -= over; for (let k = list.length - 2; k >= 0; k--) list[k]!.y = Math.min(list[k]!.y, list[k + 1]!.y - 20); }
      for (const l of list) labelY.set(l.id, l.y);
    }
  }
  const symbols = spec.market.symbols.map(s => s.symbol);
  const closed = d?.trades.filter(t => t.pnl != null) ?? [];
  const closedPnl = closed.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const hv = hover != null && d ? d.candles[hover] : null;
  const timeFmt = (t: number) => {
    const dt = new Date(t);
    return d?.interval === '1d' ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const canDraw = (g: ChartGroup) => {
    const dir = spec.market.direction;
    if ((g === 'long' || g === 'exitLong') && dir === 'short') return false;
    if ((g === 'short' || g === 'exitShort') && dir === 'long') return false;
    return groupOf(spec, g) !== 'mirror';
  };
  const riskLabel = (kind: 'stop' | 'target', p: number) => {
    const v = riskValue(kind, p);
    const m = kind === 'stop' ? spec.risk.stopLoss : spec.risk.takeProfit;
    const name = kind === 'stop' ? 'SL' : 'TP';
    if (!m || v == null) return name;
    return m.mode === 'pct' ? `${name} ${v}%` : m.mode === 'atr' ? `${name} ${v}×ATR` : m.mode === 'rr' ? `${name} ${v}R` : m.mode === 'points' ? `${name} ${fmtPrice(v)}` : `${name} ${fmtPrice(v)}`;
  };

  return (
    <section className="x-card sc-card" aria-label="Chart" data-testid="sc-card">
      <div className="sc-chead">
        {symbols.length > 1 ? (
          <select className="x-input sc-sym" value={d?.symbol ?? symbols[0]} onChange={e => setSymbol(e.target.value)} aria-label="Market" data-testid="sc-symbol">{symbols.map(s => <option key={s}>{s}</option>)}</select>
        ) : <b className="sc-symb">{symbols[0] ?? '—'}</b>}
        <span className="x-muted">{spec.session.interval}</span>
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Bars">{BARS.map(b => <button key={b} type="button" role="radio" aria-checked={bars === b} onClick={() => setBars(b)} data-testid={`sc-bars-${b}`}>{b} bars</button>)}</div>
        <button type="button" className={`x-btn x-btn--sm ${drawing ? 'x-btn--hi' : ''}`} aria-pressed={drawing} onClick={() => { setDrawing(v => !v); setLevel(null); }} data-testid="sc-draw">{drawing ? 'Click the chart…' : 'Draw a level'}</button>
        <span className="sc-sum">
          {busy && <span className="x-muted" data-testid="sc-busy">Updating…</span>}
          {d && <span data-testid="sc-summary">{d.trades.length} trade{d.trades.length === 1 ? '' : 's'} on these bars{closed.length ? <> · <b className={`m ${tone(closedPnl)}`}>{usd(closedPnl)}</b> closed</> : null}</span>}
        </span>
      </div>
      <div className="sc-read m" data-testid="sc-readout">
        {hv ? <>{timeFmt(hv.t)} · O {fmtPrice(hv.o)} H {fmtPrice(hv.h)} L {fmtPrice(hv.l)} C {fmtPrice(hv.c)}{d!.series.filter(s => s.values.length).map(s => <span key={s.key} style={{ color: seriesColor.get(s.key) }}> · {s.label} {s.values[hover!] == null ? '—' : fmtAxis(s.values[hover!]!, 1)}</span>)}</>
          : <span className="x-muted">{drawing ? 'Click where the level should be.' : 'Drag a dashed line to change its number, or focus it and use the arrow keys.'}</span>}
      </div>
      <div ref={wrap} className={`sc-wrap ${drawing ? 'is-drawing' : ''}`}>
        {err && !d ? <div className="x-empty" data-testid="sc-error"><b>Chart unavailable</b><p>{err}</p></div> : !d || !w ? <div className="x-skel" style={{ height: PRICE_H }} /> : (
          <svg ref={svg} width={w} height={H} role="img" aria-label={`${d.symbol} ${d.interval} chart with the strategy's levels`} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} onPointerLeave={() => !drag && setHover(null)} onClick={onClick} data-testid="sc-svg">
            {/* Panes and axes */}
            {['price', ...lower].map(p => {
              const [lo, hi] = ranges.get(p)!;
              const ticks = p === 'price' ? [0.1, 0.35, 0.6, 0.85].map(f => lo + (hi - lo) * f) : [lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.8];
              return (
                <g key={p}>
                  <rect x={0} y={paneTop(p)} width={plotW} height={paneH(p)} fill="none" stroke="var(--line)" />
                  {ticks.map((v, k) => <g key={k}><line x1={0} x2={plotW} y1={Y(p, v)} y2={Y(p, v)} stroke="var(--grid)" /><text x={plotW + 6} y={Y(p, v) + 4} className="mk-pc-axis">{fmtAxis(v, hi - lo)}</text></g>)}
                  {p !== 'price' && <text x={6} y={paneTop(p) + 14} className="sc-pane-l">{d.series.filter(s => s.pane === p).map(s => s.label).join(' · ')}</text>}
                </g>
              );
            })}
            {/* Candles */}
            {d.candles.map((c, i) => {
              const up = c.c >= c.o;
              const x = X(i);
              const bodyW = Math.max(1, bw * 0.62);
              return (
                <g key={c.t} className={up ? 'sc-up' : 'sc-dn'}>
                  <line x1={x} x2={x} y1={Y('price', c.h)} y2={Y('price', c.l)} />
                  <rect x={x - bodyW / 2} y={Y('price', Math.max(c.o, c.c))} width={bodyW} height={Math.max(1, Math.abs(Y('price', c.o) - Y('price', c.c)))} />
                </g>
              );
            })}
            {/* Indicator lines */}
            {d.series.filter(s => s.values.length).map(s => <path key={s.key} d={pathOf(s.values, s.pane)} fill="none" stroke={seriesColor.get(s.key)} strokeWidth={1.4} data-testid="sc-series" />)}
            {/* Signals: dots along the bottom of the candles */}
            {d.signals.long.map(i => <circle key={`l${i}`} cx={X(i)} cy={PRICE_H - 6} r={2.2} fill="var(--g)" opacity={0.75} data-testid="sc-sig-long" />)}
            {d.signals.short.map(i => <circle key={`s${i}`} cx={X(i)} cy={PRICE_H - 12} r={2.2} fill="var(--r)" opacity={0.75} data-testid="sc-sig-short" />)}
            {/* Trades */}
            {d.trades.map((t, k) => {
              const a = idxOf.get(t.entryT);
              if (a == null) return null;
              const b = t.exitT != null ? idxOf.get(t.exitT) ?? n - 1 : n - 1;
              const end = t.exitPrice ?? d.candles[n - 1]!.c;
              const col = t.pnl == null ? 'var(--mut)' : t.pnl >= 0 ? 'var(--g)' : 'var(--r)';
              const ya = Y('price', t.entryPrice);
              const tri = t.side === 'long' ? `${X(a) - 5},${ya + 11} ${X(a) + 5},${ya + 11} ${X(a)},${ya + 3}` : `${X(a) - 5},${ya - 11} ${X(a) + 5},${ya - 11} ${X(a)},${ya - 3}`;
              return (
                <g key={k} data-testid="sc-trade">
                  <title>{`${t.side === 'long' ? 'Long' : 'Short'} at ${fmtPrice(t.entryPrice)}${t.exitPrice != null ? ` → ${fmtPrice(t.exitPrice)} (${t.reason}) ${usd(t.pnl)}` : ', still open'}`}</title>
                  <line x1={X(a)} x2={X(b)} y1={ya} y2={Y('price', end)} stroke={col} strokeDasharray="3 3" strokeWidth={1.2} />
                  <polygon points={tri} fill={t.side === 'long' ? 'var(--g)' : 'var(--r)'} />
                  {t.exitPrice != null && <text x={X(b)} y={Y('price', t.exitPrice) + 4} textAnchor="middle" className="sc-exitmark" fill={col}>×</text>}
                </g>
              );
            })}
            {/* Thresholds: the read-only mirrored lines first, so a draggable one sharing their level stays on top */}
            {[...d.thresholds].sort((a, b) => Number(b.mirrored) - Number(a.mirrored)).map(t => {
              const id = `${t.group}:${t.index}`;
              const value = drag?.id === id ? drag.value : t.value;
              const color = t.group === 'long' ? 'var(--g)' : t.group === 'short' ? 'var(--r)' : 'var(--mut)';
              return handle({ id, pane: t.pane, value, color, draggable: !t.mirrored, label: fmtAxis(drag?.id === id ? roundFor(t.pane, value) : value, Math.abs(value) >= 100 ? 50 : 1),
                ariaLabel: `${GROUP_TEXT[t.group]}: ${t.label} ${OPS[t.operator]} ${value}${t.mirrored ? ' (mirrors the long rule)' : ''}`,
                onKey: t.mirrored ? undefined : nudge(t.pane, v => setThreshold(t, v), t.value) });
            })}
            {/* Stop, target and the price now */}
            {d.risk && (
              <g>
                <line x1={0} x2={plotW} y1={Y('price', d.risk.entry)} y2={Y('price', d.risk.entry)} stroke="var(--axis)" strokeDasharray="2 3" />
                {d.risk.stop != null && handle({ id: 'stop', pane: 'price', value: drag?.id === 'stop' ? drag.value : d.risk.stop, color: 'var(--r)', draggable: true, label: riskLabel('stop', drag?.id === 'stop' ? drag.value : d.risk.stop), ariaLabel: `Stop for a ${d.risk.side} opened now at ${fmtPrice(d.risk.entry)}`, onKey: nudge('price', v => setRisk('stop', v), d.risk.stop) })}
                {d.risk.target != null && handle({ id: 'target', pane: 'price', value: drag?.id === 'target' ? drag.value : d.risk.target, color: 'var(--g)', draggable: true, label: riskLabel('target', drag?.id === 'target' ? drag.value : d.risk.target), ariaLabel: `Target for a ${d.risk.side} opened now at ${fmtPrice(d.risk.entry)}`, onKey: nudge('price', v => setRisk('target', v), d.risk.target) })}
              </g>
            )}
            {/* Hover */}
            {hover != null && !drag && <line x1={X(hover)} x2={X(hover)} y1={0} y2={H - TIME_H} stroke="var(--line-2)" pointerEvents="none" />}
            {drawing && level && <line x1={0} x2={plotW} y1={level.y} y2={level.y} stroke="var(--tx)" strokeDasharray="6 3" />}
            {/* Time axis */}
            {(w < 640 ? [0.15, 0.8] : [0.1, 0.4, 0.7, 0.95]).map(f => { const i = Math.min(n - 1, Math.floor(f * n)); return <text key={f} x={X(i)} y={H - 6} textAnchor={X(i) < 60 ? 'start' : X(i) > plotW - 60 ? 'end' : 'middle'} className="mk-pc-axis">{timeFmt(d.candles[i]!.t)}</text>; })}
          </svg>
        )}
        {level && d && (
          <div className="sc-pop" style={{ left: Math.min(Math.max(8, level.x - 120), Math.max(8, plotW - 250)), top: Math.min(level.y + 12, PRICE_H - 40) }} role="dialog" aria-label="Add a price level" data-testid="sc-level">
            <div className="sc-pop-h"><b className="m">{fmtPrice(sig(level.price, 6))}</b><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setLevel(null)} aria-label="Cancel"><IClose size={14} /></button></div>
            {(['long', 'short', 'exitLong', 'exitShort'] as ChartGroup[]).filter(canDraw).map(g => (
              <div key={g} className="sc-pop-r">
                <span>{GROUP_TEXT[g]} when the close</span>
                <button type="button" className="x-btn x-btn--sm" onClick={() => addLevel(g, 'crosses_above')} data-testid={`sc-add-${g}-above`}>crosses above</button>
                <button type="button" className="x-btn x-btn--sm" onClick={() => addLevel(g, 'crosses_below')} data-testid={`sc-add-${g}-below`}>crosses below</button>
              </div>
            ))}
            {(spec.entry.short === 'mirror' && spec.market.direction !== 'long') && <p className="x-muted sc-pop-n">Short rules mirror long, so a long level also adds its short mirror.</p>}
          </div>
        )}
      </div>
      <div className="sc-legend x-muted">
        {d?.series.filter(s => s.values.length).map(s => <span key={s.key}><i style={{ background: seriesColor.get(s.key) }} />{s.label}</span>)}
        <span><i className="sc-tri g" />Entry</span><span>× Exit</span><span><i className="sc-dot g" />Long signal</span>{spec.market.direction !== 'long' && <span><i className="sc-dot r" />Short signal</span>}
      </div>
      {d && (
        <div className="sc-levels" data-testid="sc-levels">
          <div className="sc-levels-h">Numbers on the chart</div>
          {!d.thresholds.length && !d.risk?.stop && !d.risk?.target ? <p className="x-muted">No fixed numbers in the rules yet. Use “Draw a level” to add one.</p> : null}
          {d.thresholds.map(t => (
            <div key={`${t.group}:${t.index}`} className="sc-lv" data-testid="sc-lv">
              <span className={`x-tag ${t.group === 'long' ? 'x-tag--g' : t.group === 'short' ? 'x-tag--r' : ''}`}>{GROUP_TEXT[t.group]}</span>
              <span>{t.label} {OPS[t.operator]}</span>
              {t.mirrored ? <span className="m">{fmtAxis(t.value, 1)} <span className="x-muted">mirrors long</span></span> : (
                <>
                  <input className="x-input m sc-lv-in" type="number" step="any" defaultValue={t.value} key={t.value} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== t.value) setThreshold(t, v); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={`${GROUP_TEXT[t.group]} ${t.label} value`} data-testid={`sc-lv-in-${t.group}-${t.index}`} />
                  <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => removeThreshold(t)} aria-label={`Remove ${GROUP_TEXT[t.group]} rule ${t.label} ${OPS[t.operator]} ${t.value}`} data-testid={`sc-lv-rm-${t.group}-${t.index}`}>Remove</button>
                </>
              )}
            </div>
          ))}
          {d.risk && (d.risk.stop != null || d.risk.target != null) && <p className="x-muted sc-lv-n">Stop and target are shown for a {d.risk.side} opened at the last close ({fmtPrice(d.risk.entry)}). Dragging them changes the {spec.risk.stopLoss?.mode === 'atr' ? 'ATR multiple' : 'distance'} every trade uses.</p>}
        </div>
      )}
    </section>
  );
}
