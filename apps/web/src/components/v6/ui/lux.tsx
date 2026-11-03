'use client';

// Small pieces of the lux finish (styles/v6/lux.css) shared by the markets and
// strategy pages: a pair label with its coin mark, a change pill, a 0–100 meter, a hero stat tile and a sparkline for it.
import type { CSSProperties, ReactNode } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import CoinMark from './coin-mark';

export function Pair({ base, quote = '/USDT', symbol, size }: { base: string; quote?: string | null; symbol?: string; size?: 'lg' }) {
  return (
    <span className="lx-pair">
      <CoinMark symbol={symbol ?? base} size={size} />
      <span><b>{base}</b>{quote && <span className="x-muted sc-quote">{quote}</span>}</span>
    </span>
  );
}

const tone = (v: number | null | undefined) => (v == null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');

/** A signed % as a tinted pill. */
export function Chg({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="x-muted">—</span>;
  return <span className={`lx-chg m ${tone(v)}`}>{v > 0 ? '+' : ''}{v.toFixed(digits)}%</span>;
}

/** A value on a 0–100 track; `t` colours it. */
export function Meter({ v, label, t }: { v: number; label: ReactNode; t?: 'pos' | 'neg' | '' }) {
  return <span className={`lx-meter ${t ?? ''}`}><span className="m">{label}</span><i style={{ '--v': `${Math.max(0, Math.min(100, v))}%` } as CSSProperties} /></span>;
}

export function Kpi({ label, value, sub, side, viz, testId, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; side?: ReactNode; viz?: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={`lx-kpi ${className ?? ''}`} data-testid={testId}>
      <div className="lx-kpi-h"><span>{label}</span>{side}</div>
      <div className="lx-kpi-v">{value}</div>
      {sub && <div className="lx-kpi-s">{sub}</div>}
      {viz && <div className="lx-kpi-viz">{viz}</div>}
    </div>
  );
}

export function Delta({ v, suffix = '%', digits = 1 }: { v: number | null | undefined; suffix?: string; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return null;
  return <span className={`lx-delta ${tone(v)}`}>{v > 0 ? <CaretUp size={10} weight="fill" aria-hidden /> : v < 0 ? <CaretDown size={10} weight="fill" aria-hidden /> : null}{Math.abs(v).toFixed(digits)}{suffix}</span>;
}

/** A line through `values`, green or red by its overall direction, with a soft fill. */
export function Spark({ values, t, color }: { values: number[]; t?: 'pos' | 'neg'; color?: string }) {
  const vs = values.filter(Number.isFinite);
  if (vs.length < 2) return null;
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const pts = vs.map((v, i) => [(i / (vs.length - 1)) * 100, 30 - ((v - lo) / span) * 28] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const dir = t ?? (vs.at(-1)! >= vs[0]! ? 'pos' : 'neg');
  const c = color ?? (dir === 'pos' ? 'var(--g)' : 'var(--r)');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,32 ${line} 100,32`} fill={c} opacity=".1" />
      <polyline points={line} fill="none" stroke={c} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Buy / neutral / sell (or long / short) shares as one bar. */
export function Split({ g, n = 0, r }: { g: number; n?: number; r: number }) {
  const t = g + n + r || 1;
  return (
    <div className="lx-split" aria-hidden>
      {g > 0 && <i className="g" style={{ flex: g / t }} />}
      {n > 0 && <i className="n" style={{ flex: n / t }} />}
      {r > 0 && <i className="r" style={{ flex: r / t }} />}
    </div>
  );
}
