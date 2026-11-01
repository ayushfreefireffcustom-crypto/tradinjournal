// The one sparkline (A2.27) for macro rows, copy leaders, deployments, the
// market overview and the dashboard's expectancy trend. Green when the series
// rose, red when it fell, muted when flat; geometry lives in lib/sparkline.
import { sparkGeometry } from '@/lib/sparkline';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Force a colour instead of reading it from the series. */
  tone?: 'up' | 'down' | 'flat';
  /** Keep 0 in range with a faint zero line, coloured by the last value's sign. */
  zero?: boolean;
  /** Stretch to the parent's box (the path scales; the stroke doesn't). */
  fluid?: boolean;
  /** Soft fill under the line. */
  area?: boolean;
  /** Spoken description. Without one the sparkline is decorative. */
  label?: string;
  className?: string;
}

const COLOUR = { up: 'var(--g)', down: 'var(--r)', flat: 'var(--mut)' } as const;

export default function Sparkline({ values, width = 120, height = 36, tone, zero, fluid, area, label, className = '' }: SparklineProps) {
  const g = sparkGeometry(values, width, height, { zero });
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  if (!g) {
    return <span className={`x-spark x-spark--empty ${fluid ? 'fluid' : ''} ${className}`} style={fluid ? undefined : { width, height }} title="Not enough history yet" {...a11y} data-testid="spark-empty" />;
  }
  const col = COLOUR[tone ?? g.dir];
  return (
    <svg
      className={`x-spark ${fluid ? 'fluid' : ''} ${className}`} width={fluid ? undefined : width} height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" {...a11y} data-dir={tone ?? g.dir}
    >
      {g.zeroY !== null && <line x1="0" x2={width} y1={g.zeroY} y2={g.zeroY} stroke="var(--grid)" vectorEffect="non-scaling-stroke" />}
      {area && <path d={g.area} fill={col} fillOpacity=".1" />}
      <path d={g.line} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
