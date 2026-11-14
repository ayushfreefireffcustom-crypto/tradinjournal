'use client';

// We have no FedWatch feed, so there are no per-meeting odds. This block shows
// an honest proxy instead: 25bp cuts (or hikes) implied by the 3-month bill and
// the 2-year note relative to effective Fed funds, (EFFR − yield) / 0.25.
// Bars diverge from zero: right = cuts priced, left = hikes. Red tick = prior day.
import type { MacroCutsProxy } from '@/lib/macro-api';
import { Quiet, SecHead, lin, useWidth } from './parts';
import { signed } from './format';

export default function CutsProxy({ cuts }: { cuts: MacroCutsProxy | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rows = cuts?.rows ?? [];
  // Narrow: row labels sit above their bars instead of in a left column.
  const compact = w > 0 && w < 440;
  const lw = compact ? 0 : 104;
  const rw = 128;
  const span = Math.max(2, ...rows.flatMap(r => [Math.abs(r.cuts), Math.abs(r.cutsYesterday ?? 0)])) * 1.1;
  const x = lin(-span, span, lw, Math.max(lw + 40, w - rw));
  const bh = 22;
  const gap = compact ? 34 : 18;
  const top = compact ? 38 : 22;
  const h = rows.length * (bh + gap) + top;

  return (
    <div ref={ref}>
      <SecHead title="Cuts priced" sub="proxy · red tick = prior day" />
      {!cuts || rows.length === 0 ? (
        <Quiet>Needs Fed funds and Treasury yields from the next macro update.</Quiet>
      ) : (
        <>
          <div className="mo-cuts">
            {w > 0 && (
              <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="25 basis point cuts implied by Treasury yields versus Fed funds">
                <text x={x(-span)} y={12} className="mo-t11 mo-tx3">← hikes</text>
                <text x={x(span)} y={12} textAnchor="end" className="mo-t11 mo-tx3">cuts →</text>
                <line x1={x(0)} x2={x(0)} y1={16} y2={h} className="mo-ax" />
                {rows.map((r, i) => {
                  const y = top + i * (bh + gap);
                  const x0 = x(0);
                  const xv = x(r.cuts);
                  const word = Math.abs(r.cuts) < 0.05 ? 'none' : `${Math.abs(r.cuts).toFixed(1)} ${r.cuts < 0 ? 'hikes' : 'cuts'}`;
                  const d = r.cutsYesterday != null ? r.cuts - r.cutsYesterday : null;
                  return (
                    <g key={r.key}>
                      <text x={0} y={compact ? y - 8 : y + 15} className="mo-t13 mo-tx2">{r.label}</text>
                      <rect x={lw} y={y} width={Math.max(0, x(span) - lw)} height={bh} className="mo-track" />
                      <rect x={Math.min(x0, xv)} y={y} width={Math.max(1, Math.abs(xv - x0))} height={bh} className="mo-fi" opacity={i === 0 ? 1 : 0.6} />
                      {r.cutsYesterday != null && (
                        <line x1={x(r.cutsYesterday)} x2={x(r.cutsYesterday)} y1={y - 4} y2={y + bh + 4} className="mo-tick-r" />
                      )}
                      <text x={w - rw + 10} y={y + 15} className="mo-t14 mo-tx1" fontWeight={900}>{word}</text>
                      {d != null && Math.abs(d) >= 0.05 && (
                        <text x={w - 4} y={y + 15} textAnchor="end" className={`mo-t11 ${d > 0 ? 'mo-txu' : 'mo-txd'}`} fontWeight={900}>{signed(d, 1)}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
          <p className="mo-note m">
            (Fed funds {cuts.effr.toFixed(2)}% − yield) ÷ 0.25, from {rows.map(r => `${r.key.toUpperCase()} ${r.yield.toFixed(2)}%`).join(', ')}. A rough proxy: term and bill premia sit in the gap. Not CME FedWatch meeting odds.
          </p>
        </>
      )}
    </div>
  );
}
