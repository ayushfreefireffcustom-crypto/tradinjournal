'use client';

// The Analytics summary (top of Overview), in the spirit of the September "Dissect your edge"
// page: five headline numbers each with a small still drawing, short insight tiles, strike rate
// and per-trade spread side by side, then the equity curve with its deepest drawdown marked.
// Profit is green and loss red on every figure. Every number comes from the same analytics call.
import type { ReactNode } from 'react';
import { CalendarBlank, ChartBar, ChatCircleText, Clock, Coins, ListChecks, Scales, type Icon } from '@phosphor-icons/react';
import type { AiLine } from '@/lib/dashboard-v2-api';
import { fmtAi, fmtDate, kmoney, money, path, pct, plural, rfmt, scale, ticks, tone, axisMoney } from '@/lib/dashboard-v2-format';
import { fmtHold, type AnaDay, type AnaStats } from '@/lib/analytics-v2-api';
import { DistChart } from '@/components/dashboard-v2/charts';
import { useWidth } from '@/components/dashboard-v2/ui';
import type { ViewCtx } from './views';

const G = 'var(--d2-g)', R = 'var(--d2-r)';

/** Running total of closed P&L by day. */
function cumulative(days: AnaDay[]): Array<{ d: string; v: number }> {
  let v = 0;
  return days.map(x => ({ d: x.d, v: (v += x.net) }));
}
/** The deepest peak-to-trough fall on the daily curve (indexes into `pts`, with a 0 start at -1). */
function deepest(pts: Array<{ v: number }>): { from: number; to: number; dd: number } | null {
  let peak = 0, peakI = -1, best: { from: number; to: number; dd: number } | null = null;
  pts.forEach((p, i) => {
    if (p.v > peak) { peak = p.v; peakI = i; }
    const dd = p.v - peak;
    if (dd < 0 && (!best || dd < best.dd)) best = { from: peakI, to: i, dd };
  });
  return best;
}

// ─── small drawings for the KPI tiles ────────────────────────────────────────

function MiniArea({ vals, color, under = false }: { vals: number[]; color: string; under?: boolean }) {
  const w = 120, h = 34;
  if (vals.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} className="a2s-mini" aria-hidden />;
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const x = scale(0, vals.length - 1, 1, w - 1), y = scale(lo, hi === lo ? lo + 1 : hi, h - 2, 2);
  const line = path(vals.map((v, i) => [x(i), y(v)]));
  const base = y(0);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="a2s-mini" aria-hidden preserveAspectRatio="none">
      <path d={`${line}L${x(vals.length - 1).toFixed(1)},${base.toFixed(1)}L${x(0).toFixed(1)},${base.toFixed(1)}Z`} fill={color} fillOpacity={under ? 0.22 : 0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MiniBars({ vals, color, down = false }: { vals: number[]; color: string; down?: boolean }) {
  const w = 120, h = 34, n = Math.max(vals.length, 1), mx = Math.max(1e-9, ...vals.map(Math.abs));
  const bw = Math.min(8, w / n - 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="a2s-mini" aria-hidden preserveAspectRatio="none">
      {vals.map((v, i) => {
        if (!v) return null;
        const hh = Math.max(2, (Math.abs(v) / mx) * (h - 4));
        const x = w - (n - i) * (w / n) + (w / n - bw) / 2;
        return <rect key={i} x={x} y={down ? 2 : h - 2 - hh} width={bw} height={hh} rx={1.5} fill={color} fillOpacity={0.85} />;
      })}
    </svg>
  );
}

function SplitBar({ gp, gl }: { gp: number; gl: number }) {
  const tot = gp + Math.abs(gl) || 1, g = (gp / tot) * 100;
  return (
    <span className="a2s-split" aria-hidden>
      <i style={{ width: `${g}%`, background: G }} />
      <i style={{ width: `${100 - g}%`, background: R }} />
      <b style={{ left: '50%' }} />
    </span>
  );
}

function Kpi({ cap, value, valueTone, sub, art, testId }: { cap: string; value: string; valueTone: string; sub: ReactNode; art: ReactNode; testId: string }) {
  return (
    <div className="d2-tile a2s-kpi" data-testid={testId}>
      <span className="d2-cap">{cap}</span>
      <b className={`d2-n mny ${valueTone}`}>{value}</b>
      <small>{sub}</small>
      <div className="a2s-art">{art}</div>
    </div>
  );
}

// ─── strike rate ring ────────────────────────────────────────────────────────

function Ring({ wins, losses, total }: { wins: number; losses: number; total: number }) {
  const r = 52, c = 2 * Math.PI * r, gap = total > 1 ? 3 : 0;
  const seg = (n: number) => Math.max(0, (n / Math.max(1, total)) * c - gap);
  const wl = seg(wins), ll = seg(losses);
  return (
    <svg viewBox="0 0 140 140" className="a2s-ring" role="img" aria-label={`${pct(wins / Math.max(1, total))} of ${total} trades won`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--track)" strokeWidth="12" />
      {wins > 0 && <circle cx="70" cy="70" r={r} fill="none" stroke={G} strokeWidth="12" strokeDasharray={`${wl} ${c - wl}`} transform="rotate(-90 70 70)" />}
      {losses > 0 && <circle cx="70" cy="70" r={r} fill="none" stroke={R} strokeWidth="12" strokeDasharray={`${ll} ${c - ll}`} strokeDashoffset={-(wl + gap)} transform="rotate(-90 70 70)" />}
      <text x="70" y="72" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--tx)" className="d2-n">{pct(wins / Math.max(1, total))}</text>
      <text x="70" y="92" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--dim)" letterSpacing=".04em">WIN RATE</text>
    </svg>
  );
}

