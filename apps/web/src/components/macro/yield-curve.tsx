'use client';

import type { MacroState } from '@/lib/macro-api';

const TENORS = [
  { key: 'DGS3MO', label: '3M' },
  { key: 'DGS2', label: '2Y' },
  { key: 'DGS5', label: '5Y' },
  { key: 'DGS10', label: '10Y' },
  { key: 'DGS30', label: '30Y' },
] as const;

interface Pt { label: string; value: number; }

/** Pure SVG US Treasury yield curve — no chart lib, themed to the terminal. */
export default function YieldCurve({ macro }: { macro: MacroState['macro'] }) {
  const byKey = new Map(macro.map(m => [m.key, m.value]));
  const pts: Pt[] = [];
  for (const t of TENORS) {
    const value = byKey.get(t.key);
    if (typeof value === 'number' && Number.isFinite(value)) pts.push({ label: t.label, value });
  }

  if (pts.length < 2) return null;

  const values = pts.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.35 || 0.4;
  const lo = min - pad;
  const hi = max + pad;

  const W = 340, H = 150;
  const padL = 16, padR = 16, padT = 26, padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xAt = (i: number) => padL + (i / (pts.length - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  const linePts = pts.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + innerH} ${linePts} ${padL + innerW},${padT + innerH}`;

  const twoS = byKey.get('DGS2');
  const threeM = byKey.get('DGS3MO');
  const ten = byKey.get('DGS10');
  const short = typeof twoS === 'number' ? twoS : threeM;
  const inverted = typeof short === 'number' && typeof ten === 'number' && short > ten;

  const spread2s10s = byKey.get('T10Y2Y');
  const spread10y3m = byKey.get('T10Y3M');

  return (
    <div className="tcard p-4 flex flex-col h-full min-h-[260px]" data-testid="macro-yield-curve">
      <div className="flex items-center justify-between border-b border-border-soft pb-2 shrink-0">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// YIELD CURVE</div>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded border ${
            inverted ? 'text-loss border-loss/30 bg-loss/10' : 'text-profit border-profit/30 bg-profit/10'
          }`}
        >
          {inverted ? 'INVERTED' : 'UPWARD'}
        </span>
      </div>

      <div className="flex-1 flex items-center">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1" role="img" aria-label="US Treasury yield curve">
          <defs>
            <linearGradient id="yc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-profit)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-profit)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal guides */}
          {[0, 0.5, 1].map(f => (
            <line
              key={f}
              x1={padL}
              x2={padL + innerW}
              y1={padT + f * innerH}
              y2={padT + f * innerH}
              stroke="var(--color-border-soft)"
              strokeWidth="1"
            />
          ))}

          <polygon points={areaPts} fill="url(#yc-fill)" />
          <polyline
            points={linePts}
            fill="none"
            stroke="var(--color-profit)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {pts.map((p, i) => (
            <g key={p.label}>
              <circle cx={xAt(i)} cy={yAt(p.value)} r="3" fill="var(--color-app)" stroke="var(--color-profit)" strokeWidth="1.6" />
              <text x={xAt(i)} y={yAt(p.value) - 8} textAnchor="middle" fontSize="9.5" fill="var(--color-fg)" className="numeric">
                {p.value.toFixed(2)}
              </text>
              <text x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--color-fg-3)" letterSpacing="0.5">
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-auto pt-2 border-t border-border-soft flex items-center justify-between text-[10px] shrink-0">
        <span className="text-fg-3 tracking-[0.12em]">
          2s10s <span className={`numeric ${(spread2s10s ?? 0) < 0 ? 'text-loss' : 'text-fg'}`}>
            {typeof spread2s10s === 'number' ? `${spread2s10s >= 0 ? '+' : ''}${Math.round(spread2s10s * 100)}bp` : '—'}
          </span>
        </span>
        <span className="text-fg-3 tracking-[0.12em]">
          10y-3m <span className={`numeric ${(spread10y3m ?? 0) < 0 ? 'text-loss' : 'text-fg'}`}>
            {typeof spread10y3m === 'number' ? `${spread10y3m >= 0 ? '+' : ''}${Math.round(spread10y3m * 100)}bp` : '—'}
          </span>
        </span>
      </div>
    </div>
  );
}
