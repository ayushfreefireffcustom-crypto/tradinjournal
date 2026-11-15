'use client';

// SVG charts for Analytics v2. Each chart measures its own width (useWidth)
// and lays itself out for it; AI marks (outlines, callouts) render only when
// `ai` is on and carry data-ai so the "AI notes" switch hides them.
import { useMemo } from 'react';
import type { DashSession } from '@/lib/dashboard-v2-api';
import {
  calendarWeeks, fmtHold, heat, monthLabel, multDomain, pageCols,
  type AnaBehaviour, type AnaExit, type AnaHold, type AnaMonth, type AnaPerformance, type AnaSegment, type AnaSymbolSeries, type AnaTime,
} from '@/lib/analytics-v2-api';
import { axisMoney, DAY_SHORT, isFlat, kmoney, money, path, pct, plural, rfmt, scale, ticks, toneColor } from '@/lib/dashboard-v2-format';
import { Callout, calloutW, useWidth } from '@/components/dashboard-v2/ui';

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const SES: Record<DashSession, string> = { ASIA: 'Asia', LONDON: 'London', NY: 'NY' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Rough text width for Inter (px). */
export const textW = (s: string, size = 13, bold = false) => s.length * size * (bold ? 0.6 : 0.56);
/** Cut text to fit a width, with an ellipsis. */
export function fit(s: string, px: number, size = 13, bold = false): string {
  if (textW(s, size, bold) <= px) return s;
  const n = Math.max(1, Math.floor(px / (size * (bold ? 0.6 : 0.56))) - 1);
  return `${s.slice(0, n)}…`;
}
const wkLabel = (d?: string) => { if (!d) return ''; const t = new Date(`${d}T00:00:00Z`); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}${t.getUTCFullYear() !== new Date().getUTCFullYear() ? ` ’${String(t.getUTCFullYear()).slice(2)}` : ''}`; };
const short = (v: number) => kmoney(v).replace('$', '');
/** Cell colour: green / red by sign, neutral when the value shows as 0. */
const fill = (v: number, a: number) => (isFlat(v) ? 'var(--d2-chip)' : v >= 0 ? `rgba(8,196,101,${(0.14 + a * 0.8).toFixed(2)})` : `rgba(254,58,49,${(0.14 + a * 0.8).toFixed(2)})`);
const axisV = (v: number, unit: '$' | 'R') => (unit === 'R' ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${+Math.abs(v).toFixed(2)}R` : `${v < 0 ? '−' : ''}$${axisMoney(Math.abs(v))}`);
const fmtU = (v: number, unit: '$' | 'R') => (unit === 'R' ? rfmt(v) : money(v));

// ─── hero: symbol × session bars ─────────────────────────────────────────────

