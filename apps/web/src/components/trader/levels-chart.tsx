'use client';

// Recent candles for the analysed symbol with the call's levels drawn on top:
// violet entry zone, red stop, green targets. Real market data only — if the
// candles can't be fetched the chart simply doesn't render.
import { useEffect, useState } from 'react';
import { marketApi, type Candle } from '@/lib/market-api';
import type { TraderAnalysis } from '@/lib/trader-api';
import { formatMacroNumber } from '@/lib/macro-format';

export default function LevelsChart({ a }: { a: TraderAnalysis }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const tf = a.timeframes[0] ?? '1h';
  useEffect(() => {
    let alive = true;
    setCandles(null);
    marketApi.candles({ symbol: a.symbol, tf, limit: 90 })
      .then(r => { if (alive) setCandles(r.candles.length > 5 ? r.candles : []); })
      .catch(() => { if (alive) setCandles([]); });
    return () => { alive = false; };
  }, [a.symbol, tf]);

  if (candles === null) return <div className="skel d-sk lv-sk" />;
  if (candles.length === 0) return null;

  const W = 1000, H = 300, PR = 74;
  const levels = [a.stop, a.entryLow, a.entryHigh, a.t1, a.t2];
  const lo = Math.min(...candles.map(c => c.low), ...levels), hi = Math.max(...candles.map(c => c.high), ...levels);
  const pad = (hi - lo) * 0.06;
  const y = (v: number) => 8 + (1 - (v - (lo - pad)) / (hi - lo + pad * 2)) * (H - 16);
  const slot = (W - PR) / candles.length, cw = Math.max(2, slot * 0.58);
  const line = (v: number, col: string, dash = '5 5') => <line x1={0} x2={W - PR} y1={y(v)} y2={y(v)} stroke={col} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
  const tag = (v: number, label: string, cls: string) => (
    <span className={`lv-tag ${cls}`} style={{ top: `${(y(v) / H) * 100}%` }}>{label} {formatMacroNumber(v)}</span>
  );
  return (
    <div className="lv" role="img" aria-label={`${a.symbol} ${tf} candles with entry, stop and targets`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W - PR} y1={H * f} y2={H * f} stroke="#EDECF0" vectorEffect="non-scaling-stroke" />)}
        <rect x={0} y={y(Math.max(a.entryLow, a.entryHigh))} width={W - PR} height={Math.max(2, Math.abs(y(a.entryLow) - y(a.entryHigh)))} fill="#EEEAFF" opacity={0.8} />
        {candles.map((c, i) => {
          const up = c.close >= c.open, col = up ? '#19C37D' : '#F4435E', x = slot * i + slot / 2;
          const t = y(Math.max(c.open, c.close)), b = y(Math.min(c.open, c.close));
          return <g key={i} className="tc-c" style={{ animationDelay: `${Math.min(i * 5, 400)}ms` }}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
            <rect x={x - cw / 2} y={t} width={cw} height={Math.max(b - t, 1.2)} rx={1} fill={col} />
          </g>;
        })}
        {line(a.stop, '#F4435E')}
        {line(a.t1, '#19C37D')}
        {line(a.t2, '#19C37D', '2 5')}
      </svg>
      {tag(a.stop, 'Stop', 'r')}
      {tag((a.entryLow + a.entryHigh) / 2, 'Entry', 'v')}
      {tag(a.t1, 'T1', 'g')}
      {tag(a.t2, 'T2', 'g')}
    </div>
  );
}
