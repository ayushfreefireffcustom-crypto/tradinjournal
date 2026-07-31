'use client';

// The replay chart. When REAL candles are available (crypto via Binance, broker
// symbols via the MT5 bridge) it draws them; otherwise it falls back to a
// deterministic synthetic OHLC walk anchored to the trade's entry/exit fills.
// Either way it's drawn TradingView-style: a shaded position zone between entry
// and exit, floating price pills on the right axis, and direction-aware markers.
import { useMemo } from 'react';
import type { Trade } from '@/lib/api';
import type { Candle } from '@/lib/market-api';

// Broker symbols carry suffixes (AUDCAD.z, GOLD.i#), so name-matching alone is
// brittle. Decimals and pip size are derived from the price magnitude, which
// works for any suffix: FX majors ~1.08, JPY ~150, gold ~2400, indices/BTC big.
export function decimals(symbol: string, price?: number | null): number {
  if (symbol.includes('JPY')) return 3;
  if (price != null) {
    const a = Math.abs(price);
    if (a >= 5000) return 1; // indices, BTC
    if (a >= 20) return 2;   // gold, silver, small indices
  }
  return 5; // FX majors
}
export function fmtPrice(symbol: string, v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(decimals(symbol, v));
}
export function pipSize(symbol: string, price?: number | null): number {
  if (symbol.includes('JPY')) return 0.01;
  if (price != null) {
    const a = Math.abs(price);
    if (a >= 5000) return 1;   // indices, BTC: one point
    if (a >= 20) return 0.1;   // gold
  }
  return 0.0001; // FX majors
}
/** Signed favourable move in pips (positive = trade moved your way). */
export function pipMove(trade: Trade): number {
  const exit = trade.exitPrice ?? trade.entryPrice;
  const signed = (exit - trade.entryPrice) * (trade.direction === 'LONG' ? 1 : -1);
  return signed / pipSize(trade.symbol, trade.entryPrice);
}

function buildCandles(trade: Trade | null, n = 72) {
  if (!trade) return { candles: [] as { o: number; h: number; l: number; c: number }[], entryIdx: 0, exitIdx: 0, min: 0, max: 1 };
  const seed = parseInt(trade.positionId, 10) || 1;
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s >>> 0) / 4294967296; };

  const baseVol = trade.symbol === 'XAUUSD' ? 0.4
    : trade.symbol === 'BTCUSD' ? 80
    : trade.symbol.includes('JPY') ? 0.08
    : trade.symbol.includes('100') || trade.symbol.includes('30') ? 18
    : 0.0008;

  const entryIdx = Math.floor(n * 0.22);
  const exitIdx = Math.floor(n * 0.68);
  const entry = trade.entryPrice;
  const exit = trade.exitPrice ?? entry;

  let price = entry - (rand() - 0.3) * baseVol * 14;
  const candles: { o: number; h: number; l: number; c: number }[] = [];
  const drift = (exit - price) / (exitIdx - 0);
  for (let i = 0; i < n; i++) {
    const o = price;
    const noise = (rand() - 0.5) * baseVol * 3;
    const d = i <= exitIdx ? drift : (rand() - 0.5) * baseVol * 2;
    price = price + d + noise;
    const c = price;
    const h = Math.max(o, c) + Math.abs(noise) * 0.6;
    const l = Math.min(o, c) - Math.abs(noise) * 0.6;
    candles.push({ o, h, l, c });
  }
  candles[entryIdx]!.c = entry;
  candles[exitIdx]!.c = exit;

  const min = Math.min(...candles.map(c => c.l));
  const max = Math.max(...candles.map(c => c.h));
  return { candles, entryIdx, exitIdx, min, max };
}

