'use client';

// Growth (x) × inflation (y) map with the 12-month trail ending at "Now".
// Coordinates come from the engine (−2..+2 each); quadrant labels match it.
import type { MacroRegimeName, MacroRegimeTrail } from '@/lib/macro-api';
import { lin, pt, useWidth } from './parts';
import { monthShort } from './format';

const QUADS: { name: MacroRegimeName; sub: string; gx: 1 | -1; iy: 1 | -1 }[] = [
  { name: 'Stagflation', sub: 'USD and gold lead', gx: -1, iy: 1 },
  { name: 'Reflation', sub: 'yields up, cuts pushed out', gx: 1, iy: 1 },
  { name: 'Deflation', sub: 'bonds lead', gx: -1, iy: -1 },
  { name: 'Goldilocks', sub: 'risk assets lead', gx: 1, iy: -1 },
];

export default function RegimeMap({ trail }: { trail: MacroRegimeTrail | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const compact = w > 0 && w < 520;
  const h = Math.round(Math.max(280, Math.min(470, w * (compact ? 0.86 : 0.74))));
  const X0 = 1, X1 = w - 1, Y0 = 22, Y1 = h - 24;
  const x = lin(-2, 2, X0, X1);
  const y = lin(-2, 2, Y1, Y0);
  const active = trail?.label ?? null;
  const pts = (trail?.points ?? []).map(p => [x(p.growth), y(p.inflation)] as const);
  const now = pts.at(-1);
  const mid = pts.length > 6 ? 6 : -1;

  return (
    <div ref={ref} className="mo-rmap">
      {w > 0 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
          aria-label={trail ? `Regime map: ${trail.label}, growth ${trail.points.at(-1)!.growth}, inflation ${trail.points.at(-1)!.inflation}` : 'Regime map: not enough history yet'}>
          {QUADS.map(q => {
            const on = q.name === active;
            const rx = q.gx > 0 ? x(0) : X0;
            const ry = q.iy > 0 ? Y0 : y(0);
            const tx = q.gx > 0 ? X1 - 12 : X0 + 12;
            const ty = q.iy > 0 ? Y0 + 22 : Y1 - 26;
            const anchor = q.gx > 0 ? 'end' : 'start';
            return (
              <g key={q.name}>
                {on && <rect x={rx} y={ry} width={(X1 - X0) / 2} height={(Y1 - Y0) / 2} className="mo-rm-on" />}
                <text x={tx} y={ty} textAnchor={anchor} className={`mo-t14 ${on ? 'mo-tx1' : 'mo-tx3'}`} fontWeight={800}>{q.name}</text>
                {!compact || on ? <text x={tx} y={ty + 16} textAnchor={anchor} className="mo-t11 mo-tx3">{q.sub}</text> : null}
              </g>
            );
          })}
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} className="mo-ax" fill="none" />
          <line x1={x(0)} x2={x(0)} y1={Y0} y2={Y1} className="mo-ax" />
          <line x1={X0} x2={X1} y1={y(0)} y2={y(0)} className="mo-ax" />
          {[-1, 1].map(g => (
            <g key={g}>
              <line x1={x(g)} x2={x(g)} y1={Y0} y2={Y1} className="mo-gl" />
              <line x1={X0} x2={X1} y1={y(g)} y2={y(g)} className="mo-gl" />
            </g>
          ))}
          <text x={X0} y={Y0 - 8} className="mo-t11 mo-tx3">↑ Inflation rising</text>
          <text x={X0} y={Y1 + 17} className="mo-t11 mo-tx3">← slowing</text>
          <text x={X1} y={Y1 + 17} textAnchor="end" className="mo-t11 mo-tx3">Growth →</text>

          {pts.length > 1 && (
            <path d={'M' + pts.map(p => pt(p[0], p[1])).join('L')} className="mo-rm-trail" />
          )}
          {pts.slice(0, -1).map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={3} className="mo-rm-dot" opacity={0.35 + (i / pts.length) * 0.65} />
          ))}
          {pts.length > 1 && trail && (
            <text x={pts[0]![0] + 8} y={pts[0]![1] + 4} className="mo-t11 mo-tx3 mo-halo">{monthShort(trail.points[0]!.month, true)}</text>
          )}
          {mid > 0 && trail && !compact && (
            <text x={pts[mid]![0] + 8} y={pts[mid]![1] + 4} className="mo-t11 mo-tx3 mo-halo">{monthShort(trail.points[mid]!.month)}</text>
          )}
          {now && trail?.near && (() => {
            // Dashed hint toward the nearby boundary.
            const n = trail.near;
            const last = trail.points.at(-1)!;
            const bx = n.axis === 'growth' ? x(0) : now[0];
            const by = n.axis === 'inflation' ? y(0) : now[1];
            const left = bx < w / 2;
            const lx = Math.max(X0 + 4, Math.min(X1 - 4, bx + (left ? 6 : -6)));
            const ly = by + (n.axis === 'inflation' ? (last.inflation > 0 ? 16 : -8) : -8);
            return (
              <g>
                <line x1={now[0]} y1={now[1]} x2={bx} y2={by} className="mo-ax mo-dash" />
                <text x={lx} y={ly} textAnchor={left ? 'start' : 'end'} className="mo-t11 mo-tx2 mo-halo">{n.label} if {n.axis} turns</text>
              </g>
            );
          })()}
          {now && (
            <g>
              <circle cx={now[0]} cy={now[1]} r={7} className="mo-rm-now" />
              <circle cx={now[0]} cy={now[1]} r={12} fill="none" className="mo-rm-ring" />
              <text x={now[0] + (now[0] > w - 60 ? -18 : 18)} y={now[1] + 5} textAnchor={now[0] > w - 60 ? 'end' : 'start'} className="mo-t13 mo-tx1 mo-halo" fontWeight={800}>Now</text>
            </g>
          )}
          {!trail && (
            <text x={(X0 + X1) / 2} y={(Y0 + Y1) / 2 + 4} textAnchor="middle" className="mo-t13 mo-tx3 mo-halo">Trail needs about 30 months of history</text>
          )}
        </svg>
      )}
    </div>
  );
}
