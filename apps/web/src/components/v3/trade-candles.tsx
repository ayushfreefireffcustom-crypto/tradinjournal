'use client';

// Light candle chart for a single position: held zone, entry/exit guides and
// pills, hover crosshair with OHLC. Uses real candles when the market API has
// the window; otherwise a deterministic path anchored to the fills, which is
// labelled as illustrative by the caller.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/api';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { candlesFromReal } from '@/components/replay/trade-chart';
import { money, price as fmtPx } from './format';

const TF_SECONDS: [MarketTimeframe, number][] = [
  ['1m', 60], ['5m', 300], ['15m', 900], ['30m', 1800], ['1h', 3600], ['4h', 14400], ['1d', 86400], ['1w', 604800], ['1M', 2592000],
];
function chooseTf(windowSec: number): MarketTimeframe {
  for (const [tf, s] of TF_SECONDS) if (windowSec / s <= 400) return tf;
  return '1M';
}
/** Padded from/to (epoch seconds) + timeframe for a trade's chart window. */
export function tradeWindow(trade: Trade): { from: number; to: number; tf: MarketTimeframe } {
  const openSec = Math.floor(new Date(trade.openTime).getTime() / 1000);
  const closeSec = trade.closeTime ? Math.floor(new Date(trade.closeTime).getTime() / 1000) : openSec + 3600;
  const d = Math.max(closeSec - openSec, 300);
  const pad = Math.round(d * 0.4);
  return { from: openSec - pad, to: closeSec + pad, tf: chooseTf(closeSec - openSec + pad * 2) };
}

