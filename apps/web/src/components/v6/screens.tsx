'use client';

// Dark "monitor" charts used inside v6 cards. They keep one dark palette in both
// themes (like a screen set into the card) and read every value from props.
import { useMemo, useRef, useState } from 'react';
import type { EquityPoint } from '@/lib/api';
import { fmtHold, fmtUsdCompact, type HoldStudy, type SessionStudy, type SymbolBar, SESSIONS } from '@/lib/dashboard-v6';

const C = {
  g: 'var(--scr-g)', r: 'var(--scr-r)', hi: 'var(--scr-hi)', mid: 'var(--scr-mid)', lo: 'var(--scr-lo)',
  axis: 'var(--scr-axis)', tx: 'var(--scr-tx)',
};
const MONO = { fontFamily: 'var(--mono)' } as const;

export function Screen({ caption, children, className = '', empty }: { caption: string; children?: React.ReactNode; className?: string; empty?: string }) {
  return (
    <div className={`s-screen ${className}`}>
      <div className="s-cap">{caption}</div>
      {empty ? <div className="s-empty">{empty}</div> : children}
    </div>
  );
}

// ─── equity ──────────────────────────────────────────────────────────────────

function dateTick(iso: string, spanDays: number) {
  const d = new Date(iso);
  if (spanDays > 300) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  if (spanDays > 6) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}