// Map real OHLC bars into the renderer's shape, aligning entry/exit to the bars
// nearest the trade's open/close times.
function candlesFromReal(trade: Trade, real: Candle[]) {
  const candles = real.map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close }));
  const openMs = new Date(trade.openTime).getTime();
  const closeMs = trade.closeTime ? new Date(trade.closeTime).getTime() : openMs;
  const nearest = (t: number) => {
    let best = 0;
    let bestD = Infinity;
    real.forEach((c, i) => {
      const d = Math.abs(c.openTime - t);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const min = Math.min(...candles.map(c => c.l));
  const max = Math.max(...candles.map(c => c.h));
  return { candles, entryIdx: nearest(openMs), exitIdx: nearest(closeMs), min, max };
}

export function TradeChart({ trade, realCandles }: { trade: Trade | null; realCandles?: Candle[] }) {
  const { candles, entryIdx, exitIdx, min, max } = useMemo(
    () => (trade && realCandles && realCandles.length >= 2 ? candlesFromReal(trade, realCandles) : buildCandles(trade, 72)),
    [trade, realCandles],
  );
  if (!trade || candles.length === 0) {
    return <div className="flex items-center justify-center h-full text-fg-3 text-[12px]">Select a position to replay</div>;
  }
  const W = 920, H = 460;
  const PAD = { top: 22, right: 78, bottom: 24, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const span = (max - min) * 1.06 || 1;
  const mid = (max + min) / 2;
  const lo = mid - span / 2;
  const gap = 2.4;
  const cw = (innerW - gap * (candles.length - 1)) / candles.length;
  const toX = (i: number) => PAD.left + i * (cw + gap);
  const toY = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH;

  const win = trade.netPnl >= 0;
  const resultColor = win ? '#08C465' : '#FE3A31';
  const dirColor = trade.direction === 'LONG' ? '#08C465' : '#FE3A31';
  const entryY = toY(trade.entryPrice);
  const exitY = toY(trade.exitPrice ?? trade.entryPrice);
  const zoneX = toX(entryIdx) + cw / 2;
  const zoneW = toX(exitIdx) + cw / 2 - zoneX;

  // When entry and exit are close (scalps), their axis pills would overlap — nudge
  // the two boxes apart while keeping each guide line on its true price.
  let entryPillY = entryY;
  let exitPillY = exitY;
  if (Math.abs(entryY - exitY) < 18) {
    const m = (entryY + exitY) / 2;
    const above = entryY <= exitY ? entryY : exitY;
    entryPillY = entryY === above ? m - 10 : m + 10;
    exitPillY = exitY === above ? m - 10 : m + 10;
  }

  const Pill = ({ lineY, boxY, price, color, label }: { lineY: number; boxY: number; price: number; color: string; label: string }) => (
    <g>
      <line x1={PAD.left} x2={W - PAD.right} y1={lineY} y2={lineY} stroke={color} strokeDasharray="3 3" opacity="0.55" strokeWidth="1" />
      {Math.abs(boxY - lineY) > 1 && <line x1={W - PAD.right} x2={W - PAD.right + 2} y1={lineY} y2={boxY} stroke={color} strokeWidth="1" opacity="0.55" />}
      <rect x={W - PAD.right + 2} y={boxY - 8} width={PAD.right - 6} height={16} rx="2" fill={color} />
      <text x={W - PAD.right + 6} y={boxY - 1} fontSize="7.5" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }} fill="#000" opacity="0.65">{label}</text>
      <text x={W - PAD.right + 6} y={boxY + 7} fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#000" fontWeight="700">{fmtPrice(trade.symbol, price)}</text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" data-testid="candle-chart">
      <defs>
        <pattern id="grid" width="64" height="56" patternUnits="userSpaceOnUse">
          <path d="M 64 0 L 0 0 0 56" fill="none" stroke="#181818" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />

      {/* held-region band */}
      <rect x={zoneX} y={PAD.top} width={zoneW} height={innerH} fill="#FFFFFF" opacity="0.025" />
      {/* position P&L zone (entry→exit price band over the hold) */}
      <rect
        x={zoneX}
        y={Math.min(entryY, exitY)}
        width={zoneW}
        height={Math.max(1, Math.abs(exitY - entryY))}
        fill={resultColor}
        opacity="0.12"
      />

      {/* y grid ticks */}
      {Array.from({ length: 5 }).map((_, i) => {
        const v = lo + (span * i) / 4;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} stroke="#161616" strokeDasharray="2 5" />
            <text x={W - PAD.right + 6} y={toY(v) + 3} fontSize="8.5" style={{ fontFamily: 'var(--font-mono)' }} fill="#52525B">{fmtPrice(trade.symbol, v)}</text>
          </g>
        );
      })}

      {/* candles */}
      {candles.map((cd, i) => {
        const up = cd.c >= cd.o;
        const inHold = i >= entryIdx && i <= exitIdx;
        const color = up ? '#08C465' : '#FE3A31';
        const x = toX(i);
        const top = Math.min(toY(cd.o), toY(cd.c));
        const bot = Math.max(toY(cd.o), toY(cd.c));
        return (
          <g key={i} opacity={inHold ? 1 : 0.5}>
            <line x1={x + cw / 2} x2={x + cw / 2} y1={toY(cd.h)} y2={toY(cd.l)} stroke={color} strokeWidth="1" />
            <rect x={x} y={top} width={cw} height={Math.max(1, bot - top)} fill={color} />
          </g>
        );
      })}

      {/* entry / exit price pills */}
      <Pill lineY={entryY} boxY={entryPillY} price={trade.entryPrice} color="#E4E4E7" label="ENTRY" />
      <Pill lineY={exitY} boxY={exitPillY} price={trade.exitPrice ?? trade.entryPrice} color={resultColor} label="EXIT" />

      {/* entry marker (direction-aware triangle) */}
      <g transform={`translate(${zoneX}, ${entryY})`}>
        {trade.direction === 'LONG'
          ? <polygon points="-5,5 5,5 0,-4" fill={dirColor} />
          : <polygon points="-5,-5 5,-5 0,4" fill={dirColor} />}
        <circle cx="0" cy="0" r="8" fill="none" stroke={dirColor} strokeWidth="1" opacity="0.5" />
      </g>
      {/* exit marker */}
      <g transform={`translate(${toX(exitIdx) + cw / 2}, ${exitY})`}>
        <circle cx="0" cy="0" r="3.2" fill={resultColor} />
        <circle cx="0" cy="0" r="8" fill="none" stroke={resultColor} strokeWidth="1" opacity="0.5" />
      </g>
    </svg>
  );
}