function StrikeRate({ s, n }: { s: AnaStats; n: number }) {
  const wins = Math.round(s.winRate * n), losses = s.losses ?? Math.max(0, n - wins), be = Math.max(0, n - wins - losses);
  return (
    <div className="a2s-strike">
      <div className="a2s-strike-top">
        <Ring wins={wins} losses={losses} total={n} />
        <ul className="a2s-legend">
          <li><i style={{ background: G }} />Wins<b className="d2-n">{wins}</b></li>
          <li><i style={{ background: R }} />Losses<b className="d2-n">{losses}</b></li>
          {be > 0 && <li><i style={{ background: 'var(--track)' }} />Breakeven<b className="d2-n">{be}</b></li>}
          <li><i className="o" />Total<b className="d2-n">{n}</b></li>
        </ul>
      </div>
      <dl className="a2s-facts">
        <div><dt>Avg win</dt><dd className="d2-n mny up">{money(s.avgWin, { dec: 2 })}</dd></div>
        <div><dt>Avg loss</dt><dd className={`d2-n mny ${tone(s.avgLoss)}`}>{money(s.avgLoss, { dec: 2 })}</dd></div>
        <div><dt>Best trade</dt><dd className={`d2-n mny ${tone(s.best)}`}>{money(s.best, { dec: 2 })}</dd></div>
        <div><dt>Worst trade</dt><dd className={`d2-n mny ${tone(s.worst)}`}>{money(s.worst, { dec: 2 })}</dd></div>
      </dl>
    </div>
  );
}

// ─── equity curve ────────────────────────────────────────────────────────────