export function EquityScreen({ curve, caption }: { curve: EquityPoint[]; caption: string }) {
  const W = 320, H = 200, L = 30, R = 8, T = 22, B = 22;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const pts = useMemo(() => {
    // The starting-balance point can carry an empty time; drop anything undated.
    const ok = curve.filter(p => Number.isFinite(new Date(p.time).getTime()) && Number.isFinite(p.equity));
    if (ok.length <= 240) return ok;
    const step = ok.length / 240;
    const out: EquityPoint[] = [];
    for (let i = 0; i < 240; i++) out.push(ok[Math.floor(i * step)]!);
    out.push(ok[ok.length - 1]!);
    return out;
  }, [curve]);

  if (pts.length < 2) return <Screen caption={caption} className="s-eq" empty="Your equity curve draws itself after the first closed trade." />;

  const vals = pts.map(p => p.equity);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx - mn < 1) { mn -= 1; mx += 1; }
  const X = (i: number) => L + (i / (pts.length - 1)) * (W - L - R);
  const Y = (v: number) => H - B - ((v - mn) / (mx - mn)) * (H - T - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.equity).toFixed(1)}`).join(' ');
  const first = new Date(pts[0]!.time).getTime(), last = new Date(pts[pts.length - 1]!.time).getTime();
  const span = (last - first) / 86400000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * (pts.length - 1)));
  const end = pts[pts.length - 1]!;
  const up = end.equity >= pts[0]!.equity;
  const line = up ? C.g : C.r;
  const h = hover != null ? pts[hover]! : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    // viewBox is letterboxed ("meet"): map the pointer into viewBox units.
    const scale = Math.min(box.width / W, box.height / H);
    const ox = (box.width - W * scale) / 2;
    const vx = (e.clientX - box.left - ox) / scale;
    const i = Math.round(((vx - L) / (W - L - R)) * (pts.length - 1));
    setHover(i >= 0 && i < pts.length ? i : null);
  };

  return (
    <Screen caption={caption} className="s-eq">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label={`Equity from ${fmtUsdCompact(pts[0]!.equity)} to ${fmtUsdCompact(end.equity)}`}>
        <defs>
          <linearGradient id="s-eq-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={line} stopOpacity=".22" />
            <stop offset="1" stopColor={line} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => {
          const v = mn + (mx - mn) * f;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={C.axis} strokeDasharray="2 3" />
              <text x={0} y={Y(v) + 3} style={MONO} fontSize="7.5" fill={C.tx}>{fmtUsdCompact(v)}</text>
            </g>
          );
        })}
        <path d={`${d} L${X(pts.length - 1)} ${H - B} L${X(0)} ${H - B}Z`} fill="url(#s-eq-fill)" />
        <path d={d} fill="none" stroke={line} strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={X(pts.length - 1)} cy={Y(end.equity)} r="2.8" fill={line} />
        {h == null && (
          <text x={X(pts.length - 1) - 5} y={Y(end.equity) - 8} textAnchor="end" style={MONO} fontSize="7.5" fill={C.hi}>
            {end.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </text>
        )}
        {ticks.map((i, k) => (
          <text key={k} x={X(i)} y={H - 7} textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'} style={MONO} fontSize="7" fill={C.tx}>
            {dateTick(pts[i]!.time, span)}
          </text>
        ))}
        {h && hover != null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={T - 6} y2={H - B} stroke={C.hi} strokeOpacity=".35" />
            <circle cx={X(hover)} cy={Y(h.equity)} r="3" fill={C.hi} />
            <g transform={`translate(${Math.min(Math.max(X(hover) - 46, L), W - R - 92)} ${T - 18})`}>
              <rect width="92" height="16" rx="4" fill="#1E1E1E" stroke="rgba(255,255,255,.08)" />
              <text x="6" y="10.5" style={MONO} fontSize="7" fill={C.hi}>
                {new Date(h.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {h.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </text>
            </g>
          </g>
        )}
      </svg>
    </Screen>
  );
}

// ─── by symbol ───────────────────────────────────────────────────────────────

export function SymbolScreen({ bars }: { bars: SymbolBar[] }) {
  const W = 260, H = 132, base = 108, top = 18;
  if (!bars.length) return <Screen caption="Gross win · gross loss · net" empty="No closed trades in this range." />;
  const mx = Math.max(1, ...bars.flatMap(b => [b.grossWin, b.grossLoss, Math.abs(b.net)]));
  const sc = (v: number) => (Math.abs(v) / mx) * (base - top);
  const slot = (W - 12) / bars.length;
  const bw = Math.min(11, (slot - 10) / 3);
  return (
    <Screen caption="Gross win · gross loss · net">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gross win, gross loss and net by symbol">
        <line x1="6" x2={W - 6} y1={base} y2={base} stroke={C.axis} />
        {bars.map((b, i) => {
          const x0 = 6 + i * slot + (slot - (bw * 3 + 4)) / 2;
          return (
            <g key={b.symbol}>
              {([[b.grossWin, C.hi], [b.grossLoss, C.lo], [b.net, b.net < 0 ? C.r : C.g]] as const).map(([v, c], k) => {
                const hgt = Math.max(1, sc(v));
                const bx = x0 + k * (bw + 2);
                return (
                  <g key={k}>
                    <rect x={bx} y={base - hgt} width={bw} height={hgt} rx="1.2" fill={c} />
                    {k === 2 && (
                      <text x={bx + bw / 2} y={base - hgt - 3.5} textAnchor="middle" style={MONO} fontSize="6.5" fill={b.net < 0 ? C.r : C.g}>
                        {fmtUsdCompact(v)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={x0 + (bw * 3 + 4) / 2} y={base + 13} textAnchor="middle" style={MONO} fontSize="6.5" fill={C.tx}>{b.symbol.slice(0, 7)}</text>
            </g>
          );
        })}
      </svg>
    </Screen>
  );
}

// ─── P&L vs hold time ────────────────────────────────────────────────────────

export function HoldScreen({ study }: { study: HoldStudy }) {
  const W = 260, H = 132, L = 8, R = 8, mid = 60;
  const pts = study.points;
  if (pts.length < 3) return <Screen caption="P&L vs hold time" empty="Needs at least 3 closed trades." />;
  const secs = pts.map(p => p.secs);
  const lo = Math.log(Math.max(30, Math.min(...secs)));
  const hi = Math.log(Math.max(Math.exp(lo) * 2, Math.max(...secs)));
  const X = (s: number) => L + ((Math.log(Math.max(30, s)) - lo) / (hi - lo)) * (W - L - R);
  // Scale on the 95th percentile so one outlier can't flatten the rest.
  const abs = pts.map(p => Math.abs(p.pnl)).sort((a, b) => a - b);
  const cap = Math.max(1, abs[Math.floor(abs.length * 0.95)] ?? abs[abs.length - 1]!);
  const Y = (v: number) => mid - Math.max(-1, Math.min(1, v / cap)) * 46;
  const median = study.medianSecs ?? 0;
  const shown = pts.length > 300 ? pts.slice(-300) : pts;
  return (
    <Screen caption={`P&L vs hold · ${pts.length} trades · log scale`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter of profit and loss against how long each trade was held">
        <line x1={L} x2={W - R} y1={mid} y2={mid} stroke={C.axis} strokeDasharray="2 3" />
        {median > 0 && <line x1={X(median)} x2={X(median)} y1={13} y2={112} stroke={C.axis} />}
        {shown.map(p => {
          const long = p.secs > median;
          const c = p.pnl > 0 ? (long ? C.g : C.hi) : (long ? C.r : C.mid);
          return <circle key={p.id} cx={X(p.secs).toFixed(1)} cy={Y(p.pnl).toFixed(1)} r={long ? 3.2 : 2.7} fill={c} opacity={c === C.mid ? 0.8 : 0.95} />;
        })}
        <text x={L} y={H - 5} style={MONO} fontSize="6.5" fill={C.tx}>{fmtHold(Math.exp(lo))}</text>
        {median > 0 && <text x={Math.min(X(median) + 3, W - R)} y={9} textAnchor={X(median) > W - 60 ? 'end' : 'start'} style={MONO} fontSize="6.5" fill={C.hi}>median {fmtHold(median)}</text>}
        <text x={W - R} y={H - 5} textAnchor="end" style={MONO} fontSize="6.5" fill={C.tx}>{fmtHold(Math.exp(hi))}</text>
      </svg>
    </Screen>
  );
}

// ─── entry → exit hour arcs ──────────────────────────────────────────────────

export function SessionScreen({ study }: { study: SessionStudy }) {
  const W = 260, H = 132, base = 110, L = 12, R = 12;
  const best = study.best?.key;
  if (!study.best) return <Screen caption="Entry → exit hour (UTC)" empty="No closed trades in this range." />;
  const X = (h: number) => L + (h / 24) * (W - L - R);
  const arcs = study.arcs.slice(-80);
  const band = SESSIONS.find(s => s.key === best)!;
  // Draw the highlighted session last so it sits on top.
  const ordered = [...arcs.filter(a => a.session !== best), ...arcs.filter(a => a.session === best)];
  return (
    <Screen caption={`Entry → exit hour, UTC · ${best}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trades drawn from entry hour to exit hour; ${best} session highlighted`}>
        <rect x={X(band.from)} y={base - 1} width={X(band.to) - X(band.from)} height="2" fill={C.g} opacity=".7" />
        <line x1={L} x2={W - R} y1={base} y2={base} stroke={C.axis} />
        {ordered.map(a => {
          const x1 = X(a.from), x2 = X(a.to), r = Math.max(0.5, (x2 - x1) / 2);
          const on = a.session === best;
          const c = on ? (a.pnl > 0 ? C.g : C.r) : (a.pnl > 0 ? C.mid : C.lo);
          return <path key={a.id} d={`M${x1.toFixed(1)} ${base} A ${r.toFixed(1)} ${Math.min(r, 92).toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${base}`} fill="none" stroke={c} strokeWidth={on ? 1.3 : 0.9} opacity={on ? 0.95 : 0.7} />;
        })}
        {[0, 3, 6, 9, 12, 15, 18, 21].map(hr => (
          <text key={hr} x={X(hr)} y={base + 13} textAnchor="middle" style={MONO} fontSize="6.5" fill={hr >= band.from && hr < band.to ? C.g : C.tx}>
            {String(hr).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </Screen>
  );
}
