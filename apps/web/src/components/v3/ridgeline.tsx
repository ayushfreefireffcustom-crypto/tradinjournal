// Decorative ridgeline: stacked "sessions" drawn as fine lines, each one
// occluding the one behind it. One line, in green, trends upward through the
// noise. Seeded, so server and client render the same paths.
import { useMemo } from 'react';

const W = 600, H = 720, LINES = 34, PTS = 110, TOP = 150, GAP = 14, HL = 21;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build() {
  const r = rng(7);
  return Array.from({ length: LINES }, (_, i) => {
    const base = TOP + i * GAP;
    const waves = Array.from({ length: 4 }, () => ({ f: 4 + r() * 14, p: r() * Math.PI * 2, a: 0.25 + r() * 0.75 }));
    const pts: string[] = [];
    for (let k = 0; k <= PTS; k++) {
      const x = k / PTS;
      const env = 0.04 + Math.exp(-(((x - 0.5) / 0.19) ** 2));
      let n = 0;
      for (const w of waves) n += w.a * Math.sin(x * w.f + w.p);
      n = Math.abs(n) / 2 + r() * 0.05;
      let h = env * 78 * n;
      if (i === HL) h = env * 26 * n + Math.pow(x, 1.6) * 165;
      pts.push(`${(x * W).toFixed(1)},${(base - h).toFixed(1)}`);
    }
    const line = `M${pts.join('L')}`;
    const end = pts[Math.round(PTS * 0.84)]!.split(',').map(Number) as [number, number];
    return { line, fill: `${line}L${W},${H}L0,${H}Z`, hl: i === HL, end, depth: 0.16 + 0.42 * (i / (LINES - 1)) };
  });
}

export default function Ridgeline({ className }: { className?: string }) {
  const rows = useMemo(build, []);
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <filter id="rl-glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      {rows.map((row, i) => (
        <g key={i} className={`rl-row${row.hl ? ' rl-hl' : ''}`} style={{ animationDelay: `${i * 28}ms` }}>
          <path d={row.fill} className="rl-fill" />
          {row.hl && <path d={row.line} className="rl-glow" filter="url(#rl-glow)" />}
          <path d={row.line} className="rl-line" style={row.hl ? undefined : { strokeOpacity: row.depth }} />
          {row.hl && <><circle cx={row.end[0]} cy={row.end[1]} r="9" className="rl-halo" /><circle cx={row.end[0]} cy={row.end[1]} r="3.2" className="rl-dot" /></>}
        </g>
      ))}
    </svg>
  );
}