export function SegBars({ rows }: { rows: AnaSegment[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rowH = 25, padT = 4;
  const h = padT + rows.length * rowH + 18;
  let body = null;
  if (w > 0 && rows.length) {
    const narrow = w < 400;
    const lab = narrow ? 100 : 128, valW = narrow ? 50 : 58, note = narrow ? 0 : 58;
    const mxP = Math.max(0, ...rows.map(r => r.net)), mxN = Math.max(0, ...rows.map(r => -r.net));
    const avail = Math.max(40, w - lab - valW - note - 8);
    const negW = mxN && mxP ? Math.max(24, avail * (mxN / (mxN + mxP))) : mxN ? avail : 0;
    const posW = avail - negW;
    const x0 = lab + negW;
    const k = Math.max(mxP / Math.max(posW, 1), mxN / Math.max(negW, 1), 1e-9);
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Net by symbol and session">
        <line x1={x0} x2={x0} y1={0} y2={h - 16} stroke="var(--line-2)" />
        {rows.map((r, i) => {
          const y = padT + i * rowH, bw = Math.max(1.5, Math.abs(r.net) / k), up = r.net >= 0;
          const ses = SES[r.session];
          const symTxt = fit(r.symbol, lab - textW(` ${ses}`, narrow ? 11 : 13) - 4, 13, true);
          return (
            <g key={`${r.symbol}|${r.session}`}>
              <title>{`${r.symbol} ${ses}: ${money(r.net)} · ${plural(r.n, 'trade')} · ${pct(r.wins / r.n)} won`}</title>
              <text x={0} y={y + 14} fontSize={13} fontWeight={600} fill="var(--tx)">{symTxt} <tspan fill="var(--mut)" fontWeight={500} fontSize={narrow ? 11 : 13}>{ses}</tspan></text>
              <rect x={up ? x0 : x0 - bw} y={y + 5} width={bw} height={13} rx={2} fill={up ? 'var(--d2-g)' : 'var(--d2-r)'} />
              {!narrow && <text x={up ? x0 + bw + 6 : x0 + 6} y={y + 15} fontSize={11} fill="var(--dim)">{r.n} · {pct(r.wins / r.n)}</text>}
              <text x={w} y={y + 15} fontSize={13} fontWeight={900} fill={up ? 'var(--d2-gt)' : 'var(--d2-rt)'} textAnchor="end" className="mny">{kmoney(r.net)}</text>
            </g>
          );
        })}
        <text x={x0} y={h - 2} fontSize={11} fill="var(--dim)" textAnchor="middle">$0</text>
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── hero: win rate vs avg result ────────────────────────────────────────────

export function Quadrant({ rows, winRate, unit, ai }: { rows: AnaSegment[]; winRate: number; unit: '$' | 'R'; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 420 ? 270 : 330;
  const padL = unit === 'R' ? 40 : 46, padR = 10, padT = 12, padB = 26;
  let body = null;
  if (w > 0 && rows.length) {
    const vs = rows.map(r => r.avg);
    const mag = Math.max(...vs.map(Math.abs), unit === 'R' ? 0.25 : 1);
    const lo = Math.min(-mag * 0.2, ...vs) - mag * 0.15, hi = Math.max(mag * 0.2, ...vs) + mag * 0.15;
    const x = scale(0, 1, padL, w - padR), y = scale(lo, hi, h - padB, padT);
    const maxN = Math.max(...rows.map(r => r.n));
    const rr = (n: number) => Math.min(w < 420 ? 16 : 22, 4 + Math.sqrt(n) * (maxN > 80 ? 1.4 : 2.2));
    const xw = x(winRate);
    // Keep every bubble inside the plot (a 0% or 100% segment would be cut in half).
    const cxOf = (r: AnaSegment) => Math.max(padL + rr(r.n), Math.min(w - padR - rr(r.n), x(r.wins / r.n)));
    const cyOf = (r: AnaSegment) => Math.max(padT + rr(r.n), Math.min(h - padB - rr(r.n), y(r.avg)));
    const best = rows[0]!, worst = rows.at(-1)!;
    const callouts: React.ReactNode[] = [];
    if (ai) {
      const boxes: Box[] = [];
      const place = (r: AnaSegment, tone: 'up' | 'dn', key: string) => {
        const text = `${r.symbol} ${SES[r.session]} · ${kmoney(r.net)}`;
        const cw = Math.min(calloutW(text), w - padL);
        const cx = cxOf(r), cy = cyOf(r), rad = rr(r.n);
        const cands: Box[] = [
          { x: cx - cw - rad - 4, y: cy - 17, w: cw, h: 34 }, { x: cx + rad + 4, y: cy - 17, w: cw, h: 34 },
          { x: cx - cw / 2, y: cy + rad + 4, w: cw, h: 34 }, { x: cx - cw / 2, y: cy - rad - 38, w: cw, h: 34 },
        ].map(b => ({ ...b, x: Math.max(padL, Math.min(b.x, w - padR - cw)), y: Math.max(padT, Math.min(b.y, h - padB - 34)) }));
        const b = cands.find(c => !boxes.some(o => hit(o, c)) && !hit(c, { x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2 })) ?? cands[0]!;
        boxes.push(b);
        callouts.push(<Callout key={key} x={b.x} y={b.y} text={text} tone={tone} maxX={w - padR} />);
      };
      if (best.net > 0) place(best, 'up', 'best');
      if (worst !== best && worst.net < 0) place(worst, 'dn', 'worst');
    }
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={`Win rate against average ${unit === 'R' ? 'R' : 'result'} per segment`}>
        <rect x={xw} y={padT} width={Math.max(0, w - padR - xw)} height={Math.max(0, y(0) - padT)} fill="var(--d2-gfill)" />
        <rect x={padL} y={y(0)} width={Math.max(0, xw - padL)} height={Math.max(0, h - padB - y(0))} fill="var(--d2-rfill)" />
        {ticks(lo, hi, 4).map(t => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} />
            <text x={padL - 6} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{axisV(t, unit)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map(v => <text key={v} x={x(v)} y={h - 8} fontSize={11} fill="var(--dim)" textAnchor={v === 0 ? 'start' : v === 1 ? 'end' : 'middle'}>{pct(v)}</text>)}
        <line x1={xw} x2={xw} y1={padT} y2={h - padB} stroke="var(--line-2)" strokeDasharray="3 3" />
        <text x={w - padR - 4} y={padT + 14} fontSize={11} fontWeight={700} fill="var(--d2-gt)" textAnchor="end">EDGE</text>
        <text x={padL + 4} y={h - padB - 6} fontSize={11} fontWeight={700} fill="var(--d2-rt)">BLEED</text>
        {[...rows].sort((a, b) => b.n - a.n).map(r => (
          <circle key={`${r.symbol}|${r.session}`} cx={cxOf(r)} cy={cyOf(r)} r={rr(r.n)} fill={r.net >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} fillOpacity={0.3} stroke={r.net >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} strokeWidth={1.25}>
            <title>{`${r.symbol} ${SES[r.session]}: ${pct(r.wins / r.n)} won · avg ${fmtU(r.avg, unit)} · ${plural(r.n, 'trade')} · ${money(r.net)}`}</title>
          </circle>
        ))}
        {callouts}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── performance: calendar ───────────────────────────────────────────────────

export function Calendar({ perf, unit, ai, back, onBack }: { perf: AnaPerformance; unit: '$' | 'R'; ai: boolean; back: number; onBack: (b: number) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const cal = useMemo(() => calendarWeeks(perf.days, perf.weeks), [perf.days, perf.weeks]);
  const narrow = w < 520;
  const padL = 30, padT = 18, gap = 3, ch = narrow ? 24 : 34;
  const minCw = narrow ? 16 : 36, maxCw = 64;
  const fitN = Math.max(1, Math.floor((w - padL + gap) / (minCw + gap)));
  const pg = pageCols(cal.cols, fitN, back);
  const n = pg.shown.length;
  const cw = n ? Math.min(maxCw, (w - padL - gap * (n - 1)) / n) : 0;
  const worstIdx = pg.shown.findIndex(c => c.start === perf.worstWeek);
  const showCallout = ai && worstIdx >= 0;
  const gridH = cal.rows.length * (ch + gap);
  const h = padT + gridH + (narrow ? 4 : 20) + (showCallout ? 44 : 0);
  const val = (c: { net: number; r: number | null }) => (unit === 'R' ? c.r ?? 0 : c.net);
  const mx = Math.max(1e-9, ...perf.days.map(d => Math.abs(val(d))));
  const weekVal = (c: (typeof cal.cols)[number]) => (unit === 'R' ? c.days.reduce((a, d) => a + (d.cell?.r ?? 0), 0) : c.total?.net ?? 0);
  const fmtCell = (v: number) => (unit === 'R' ? rfmt(v, Math.abs(v) < 0.05 ? 2 : 1).slice(0, -1) : short(v));
  const fmtWeek = (v: number) => (unit === 'R' ? rfmt(v, Math.abs(v) < 0.05 ? 2 : 1) : kmoney(v));
  let body = null;
  if (w > 0 && n) {
    let lastM = -1;
    const wx = padL + worstIdx * (cw + gap);
    const ctext = perf.worstWeek ? `Worst week · ${MONTHS[new Date(`${perf.worstWeek}T00:00:00Z`).getUTCMonth()]} ${new Date(`${perf.worstWeek}T00:00:00Z`).getUTCDate()} · ${kmoney(perf.weeks.find(x => x.start === perf.worstWeek)?.net ?? 0)}` : '';
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Daily net P&L calendar">
        {cal.rows.map((r, i) => <text key={r} x={0} y={padT + i * (ch + gap) + ch / 2 + 4} fontSize={11} fill="var(--dim)">{DAY_SHORT[r]}</text>)}
        {pg.shown.map((c, k) => {
          const cx = padL + k * (cw + gap);
          const m = new Date(`${c.start}T00:00:00Z`).getUTCMonth();
          const label = m !== lastM ? MONTHS[m] : null;
          lastM = m;
          const wv = weekVal(c);
          return (
            <g key={c.start}>
              {label && (k === 0 || cw * 2 > 30) && <text x={cx} y={11} fontSize={11} fontWeight={600} fill="var(--mut)">{label}</text>}
              {c.days.map((d, i) => {
                const y = padT + i * (ch + gap);
                if (!d.cell) return <rect key={d.d} x={cx} y={y} width={cw} height={ch} rx={3} fill="none" stroke="var(--line)" />;
                const v = val(d.cell), a = heat(v, mx);
                return (
                  <g key={d.d}>
                    <rect x={cx} y={y} width={cw} height={ch} rx={3} fill={fill(v, a)}><title>{`${DAY_SHORT[new Date(`${d.d}T00:00:00Z`).getUTCDay()]} ${d.d}: ${unit === 'R' ? rfmt(v) : money(v)} · ${d.cell.n} trade${d.cell.n === 1 ? '' : 's'}`}</title></rect>
                    {!narrow && cw >= 34 && <text x={cx + cw / 2} y={y + ch / 2 + 4} fontSize={11} fontWeight={700} fill={a > 0.62 ? '#fff' : 'var(--tx)'} textAnchor="middle" className="mny" pointerEvents="none">{fmtCell(v)}</text>}
                  </g>
                );
              })}
              {!narrow && c.total && <text x={cx + cw / 2} y={padT + gridH + 12} fontSize={11} fontWeight={700} fill={toneColor(wv, 'var(--d2-gt)', 'var(--d2-rt)')} textAnchor="middle" className="mny">{cw >= 40 ? fmtWeek(wv) : ''}</text>}
            </g>
          );
        })}
        {showCallout && (
          <g data-ai>
            <rect x={wx - 2.5} y={padT - 3} width={cw + 5} height={gridH + (narrow ? 4 : 20)} rx={5} fill="none" stroke="var(--d2-rt)" strokeWidth={1.5} strokeDasharray="4 3" />
            <Callout x={Math.max(0, Math.min(w - calloutW(ctext), wx + cw / 2 - calloutW(ctext) / 2))} y={padT + gridH + (narrow ? 10 : 26)} text={ctext} maxX={w} lead={[wx + cw / 2, padT + gridH + (narrow ? 1 : 17)]} />
          </g>
        )}
      </svg>
    );
  }
  return (
    <div className="a2-cal">
      {pg.maxBack > 0 && (
        <div className="a2-pager">
          <span className="d2-dim">{wkLabel(pg.shown[0]?.start)} – {wkLabel(pg.shown.at(-1)?.start)} · {pg.shown.length} of {cal.cols.length} weeks</span>
          <span className="a2-pgs">
          <button type="button" className="a2-pg" onClick={() => onBack(Math.min(pg.maxBack, pg.back + n))} disabled={pg.back >= pg.maxBack} data-testid="cal-earlier">Earlier</button>
          <button type="button" className="a2-pg" onClick={() => onBack(Math.max(0, pg.back - n))} disabled={pg.back === 0} data-testid="cal-later">Later</button>
          </span>
        </div>
      )}
      <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>
    </div>
  );
}

// ─── performance: by month ───────────────────────────────────────────────────

export function MonthBars({ months, ai }: { months: AnaMonth[]; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 250, padT = 28, padB = 38;
  const shown = months.slice(-Math.max(1, Math.min(12, Math.floor((w || 300) / 44))));
  let body = null;
  if (w > 0 && shown.length) {
    const multiYear = new Set(shown.map(m => m.key.slice(0, 4))).size > 1;
    const lo = Math.min(0, ...shown.map(m => m.net)), hi = Math.max(0, ...shown.map(m => m.net));
    const pad = (hi - lo || 1) * 0.16;
    const y = scale(lo - (lo < 0 ? pad : 0), hi + pad, h - padB, padT);
    const gap = w / shown.length, bw = Math.min(46, gap - 12);
    const elig = shown.filter(m => m.n >= 3);
    const least = shown.length >= 2 && elig.length ? elig.reduce((a, m) => (m.net / m.n < a.net / a.n ? m : a)) : null;
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Net P&L by month">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {shown.map((m, i) => {
          const cx = gap * i + gap / 2, up = m.net >= 0;
          const top = y(Math.max(0, m.net)), hgt = Math.max(1.5, Math.abs(y(m.net) - y(0)));
          const valY = up ? top - 7 : y(m.net) + 15;
          return (
            <g key={m.key}>
              <title>{`${m.key}: ${money(m.net)} · ${plural(m.n, 'trade')} · ${pct(m.wins / m.n)} won`}</title>
              <rect x={cx - bw / 2} y={top} width={bw} height={hgt} rx={2} fill={up ? 'var(--d2-g)' : 'var(--d2-r)'} fillOpacity={ai && least === m ? 0.45 : 1} />
              {gap >= 40 && <text x={cx} y={Math.min(valY, h - padB - 2)} fontSize={gap >= 60 ? 13 : 11} fontWeight={800} fill="var(--tx)" textAnchor="middle" className="mny">{kmoney(m.net)}</text>}
              <text x={cx} y={h - 20} fontSize={11} fontWeight={600} fill="var(--tx)" textAnchor="middle">{monthLabel(m.key, multiYear)}</text>
              {gap >= 64 && <text x={cx} y={h - 5} fontSize={11} fill="var(--dim)" textAnchor="middle">{m.n} tr · {pct(m.wins / m.n)}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
  return (
    <>
      <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>
      {months.length > shown.length && w > 0 && <div className="a2-sub">Last {shown.length} of {months.length} months</div>}
    </>
  );
}

// ─── time: hour × weekday ────────────────────────────────────────────────────

export function HourHeat({ time, metric, ai }: { time: AnaTime; metric: '$' | 'win'; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const narrow = w < 520;
  const padL = 34, padT = 18, gap = narrow ? 1 : 2, ch = narrow ? 24 : 30, totW = narrow ? 0 : 50;
  const rowsH = time.days.length * (ch + gap);
  const late = time.late;
  const lateText = late ? `After ${String(late.from).padStart(2, '0')}:00 · ${kmoney(late.net)}` : '';
  const h = padT + rowsH + 16 + (ai && late ? 44 : 0);
  let body = null;
  if (w > 0) {
    const cw = (w - padL - totW - 23 * gap) / 24;
    const x = (hr: number) => padL + hr * (cw + gap);
    const cells = new Map(time.cells.map(c => [`${c.day}|${c.hour}`, c]));
    const mx = Math.max(1e-9, ...time.cells.map(c => Math.abs(c.net)));
    const lastHour = late ? Math.max(late.from, ...time.cells.filter(c => c.hour >= late.from).map(c => c.hour)) : 0;
    const every = cw >= 22 ? 3 : 6;
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={`${metric === '$' ? 'Net P&L' : 'Win rate'} by hour and weekday (UTC)`}>
        {[[0, 'Asia'], [7, narrow ? 'Lon' : 'London'], [13, narrow ? 'NY' : 'New York']].map(([hr, l]) => (
          <g key={l as string}>
            <line x1={x(hr as number) - gap / 2} x2={x(hr as number) - gap / 2} y1={2} y2={padT + rowsH} stroke="var(--line-2)" />
            <text x={x(hr as number) + 2} y={11} fontSize={11} fontWeight={600} fill="var(--mut)">{l}</text>
          </g>
        ))}
        {time.days.map((d, i) => {
          const y = padT + i * (ch + gap);
          const tot = time.dayTotals.find(t => t.day === d);
          return (
            <g key={d}>
              <text x={0} y={y + ch / 2 + 4} fontSize={11} fontWeight={600} fill="var(--mut)">{DAY_SHORT[d]}</text>
              {Array.from({ length: 24 }, (_, hr) => {
                const c = cells.get(`${d}|${hr}`);
                if (!c || !c.n) return <rect key={hr} x={x(hr)} y={y} width={cw} height={ch} rx={2} fill="var(--grid)" />;
                const v = metric === '$' ? c.net : (c.wins / c.n - 0.5) * 2;
                const a = metric === '$' ? heat(c.net, mx) : Math.min(1, Math.abs(v));
                return <rect key={hr} x={x(hr)} y={y} width={cw} height={ch} rx={2} fill={metric === 'win' && v === 0 ? 'var(--d2-chip)' : fill(v, a)}><title>{`${DAY_SHORT[d]} ${String(hr).padStart(2, '0')}:00 UTC: ${money(c.net)} · ${c.wins}/${c.n} won`}</title></rect>;
              })}
              {!narrow && tot && tot.n > 0 && <text x={w} y={y + ch / 2 + 4} fontSize={11} fontWeight={800} fill={metric === '$' ? toneColor(tot.net, 'var(--d2-gt)', 'var(--d2-rt)') : 'var(--tx)'} textAnchor="end" className={metric === '$' ? 'mny' : ''}>{metric === '$' ? kmoney(tot.net) : pct(tot.wins / tot.n)}</text>}
            </g>
          );
        })}
        {Array.from({ length: 24 / every }, (_, k) => k * every).map(hr => <text key={hr} x={x(hr) + cw / 2} y={padT + rowsH + 12} fontSize={11} fill="var(--dim)" textAnchor="middle">{String(hr).padStart(2, '0')}</text>)}
        {ai && late && (
          <g data-ai>
            <rect x={x(late.from) - 2} y={padT - 3} width={x(lastHour) + cw - x(late.from) + 4} height={rowsH + 3} rx={4} fill="none" stroke="var(--d2-rt)" strokeWidth={1.5} strokeDasharray="4 3" />
            <Callout x={Math.max(0, Math.min(w - calloutW(lateText), x(late.from)))} y={padT + rowsH + 22} text={lateText} maxX={w} />
          </g>
        )}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── generic horizontal diverging rows (sessions, size, tags, emotions) ─────

export interface HRow { key: string; label: string; sub?: string; value: number; tip?: string }
/** Label column on the left on wide cards; label line above the bar on narrow ones. Subs wrap at " · ". */
export function HBars({ rows, unit = '$', label = 'Bars', compact = false }: { rows: HRow[]; unit?: '$' | 'R'; label?: string; compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const stacked = w > 0 && w < 400;
  const lab = stacked ? 0 : Math.min(170, Math.max(96, w * 0.36));
  const two = !stacked && rows.some(r => r.sub && textW(r.sub, 11) > lab - 8 && r.sub.includes(' · '));
  const rowH = stacked ? (compact ? 46 : 52) : two ? (compact ? 54 : 62) : compact ? 42 : 60;
  const h = rows.length * rowH + 4;
  let body = null;
  if (w > 0 && rows.length) {
    const valW = unit === 'R' ? 56 : 62;
    const mxP = Math.max(0, ...rows.map(r => r.value)), mxN = Math.max(0, ...rows.map(r => -r.value));
    const avail = Math.max(30, w - lab - valW * (mxN && mxP ? 2 : 1) - 4);
    const negW = mxN && mxP ? avail * (mxN / (mxN + mxP)) : mxN ? avail : 0;
    const x0 = lab + (mxN ? valW : 0) + negW;
    const k = Math.max(mxP / Math.max(1, avail - negW), mxN / Math.max(1, negW), 1e-9);
    const fmt = (v: number) => (unit === 'R' ? rfmt(v) : kmoney(v));
    const barY = stacked ? 20 : 4, barH = compact ? 14 : 16;
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={label}>
        <line x1={x0} x2={x0} y1={stacked ? 18 : 0} y2={h} stroke="var(--line-2)" />
        {rows.map((r, i) => {
          const y = i * rowH + 4, bw = Math.max(1.5, Math.abs(r.value) / k), up = r.value >= 0;
          const subs = r.sub ? (two && textW(r.sub, 11) > lab - 8 ? r.sub.split(' · ') : [r.sub]) : [];
          return (
            <g key={r.key}>
              {r.tip && <title>{r.tip}</title>}
              {stacked ? (
                <text x={0} y={y + 12} fontSize={13} fontWeight={700} fill="var(--tx)">{fit(r.label, w * 0.55, 13, true)}{r.sub && <tspan fontSize={11} fontWeight={500} fill="var(--dim)">{`  ${fit(r.sub, w - Math.min(textW(r.label, 13, true), w * 0.55) - 12, 11)}`}</tspan>}</text>
              ) : (
                <>
                  <text x={0} y={y + 13} fontSize={13} fontWeight={700} fill="var(--tx)">{fit(r.label, lab - 8, 13, true)}</text>
                  {subs.map((t, j) => <text key={j} x={0} y={y + 29 + j * 14} fontSize={11} fill="var(--dim)">{fit(t, lab - 8, 11)}</text>)}
                </>
              )}
              <rect x={up ? x0 : x0 - bw} y={y + barY} width={bw} height={barH} rx={2} fill={up ? 'var(--d2-g)' : 'var(--d2-r)'} />
              <text x={up ? x0 + bw + 6 : x0 - bw - 6} y={y + barY + barH - 3} fontSize={13} fontWeight={900} fill={up ? 'var(--d2-gt)' : 'var(--d2-rt)'} textAnchor={up ? 'start' : 'end'} className={unit === '$' ? 'mny' : ''}>{fmt(r.value)}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── symbols: cumulative small multiples ─────────────────────────────────────

export function SmallMultiples({ series, shared, ai, total }: { series: AnaSymbolSeries[]; shared: boolean; ai: boolean; total: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const cols = w >= 560 ? 3 : w >= 300 ? 2 : 1;
  const cw = cols ? (w - (cols - 1) * 16) / cols : 0;
  const ch = w < 420 ? 84 : 120;
  return (
    <div ref={ref} className="a2-sm" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {w > 0 && series.map((s, i) => {
        const [lo, hi] = multDomain(series, shared, i);
        const x = scale(0, Math.max(1, s.pts.length - 1), 2, cw - 4), y = scale(lo, hi, ch - 4, 6);
        const up = s.net >= 0;
        const pause = s.flag === 'pause', share = s.flag === 'share' && total > 0;
        const note = ai && pause ? `Pause · lost ${s.monthsLost} of ${s.monthsTraded} mo` : ai && share ? `${pct(s.net / total)} of your profit` : '';
        return (
          <div key={s.symbol} className={`a2-smc${ai && pause ? ' flagd' : ''}`} data-testid={`mult-${s.symbol}`}>
            <div className="a2-smh"><b>{s.symbol}</b><b className={`d2-n mny ${up ? 'up' : 'dn'}`}>{money(s.net)}</b></div>
            <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} className="d2-chart" role="img" aria-label={`${s.symbol} cumulative P&L`}>
              {ticks(lo, hi, 3).map(t => <line key={t} x1={0} x2={cw} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} />)}
              <path d={path(s.pts.map((p, k) => [x(k), y(p.v)]))} fill="none" stroke={up ? 'var(--d2-g)' : 'var(--d2-r)'} strokeWidth={1.5} strokeLinejoin="round" />
              <circle cx={x(s.pts.length - 1)} cy={y(s.pts.at(-1)!.v)} r={2.5} fill={up ? 'var(--d2-g)' : 'var(--d2-r)'} />
              {note && <Callout x={Math.max(0, cw / 2 - calloutW(note) / 2)} y={4} text={note} tone={pause ? 'dn' : 'up'} maxX={cw} />}
            </svg>
            <div className="a2-smf"><span>{s.n} trade{s.n === 1 ? '' : 's'}</span><span>{pct(s.wins / s.n)} won</span><span>PF {s.profitFactor == null ? '–' : s.profitFactor.toFixed(2)}</span></div>
          </div>
        );
      })}
    </div>
  );
}

// ─── risk: time in trade vs result ───────────────────────────────────────────

const HOLD_TICKS = [60e3, 5 * 60e3, 15 * 60e3, 3.6e6, 4 * 3.6e6, 12 * 3.6e6, 86.4e6, 3 * 86.4e6, 7 * 86.4e6, 30 * 86.4e6];
export function HoldScatter({ hold, ai }: { hold: AnaHold; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 400 ? 230 : 260;
  const padL = hold.unit === 'R' ? 36 : 44, padB = 22, padT = ai && hold.longLosers ? 42 : 10, padR = 6;
  let body = null;
  if (w > 0 && hold.points.length) {
    const lx = (ms: number) => Math.log10(Math.max(30e3, ms));
    const xs = hold.points.map(p => lx(p.ms));
    const x0 = Math.min(...xs), x1 = Math.max(x0 + 0.5, ...xs);
    const vs = hold.points.map(p => p.v).sort((a, b) => a - b);
    const q = (f: number) => vs[Math.min(vs.length - 1, Math.max(0, Math.round(f * (vs.length - 1))))]!;
    const lo = Math.min(0, hold.unit === 'R' ? Math.max(-3, vs[0]!) : q(0.02)), hi = Math.max(0, hold.unit === 'R' ? Math.min(5, vs.at(-1)!) : q(0.98));
    const pad = (hi - lo || 1) * 0.06;
    const x = scale(x0, x1, padL + 4, w - padR - 4), y = scale(lo - pad, hi + pad, h - padB, padT);
    const cy = (v: number) => y(Math.max(lo - pad, Math.min(hi + pad, v)));
    const xt = HOLD_TICKS.filter(t => lx(t) >= x0 - 0.02 && lx(t) <= x1 + 0.02).filter((t, i, a) => i === 0 || x(lx(t)) - x(lx(a[i - 1]!)) >= 46);
    const ll = hold.longLosers;
    const text = ll ? `${plural(ll.n, 'loser')} held ${fmtHold(ll.thresholdMs)}+ · ${kmoney(ll.net)}` : '';
    const rx = ll ? Math.max(padL, x(lx(ll.thresholdMs))) : 0;
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Time in trade against result">
        {ticks(lo - pad, hi + pad, 4).map(t => (
          <g key={t}><line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} /><text x={padL - 6} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{axisV(t, hold.unit)}</text></g>
        ))}
        {xt.map(t => <text key={t} x={x(lx(t))} y={h - 5} fontSize={11} fill="var(--dim)" textAnchor="middle">{fmtHold(t)}</text>)}
        {hold.points.map((p, i) => <circle key={i} cx={x(lx(p.ms))} cy={cy(p.v)} r={2.6} fill={p.win ? 'var(--d2-g)' : 'var(--d2-r)'} fillOpacity={0.7} />)}
        {ai && ll && rx < w - padR - 8 && (
          <g data-ai>
            <rect x={rx} y={y(0) + 3} width={w - padR - rx} height={Math.max(4, h - padB - y(0) - 3)} rx={4} fill="none" stroke="var(--d2-rt)" strokeDasharray="3 3" />
            <Callout x={w - padR - calloutW(text)} y={2} text={text} maxX={w - padR} lead={[Math.min(w - padR - 20, rx + 20), y(0) + 3]} />
          </g>
        )}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── risk: exit efficiency ───────────────────────────────────────────────────

export function ExitBars({ exit, ai }: { exit: AnaExit; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 230, padT = 30, padB = 20;
  let body = null;
  if (w > 0) {
    const mx = Math.max(1, ...exit.bins.map(b => b.n));
    const x = scale(0, 1, 2, w - 2), y = scale(0, mx * 1.15, h - padB, padT);
    const bw = x(0.1) - x(0) - 4;
    const ax = x(exit.avg);
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Share of the best open profit kept by winners">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {exit.bins.map((b, i) => (
          <g key={i}>
            <rect x={x(b.from) + 2} y={y(b.n)} width={bw} height={Math.max(0, y(0) - y(b.n))} fill="var(--d2-g)" fillOpacity={0.35 + 0.65 * (i / 9)} />
            {bw >= 14 && <text x={x(b.from) + 2 + bw / 2} y={y(b.n) - 4} fontSize={11} fill="var(--mut)" textAnchor="middle">{b.n}</text>}
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map(v => <text key={v} x={x(v)} y={h - 4} fontSize={11} fill="var(--dim)" textAnchor={v === 0 ? 'start' : v === 1 ? 'end' : 'middle'}>{pct(v)}</text>)}
        {ai && <g data-ai><line x1={ax} x2={ax} y1={padT - 16} y2={y(0)} stroke="var(--tx)" strokeWidth={1.25} /><text x={ax > w - 110 ? ax - 4 : ax + 4} y={padT - 6} fontSize={11} fontWeight={800} fill="var(--tx)" textAnchor={ax > w - 110 ? 'end' : 'start'}>avg {pct(exit.avg)} kept</text></g>}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

// ─── waterfall (rules, what-if) ──────────────────────────────────────────────

export interface Fall { key: string; label: string; sub?: string; value: number; kind: 'base' | 'step' | 'total' | 'goal' }
/** Columns on wide cards, rows on narrow ones. Steps float from the running total. */
export function Waterfall({ cols, label }: { cols: Fall[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rowsMode = w > 0 && w < 80 * cols.length;
  const h = rowsMode ? cols.length * 44 + 8 : 270;
  let body = null;
  if (w > 0 && cols.length) {
    let run = 0;
    const seg = cols.map(c => {
      let a: number, b: number;
      if (c.kind === 'step') { a = run; b = run + c.value; run = b; } else { a = 0; b = c.value; run = c.value; }
      return { ...c, a, b, run };
    });
    const lo = Math.min(0, ...seg.flatMap(s => [s.a, s.b])), hi = Math.max(0, ...seg.flatMap(s => [s.a, s.b]));
    const color = (s: (typeof seg)[number]) => (s.kind === 'total' ? 'var(--series-other)' : s.kind === 'goal' ? 'none' : s.value >= 0 && s.kind === 'base' ? 'var(--d2-g)' : s.kind === 'base' ? 'var(--d2-r)' : s.value >= 0 ? 'var(--d2-g)' : 'var(--d2-r)');
    const tcol = (s: (typeof seg)[number]) => (s.kind === 'step' ? (s.value >= 0 ? 'var(--d2-gt)' : 'var(--d2-rt)') : 'var(--tx)');
    if (rowsMode) {
      const lab = Math.min(170, w * 0.46), valW = 60;
      const x = scale(lo, hi || 1, lab, w - valW);
      body = (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={label}>
          <line x1={x(0)} x2={x(0)} y1={0} y2={h} stroke="var(--line-2)" />
          {seg.map((s, i) => {
            const y = i * 44 + 6, x1 = x(Math.min(s.a, s.b)), x2 = x(Math.max(s.a, s.b));
            return (
              <g key={s.key}>
                <text x={0} y={y + 13} fontSize={13} fontWeight={700} fill="var(--tx)">{fit(s.label, lab - 6, 13, true)}</text>
                {s.sub && <text x={0} y={y + 28} fontSize={11} fill="var(--dim)">{s.sub}</text>}
                <rect x={x1} y={y + 3} width={Math.max(2, x2 - x1)} height={16} rx={2} fill={color(s)} stroke={s.kind === 'goal' ? 'var(--d2-g)' : 'none'} strokeWidth={1.5} />
                <text x={w} y={y + 15} fontSize={13} fontWeight={800} fill={tcol(s)} textAnchor="end" className="mny">{kmoney(s.value)}</text>
              </g>
            );
          })}
        </svg>
      );
    } else {
      const padT = 26, padB = 52;
      const y = scale(lo, hi || 1, h - padB, padT);
      const gap = w / cols.length, bw = Math.min(56, gap - 22);
      body = (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={label}>
          {ticks(lo, hi || 1, 3).map(t => <line key={t} x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-2)' : 'var(--grid)'} />)}
          {seg.map((s, i) => {
            const cx = gap * i + gap / 2, top = y(Math.max(s.a, s.b)), hgt = Math.max(2, Math.abs(y(s.a) - y(s.b)));
            const neg = s.b < s.a && s.kind === 'step';
            return (
              <g key={s.key}>
                <rect x={cx - bw / 2} y={top} width={bw} height={hgt} rx={2} fill={color(s)} stroke={s.kind === 'goal' ? 'var(--d2-g)' : 'none'} strokeWidth={1.5} />
                {i < seg.length - 1 && <line x1={cx + bw / 2} x2={cx + gap - bw / 2} y1={y(s.run)} y2={y(s.run)} stroke="var(--line-2)" strokeDasharray="2 3" />}
                <text x={cx} y={neg ? top + hgt + 15 : top - 7} fontSize={13} fontWeight={800} fill={tcol(s)} textAnchor="middle" className="mny">{kmoney(s.value)}</text>
                {wrap2(s.label, gap - 6).map((t, j, a) => <text key={j} x={cx} y={h - (a.length === 2 ? 34 : 20) + j * 14} fontSize={11} fontWeight={600} fill="var(--tx)" textAnchor="middle">{t}</text>)}
                {s.sub && <text x={cx} y={h - 5} fontSize={11} fill="var(--dim)" textAnchor="middle">{s.sub}</text>}
              </g>
            );
          })}
        </svg>
      );
    }
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}

/** Split a label into at most two lines that fit `px` (11px bold), cutting the second if needed. */
export function wrap2(label: string, px: number): string[] {
  if (textW(label, 11, true) <= px) return [label];
  const words = label.split(' ');
  let a = '';
  for (let i = 0; i < words.length; i++) {
    const next = a ? `${a} ${words[i]}` : words[i]!;
    if (textW(next, 11, true) > px && a) return [a, fit(words.slice(i).join(' '), px, 11, true)];
    a = next;
  }
  return [fit(a, px, 11, true)];
}

// ─── behaviour: score strips ─────────────────────────────────────────────────

export function ScoreStrips({ b, parts, ai }: { b: NonNullable<AnaBehaviour['strips']>; parts: Array<{ key: string; score: number; last30: number }>; ai: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const len = b[0]?.bits.length ?? 0;
  const last = Math.min(30, len);
  const sw = Math.max(40, w - 86 - 44 - 16);
  const bw = sw / Math.max(1, len);
  return (
    <div ref={ref} className="a2-strips">
      {w > 0 && b.map(s => {
        const p = parts.find(x => x.key === s.key);
        return (
          <div key={s.key} className="a2-strip" data-testid={`strip-${s.key}`}>
            <div><b>{s.label}</b><small>{s.failed} failed</small></div>
            <svg width={sw} height={30} viewBox={`0 0 ${sw} 30`} className="d2-chart" role="img" aria-label={`${s.label}: pass or fail per trade, oldest first`} shapeRendering="crispEdges">
              <rect x={0} y={9} width={sw} height={12} fill="var(--d2-chip)" />
              {[...s.bits].map((c, i) => (c === '0' ? <rect key={i} x={i * bw} y={3} width={Math.max(0.8, bw * 0.8)} height={24} fill="var(--d2-r)" /> : null))}
              {ai && last > 0 && <rect data-ai x={Math.max(0.5, (len - last) * bw)} y={0.5} width={Math.min(sw - 1, last * bw)} height={29} fill="none" stroke="var(--tx)" strokeWidth={1} strokeDasharray="2 2" />}
            </svg>
            <b className="d2-n">{p?.score ?? '–'}</b>
          </div>
        );
      })}
      {ai && w > 0 && <div className="a2-last" data-ai>last 30 trades: {parts.map(p => p.last30).join(' · ')}</div>}
    </div>
  );
}

// ─── behaviour: win rate by losses that day ──────────────────────────────────

export function LossBars({ rows, avg }: { rows: AnaBehaviour['byLosses']; avg: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 220, padT = 22, padB = 38;
  let body = null;
  if (w > 0 && rows.length) {
    const y = scale(0, 1, h - padB, padT);
    const gap = (w - 4) / rows.length, bw = Math.min(52, gap - 24);
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label="Win rate by losing trades earlier that day">
        <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} stroke="var(--mut)" strokeDasharray="2 3" />
        <text x={w} y={y(avg) - 5} fontSize={11} fill="var(--mut)" textAnchor="end">avg {pct(avg)}</text>
        {rows.map((r, i) => {
          const cx = gap * i + gap / 2, wr = r.n ? r.wins / r.n : 0, low = r.n >= 3 && wr < avg - 0.1;
          return (
            <g key={r.key}>
              <title>{`${r.key} lost earlier that day: ${plural(r.n, 'trade')} · ${r.n ? pct(wr) : '–'} won · ${money(r.net)}`}</title>
              {r.n > 0 && <rect x={cx - bw / 2} y={y(wr)} width={bw} height={Math.max(1.5, y(0) - y(wr))} rx={2} fill={low ? 'var(--d2-r)' : 'var(--series-other)'} />}
              <text x={cx} y={(r.n ? y(wr) : y(0)) - 6} fontSize={13} fontWeight={800} fill={low ? 'var(--d2-rt)' : 'var(--tx)'} textAnchor="middle">{r.n ? pct(wr) : '–'}</text>
              <text x={cx} y={h - 21} fontSize={11} fontWeight={700} fill="var(--tx)" textAnchor="middle">{r.key} lost</text>
              <text x={cx} y={h - 6} fontSize={11} fill={r.size != null && r.size > 1.3 ? 'var(--d2-rt)' : 'var(--dim)'} textAnchor="middle">{r.n ? `${r.n} tr${r.size != null && gap >= 70 ? ` · ${r.size.toFixed(1)}×` : ''}` : 'none'}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body}</div>;
}
