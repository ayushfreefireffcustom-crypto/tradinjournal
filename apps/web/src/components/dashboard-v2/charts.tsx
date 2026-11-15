'use client';

// SVG charts for Dashboard v2. Each chart measures its own width and redraws on
// resize; AI marks (callouts, outlines, leak dots) render only when `ai` is on.
import { useId } from 'react';
import type { AskBarDTO, DashDistribution, DashEquity, DashMaeMfe, DashRolling, HourCellDTO } from '@/lib/dashboard-v2-api';
import { axisMoney, fmtDate, kmoney, money, path, plural, rfmt, scale, spct, ticks } from '@/lib/dashboard-v2-format';
import { Callout, calloutW, useWidth } from './ui';

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Time labels along an index axis: months for long spans, days for short ones. */
function timeLabels(ts: number[], x: (i: number) => number, minGap: number) {
  if (!ts.length) return [];
  const span = ts.at(-1)! - ts[0]!;
  const long = span > 62 * 86_400_000;
  const out: Array<{ x: number; label: string }> = [];
  let last = '';
  ts.forEach((t, i) => {
    const d = new Date(t);
    const key = long ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : d.toISOString().slice(0, 10);
    if (key === last) return;
    last = key;
    const px = x(i);
    if (out.length && px - out.at(-1)!.x < minGap) return;
    out.push({ x: px, label: long ? MONTHS[d.getUTCMonth()]! : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
  });
  return out;
}

export function EquityChart({ eq, mode, unit, ai, leakNet }: { eq: DashEquity; mode: 'trades' | 'days'; unit: '$' | '%'; ai: boolean; leakNet: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const pts = mode === 'trades' ? eq.trades : eq.days;
  const pctMode = unit === '%' && eq.basis === 'balance' && eq.start > 0;
  const val = (v: number) => (pctMode ? ((v - eq.start) / eq.start) * 100 : v);
  const h = w < 520 ? 210 : 250;
  const padR = 46, padT = 12, padB = 22;
  let body = null;
  if (w > 0 && pts.length) {
    const series = [val(eq.start), ...pts.map(p => val(p.v))];
    // Running peak for the drawdown shading. Deposits and withdrawals move the
    // peak with them, so taking money out never shows as a drawdown.
    const peaks: number[] = [];
    let pk = -Infinity;
    series.forEach((v, i) => {
      const flow = i ? pts[i - 1]!.flow ?? 0 : 0;
      if (flow && pk > -Infinity) pk += pctMode ? (flow / eq.start) * 100 : flow;
      pk = Math.max(pk, v);
      peaks.push(pk);
    });
    const mn = Math.min(...series), mx = Math.max(...series);
    const pad = (mx - mn || Math.abs(mx) || 1) * 0.08;
    const lo = mn - pad, hi = mx + pad;
    const x = scale(0, series.length - 1, 0, w - padR), y = scale(lo, hi, h - padB, padT);
    const line = series.map((v, i) => [x(i), y(v)] as [number, number]);
    const dd = `${path(peaks.map((v, i) => [x(i), y(v)]))}${[...line].reverse().map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')}Z`;
    // Split the line: steps that end on a deposit/withdrawal are drawn apart (dashed, grey).
    const isFlow = (i: number) => i > 0 && !!pts[i - 1]!.flow;
    let tradePath = '';
    const flowSegs: Array<[number, number, number, number]> = [];
    line.forEach((p, i) => {
      if (i === 0) { tradePath += `M${p[0].toFixed(1)},${p[1].toFixed(1)}`; return; }
      const prev = line[i - 1]!;
      if (isFlow(i)) { flowSegs.push([prev[0], prev[1], p[0], p[1]]); tradePath += `M${p[0].toFixed(1)},${p[1].toFixed(1)}`; return; }
      tradePath += `L${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    });
    // Label the biggest cash moves (up to 2) beside their step.
    const flowLabels = pts
      .map((p, i) => ({ i: i + 1, flow: p.flow ?? 0 }))
      .filter(f => f.flow && Math.abs(pctMode ? (f.flow / eq.start) * 100 : f.flow) >= (hi - lo) * 0.08)
      .sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow)).slice(0, 2)
      .map(f => {
        const fx = x(f.i), fy0 = y(series[f.i - 1]!), fy1 = y(series[f.i]!);
        const text = `${f.flow < 0 ? 'Withdrew' : 'Deposited'} ${kmoney(Math.abs(f.flow), { plus: false })}`;
        const right = fx > (w - padR) / 2;
        return { x: right ? fx - 8 : fx + 8, y: Math.max(padT + 10, Math.min(h - padB - 6, (fy0 + fy1) / 2 + 4)), text, anchor: (right ? 'end' : 'start') as 'end' | 'start' };
      });
    const end = series.length - 1;
    const endLabel = pctMode ? spct(series[end]! / 100) : money(pts.at(-1)!.v, { plus: false });
    const labels = timeLabels([pts[0]!.t, ...pts.map(p => p.t)], x, 56);
    // Callouts: the top leak at the top-left, the deepest dip under (or over) its trough.
    const boxes: Box[] = [];
    const callouts: React.ReactNode[] = [];
    if (ai && eq.dotLabel && leakNet != null) {
      const text = `${eq.dotLabel} · ${money(leakNet)}`;
      const b = { x: 4, y: padT, w: Math.min(calloutW(text), w - padR - 4), h: 34 };
      boxes.push(b);
      callouts.push(<Callout key="leak" x={b.x} y={b.y} text={text} maxX={w - padR} />);
    }
    // Cash-move labels are fixed: drop one that would sit under the leak callout, keep the rest
    // as obstacles so the dip callout and the end value move out of their way.
    const flowShown = flowLabels.filter(f => {
      const fw = f.text.length * 6.4;
      const b: Box = { x: f.anchor === 'end' ? f.x - fw : f.x, y: f.y - 11, w: fw, h: 14 };
      if (boxes.some(o => hit(o, b))) return false;
      boxes.push(b);
      return true;
    });
    // End value: above its point unless a callout is there, then under it.
    const ew = endLabel.length * 7.6, ex = x(end) - 8, eyUp = Math.max(14, y(series[end]!) - 9);
    const endBox = (ey: number): Box => ({ x: ex - ew, y: ey - 12, w: ew, h: 15 });
    const eyDown = Math.min(h - padB - 4, y(series[end]!) + 20);
    const endY = boxes.some(o => hit(o, endBox(eyUp))) && !boxes.some(o => hit(o, endBox(eyDown))) ? eyDown : eyUp;
    boxes.push(endBox(endY));
    if (ai && eq.drawdown) {
      const ti = Math.max(1, pts.findIndex(p => p.t >= eq.drawdown!.troughT) + 1);
      const tx = x(ti), ty = y(series[ti] ?? series[end]!);
      const text = `${eq.drawdown.pct != null ? spct(-eq.drawdown.pct) : money(-eq.drawdown.amount)} dip · ${eq.drawdown.trades} trade${eq.drawdown.trades === 1 ? '' : 's'}`;
      const cw = calloutW(text);
      const bx = Math.max(0, Math.min(tx - cw / 2, w - padR - cw));
      const below = { x: bx, y: ty + 18, w: cw, h: 34 }, above = { x: bx, y: ty - 18 - 34, w: cw, h: 34 };
      const fits = (b: Box) => b.y >= padT && b.y + b.h <= h - padB && !boxes.some(o => hit(o, b));
      const b = fits(below) ? below : fits(above) ? above : null;
      if (b) callouts.push(<Callout key="dd" x={b.x} y={b.y} text={text} lead={[tx, ty]} maxX={w - padR} />);
    }
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={eq.basis === 'pnl' ? 'Cumulative P&L' : 'Equity and drawdown'}>
        {ticks(lo, hi, 4).map(t => (
          <g key={t}>
            <line x1={0} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={w} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{pctMode ? `${t > 0 ? '+' : ''}${+t.toFixed(1)}%` : `${t < 0 ? '−' : ''}$${axisMoney(Math.abs(t))}`}</text>
          </g>
        ))}
        <line x1={0} x2={w - padR} y1={y(series[0]!)} y2={y(series[0]!)} stroke="var(--mut)" strokeDasharray="2 3" />
        <path d={dd} fill="var(--d2-rfill)" />
        <path d={tradePath} fill="none" stroke="var(--d2-g)" strokeWidth={1.75} strokeLinejoin="round" />
        {/* Cash in or out is not trading: a grey dashed step, labelled, never a green crash or spike. */}
        {flowSegs.map((f, i) => <line key={`fs${i}`} x1={f[0]} y1={f[1]} x2={f[2]} y2={f[3]} stroke="var(--mut)" strokeWidth={1.5} strokeDasharray="3 3" data-testid="flow-step" />)}
        {flowShown.map((f, i) => <text key={`fl${i}`} x={f.x} y={f.y} fontSize={11} fontWeight={700} fill="var(--mut)" textAnchor={f.anchor}>{f.text}</text>)}
        {ai && pts.map((p, i) => (p.leak ? <circle key={i} cx={x(i + 1)} cy={y(series[i + 1]!)} r={3} fill="var(--d2-r)" stroke="var(--d2-card)" strokeWidth={1} data-ai /> : null))}
        {/* Trades whose stop was widened: a red ring (only with recorded stop levels). */}
        {ai && pts.map((p, i) => (p.moved && !p.leak ? <circle key={`m${i}`} cx={x(i + 1)} cy={y(series[i + 1]!)} r={3.5} fill="var(--d2-card)" stroke="var(--d2-r)" strokeWidth={1.5} data-ai data-testid="moved-dot"><title>Stop widened</title></circle> : null))}
        {/* Deposits and withdrawals: a small hollow square where the cash moved. */}
        {pts.map((p, i) => (p.flow ? (
          <rect key={`f${i}`} x={x(i + 1) - 3.5} y={y(series[i + 1]!) - 3.5} width={7} height={7} rx={1.5} fill="var(--d2-card)" stroke="var(--mut)" strokeWidth={1.25} data-testid="flow-mark">
            <title>{`${p.flow > 0 ? 'Deposit' : 'Withdrawal'} ${money(p.flow)} · ${fmtDate(p.t)}`}</title>
          </rect>
        ) : null))}
        <circle cx={x(end)} cy={y(series[end]!)} r={3.5} fill="var(--d2-g)" />
        <text x={ex} y={endY} fontSize={13} fontWeight={900} fill="var(--tx)" textAnchor="end">{endLabel}</text>
        {labels.map((l, i) => <text key={i} x={Math.max(0, l.x)} y={h - 5} fontSize={11} fill="var(--dim)" textAnchor={i ? 'middle' : 'start'}>{l.label}</text>)}
        {callouts}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

export function DistChart({ dist, ai }: { dist: DashDistribution; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 400 ? 200 : 230;
  const padB = 20, padT = 22;
  let body = null;
  if (w > 0) {
    const R = dist.unit === 'R';
    const n = dist.bins.length;
    const a = dist.bins[0]!.from, b = dist.bins.at(-1)!.to;
    const x = scale(a, b, 0, w);
    const mx = Math.max(1, ...dist.bins.map(z => z.n));
    const y = scale(0, mx * 1.35, h - padB, padT + 30);
    const bw = Math.max(2, w / n - 2);
    const tailBins = dist.tail ? dist.bins.filter(z => z.from < dist.tail!.threshold) : [];
    const tallest = Math.max(0, ...tailBins.map(z => z.n));
    const fmtX = (v: number) => (R ? `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v)}R` : `${v < 0 ? '−' : ''}$${axisMoney(Math.abs(v))}`);
    const xt = R ? [-2, -1, 0, 1, 2, 3, 4] : ticks(a, b, Math.max(2, Math.floor(w / 80)));
    const meanX = Math.max(1, Math.min(w - 1, x(dist.mean)));
    const meanTxt = `mean ${R ? rfmt(dist.mean) : money(dist.mean)}`;
    const tailText = dist.tail ? `${dist.tail.trades} losses past ${R ? '−1.25R' : kmoney(dist.tail.threshold)} · ${kmoney(dist.tail.net)}` : '';
    const meanRight = meanX > w - 110;
    const meanBox: Box = { x: meanRight ? meanX - 4 - meanTxt.length * 6.6 : meanX + 4, y: padT + 27, w: meanTxt.length * 6.6, h: 15 };
    // The tail callout sits right above the dashed outline it explains (short lead), or in the
    // top corner over it when that would cover the mean label. Never a line across the chart.
    let tailBox: (Box & { lead: [number, number] }) | null = null;
    if (ai && dist.tail && tailBins.length) {
      const rx0 = x(tailBins[0]!.from), rx1 = x(tailBins.at(-1)!.to), top = y(tallest) - 16;
      const cw = Math.min(calloutW(tailText), w);
      const bx = Math.max(0, Math.min((rx0 + rx1) / 2 - cw / 2, w - cw));
      const above: Box = { x: bx, y: top - 8 - 34, w: cw, h: 34 }, corner: Box = { x: bx, y: 0, w: cw, h: 34 };
      const b = above.y >= 0 && !hit(above, meanBox) ? above : corner;
      tailBox = { ...b, lead: [Math.max(rx0, Math.min(rx1, b.x + cw / 2)), top] };
    }
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={`Trade results in ${dist.unit}`}>
        {ticks(0, mx * 1.35, 3).filter(t => t > 0).map(t => <line key={t} x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />)}
        {dist.bins.map((z, i) => (
          <g key={i}>
            <rect x={x(z.from) + 1} y={y(z.n)} width={bw} height={Math.max(0, y(0) - y(z.n))} fill={z.from >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} opacity={0.85} />
            {z.n > 0 && bw >= 12 && <text x={x(z.from) + 1 + bw / 2} y={y(z.n) - 4} fontSize={11} fill="var(--mut)" textAnchor="middle">{z.n}</text>}
          </g>
        ))}
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        <line x1={meanX} x2={meanX} y1={padT + 28} y2={y(0)} stroke="var(--tx)" strokeWidth={1.25} />
        <text x={meanRight ? meanX - 4 : meanX + 4} y={padT + 38} fontSize={11} fontWeight={800} fill="var(--tx)" textAnchor={meanRight ? 'end' : 'start'}>{meanTxt}</text>
        {xt.filter(v => v >= a && v <= b).map(v => <text key={v} x={Math.min(w - 12, Math.max(10, x(v)))} y={h - 4} fontSize={11} fill="var(--dim)" textAnchor="middle">{fmtX(v)}</text>)}
        {tailBox && (
          <g data-ai>
            <rect x={x(tailBins[0]!.from)} y={y(tallest) - 16} width={x(tailBins.at(-1)!.to) - x(tailBins[0]!.from) + 1} height={y(0) - y(tallest) + 20} rx={4} fill="none" stroke="var(--d2-rt)" strokeDasharray="3 3" />
            <Callout x={tailBox.x} y={tailBox.y} w={tailBox.w} text={tailText} maxX={w} lead={tailBox.lead} />
          </g>
        )}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

export function RollingChart({ roll, ai }: { roll: DashRolling; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const id = useId().replace(/:/g, '');
  const h = w < 400 ? 180 : 210;
  const padR = 44, padT = 14, padB = 18;
  let body = null;
  if (w > 0 && roll.points.length > 1) {
    const R = roll.unit === 'R';
    const vs = roll.points.map(p => p.v);
    const mn = Math.min(0, ...vs), mx = Math.max(0, ...vs);
    const pad = (mx - mn || 1) * 0.12;
    const x = scale(roll.points[0]!.i, roll.points.at(-1)!.i, 0, w - padR), y = scale(mn - pad, mx + pad, h - padB, padT);
    const ln = path(roll.points.map(p => [x(p.i), y(p.v)]));
    const last = roll.points.at(-1)!;
    const fmt = (v: number) => (R ? rfmt(v) : money(v));
    const lowText = `${fmtDate(roll.low.t)} low · ${R ? rfmt(roll.low.v) : kmoney(roll.low.v)}`;
    const lx = x(roll.low.i), ly = y(roll.low.v);
    const cw = calloutW(lowText);
    const cx = Math.max(0, Math.min(w - padR - cw, lx - cw / 2));
    // The callout must not cover the end-value label: flip it above the low, else drop the label (the foot repeats it).
    const endTxt = fmt(last.v), ey = Math.max(13, y(last.v) - 8), ex1 = x(last.i) - 6, ex0 = ex1 - endTxt.length * 7.6;
    const hits = (top: number) => cx < ex1 && cx + cw > ex0 && top < ey + 3 && top + 34 > ey - 12;
    let cy = ly + 12 + 34 <= h - padB ? ly + 12 : Math.max(padT, ly - 46);
    if (ai && hits(cy) && !hits(Math.max(padT, ly - 46))) cy = Math.max(padT, ly - 46);
    const showEnd = !(ai && hits(cy));
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Rolling expectancy">
        <defs>
          <clipPath id={`${id}a`}><rect x={0} y={0} width={w} height={y(0)} /></clipPath>
          <clipPath id={`${id}b`}><rect x={0} y={y(0)} width={w} height={h} /></clipPath>
        </defs>
        {ticks(mn - pad, mx + pad, 3).map(t => (
          <g key={t}>
            <line x1={0} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} />
            <text x={w} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{R ? `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}R` : `${t < 0 ? '−' : ''}$${axisMoney(Math.abs(t))}`}</text>
          </g>
        ))}
        <path d={ln} fill="none" stroke="var(--d2-g)" strokeWidth={1.5} clipPath={`url(#${id}a)`} />
        <path d={ln} fill="none" stroke="var(--d2-r)" strokeWidth={1.5} clipPath={`url(#${id}b)`} />
        <circle cx={x(last.i)} cy={y(last.v)} r={3.5} fill={last.v >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} />
        {showEnd && <text x={ex1} y={ey} fontSize={13} fontWeight={900} fill="var(--tx)" textAnchor="end">{endTxt}</text>}
        {ai && <circle cx={lx} cy={ly} r={3} fill="var(--d2-r)" data-ai />}
        {ai && <Callout x={cx} y={cy} text={lowText} maxX={w - padR} />}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

/** Round money values for a square-root axis, kept at least minGap px apart. */
const SQRT_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
function sqrtTicks(max: number, px: (v: number) => number, minGap: number): number[] {
  const out = [0];
  for (const v of SQRT_STEPS) {
    if (v > max) break;
    if (Math.abs(px(v) - px(out.at(-1)!)) >= minGap) out.push(v);
  }
  return out;
}

export function MaeScatter({ mm, ai }: { mm: DashMaeMfe; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 400 ? 230 : 250;
  const padL = 52, padB = 36, padT = 10, padR = 8;
  let body = null;
  if (w > 0) {
    // Square-root axes: one big trade would otherwise squash every other point into a corner.
    const sq = (v: number) => Math.sqrt(Math.abs(v));
    const xmax = Math.max(1, ...mm.points.map(p => -p.mae)), ymax = Math.max(1, ...mm.points.map(p => p.mfe));
    const X = scale(0, sq(xmax) * 1.04, w - padR, padL), Y = scale(0, sq(ymax) * 1.06, h - padB, padT);
    const x = (mae: number) => X(sq(mae)), y = (mfe: number) => Y(sq(mfe));
    const xt = sqrtTicks(xmax, x, 44), yt = sqrtTicks(ymax, y, 22);
    const text = mm.gaveBack ? `${plural(mm.gaveBack.trades, 'loser')} green first · ${kmoney(mm.gaveBack.net)}` : '';
    const gave = mm.points.filter(p => p.gave);
    let callout: React.ReactNode = null;
    if (ai && text) {
      const cw = Math.min(calloutW(text), w - padL - padR);
      const g = gave[0];
      if (g) {
        // Next to the first such loser (which gets a red ring), above it if there is room, else below.
        const gx = x(g.mae), gy = y(g.mfe);
        const bx = Math.max(padL, Math.min(gx - cw / 2, w - padR - cw));
        const by = gy - 14 - 34 >= padT ? gy - 14 - 34 : Math.min(h - padB - 34, gy + 14);
        callout = <Callout x={bx} y={by} w={cw} text={text} lead={[gx, gy]} maxX={w - padR} />;
      } else callout = <Callout x={padL} y={padT} w={cw} text={text} maxX={w - padR} />;
    }
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Worst point against best point of each trade">
        {yt.map(t => (
          <g key={t}><line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} /><text x={padL - 6} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{`$${axisMoney(t)}`}</text></g>
        ))}
        {xt.map(t => <text key={t} x={x(t)} y={h - padB + 15} fontSize={11} fill="var(--dim)" textAnchor={t === 0 ? 'end' : 'middle'}>{t === 0 ? '$0' : `−$${axisMoney(t)}`}</text>)}
        <text x={(padL + w - padR) / 2} y={h - 3} fontSize={11} fill="var(--mut)" textAnchor="middle">Worst point against you (MAE)</text>
        <text transform={`translate(11,${(padT + h - padB) / 2}) rotate(-90)`} fontSize={11} fill="var(--mut)" textAnchor="middle">Best point (MFE)</text>
        {mm.points.map((p, i) => <circle key={i} cx={x(p.mae)} cy={y(p.mfe)} r={3.2} fill={p.win ? 'var(--d2-g)' : 'var(--d2-r)'} fillOpacity={0.8} />)}
        {ai && gave.map((p, i) => <circle key={`g${i}`} cx={x(p.mae)} cy={y(p.mfe)} r={7} fill="none" stroke="var(--d2-rt)" strokeWidth={1.25} data-ai />)}
        {callout}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

/** Before you trade: net by UTC hour for one symbol + side, with a "now" line. */
export function HourBars({ cells, nowH, nowFrac, ai }: { cells: HourCellDTO[]; nowH: number; nowFrac: number; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 150, padT = 30, padB = 20;
  let body = null;
  if (w > 0) {
    const byH = new Map(cells.map(c => [c.hour, c]));
    const mx = Math.max(1, ...cells.map(c => Math.abs(c.net)));
    const x = scale(0, 24, 0, w), y = scale(-mx, mx, h - padB, padT);
    const bw = Math.max(2, w / 24 - 3);
    const now = byH.get(nowH);
    const nx = x(nowH + nowFrac);
    const right = nx > w - 70;
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Net by hour (UTC)">
        {ai && now && now.n >= 3 && now.wins / now.n < 0.4 && <rect x={x(nowH)} y={padT - 6} width={x(1) - x(0)} height={h - padB - padT + 6} fill="var(--d2-rfill)" data-ai />}
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {[...byH.values()].map(c => (
          <rect key={c.hour} x={x(c.hour) + 1.5} y={y(Math.max(0, c.net))} width={bw} height={Math.max(1.5, Math.abs(y(c.net) - y(0)))} rx={1.5} fill={c.net >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} />
        ))}
        <line x1={nx} x2={nx} y1={padT - 22} y2={h - padB} stroke="var(--tx)" strokeWidth={1.5} />
        <text x={right ? nx - 4 : nx + 4} y={padT - 14} fontSize={11} fontWeight={800} fill="var(--tx)" textAnchor={right ? 'end' : 'start'}>now</text>
        {now && <text x={right ? nx - 4 : nx + 4} y={padT} fontSize={11} fontWeight={800} fill={now.wins / now.n >= 0.5 ? 'var(--d2-gt)' : 'var(--d2-rt)'} textAnchor={right ? 'end' : 'start'}>{Math.round((100 * now.wins) / now.n)}% won</text>}
        {[0, 6, 12, 18].map(hh => <text key={hh} x={x(hh) + bw / 2 + 1.5} y={h - 4} fontSize={11} fill="var(--dim)" textAnchor="middle">{String(hh).padStart(2, '0')}</text>)}
        <text x={w} y={h - 4} fontSize={11} fill="var(--dim)" textAnchor="end">UTC</text>
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

/** Ask-your-journal answer: one bar per bucket, net $. */
export function AskBars({ bars }: { bars: AskBarDTO[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 150, padT = 18, padB = 20, padL = 40;
  let body = null;
  if (w > 0 && bars.length) {
    const mx = Math.max(1, ...bars.map(b => Math.abs(b.value)));
    const mn = Math.min(0, ...bars.map(b => b.value)), top = Math.max(0, ...bars.map(b => b.value));
    const y = scale(mn - mx * 0.05, top + mx * 0.12, h - padB, padT);
    const slot = (w - padL) / bars.length, bw = Math.max(3, Math.min(48, slot - 4));
    const every = Math.ceil(bars.length / Math.max(1, Math.floor((w - padL) / 34)));
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Answer chart">
        {ticks(mn, top, 2).map(t => (
          <g key={t}><line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} /><text x={padL - 6} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{t === 0 ? '$0' : `${t < 0 ? '−' : '+'}$${axisMoney(Math.abs(t))}`}</text></g>
        ))}
        {bars.map((b, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={b.label}>
              <rect x={cx - bw / 2} y={y(Math.max(0, b.value))} width={bw} height={Math.max(1.5, Math.abs(y(b.value) - y(0)))} rx={1.5}
                fill={b.value >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} opacity={b.hl || bars.every(z => !z.hl) ? 1 : 0.45} />
              {i % every === 0 && <text x={cx} y={h - 4} fontSize={11} fill="var(--dim)" textAnchor="middle">{b.label.length > 7 && slot < 60 ? b.label.slice(0, 6) : b.label}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

/** Cumulative P&L sparkline (symbols table). */
export function Spark({ vals, w = 120, h = 24 }: { vals: number[]; w?: number; h?: number }) {
  if (vals.length < 2) return <svg width={w} height={h} className="d2-spk" aria-hidden />;
  const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
  const x = scale(0, vals.length - 1, 1, w - 3), y = scale(mn, mx, h - 2, 2);
  const c = vals.at(-1)! >= 0 ? 'var(--d2-g)' : 'var(--d2-r)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-spk" aria-hidden>
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
      <path d={path(vals.map((v, i) => [x(i), y(v)]))} fill="none" stroke={c} strokeWidth={1.4} />
      <circle cx={x(vals.length - 1)} cy={y(vals.at(-1)!)} r={2} fill={c} />
    </svg>
  );
}

/** Tiny grey trend line (KPI ribbon). */
export function MiniLine({ vals, w = 56, h = 16 }: { vals: number[]; w?: number; h?: number }) {
  if (vals.length < 2) return null;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const x = scale(0, vals.length - 1, 0, w), y = scale(mn, mx === mn ? mn + 1 : mx, h - 1, 1);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-mini" aria-hidden><path d={path(vals.map((v, i) => [x(i), y(v)]))} fill="none" stroke="var(--mut)" strokeWidth={1.2} /></svg>;
}