/** Real candles for the trade window, or null when no provider covers it. */
export function useTradeCandles(trade: Trade | null, accountId?: string) {
  const [state, setState] = useState<{ id: string | null; candles: Candle[] | null; loading: boolean }>({ id: null, candles: null, loading: false });
  useEffect(() => {
    if (!trade) { setState({ id: null, candles: null, loading: false }); return; }
    let alive = true;
    setState({ id: trade.positionId, candles: null, loading: true });
    const { from, to, tf } = tradeWindow(trade);
    marketApi.candles({ symbol: trade.symbol, tf, from, to, limit: 500, accountId })
      .then(r => { if (alive) setState({ id: trade.positionId, candles: r.candles.length >= 2 ? r.candles : null, loading: false }); })
      .catch(() => { if (alive) setState({ id: trade.positionId, candles: null, loading: false }); });
    return () => { alive = false; };
  }, [trade?.positionId, trade?.symbol, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

type Bar = { o: number; h: number; l: number; c: number };
/**
 * Deterministic illustrative path (seeded by position id): a Brownian bridge
 * that closes exactly on the entry and exit fills, with a random walk either
 * side. Volatility scales with the trade's own move so scalps and swings both
 * look plausible. Never presented as market data.
 */
export function synthCandles(trade: Trade, n = 72) {
  let seed = (parseInt(trade.positionId.replace(/\D/g, '').slice(-9), 10) || 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const entry = trade.entryPrice, exit = trade.exitPrice ?? entry;
  const e = Math.round(n * 0.24), x = Math.round(n * 0.7);
  const sig = Math.max(Math.abs(exit - entry), Math.abs(entry) * 0.0012) / Math.sqrt(x - e) * 0.85;
  const p = new Array<number>(n + 1).fill(entry);
  for (let i = e - 1; i >= 0; i--) p[i] = p[i + 1]! + gauss() * sig;
  const w = [0];
  for (let i = 1; i <= x - e; i++) w.push(w[i - 1]! + gauss() * sig);
  const wEnd = w[x - e]!;
  for (let i = e; i <= x; i++) { const k = (i - e) / (x - e); p[i] = entry + (w[i - e]! - k * wEnd) + k * (exit - entry); }
  for (let i = x + 1; i <= n; i++) p[i] = p[i - 1]! + gauss() * sig;
  const candles: Bar[] = [];
  for (let i = 1; i <= n; i++) {
    const o = p[i - 1]!, c = p[i]!;
    candles.push({ o, c, h: Math.max(o, c) + Math.abs(gauss()) * sig * 0.45, l: Math.min(o, c) - Math.abs(gauss()) * sig * 0.45 });
  }
  return { candles, entryIdx: e - 1, exitIdx: x - 1, min: Math.min(...candles.map(b => b.l)), max: Math.max(...candles.map(b => b.h)) };
}

export function TradeCandles({ trade, real, height = 400 }: { trade: Trade; real?: Candle[] | null; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { candles, entryIdx, exitIdx, min, max } = useMemo(
    () => (real && real.length >= 2 ? candlesFromReal(trade, real) : synthCandles(trade, 72)),
    [trade, real],
  );
  const times = useMemo(() => (real && real.length >= 2 ? real.map(c => c.openTime) : null), [real]);

  const W = 1000, H = height, PT = 22, PB = 22;
  const span = (max - min) * 1.1 || 1;
  const lo = (max + min) / 2 - span / 2;
  const n = candles.length;
  const slot = W / n;
  const cw = Math.max(2, slot * 0.58);
  const cx = (i: number) => slot * i + slot / 2;
  const y = (v: number) => PT + (H - PT - PB) - ((v - lo) / span) * (H - PT - PB);

  const exitPx = trade.exitPrice ?? trade.entryPrice;
  const ey = y(trade.entryPrice), xy = y(exitPx);
  const zx = cx(entryIdx), zw = Math.max(cx(exitIdx) - zx, slot);
  const bandTop = Math.min(ey, xy), bandH = Math.max(Math.abs(ey - xy), 22);
  const bandY = Math.abs(ey - xy) < 22 ? (ey + xy) / 2 - 11 : bandTop;
  const open = trade.status === 'OPEN';
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };
  const hc = hover != null ? candles[hover] : null;
  const hTime = hover != null && times ? new Date(times[hover]!) : null;
  // Exit pill sits above the exit dot unless that would leave the chart.
  const exitAbove = xy > 60;

  return (
    <div ref={ref} className="tc" style={{ height }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}
      role="img" aria-label={`${trade.symbol} ${trade.direction.toLowerCase()} from ${fmtPx(trade.entryPrice)} to ${fmtPx(exitPx)}`} data-testid="candle-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.2, 0.4, 0.6, 0.8].map(f => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="#EDECF0" vectorEffect="non-scaling-stroke" />)}
        <rect className="tc-zone" x={zx} y={bandY} width={zw} height={bandH} fill="#EEEAFF" opacity={0.75} />
        <line x1={zx} x2={W} y1={ey} y2={ey} stroke="#6E4BFF" strokeDasharray="5 5" opacity={0.75} vectorEffect="non-scaling-stroke" />
        {!open && <line x1={cx(exitIdx)} x2={W} y1={xy} y2={xy} stroke="#100F17" strokeDasharray="5 5" opacity={0.8} vectorEffect="non-scaling-stroke" />}
        {candles.map((c, i) => {
          const up = c.c >= c.o, col = up ? '#19C37D' : '#F4435E';
          const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
          const dim = hover != null && hover !== i;
          return (
            <g key={i} opacity={dim ? 0.55 : 1} className="tc-c" style={{ animationDelay: `${Math.min(i * 6, 500)}ms` }}>
              <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              <rect x={cx(i) - cw / 2} y={top} width={cw} height={Math.max(bot - top, 1.2)} rx={1} fill={col} />
            </g>
          );
        })}
      </svg>
      {hover != null && <span className="tc-cross" style={{ left: pct(cx(hover), W) }} />}
      <span className="tc-dot e" style={{ left: pct(zx, W), top: pct(ey, H) }} />
      {!open && <span className="tc-dot x" style={{ left: pct(cx(exitIdx), W), top: pct(xy, H) }} />}
      <span className="tc-pill e num" style={{ left: pct(zx, W), top: pct(ey, H) }}>Entry {fmtPx(trade.entryPrice)}</span>
      {!open && <span className={`tc-pill x num ${exitAbove ? 'up' : ''}`} style={{ left: pct(cx(exitIdx), W), top: pct(xy, H) }}>Exit · {money(trade.netPnl)}</span>}
      {hc && (
        <div className="tc-ohlc num">
          {hTime && <span>{hTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
          <span>O <b>{fmtPx(hc.o)}</b></span><span>H <b>{fmtPx(hc.h)}</b></span><span>L <b>{fmtPx(hc.l)}</b></span><span>C <b className={hc.c >= hc.o ? 'lg' : 'sh'}>{fmtPx(hc.c)}</b></span>
        </div>
      )}
    </div>
  );
}
