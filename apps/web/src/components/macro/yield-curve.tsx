'use client';

import type { MacroState } from '@/lib/macro-api';
import { useSize } from '@/components/v6/macro/ui';

const TENORS = [
  { key: 'DGS3MO', label: '3M' },
  { key: 'DGS2', label: '2Y' },
  { key: 'DGS5', label: '5Y' },
  { key: 'DGS10', label: '10Y' },
  { key: 'DGS30', label: '30Y' },
] as const;

interface Pt { label: string; value: number; }
const MONO = { fontFamily: 'var(--mono)' } as const;
const bp = (n: number | undefined) => (typeof n === 'number' ? `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 100))}bp` : '—');

function Chart({ pts }: { pts: Pt[] }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const values = pts.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min) * 0.3 || 0.4;
  const lo = min - pad, hi = max + pad;
  const L = 6, R = 44, T = 22, B = 24;
  const X = (i: number) => L + 10 + (i / (pts.length - 1)) * (w - L - R - 20);
  const Y = (v: number) => T + (h - T - B) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const ticks = [0, 1 / 3, 2 / 3, 1].map(f => lo + (hi - lo) * f);
  return (
    <div className="mc-yc-chart" ref={ref}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`US Treasury yield curve: ${pts.map(p => `${p.label} ${p.value.toFixed(2)}%`).join(', ')}`}>
          <defs><linearGradient id="mc-yc-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--g)" stopOpacity=".2" /><stop offset="1" stopColor="var(--g)" stopOpacity="0" /></linearGradient></defs>
          {ticks.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              <text x={w - R + 8} y={Y(v) + 3.5} fontSize="10.5" fill="var(--axis)" style={MONO}>{v.toFixed(2)}%</text>
            </g>
          ))}
          <path d={`${line} L${X(pts.length - 1)} ${h - B} L${X(0)} ${h - B}Z`} fill="url(#mc-yc-g)" />
          <path d={line} fill="none" stroke="var(--g)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <g key={p.label}>
              <circle cx={X(i)} cy={Y(p.value)} r="3.5" fill="var(--s1)" stroke="var(--g)" strokeWidth="1.8" />
              <text x={X(i)} y={Y(p.value) - 9} textAnchor="middle" fontSize="10.5" fill="var(--tx)" style={MONO}>{p.value.toFixed(2)}</text>
              <text x={X(i)} y={h - 4} textAnchor="middle" fontSize="11" fill="var(--axis)">{p.label}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/** US Treasury yield curve across the standard tenors, plus the two recession spreads. */
export default function YieldCurve({ macro }: { macro: MacroState['macro'] }) {
  const byKey = new Map(macro.map(m => [m.key, m.value]));
  const pts: Pt[] = [];
  for (const t of TENORS) {
    const value = byKey.get(t.key);
    if (typeof value === 'number' && Number.isFinite(value)) pts.push({ label: t.label, value });
  }
  if (pts.length < 2) return null;

  const twoS = byKey.get('DGS2');
  const threeM = byKey.get('DGS3MO');
  const ten = byKey.get('DGS10');
  const short = typeof twoS === 'number' ? twoS : threeM;
  const inverted = typeof short === 'number' && typeof ten === 'number' && short > ten;
  const s1 = byKey.get('T10Y2Y');
  const s2 = byKey.get('T10Y3M');

  return (
    <section className="x-card mc-yc" data-testid="macro-yield-curve">
      <div className="x-ch"><h2>Yield curve</h2><span className="x-sub">US Treasuries</span>
        <span className="x-r"><span className={inverted ? 'x-tag x-tag--r' : 'x-tag x-tag--g'}>{inverted ? 'Inverted' : 'Upward'}</span></span></div>
      <Chart pts={pts} />
      <div className="x-strip mc-yc-s" style={{ ['--n' as string]: 2 }}>
        <div><span>2s10s spread</span><b className={`m ${(s1 ?? 0) < 0 ? 'neg' : ''}`}>{bp(s1)}</b></div>
        <div><span>10y–3m spread</span><b className={`m ${(s2 ?? 0) < 0 ? 'neg' : ''}`}>{bp(s2)}</b></div>
      </div>
    </section>
  );
}
