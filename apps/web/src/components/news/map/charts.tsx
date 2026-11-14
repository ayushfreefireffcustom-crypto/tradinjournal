'use client';

// The top story's reaction chart (% move of its assets since it was published,
// with numbered pins for the other map stories) and the scoreboard sparkline.
// Drawn at the container's real pixel size so text never scales.
import { fmtMove, hhmm, type ReactionSeries } from '@/lib/news-map-api';

export interface ChartLine { key: string; series: ReactionSeries; you?: boolean }
export interface ChartPin { at: number; n: number; hot: boolean }

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
const P = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
const MINUS = '−';

function niceStep(span: number): number {
  for (const s of [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) if (span / s <= 4) return s;
  return 20;
}

/**
 * % move since `t0` for each line, from `t0 − lead` to the last bar.
 * Returns null when nothing is drawable (no bars after publish).
 */
export function ReactionChart({ w, h, t0, lines, pins, lead = 15 * 60_000 }: { w: number; h: number; t0: number; lines: ChartLine[]; pins: ChartPin[]; lead?: number }) {
  const start = t0 - lead;
  const data = lines
    .map(l => {
      const pts = l.series.points;
      let bi = -1;
      for (let i = pts.length - 1; i >= 0; i--) if (pts[i]![0] <= t0) { bi = i; break; }
      if (bi === -1 || bi === pts.length - 1) return null;
      const base = pts[bi]![1];
      if (!base) return null;
      const from = pts.findIndex(p => p[0] >= start);
      const vals = pts.slice(Math.min(from === -1 ? bi : from, bi)).map(([t, v]) => [t, (v / base - 1) * 100] as [number, number]);
      return { ...l, vals, last: vals[vals.length - 1]![1] };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!data.length || w < 220 || h < 110) return null;

  const pl = 42, pr = w >= 300 ? 112 : 8, pt = 30, pb = 20;
  const tMin = Math.min(...data.map(d => d.vals[0]![0]));
  const tMax = Math.max(...data.map(d => d.vals[d.vals.length - 1]![0]));
  let lo = Math.min(0, ...data.flatMap(d => d.vals.map(v => v[1])));
  let hi = Math.max(0, ...data.flatMap(d => d.vals.map(v => v[1])));
  if (hi - lo < 0.2) { hi += 0.1; lo -= 0.1; }
  const step = niceStep(hi - lo);
  const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step;
  const X = lin(tMin, tMax, pl, w - pr), Y = lin(yMin, yMax, h - pb, pt);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const fmtTick = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)}%`;

  // Pins inside the window; drop one that would sit on top of a higher-ranked pin.
  const shown: ChartPin[] = [];
  for (const p of [...pins].sort((a, b) => a.n - b.n)) {
    if (p.at < tMin || p.at > tMax) continue;
    if (shown.some(s => Math.abs(X(s.at) - X(p.at)) < 22)) continue;
    shown.push(p);
  }

  // Direct end labels, nudged apart.
  const ends = data.map(d => ({ d, x: X(d.vals[d.vals.length - 1]![0]), y: Y(d.last) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < 15) ends[i]!.y = ends[i - 1]!.y + 15;
  const drawOrder = [...data].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));

  return (
    <svg className="nw-ch" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Move since ${hhmm(t0)} UTC: ${data.map(d => `${d.key} ${fmtMove({ v: d.last, unit: 'pct' })}`).join(', ')}`}>
      {ticks.map(t => (
        <g key={t}>
          <line className={t === 0 ? 'nw-ax' : 'nw-gl'} x1={pl} x2={w - pr} y1={Y(t)} y2={Y(t)} />
          <text className="nw-t11 nw-tx3" x={pl - 6} y={Y(t) + 4} textAnchor="end">{fmtTick(t)}</text>
        </g>
      ))}
      <text className="nw-t11 nw-tx3" x={pl} y={h - 4}>{hhmm(tMin)}</text>
      <text className="nw-t11 nw-tx3" x={w - pr} y={h - 4} textAnchor="end">{hhmm(tMax)}</text>
      {shown.map(p => <line key={`l${p.n}`} className={p.hot ? 'nw-pinl nw-pinl--hot' : 'nw-pinl'} x1={X(p.at)} x2={X(p.at)} y1={pt - 8} y2={h - pb} />)}
      {drawOrder.map(d => {
        const pts = d.vals.map(([t, v]) => P(X(t), Y(v)));
        const [lx, ly] = [X(d.vals[d.vals.length - 1]![0]), Y(d.last)];
        return (
          <g key={d.key}>
            <path className={d.you ? 'nw-ln' : 'nw-ln2'} d={`M${pts.join('L')}`} />
            <circle className={d.you ? 'nw-dot' : 'nw-dot nw-dot--2'} cx={lx} cy={ly} r={d.you ? 3.5 : 2.75} />
          </g>
        );
      })}
      {pr > 8 && ends.map(e => (
        <text key={`e${e.d.key}`} className={`nw-t11 ${e.d.you ? 'nw-tx1' : 'nw-tx2'}`} x={e.x + 8} y={e.y + 4} fontWeight={e.d.you ? 700 : 400}>
          {e.d.key} <tspan className={e.d.last >= 0.05 ? 'nw-txu' : e.d.last <= -0.05 ? 'nw-txd' : 'nw-tx2'} fontWeight={900}>{fmtMove({ v: e.d.last, unit: 'pct' })}</tspan>
        </text>
      ))}
      {shown.map(p => (
        <g key={`p${p.n}`}>
          <rect x={X(p.at) - 9} y={pt - 26} width={18} height={18} rx={3} className={p.hot ? 'nw-pinb nw-pinb--hot' : 'nw-pinb'} />
          <text x={X(p.at)} y={pt - 13} textAnchor="middle" className={`nw-t11 ${p.hot ? 'nw-pint--hot' : 'nw-tx1'}`} fontWeight={900}>{p.n}</text>
        </g>
      ))}
    </svg>
  );
}

/** A flat sparkline scaled to its box (stroke stays 1.75px at any width). */
export function Spark({ vals, dir }: { vals: number[]; dir: 'up' | 'dn' | 'flat' }) {
  if (vals.length < 2) return <svg className="nw-sp" viewBox="0 0 110 26" preserveAspectRatio="none" aria-hidden />;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const X = lin(0, vals.length - 1, 2, 108), Y = lin(mn, mx === mn ? mn + 1 : mx, 24, 2);
  return (
    <svg className="nw-sp" viewBox="0 0 110 26" preserveAspectRatio="none" aria-hidden>
      <path className={dir === 'up' ? 'nw-lnu' : dir === 'dn' ? 'nw-lnd' : 'nw-ln2'} d={`M${vals.map((v, i) => P(X(i), Y(v))).join('L')}`} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
