'use client';

// Recent candles for the analysed symbol with the call's levels drawn on top:
// entry zone band, red stop, green targets. Real market data only: if the
// candles can't be fetched the chart simply doesn't render. The SVG is drawn
// at the container's measured size so labels stay crisp at every width.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { marketApi, type Candle } from '@/lib/market-api';
import type { TraderAnalysis } from '@/lib/trader-api';
import { formatMacroNumber } from '@/lib/macro-format';

const MONO = { fontFamily: 'var(--mono)' } as const;

function useSize<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return [ref, size] as const;
}

const when = (ms: number, tf: string) => {
  const d = new Date(ms);
  return tf === '1d'
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function LevelsChart({ a }: { a: TraderAnalysis }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const tf = a.timeframes[0] ?? '1h';
  const [ref, { w, h }] = useSize<HTMLDivElement>(!!candles && candles.length > 0);
  useEffect(() => {
    let alive = true;
    setCandles(null);
    marketApi.candles({ symbol: a.symbol, tf, limit: 90 })
      .then(r => { if (alive) setCandles(r.candles.length > 5 ? r.candles : []); })
      .catch(() => { if (alive) setCandles([]); });
    return () => { alive = false; };
  }, [a.symbol, tf]);

  if (candles === null) return <i className="x-skel x-skel--in ai-chart-sk" aria-hidden />;
  if (candles.length === 0) return null;

  // Fewer candles on narrow screens so bodies stay readable.
  const shown = w > 0 && w < 520 ? candles.slice(-48) : candles;
  const PR = 78, B = 20, T = 8;
  const levels = [a.stop, a.entryLow, a.entryHigh, a.t1, a.t2];
  const lo = Math.min(...shown.map(c => c.low), ...levels), hi = Math.max(...shown.map(c => c.high), ...levels);
  const pad = (hi - lo) * 0.06 || 1;
  const plotW = Math.max(0, w - PR), plotH = Math.max(0, h - B - T);
  const y = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + pad * 2)) * plotH;
  const slot = plotW / shown.length, cw = Math.max(1.5, Math.min(9, slot * 0.6));
  const zoneTop = y(Math.max(a.entryLow, a.entryHigh)), zoneH = Math.max(2, Math.abs(y(a.entryLow) - y(a.entryHigh)));

  // Right-gutter level labels, nudged apart so they never overlap.
  const tags = [
    { v: a.t2, l: 'T2', c: 'var(--g)' }, { v: a.t1, l: 'T1', c: 'var(--g)' },
    { v: (a.entryLow + a.entryHigh) / 2, l: 'Entry', c: 'var(--tx)' }, { v: a.stop, l: 'Stop', c: 'var(--r)' },
  ].map(t => ({ ...t, y: y(t.v) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < tags.length; i++) if (tags[i]!.y - tags[i - 1]!.y < 15) tags[i]!.y = tags[i - 1]!.y + 15;
  const over = tags.length ? tags[tags.length - 1]!.y - (h - B - 2) : 0;
  if (over > 0) for (const t of tags) t.y -= over;

  const xTicks = w > 520 ? [0, 0.33, 0.66, 1] : [0, 1];
  const hc = hover != null ? shown[hover] : null;
  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left) / slot);
    setHover(i >= 0 && i < shown.length ? i : null);
  };

  return (
    <div className="ai-chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}
      role="img" aria-label={`${a.symbol} ${tf} candles with entry, stop and targets`}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={0} x2={plotW} y1={T + plotH * f} y2={T + plotH * f} stroke="var(--grid)" />)}
          <rect x={0} y={zoneTop} width={plotW} height={zoneH} fill="var(--tx)" opacity=".07" />
          {shown.map((c, i) => {
            const col = c.close >= c.open ? 'var(--g)' : 'var(--r)', x = slot * i + slot / 2;
            const t = y(Math.max(c.open, c.close)), b = y(Math.min(c.open, c.close));
            return (
              <g key={c.openTime ?? i} opacity={hover != null && hover !== i ? 0.55 : 1}>
                <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1.2} />
                <rect x={x - cw / 2} y={t} width={cw} height={Math.max(b - t, 1.2)} rx={1} fill={col} />
              </g>
            );
          })}
          <line x1={0} x2={plotW} y1={y(a.stop)} y2={y(a.stop)} stroke="var(--r)" strokeDasharray="5 5" />
          <line x1={0} x2={plotW} y1={y(a.t1)} y2={y(a.t1)} stroke="var(--g)" strokeDasharray="5 5" />
          <line x1={0} x2={plotW} y1={y(a.t2)} y2={y(a.t2)} stroke="var(--g)" strokeDasharray="2 5" />
          {tags.map(t => (
            <g key={t.l}>
              <text x={plotW + 8} y={t.y + 3.5} fontSize="10.5" fill={t.c}>{t.l}</text>
              <text x={w} y={t.y + 3.5} fontSize="10.5" fill="var(--axis)" textAnchor="end" style={MONO}>{formatMacroNumber(t.v)}</text>
            </g>
          ))}
          {xTicks.map((f, k) => {
            const i = Math.round(f * (shown.length - 1));
            return <text key={k} x={slot * i + slot / 2} y={h - 4} fontSize="10.5" fill="var(--axis)" textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}>{when(shown[i]!.openTime, tf)}</text>;
          })}
          {hover != null && <line x1={slot * hover + slot / 2} x2={slot * hover + slot / 2} y1={T} y2={T + plotH} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />}
        </svg>
      )}
      {hc && hover != null && (
        <div className="ai-tip" style={{ left: Math.min(Math.max(slot * hover + 14, 0), Math.max(0, plotW - 140)), top: 10 }}>
          <span>{when(hc.openTime, tf)}</span>
          <b>O {formatMacroNumber(hc.open)} · C {formatMacroNumber(hc.close)}</b>
          <span>H {formatMacroNumber(hc.high)} · L {formatMacroNumber(hc.low)}</span>
        </div>
      )}
    </div>
  );
}
