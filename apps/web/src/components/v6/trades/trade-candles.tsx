'use client';

// Candle chart for one position on the v6 tokens: held zone, entry/exit guides
// and pills, a price axis, and a hover crosshair with OHLC. Measures its box so
// strokes and labels stay crisp. Real candles when the market API has the
// window, otherwise the deterministic illustrative path (the caller labels it).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/api';
import type { Candle } from '@/lib/market-api';
import { candlesFromReal } from '@/components/replay/trade-chart';
import { synthCandles } from '@/lib/use-trade-candles';
import { fmtUsd } from '@/lib/dashboard-v6';
import { fmtPrice } from '@/lib/desk';
import '@/styles/v6/trades.css';

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

export function TradeCandles({ trade, real }: { trade: Trade; real?: Candle[] | null }) {
  const [ref, { w: W, h: H }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { candles, entryIdx, exitIdx, min, max } = useMemo(
    () => (real && real.length >= 2 ? candlesFromReal(trade, real) : synthCandles(trade, 72)),
    [trade, real],
  );
  const times = useMemo(() => (real && real.length >= 2 ? real.map(c => c.openTime) : null), [real]);

  const AX = W < 520 ? 0 : 64;          // right gutter for the price axis
  const PT = 28, PB = times ? 26 : 12;
  const plotW = Math.max(1, W - AX);
  const span = (max - min) * 1.1 || 1;
  const lo = (max + min) / 2 - span / 2;
  const n = candles.length;
  const slot = plotW / n;
  const cw = Math.max(1.5, Math.min(14, slot * 0.6));
  const cx = (i: number) => slot * i + slot / 2;
  const y = (v: number) => PT + (H - PT - PB) - ((v - lo) / span) * (H - PT - PB);

  const open = trade.status === 'OPEN';
  const exitPx = trade.exitPrice ?? trade.entryPrice;
  const ey = y(trade.entryPrice), xy = y(exitPx);
  const zx = cx(entryIdx);
  const win = trade.netPnl >= 0;
  const ticks = [0.15, 0.38, 0.62, 0.85].map(f => lo + span * f);
  const timeTicks = times ? [0.12, 0.37, 0.62, 0.87].map(f => Math.min(n - 1, Math.round(f * (n - 1)))) : [];
  const fmtT = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const x = e.clientX - r.left;
    setHover(x > plotW ? null : Math.max(0, Math.min(n - 1, Math.floor((x / plotW) * n))));
  };
  const hc = hover != null ? candles[hover] : null;
  const pctX = (x: number) => `${(x / (W || 1)) * 100}%`;
  // Pills sit above their marker unless that would leave the chart, and never on top of each other.
  const entryUp = ey > 50;
  const exitUp = open ? true : (Math.abs(xy - ey) < 30 && Math.abs(cx(exitIdx) - zx) < 160 ? !entryUp : xy > 50);

  return (
    <div ref={ref} className="tr-chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
      role="img" aria-label={`${trade.symbol} ${trade.direction.toLowerCase()} from ${fmtPrice(trade.entryPrice, exitPx)} to ${fmtPrice(exitPx, trade.entryPrice)}`} data-testid="candle-chart">
      {W > 0 && H > 0 && (
        <>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            {ticks.map(v => (
              <g key={v}>
                <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
                {AX > 0 && <text x={W} y={y(v) + 3.5} textAnchor="end" fill="var(--axis)" fontSize="10.5" fontFamily="var(--mono)">{fmtPrice(v, trade.entryPrice)}</text>}
              </g>
            ))}
            {timeTicks.map(i => <text key={i} x={cx(i)} y={H - 6} textAnchor="middle" fill="var(--axis)" fontSize="10.5" fontFamily="var(--sans)">{fmtT(times![i]!)}</text>)}
            <line x1={zx} x2={plotW} y1={ey} y2={ey} stroke="var(--tx)" strokeOpacity={0.55} strokeDasharray="4 4" />
            {!open && <line x1={cx(exitIdx)} x2={plotW} y1={xy} y2={xy} stroke={win ? 'var(--g)' : 'var(--r)'} strokeDasharray="4 4" />}
            {candles.map((c, i) => {
              const up = c.c >= c.o, col = up ? 'var(--g)' : 'var(--r)';
              const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
              return (
                <g key={i} opacity={hover != null && hover !== i ? 0.5 : 1}>
                  <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
                  <rect x={cx(i) - cw / 2} y={top} width={cw} height={Math.max(bot - top, 1)} rx={1} fill={col} />
                </g>
              );
            })}
            {hover != null && <line x1={cx(hover)} x2={cx(hover)} y1={PT - 8} y2={H - PB} stroke="var(--line-2)" />}
            <circle cx={zx} cy={ey} r={5} fill="var(--tx)" stroke="var(--s1)" strokeWidth={2.5} />
            {!open && <circle cx={cx(exitIdx)} cy={xy} r={5} fill={win ? 'var(--g)' : 'var(--r)'} stroke="var(--s1)" strokeWidth={2.5} />}
          </svg>
          <span className={`tr-pill ${entryUp ? '' : 'dn'}`} style={{ left: pctX(Math.max(60, Math.min(zx, W - 60))), top: ey }}>Entry {fmtPrice(trade.entryPrice, exitPx)}</span>
          {!open && <span className={`tr-pill ${win ? 'g' : 'r'} ${exitUp ? '' : 'dn'}`} style={{ left: pctX(Math.max(60, Math.min(cx(exitIdx), W - 70))), top: xy }}>Exit · {fmtUsd(trade.netPnl)}</span>}
          {hc && (
            <div className="tr-ohlc">
              {times && hover != null && <span>{fmtT(times[hover]!)}</span>}
              <span>O <b>{fmtPrice(hc.o, trade.entryPrice)}</b></span><span>H <b>{fmtPrice(hc.h, trade.entryPrice)}</b></span>
              <span>L <b>{fmtPrice(hc.l, trade.entryPrice)}</b></span><span>C <b className={hc.c >= hc.o ? 'pos' : 'neg'}>{fmtPrice(hc.c, trade.entryPrice)}</b></span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
