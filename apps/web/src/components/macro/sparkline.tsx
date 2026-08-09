'use client';

/**
 * Tiny inline SVG sparkline — recent values, oldest → newest. Colored by net
 * direction over the window (last vs first). Pure, no chart lib.
 */
export default function Sparkline({
  values,
  width = 56,
  height = 18,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const clean = values.filter(v => Number.isFinite(v));
  if (clean.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden />;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (i / (clean.length - 1)) * w;
  const y = (v: number) => pad + h - ((v - min) / span) * h;

  const line = clean.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = clean[clean.length - 1]! >= clean[0]!;
  const stroke = up ? 'var(--color-profit)' : 'var(--color-loss)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <circle cx={x(clean.length - 1)} cy={y(clean[clean.length - 1]!)} r="1.4" fill={stroke} />
    </svg>
  );
}