function EquityCurve({ days }: { days: AnaDay[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = w < 500 ? 220 : 280, padL = 52, padR = 12, padT = 34, padB = 26;
  const pts = cumulative(days);
  let body = null;
  if (w > 0 && pts.length >= 2) {
    const vals = [0, ...pts.map(p => p.v)];
    const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo || 1) * 0.08;
    const x = scale(-1, pts.length - 1, padL, w - padR), y = scale(lo - pad, hi + pad, h - padB, padT);
    const xy: Array<[number, number]> = [[x(-1), y(0)], ...pts.map((p, i) => [x(i), y(p.v)] as [number, number])];
    const line = path(xy);
    const end = pts.at(-1)!.v, c = end >= 0 ? G : R;
    const peakI = pts.reduce((a, p, i) => (p.v > pts[a]!.v ? i : a), 0);
    const dd = deepest(pts);
    const yt = ticks(lo - pad, hi + pad, h < 240 ? 3 : 4);
    const xt = pts.length <= 2 ? [0, pts.length - 1] : [0, Math.round((pts.length - 1) / 3), Math.round(((pts.length - 1) * 2) / 3), pts.length - 1];
    body = (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="d2-chart" role="img" aria-label={`Equity from closed trades: ${money(end)} over ${plural(pts.length, 'day')}`}>
        {yt.map(t => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={padL - 8} y={y(t) + 4} fontSize={11} fill="var(--dim)" textAnchor="end">{t < 0 ? '−' : ''}${axisMoney(Math.abs(t))}</text>
          </g>
        ))}
        <line x1={padL} x2={w - padR} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {dd && (
          <g>
            <rect x={x(dd.from)} y={padT - 6} width={Math.max(2, x(dd.to) - x(dd.from))} height={h - padB - padT + 6} fill={R} fillOpacity={0.07} />
            <line x1={x(dd.from)} x2={x(dd.to)} y1={y(dd.from < 0 ? 0 : pts[dd.from]!.v)} y2={y(dd.from < 0 ? 0 : pts[dd.from]!.v)} stroke={R} strokeOpacity={0.6} strokeDasharray="3 3" />
            <text x={Math.min(w - padR - 4, Math.max(padL + 4, (x(dd.from) + x(dd.to)) / 2))} y={padT - 12} fontSize={11} fontWeight={700} fill="var(--r-tx, #FE3A31)" textAnchor="middle" className="mny">Deepest drop by day {kmoney(dd.dd)}</text>
          </g>
        )}
        <path d={`${line}L${x(pts.length - 1).toFixed(1)},${y(lo - pad).toFixed(1)}L${x(-1).toFixed(1)},${y(lo - pad).toFixed(1)}Z`} fill={c} fillOpacity={0.08} />
        <path d={line} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(peakI)} cy={y(pts[peakI]!.v)} r={3.5} fill="var(--tile)" stroke={G} strokeWidth={1.6} />
        <circle cx={x(pts.length - 1)} cy={y(end)} r={4} fill={c} />
        {xt.map((i, k) => (
          <text key={k} x={x(i)} y={h - 8} fontSize={11} fill="var(--dim)" textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'}>{fmtDate(Date.parse(pts[i]!.d))}</text>
        ))}
      </svg>
    );
  }
  return <div ref={ref} className="d2-cw" style={{ minHeight: h }}>{body ?? (w > 0 ? <p className="a2-sub">The curve starts after two trading days.</p> : null)}</div>;
}

// ─── insight tiles ───────────────────────────────────────────────────────────

function Insight({ line, icon: I }: { line: AiLine; icon: Icon }) {
  const v = fmtAi(line);
  return (
    <li className="d2-tile a2s-in" data-ai>
      <span className={`a2s-in-i ${line.tone}`} aria-hidden><I size={16} /></span>
      <span>{line.text}{v && <> <b className={`d2-n ${line.fmt === 'money' ? 'mny' : ''} ${line.tone === 'up' ? 'up' : line.tone === 'dn' ? 'dn' : ''}`}>{v}</b></>}{line.suffix && <> {line.suffix}</>}</span>
    </li>
  );
}

