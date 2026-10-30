'use client';

// Candle replay for one position, drawn in pixels so labels stay crisp at any
// width: held zone shaded by result, entry/exit guides with axis pills,
// direction-aware markers and a hover crosshair with OHLC. Real candles when the
// market API covers the window, otherwise the seeded illustrative path.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/api';
import type { Candle } from '@/lib/market-api';
import { candlesFromReal } from '@/components/replay/trade-chart';
import { synthCandles } from '@/components/v3/trade-candles';
import { fmtPrice } from '@/lib/desk';

const MONO = { fontFamily: 'var(--mono)' } as const;

function useSize<T extends HTMLElement>() {
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
  }, []);
  return [ref, size] as const;
}

const tickTime = (ms: number, spanMs: number) => new Date(ms).toLocaleString('en-US', spanMs > 3 * 86400_000
  ? { month: 'short', day: 'numeric' }
  : { hour: '2-digit', minute: '2-digit', hour12: false });

export function ReplayChart({ trade, real }: { trade: Trade; real?: Candle[] | null }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const live = !!real && real.length >= 2;
  const { candles, entryIdx, exitIdx, min, max } = useMemo(
    () => (live ? candlesFromReal(trade, real!) : synthCandles(trade, 72)),
    [trade, real, live],
  );
  const times = live ? real!.map(c => c.openTime) : null;

  const exitPx = trade.exitPrice ?? trade.entryPrice;
  const open = trade.status === 'OPEN';
  const win = trade.netPnl > 0;
  const res = win ? 'var(--g)' : 'var(--r)';
  const dir = trade.direction === 'LONG' ? 'var(--g)' : 'var(--r)';
  const pref = trade.entryPrice;
  const label = `${trade.symbol} ${trade.direction.toLowerCase()} from ${fmtPrice(trade.entryPrice, pref)} to ${fmtPrice(exitPx, pref)}`;

  // Right gutter fits the longest price label (mono, ~6.4px per char at 10.5px).
  const chars = Math.max(...[min, max, trade.entryPrice, exitPx].map(v => fmtPrice(v, pref).length));
  const R = Math.ceil(chars * 6.4 + 24), L = 4, T = 14, B = times ? 26 : 12;
  const pw = Math.max(1, w - L - R), ph = Math.max(1, h - T - B);
  const lo0 = Math.min(min, trade.entryPrice, exitPx), hi0 = Math.max(max, trade.entryPrice, exitPx);
  const pad = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.001 || 1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const n = candles.length;
  const slot = pw / n;
  const bw = Math.max(1.5, Math.min(slot * 0.62, 14));
  const cx = (i: number) => L + slot * i + slot / 2;
  const Y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph;

  const ey = Y(trade.entryPrice), xy = Y(exitPx);
  const zx = cx(entryIdx), zx2 = cx(exitIdx);
  // Axis pills: keep both readable when the fills sit close together.
  let ep = ey, xp = xy;
  if (!open && Math.abs(ey - xy) < 22) {
    const m = (ey + xy) / 2, up = ey <= xy;
    ep = up ? m - 11 : m + 11; xp = up ? m + 11 : m - 11;
  }
  const ticks = [0.12, 0.37, 0.63, 0.88].map(f => lo + (hi - lo) * f);
  const nearPill = (v: number) => Math.abs(Y(v) - ep) < 16 || (!open && Math.abs(Y(v) - xp) < 16);
  const timeTicks = times && w > 0 ? (w > 560 ? [0.08, 0.36, 0.64, 0.92] : [0.12, 0.88]).map(f => Math.round(f * (n - 1))) : [];
  const spanMs = times ? times[n - 1]! - times[0]! : 0;

  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - box.left - L) / slot);
    setHover(i >= 0 && i < n ? i : null);
  };
  const hc = hover != null ? candles[hover] : null;

  return (
    <div className="jn-chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={label} data-testid="candle-chart">
      {w > 0 && h > 0 && (
        <svg width={w} height={h} aria-hidden>
          {ticks.map(v => (
            <g key={v}>
              <line x1={L} x2={L + pw} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              {!nearPill(v) && <text x={L + pw + 10} y={Y(v) + 3.5} fontSize="10.5" fill="var(--axis)" style={MONO}>{fmtPrice(v, pref)}</text>}
            </g>
          ))}
          {timeTicks.map((i, k) => (
            <text key={k} x={cx(i)} y={h - 6} fontSize="10.5" fill="var(--axis)" textAnchor="middle">{tickTime(times![i]!, spanMs)}</text>
          ))}
          <rect x={zx} y={T} width={Math.max(zx2 - zx, slot)} height={ph} fill="var(--tx)" opacity=".035" />
          {!open && (
            <rect x={zx} y={Math.min(ey, xy)} width={Math.max(zx2 - zx, slot)} height={Math.max(Math.abs(ey - xy), 2)} fill={res} opacity=".14" />
          )}
          {hover != null && <line x1={cx(hover)} x2={cx(hover)} y1={T} y2={T + ph} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />}
          {candles.map((c, i) => {
            const up = c.c >= c.o, col = up ? 'var(--g)' : 'var(--r)';
            const top = Y(Math.max(c.o, c.c)), bot = Y(Math.min(c.o, c.c));
            const held = i >= entryIdx && i <= exitIdx;
            const op = hover != null ? (hover === i ? 1 : 0.5) : held ? 1 : 0.45;
            return (
              <g key={i} opacity={op}>
                <line x1={cx(i)} x2={cx(i)} y1={Y(c.h)} y2={Y(c.l)} stroke={col} strokeWidth="1" />
                <rect x={cx(i) - bw / 2} y={top} width={bw} height={Math.max(bot - top, 1)} rx={bw > 4 ? 1 : 0} fill={col} />
              </g>
            );
          })}
          <line x1={zx} x2={L + pw} y1={ey} y2={ey} stroke="var(--mut)" strokeDasharray="4 4" />
          {!open && <line x1={zx2} x2={L + pw} y1={xy} y2={xy} stroke={res} strokeDasharray="4 4" />}

          <g transform={`translate(${zx} ${ey})`}>
            <circle r="9" fill="var(--s1)" stroke={dir} strokeOpacity=".5" />
            {trade.direction === 'LONG' ? <path d="M-4.5 3 4.5 3 0 -4z" fill={dir} /> : <path d="M-4.5 -3 4.5 -3 0 4z" fill={dir} />}
          </g>
          {!open && (
            <g transform={`translate(${zx2} ${xy})`}>
              <circle r="9" fill="none" stroke={res} strokeOpacity=".5" />
              <circle r="4" fill={res} />
            </g>
          )}

          <g transform={`translate(${L + pw + 4} ${ep})`}>
            <rect x="0" y="-10" width={R - 6} height="20" rx="6" fill="var(--hi)" />
            <text x="7" y="3.8" fontSize="10.5" fill="var(--inv)" style={MONO}>{fmtPrice(trade.entryPrice, pref)}</text>
          </g>
          {!open && (
            <g transform={`translate(${L + pw + 4} ${xp})`}>
              <rect x="0" y="-10" width={R - 6} height="20" rx="6" fill={res} />
              <text x="7" y="3.8" fontSize="10.5" fill="var(--on-g)" style={MONO}>{fmtPrice(exitPx, pref)}</text>
            </g>
          )}
        </svg>
      )}
      {w > 0 && (
        <>
          <span className="jn-mark" style={{ left: zx, top: ey + (ey > T + 30 ? -30 : 14) }}>Entry</span>
          {!open && <span className="jn-mark" style={{ left: zx2, top: xy + (xy > T + 30 ? -30 : 14) }}>Exit</span>}
        </>
      )}
      {hc && hover != null && (
        <div className="jn-tip" style={{ left: Math.min(Math.max(cx(hover) + 12, 0), Math.max(0, w - 168)), top: 8 }}>
          {times && <span>{new Date(times[hover]!).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
          <div className="m">
            <span>O <b>{fmtPrice(hc.o, pref)}</b></span><span>H <b>{fmtPrice(hc.h, pref)}</b></span>
            <span>L <b>{fmtPrice(hc.l, pref)}</b></span><span>C <b className={hc.c >= hc.o ? 'pos' : 'neg'}>{fmtPrice(hc.c, pref)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
