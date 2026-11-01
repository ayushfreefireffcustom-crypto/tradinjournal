// Geometry for the one shared sparkline (A2.27), kept apart from React so the
// scaling rules can be tested: non-finite points are dropped, a flat series
// sits in the middle, and `zero` keeps 0 in range and reports where it falls.

export interface SparkGeometry {
  /** Line path through every point. */
  line: string;
  /** The line closed down to the bottom edge, for an optional soft fill. */
  area: string;
  /** Y of the zero line when `zero` was asked for, else null. */
  zeroY: number | null;
  /** Direction the series moved: last point against the first (or against 0 with `zero`). */
  dir: 'up' | 'down' | 'flat';
}

export interface SparkOptions {
  /** Inner padding so a 1.6px stroke isn't clipped at the edges. */
  pad?: number;
  /** Keep 0 inside the range and colour by the last value's sign (P&L, expectancy). */
  zero?: boolean;
}

/** Null when there are fewer than two usable points. */
export function sparkGeometry(values: number[], width: number, height: number, opts: SparkOptions = {}): SparkGeometry | null {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2 || width <= 0 || height <= 0) return null;
  const pad = opts.pad ?? 2;
  let lo = Math.min(...pts, ...(opts.zero ? [0] : []));
  let hi = Math.max(...pts, ...(opts.zero ? [0] : []));
  if (hi - lo < 1e-12) { lo -= 1; hi += 1; } // flat: draw it through the middle
  const x = (i: number) => pad + (i / (pts.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - lo) / (hi - lo));
  const r = (n: number) => Math.round(n * 10) / 10;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${r(x(i))} ${r(y(v))}`).join(' ');
  const last = pts[pts.length - 1]!;
  const ref = opts.zero ? 0 : pts[0]!;
  return {
    line,
    area: `${line} L${r(x(pts.length - 1))} ${height} L${r(x(0))} ${height}Z`,
    zeroY: opts.zero ? r(y(0)) : null,
    dir: last > ref ? 'up' : last < ref ? 'down' : 'flat',
  };
}
