'use client';

// Small charts for the partner reports: monthly bars and per-metric daily small
// multiples. One hue per chart (a single series needs no legend); hover shows the value.
import { useEffect, useRef, useState } from 'react';
import '@/styles/v6/ib.css';

/** The element's rendered width, so charts draw at 1:1 and labels stay readable on phones. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (el.clientWidth) setW(el.clientWidth); });
    ro.observe(el);
    if (el.clientWidth) setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function MonthBars({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const W = Math.min(560, width), H = 140, gap = 6, bw = Math.min(44, Math.max(6, (W - gap * (data.length - 1)) / Math.max(data.length, 1)));
  // Label every month when they fit (~44px each), otherwise just the first and last.
  const allTicks = data.length * (bw + gap) >= data.length * 44;
  return (
    <div className="ib-chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H + 20}`} role="img" aria-label="Monthly values" className="ib-chart-svg" onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={H} y2={H} className="ib-axis" />
        {data.map((d, i) => {
          const h = Math.max(2, (Math.abs(d.value) / max) * (H - 10));
          const x = i * (bw + gap);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <rect x={x} y={H - h} width={bw} height={h} rx={4} className={d.value < 0 ? 'ib-bar neg' : hover === i ? 'ib-bar on' : 'ib-bar'} />
              {(i === 0 || i === data.length - 1 || allTicks) && <text x={x + bw / 2} y={H + 15} textAnchor="middle" className="ib-tick">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && <div className="ib-tip" style={{ left: `${((hover * (bw + gap) + bw / 2) / W) * 100}%` }}><b>{format(data[hover]!.value)}</b><span>{data[hover]!.label}</span></div>}
    </div>
  );
}

/** One small bar chart per metric, sharing the day axis. */
export function DailyMultiples<K extends string>({ days, series }: { days: string[]; series: { key: K; label: string; values: number[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300, H = 56;
  const bw = W / Math.max(days.length, 1);
  return (
    <div className="ib-multis" onMouseLeave={() => setHover(null)}>
      {series.map(s => {
        const max = Math.max(...s.values, 1), total = s.values.reduce((a, b) => a + b, 0);
        return (
          <div key={s.key} className="ib-multi">
            <div className="ib-multi-h"><span>{s.label}</span><b className="m">{hover != null ? s.values[hover] ?? 0 : total.toLocaleString('en-US')}</b></div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ib-multi-svg" role="img" aria-label={`${s.label} per day`}>
              {s.values.map((v, i) => {
                const h = v ? Math.max(2, (v / max) * (H - 4)) : 0;
                return (
                  <g key={i} onMouseEnter={() => setHover(i)}>
                    <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
                    {h > 0 && <rect x={i * bw + (bw - Math.min(bw * 0.7, 12)) / 2} y={H - h} width={Math.max(1, Math.min(bw * 0.7, 12))} height={h} rx={Math.min(3, bw * 0.3)} className={hover === i ? 'ib-bar on' : 'ib-bar'} />}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
      <div className="ib-multi-axis"><span>{days[0]}</span><span>{hover != null ? days[hover] : 'total in range'}</span><span>{days[days.length - 1]}</span></div>
    </div>
  );
}

export function CohortTable({ rows }: { rows: { month: string; signups: number; connected: number; verified: number; everActive: number; activeNow: number; unlockedNow: number }[] }) {
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const cell = (a: number, b: number) => {
    const p = pct(a, b);
    return <td className="n m ib-heat" style={{ ['--a' as string]: (p / 100).toFixed(2) }} title={`${a} of ${b}`}>{b ? `${p}%` : '—'}</td>;
  };
  return (
    <div className="x-tblwrap ad-scroll">
      <table className="x-tbl ad-tbl ib-tbl ib-cohorts">
        <thead><tr><th>Signed up in</th><th className="n">Clients</th><th className="n">Connected</th><th className="n">Verified</th><th className="n">Were active</th><th className="n">Active now</th><th className="n">Unlocked now</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.month}>
            <td className="m">{r.month}</td><td className="n m">{r.signups}</td>
            {cell(r.connected, r.signups)}{cell(r.verified, r.signups)}{cell(r.everActive, r.signups)}{cell(r.activeNow, r.signups)}{cell(r.unlockedNow, r.signups)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
