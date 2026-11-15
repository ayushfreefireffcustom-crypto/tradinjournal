'use client';

// Compact trade chart: real candles around the trade (GET /market/candles via
// useTradeCandles), the time in the trade shaded, entry and exit marked, and
// the stop / target only when the close says one was hit. No candles → an
// empty state; never an illustrative path. Reusable: the trade-log side panel
// uses it, and the full trade review can import it.
import { useMemo } from 'react';
import type { Trade } from '@/lib/api';
import type { Candle } from '@/lib/market-api';
import { useTradeCandles } from '@/lib/use-trade-candles';
import { fmtPrice } from '@/lib/desk';
import { useWidth } from '@/components/dashboard-v2/ui';
import { ticks, toneColor } from '@/lib/dashboard-v2-format';
import { shortDate } from '@/lib/tradelog-v2-api';

export interface TradeChartTrade {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** Epoch ms. */
  openTime: number;
  closeTime: number | null;
  entry: number;
  exit: number | null;
  sl?: number | null;
  tp?: number | null;
  net: number;
}

/** Merge neighbouring candles so each one is at least `minPx` wide. */
export function fitCandles(cs: Candle[], width: number, minPx = 4): Candle[] {
  const per = Math.max(1, Math.ceil((cs.length * minPx) / Math.max(1, width)));
  if (per === 1) return cs;
  const out: Candle[] = [];
  for (let i = 0; i < cs.length; i += per) {
    const g = cs.slice(i, i + per);
    out.push({ openTime: g[0]!.openTime, open: g[0]!.open, close: g[g.length - 1]!.close, high: Math.max(...g.map(c => c.high)), low: Math.min(...g.map(c => c.low)), volume: g.reduce((a, c) => a + c.volume, 0) });
  }
  return out;
}

const hm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function TradeChart({ trade, accountId, height = 210 }: { trade: TradeChartTrade; accountId?: string; height?: number }) {
  const asTrade = useMemo(() => ({
    positionId: trade.positionId, symbol: trade.symbol,
    openTime: new Date(trade.openTime).toISOString(), closeTime: trade.closeTime ? new Date(trade.closeTime).toISOString() : null,
  }) as Trade, [trade.positionId, trade.symbol, trade.openTime, trade.closeTime]);
  const { candles, loading } = useTradeCandles(asTrade, accountId);
  const [ref, width] = useWidth<HTMLDivElement>();

  return (
    <div ref={ref} className="tl-tc" style={{ height }} data-testid="trade-chart">
      {loading ? <div className="tl-tc-msg"><i className="x-skel x-skel--in" style={{ width: '100%', height: height - 24 }} /></div>
        : !candles?.length || width < 40 ? (
          <div className="tl-tc-msg"><b>No price data for {trade.symbol}</b><span>Entry {fmtPrice(trade.entry, trade.exit)}{trade.exit != null ? ` → exit ${fmtPrice(trade.exit, trade.entry)}` : ''}</span></div>
        ) : <ChartSvg trade={trade} candles={candles} w={width} h={height} />}
    </div>
  );
}

