'use client';

// Rate cards for the admin overview: a ring for a percentage, and a bar variant.
type Tone = 'g' | 'r' | 'n';
const STROKE: Record<Tone, string> = { g: 'var(--g)', r: 'var(--r)', n: 'var(--mut)' };

export function GaugeRing({ value, label, sub, tone = 'g' }: { value: number; label: string; sub?: string; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="x-card ad-rate">
      <div className="x-stat">
        <span>{label}</span>
        <b className="m">{Math.round(pct)}%</b>
        {sub && <small>{sub}</small>}
      </div>
      <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--track)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={STROKE[tone]} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} transform="rotate(-90 26 26)" className="ad-ring" />
      </svg>
    </div>
  );
}

export function LiquidBar({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="x-card ad-rate ad-rate--bar">
      <div className="x-stat">
        <span>{label}</span>
        <b className="m">{Math.round(pct)}%</b>
        {sub && <small>{sub}</small>}
      </div>
      <div className="x-bar ad-rate-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