export function Summary({ c }: { c: ViewCtx }) {
  const { d, ai } = c;
  const o = d.overview, p = d.performance;
  if (!o || !p) return null;
  const s = p.stats, n = o.net.n;
  const gp = s.grossProfit ?? s.avgWin * Math.round(s.winRate * n);
  const gl = s.grossLoss ?? s.avgLoss * Math.max(0, n - Math.round(s.winRate * n));
  const curve = cumulative(p.days).map(x => x.v);
  const dd = s.maxDrawdown ?? (deepest(cumulative(p.days))?.dd ?? 0);
  let peak = 0;
  const under = curve.map(v => { peak = Math.max(peak, v); return v - peak; });
  const recent = p.days.slice(-16);
  const pf = o.net.profitFactor;

  const lines: Array<[AiLine | null, Icon]> = [
    [p.ai.calendar, CalendarBlank], [d.time?.ai.heat ?? null, Clock], [d.symbols?.ai.grid ?? null, Coins],
    [d.time?.ai.sessions ?? null, Clock], [d.risk?.ai.distribution ?? null, Scales], [d.behaviour?.ai.waterfall ?? null, ListChecks],
    [p.ai.months, ChartBar], [d.symbols?.ai.series ?? null, Coins],
  ];
  const insights = lines.filter((x): x is [AiLine, Icon] => !!x[0]).slice(0, 6);
  const dist = d.risk?.distribution ?? null;

  return (
    <section className="a2-sec a2s" aria-label="Summary" data-testid="view-summary">
      <div className="d2-tray a2s-kpis" data-testid="a2s-kpis">
        <Kpi testId="a2s-net" cap={`Net P&L · ${c.rangeShort}`} value={money(o.net.net, { dec: 2 })} valueTone={tone(o.net.net)} sub={plural(n, 'trade')}
          art={<MiniArea vals={curve} color={o.net.net >= 0 ? G : R} />} />
        <Kpi testId="a2s-pf" cap="Profit factor" value={pf == null ? '–' : pf.toFixed(2)} valueTone={pf == null ? 'd2-dim' : pf >= 1 ? 'up' : 'dn'}
          sub={pf == null ? 'No losing trades yet' : `${money(pf, { plus: false, dec: 2 })} back for every $1 lost`} art={<SplitBar gp={gp} gl={gl} />} />
        <Kpi testId="a2s-gp" cap="Gross profit" value={money(gp, { dec: 0 })} valueTone={gp > 0 ? 'up' : ''} sub={`${Math.round(s.winRate * n)} winners · avg ${money(s.avgWin)}`}
          art={<MiniBars vals={recent.map(x => Math.max(0, x.net))} color={G} />} />
        <Kpi testId="a2s-gl" cap="Gross loss" value={money(gl, { dec: 0 })} valueTone={gl < 0 ? 'dn' : ''} sub={`${s.losses ?? Math.max(0, n - Math.round(s.winRate * n))} losers · avg ${money(s.avgLoss)}`}
          art={<MiniBars vals={recent.map(x => Math.min(0, x.net))} color={R} down />} />
        <Kpi testId="a2s-dd" cap="Max drawdown" value={money(dd, { dec: 0 })} valueTone={dd < 0 ? 'dn' : ''} sub={dd < 0 ? 'Trade by trade, from a peak' : 'Never below a peak'}
          art={<MiniArea vals={under} color={R} under />} />
      </div>

      {ai && insights.length > 0 && (
        <ul className="a2s-ins" aria-label="Insights" data-testid="a2s-insights">
          {insights.map(([l, I], i) => <Insight key={i} line={l} icon={I} />)}
        </ul>
      )}

      <div className="a2s-row">
        <section className="d2-card d2-w" aria-label="Strike rate" data-testid="w-strike">
          <header className="d2-wh"><h2>Strike rate<span> {plural(n, 'trade')}</span></h2></header>
          <div className="d2-wb"><StrikeRate s={s} n={n} /></div>
        </section>
        <section className="d2-card d2-w" aria-label="Net P&L per trade" data-testid="w-spread">
          <header className="d2-wh">
            <h2>Net P&amp;L per trade<span> {dist?.unit === 'R' ? 'in R' : 'in $'}</span></h2>
            <div className="d2-wt"><button type="button" className="d2-ex" onClick={() => c.explain('net P&L per trade', `expectancy ${money(s.expectancy)}${s.expectancyR != null ? ` (${rfmt(s.expectancyR)})` : ''}; avg win ${money(s.avgWin)}; avg loss ${money(s.avgLoss)}; best ${money(s.best)}; worst ${money(s.worst)}`)} data-ai aria-label="Explain net P&L per trade"><ChatCircleText size={14} /><span>Explain</span></button></div>
          </header>
          <div className="d2-wb">
            {dist ? <DistChart dist={dist} ai={ai} /> : <p className="a2-sub a2s-wait">The spread fills in at {d.minTrades} trades.</p>}
            <dl className="a2s-facts a2s-facts--4">
              <div><dt>Expectancy</dt><dd className={`d2-n mny ${tone(s.expectancy)}`}>{money(s.expectancy, { dec: 2 })}</dd></div>
              <div><dt>Longest win run</dt><dd className="d2-n">{plural(s.maxWinStreak, 'trade')}</dd></div>
              <div><dt>Longest loss run</dt><dd className="d2-n">{plural(s.maxLossStreak, 'trade')}</dd></div>
              <div><dt>Median hold</dt><dd className="d2-n">{fmtHold(s.medianHoldMs)}</dd></div>
            </dl>
          </div>
        </section>
      </div>

      <section className="d2-card d2-w" aria-label="Equity curve" data-testid="w-equity-curve">
        <header className="d2-wh">
          <h2>Equity curve<span> closed trades, by day</span></h2>
          <div className="d2-wt"><span className={`a2s-peak d2-n mny`}>Peak {money(Math.max(0, ...curve), { dec: 0 })}</span></div>
        </header>
        <div className="d2-wb"><EquityCurve days={p.days} /></div>
      </section>
    </section>
  );
}
