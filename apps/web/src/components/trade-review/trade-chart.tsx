'use client';

// The review chart: market candles around the trade (5-minute bars unless the
// trade is long), the trade's span shaded, entry and exit marked, the stop when
// it is known, the best point while open, and what price did after the exit.
// Level labels sit in a right column on wide cards and as axis tags on phones;
// both are placed with the Charts page's collision helper (label-layout).
import { useMemo, useState } from 'react';
import { useWidth, Callout, calloutW } from '@/components/dashboard-v2/ui';
import { placeTags } from '@/components/charts/label-layout';
import { money, scale, ticks } from '@/lib/dashboard-v2-format';
import { barAt, type Bar, type Excursion, type ReviewTradeDTO } from '@/lib/trade-review-api';
import type { AfterExit } from '@/components/charts/trade-math';

export interface TradeChartProps {
  trade: ReviewTradeDTO;
  bars: Bar[];
  tfMs: number;
  stop: number | null;
  exitReason: 'sl' | 'tp' | 'stopout' | null;
  excursion: Excursion | null;
  after: AfterExit | null;
  price: (v: number) => string;
  /** Show the one AI callout on the chart. */
  ai?: boolean;
}

const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dm = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function TradeChart({ trade, bars, tfMs, stop, exitReason, excursion, after, price, ai = true }: TradeChartProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const narrow = w > 0 && w < 600;
  const H = w === 0 ? 300 : w < 420 ? 280 : w < 720 ? 340 : 400;
  const open = new Date(trade.openTime).getTime();
  const close = trade.closeTime ? new Date(trade.closeTime).getTime() : null;
  const closed = trade.status === 'CLOSED' && close != null && trade.exit != null;
  const win = trade.net >= 0;

  const g = useMemo(() => {
    if (!w || bars.length < 2) return null;
    const AX = narrow ? 68 : 66, LAB = narrow ? 0 : 92;
    const PL = 4, PT = 16, PB = 22;
    const plotR = w - AX - LAB;
    const levels = [trade.entry, trade.exit, stop, excursion?.best, after && after.extra > 0 ? after.best : null].filter((v): v is number => v != null && Number.isFinite(v));
    let lo = Math.min(...bars.map(b => b.low), ...levels), hi = Math.max(...bars.map(b => b.high), ...levels);
    const pad = (hi - lo) * 0.07 || Math.abs(hi) * 0.001 || 1;
    lo -= pad; hi += pad;
    const bw = (plotR - PL) / bars.length;
    const X = (i: number) => PL + i * bw + bw / 2;
    const Y = scale(lo, hi, H - PB, PT);
    const ei = Math.max(0, barAt(bars, open));
    const xi = close != null ? Math.max(ei, barAt(bars, close)) : bars.length - 1;
    const tk = ticks(lo, hi, H < 320 ? 4 : 6).filter(v => v > lo && v < hi);
    // Axis ticks are round numbers: only as many decimals as their step needs.
    const step = tk.length > 1 ? Math.abs(tk[1]! - tk[0]!) : 1;
    const tdec = Math.max(0, Math.min(5, Math.ceil(-Math.log10(step) + 1e-9)));
    const tfmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: tdec, maximumFractionDigits: tdec });
    // Level labels: entry, exit, stop. Wide: two-line labels in the right column; narrow: axis tags.
    const lv: Array<{ id: string; y: number; prio: number; t1: string; t2: string; tone: 'tx' | 'g' | 'r' }> = [];
    lv.push({ id: 'entry', y: Y(trade.entry), prio: 1, t1: `Entry ${hm(open)}`, t2: price(trade.entry), tone: 'tx' });
    if (closed) lv.push({ id: 'exit', y: Y(trade.exit!), prio: 0, t1: `${exitReason === 'sl' ? 'Stop hit' : exitReason === 'tp' ? 'Target hit' : exitReason === 'stopout' ? 'Stop-out' : 'Exit'} ${hm(close!)}`, t2: price(trade.exit!), tone: win ? 'g' : 'r' });
    if (stop != null) lv.push({ id: 'stop', y: Y(stop), prio: 2, t1: 'Stop set', t2: price(stop), tone: 'r' });
    const tagH = narrow ? 18 : 30;
    const spots = placeTags(lv.map(l => ({ id: l.id, prio: l.prio, y: l.y, h: tagH })), H - PB + 6, [], 60);
    const tagBands = [...spots.values()].map(y => ({ y0: y - tagH / 2, y1: y + tagH / 2 }));
    const tickShown = narrow ? tk.filter(v => !tagBands.some(b => Y(v) > b.y0 - 6 && Y(v) < b.y1 + 6)) : tk;
    // Time labels every ~90px, on bar boundaries.
    const every = Math.max(1, Math.ceil((narrow ? 70 : 90) / bw));
    const times: Array<{ i: number; text: string }> = [];
    for (let i = 0; i < bars.length; i += every) {
      const t = bars[i]!.openTime;
      const newDay = i > 0 && new Date(t).toDateString() !== new Date(bars[i - every]?.openTime ?? t).toDateString();
      if (X(i) < 18 || X(i) > plotR - 18) continue;
      times.push({ i, text: tfMs >= 86_400_000 || newDay ? dm(t) : hm(t) });
    }
    return { AX, LAB, PL, PT, PB, plotR, bw, X, Y, ei, xi, tk: tickShown, tfmt, lv, spots, tagH, times };
  }, [w, narrow, H, bars, trade, stop, excursion, after, open, close, closed, exitReason, win, price, tfMs]);

  const bestI = excursion ? bars.findIndex(b => b.openTime === excursion.bestAt) : -1;
  const hb = hover != null ? bars[hover] : null;
  const afterRun = closed && after && after.extra > 0 && g ? { x0: g.X(Math.min(bars.length - 1, g.xi + 1)), y: g.Y(after.best) } : null;
  // One AI callout: for a loser that was in profit first, how far up it went.
  const callout = ai && g && closed && !win && excursion?.bestMoney != null && excursion.bestMoney >= Math.max(1, Math.abs(trade.net) * 0.1) && bestI >= 0
    ? `Was ${money(excursion.bestMoney)} up first`
    : null;

  // "best" sits under/over its point; when that lands on the "after exit" caption at the plot's foot, the caption goes.
  const bestText = excursion ? `best ${excursion.bestMoney != null ? money(excursion.bestMoney) : `+${price(excursion.bestMove)}`}` : '';
  const showBest = !!(g && excursion && bestI >= 0 && excursion.bestMove > 0 && !narrow && !callout);
  const afterCapX = g ? g.X(g.xi) + g.bw / 2 + 6 : 0;
  const capClash = !!(g && excursion && showBest
    && Math.abs(g.Y(excursion.best) + (trade.side === 'LONG' ? -9 : 18) - (H - g.PB - 6)) < 14
    && g.X(bestI) + bestText.length * 3.4 > afterCapX && g.X(bestI) - bestText.length * 3.4 < afterCapX + 60);

  return (
    <div ref={ref} className="trv-chart" style={{ height: H }} data-testid="trade-chart"
      onPointerMove={e => {
        if (!g) return;
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < g.PL || x > g.plotR) { setHover(null); return; }
        setHover(Math.max(0, Math.min(bars.length - 1, Math.floor((x - g.PL) / g.bw))));
      }}
      onPointerLeave={() => setHover(null)}>
      {g && (
        <svg width={w} height={H} role="img" aria-label={`${trade.symbol} ${trade.side === 'LONG' ? 'long' : 'short'}: entry ${price(trade.entry)}${closed ? `, exit ${price(trade.exit!)}` : ', still open'}`}>
          {g.tk.map(v => <g key={v}><line x1={g.PL} x2={g.plotR} y1={g.Y(v)} y2={g.Y(v)} className="trv-grid" /><text x={g.plotR + 6} y={g.Y(v) + 4} className="trv-ax">{g.tfmt(v)}</text></g>)}
          <rect x={g.X(g.ei) - g.bw / 2} y={g.PT} width={Math.max(1, g.X(g.xi) - g.X(g.ei) + g.bw)} height={H - g.PT - g.PB} className="trv-band" data-testid="trade-band" />
          {closed && g.xi < bars.length - 2 && !narrow && !capClash && <text x={g.X(g.xi) + g.bw / 2 + 6} y={H - g.PB - 6} className="trv-ax">after exit</text>}
          {bars.map((b, i) => {
            const up = b.close >= b.open;
            const top = g.Y(Math.max(b.open, b.close));
            const out = i < g.ei || i > g.xi;
            return (
              <g key={b.openTime} className={`${up ? 'u' : 'd'}${out ? ' out' : ''}`}>
                <line x1={g.X(i)} x2={g.X(i)} y1={g.Y(b.high)} y2={g.Y(b.low)} className="trv-wick" />
                <rect x={g.X(i) - Math.max(0.5, g.bw * 0.28)} width={Math.max(1, g.bw * 0.56)} y={top} height={Math.max(1, g.Y(Math.min(b.open, b.close)) - top)} className="trv-body" />
              </g>
            );
          })}
          {stop != null && <line x1={g.X(g.ei)} x2={g.plotR} y1={g.Y(stop)} y2={g.Y(stop)} className="trv-stop" data-testid="stop-line" />}
          <line x1={g.X(g.ei)} x2={g.plotR} y1={g.Y(trade.entry)} y2={g.Y(trade.entry)} className="trv-entry" />
          {afterRun && (
            <g className="trv-after" data-testid="after-exit">
              <line x1={afterRun.x0} x2={g.plotR} y1={afterRun.y} y2={afterRun.y} className="trv-afterln" />
              {!narrow && <text x={g.plotR - 4} y={afterRun.y + (after!.best > trade.exit! === (trade.side === 'LONG') ? -6 : 14)} textAnchor="end" className="trv-lbl">{after!.leftMoney != null ? `ran ${money(after!.leftMoney, { plus: false })} further` : `ran ${price(after!.extra)} further`}</text>}
            </g>
          )}
          {excursion && bestI >= 0 && excursion.bestMove > 0 && (
            <g data-testid="best-point">
              <circle cx={g.X(bestI)} cy={g.Y(excursion.best)} r={3.5} className="trv-best" />
              {showBest && <text x={g.X(bestI)} y={g.Y(excursion.best) + (trade.side === 'LONG' ? -9 : 18)} textAnchor="middle" className="trv-lbl g">{bestText}</text>}
            </g>
          )}
          <circle cx={g.X(g.ei)} cy={g.Y(trade.entry)} r={5} className="trv-in" data-testid="entry-marker" />
          {closed && <circle cx={g.X(g.xi)} cy={g.Y(trade.exit!)} r={5} className={`trv-out ${win ? 'w' : 'l'}`} data-testid="exit-marker" />}
          {callout && (() => {
            const cw = calloutW(callout);
            const bx = g.X(bestI) - cw / 2;
            const above = trade.side === 'LONG';
            const cy = above ? Math.max(2, g.Y(excursion!.best) - 58) : Math.min(H - g.PB - 36, g.Y(excursion!.best) + 26);
            return <Callout x={Math.max(2, bx)} y={cy} text={callout} maxX={g.plotR} tone="up" lead={[g.X(bestI), g.Y(excursion!.best)]} />;
          })()}
          {g.lv.map(l => {
            const y = g.spots.get(l.id);
            if (y == null) return null;
            if (narrow) {
              return (
                <g key={l.id} className={`trv-tag ${l.tone}`} data-testid={`level-${l.id}`}>
                  <rect x={g.plotR + 2} y={y - g.tagH / 2} width={g.AX - 4} height={g.tagH} rx={4} />
                  <text x={g.plotR + 5} y={y + 4}>{l.t2}</text>
                </g>
              );
            }
            return (
              <g key={l.id} className={`trv-lvl ${l.tone}`} data-testid={`level-${l.id}`}>
                <text x={g.plotR + g.AX + 2} y={y - 2} className="t1">{l.t1}</text>
                <text x={g.plotR + g.AX + 2} y={y + 11} className="t2">{l.t2}</text>
              </g>
            );
          })}
          {g.times.map(t => <text key={t.i} x={g.X(t.i)} y={H - 5} textAnchor="middle" className="trv-ax">{t.text}</text>)}
          {hb && hover != null && (
            <g className="trv-cross" pointerEvents="none">
              <line x1={g.X(hover)} x2={g.X(hover)} y1={g.PT} y2={H - g.PB} />
            </g>
          )}
        </svg>
      )}
      {g && hb && hover != null && (
        <div className={`trv-tip ${g.X(hover) > g.plotR / 2 ? 'l' : ''}`} style={{ left: g.X(hover) }} role="tooltip" data-testid="chart-tip">
          <b>{tfMs >= 86_400_000 ? dm(hb.openTime) : `${dm(hb.openTime)} ${hm(hb.openTime)}`}</b>
          <span>O {price(hb.open)}</span><span>H {price(hb.high)}</span><span>L {price(hb.low)}</span><span>C {price(hb.close)}</span>
        </div>
      )}
    </div>
  );
}