function ChartSvg({ trade, candles, w, h }: { trade: TradeChartTrade; candles: Candle[]; w: number; h: number }) {
  const AX = 58, BOT = 20, TOP = 8;
  const pw = w - AX, ph = h - BOT - TOP;
  const cs = fitCandles(candles, pw, 5);
  const levels = [trade.entry, trade.exit, trade.sl, trade.tp].filter((v): v is number => v != null && Number.isFinite(v));
  let lo = Math.min(...cs.map(c => c.low), ...levels), hi = Math.max(...cs.map(c => c.high), ...levels);
  const padY = (hi - lo) * 0.06 || Math.abs(hi) * 0.001 || 1;
  lo -= padY; hi += padY;
  const t0 = cs[0]!.openTime, step = cs.length > 1 ? (cs[cs.length - 1]!.openTime - t0) / (cs.length - 1) : 60_000;
  const t1 = cs[cs.length - 1]!.openTime + step;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * pw;
  const y = (v: number) => TOP + (1 - (v - lo) / (hi - lo)) * ph;
  const bw = Math.max(1, Math.min(9, (pw / cs.length) * 0.62));
  // Price ticks, minus any that would sit under a level label (Entry / Exit / Stop / Target).
  const labelled = levels.map(y);
  const yt = ticks(lo, hi, 4).filter(v => v > lo && v < hi && labelled.every(ly => Math.abs(ly - y(v)) > 14));
  const xt = [0.12, 0.38, 0.64, 0.9].map(f => t0 + f * (t1 - t0));
  const multiDay = t1 - t0 > 86_400_000 * 1.5;
  const xo = x(trade.openTime), xc = trade.closeTime != null ? x(trade.closeTime) : pw;
  const tone = toneColor(trade.net, 'var(--d2-g)', 'var(--d2-r)');
  const label = (v: number, text: string, color: string) => {
    const yy = Math.max(TOP + 6, Math.min(TOP + ph - 2, y(v)));
    return <text x={pw + 6} y={yy + 4} fontSize={11} fontWeight={800} fill={color}>{text}</text>;
  };
  return (
    <svg width={w} height={h} className="d2-chart" role="img" aria-label={`${trade.symbol} price around the trade`}>
      {yt.map(v => <g key={v}><line x1={0} x2={pw} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pw + 6} y={y(v) + 4} fontSize={11} fill="var(--dim)">{fmtPrice(v, trade.entry)}</text></g>)}
      <rect x={Math.max(0, xo)} y={TOP} width={Math.max(1, Math.min(pw, xc) - Math.max(0, xo))} height={ph} fill="var(--d2-chip)" opacity={0.55} />
      {cs.map(c => {
        const up = c.close >= c.open;
        const cx = x(c.openTime) + (x(c.openTime + step) - x(c.openTime)) / 2;
        const col = up ? 'var(--d2-g)' : 'var(--d2-r)';
        return (
          <g key={c.openTime}>
            <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={col} strokeWidth={1} />
            <rect x={cx - bw / 2} y={y(Math.max(c.open, c.close))} width={bw} height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={col} />
          </g>
        );
      })}
      <line x1={Math.max(0, xo)} x2={pw} y1={y(trade.entry)} y2={y(trade.entry)} stroke="var(--mut)" strokeDasharray="4 3" />
      {trade.sl != null && <line x1={0} x2={pw} y1={y(trade.sl)} y2={y(trade.sl)} stroke="var(--d2-r)" strokeDasharray="3 3" />}
      {trade.tp != null && <line x1={0} x2={pw} y1={y(trade.tp)} y2={y(trade.tp)} stroke="var(--d2-g)" strokeDasharray="3 3" />}
      {trade.exit != null && trade.closeTime != null && <line x1={xo} y1={y(trade.entry)} x2={xc} y2={y(trade.exit)} stroke={tone} strokeWidth={1.2} strokeDasharray="1 2" />}
      <circle cx={xo} cy={y(trade.entry)} r={4.5} fill="var(--d2-card)" stroke="var(--tx)" strokeWidth={1.6} />
      {trade.exit != null && trade.closeTime != null && <circle cx={xc} cy={y(trade.exit)} r={4} fill={tone} stroke="var(--d2-card)" strokeWidth={1.2} />}
      {label(trade.entry, 'Entry', 'var(--tx)')}
      {trade.exit != null && Math.abs(y(trade.exit) - y(trade.entry)) > 13 && label(trade.exit, 'Exit', 'var(--tx)')}
      {trade.sl != null && Math.abs(y(trade.sl) - y(trade.exit ?? trade.entry)) > 13 && label(trade.sl, 'Stop', 'var(--d2-rt)')}
      {trade.tp != null && Math.abs(y(trade.tp) - y(trade.exit ?? trade.entry)) > 13 && label(trade.tp, 'Target', 'var(--d2-gt)')}
      {xt.map(t => <text key={t} x={x(t)} y={h - 5} fontSize={11} fill="var(--dim)" textAnchor="middle">{multiDay ? shortDate(t) : hm(t)}</text>)}
    </svg>
  );
}
