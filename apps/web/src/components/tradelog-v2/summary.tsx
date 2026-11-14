'use client';

// Summary ribbon for the current filter, and the daily P&L strip for the date
// window (days in the current view marked, one AI line about the worst days).
import { useMemo, useState } from 'react';
import { kmoney, money, pct } from '@/lib/dashboard-v2-format';

/** Full dollars, or $109.7k once a figure gets too wide for a ribbon cell. */
const cmoney = (v: number) => (Math.abs(v) >= 100_000 ? kmoney(v) : money(v));
import { AiMark, useWidth } from '@/components/dashboard-v2/ui';
import { fmtHold, GRADES, rStr, type Grade, type TlRuleKey, type TlStripDay, type TlSummary } from '@/lib/tradelog-v2-api';

export function SummaryRibbon({ s, useR, graded }: { s: TlSummary; useR: boolean; graded: boolean }) {
  const cells: Array<{ k: string; cap: string; v: React.ReactNode; sub: React.ReactNode; tone?: string }> = [
    { k: 'trades', cap: 'Trades', v: s.trades.toLocaleString('en-US'), sub: <>{s.wins}W · {s.losses}L{s.open ? ` · ${s.open} open` : ''}</> },
    { k: 'net', cap: 'Net P&L', v: cmoney(s.net), tone: s.net > 0 ? 'up' : s.net < 0 ? 'dn' : '', sub: <>{money(s.perTrade)} per trade</> },
    { k: 'win', cap: 'Win rate', v: pct(s.winRate, 1), sub: <>PF {s.profitFactor == null ? '—' : s.profitFactor.toFixed(2)}</> },
    useR && s.avgR != null
      ? { k: 'avgr', cap: 'Avg R', v: rStr(s.avgR), tone: s.avgR > 0 ? 'up' : s.avgR < 0 ? 'dn' : '', sub: <>W {s.avgWinR != null ? rStr(s.avgWinR) : '—'} · L {s.avgLossR != null ? rStr(s.avgLossR) : '—'}</> }
      : { k: 'avgwin', cap: 'Avg win', v: cmoney(s.avgWin), tone: s.avgWin > 0 ? 'up' : '', sub: <>{s.avgLoss < 0 ? <>avg loss {money(s.avgLoss)}</> : 'no losses'}</> },
    { k: 'hold', cap: 'Avg hold', v: fmtHold(s.avgHoldSecs), sub: <>W {fmtHold(s.avgHoldWinSecs)} · L {fmtHold(s.avgHoldLossSecs)}</> },
    ...(graded && s.ruleBroken ? [{ k: 'rule', cap: 'Rule broken', v: s.ruleBroken.n.toLocaleString('en-US'), tone: s.ruleBroken.n ? 'dn' : '', sub: <>{cmoney(s.ruleBroken.net)}</> }] : []),
    { k: 'fees', cap: 'Fees', v: cmoney(s.fees), sub: <>commission{s.swap ? ' + swap' : ''}</> },
  ];
  return (
    <section className="d2-card tl-kr" data-testid="summary" aria-label="Summary of the trades in this view" data-cells={cells.length + (s.gradeMix ? 1 : 0)}>
      {cells.map(c => (
        <div key={c.k} data-testid={`sum-${c.k}`}>
          <span className="d2-cap">{c.cap}</span>
          <b className={`d2-n ${c.tone ?? ''}`}>{c.v}</b>
          <small>{c.sub}</small>
        </div>
      ))}
      {s.gradeMix && <GradeMix mix={s.gradeMix} />}
    </section>
  );
}

const MIX_CLASS: Record<Grade, string> = { A: 'a', B: 'b', C: 'c', D: 'd', F: 'f' };
function GradeMix({ mix }: { mix: Record<Grade, number> }) {
  const total = GRADES.reduce((a, g) => a + mix[g], 0) || 1;
  return (
    <div data-testid="sum-mix" className="tl-mix-c">
      <span className="d2-cap">AI grade mix</span>
      <span className="tl-mix" role="img" aria-label={GRADES.map(g => `${g} ${mix[g]}`).join(', ')}>
        {GRADES.filter(g => mix[g]).map(g => <i key={g} className={MIX_CLASS[g]} style={{ width: `${(mix[g] / total) * 100}%` }} />)}
      </span>
      <small className="tl-mix-l">{GRADES.filter(g => mix[g]).map(g => <span key={g}>{g} {mix[g]}</span>)}</small>
    </div>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DailyStrip({ days, ai, onDay, onRule, filtered }: {
  days: TlStripDay[]; ai: { text: string; rule: TlRuleKey; trades: number } | null; onDay: (day: string) => void; onRule: (r: TlRuleKey) => void; filtered: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<TlStripDay | null>(null);
  const H = 56, mid = H / 2;
  const max = useMemo(() => Math.max(1, ...days.map(d => Math.abs(d.net))), [days]);
  const n = days.length;
  const bw = n ? w / n : 0;
  const months = useMemo(() => {
    // Month labels; over a long window, year labels instead.
    const years = days.length > 1 && days[0]!.day.slice(0, 4) !== days[days.length - 1]!.day.slice(0, 4) && days.length * bw / Math.max(1, new Set(days.map(d => d.day.slice(0, 7))).size) < 40;
    const out: Array<{ i: number; label: string }> = [];
    let last = '';
    days.forEach((d, i) => {
      const k = years ? d.day.slice(0, 4) : d.day.slice(0, 7);
      if (k !== last) { last = k; out.push({ i, label: years ? k : MONTHS[Number(d.day.slice(5, 7)) - 1]! }); }
    });
    // Keep labels at least 36px apart (and inside the chart).
    const kept: typeof out = [];
    for (const m of out) if ((!kept.length || (m.i - kept[kept.length - 1]!.i) * bw >= 36) && m.i * bw <= w - 28) kept.push(m);
    return kept;
  }, [days, bw, w]);
  const viewRuns = useMemo(() => {
    if (!filtered) return [] as Array<[number, number]>;
    const runs: Array<[number, number]> = [];
    days.forEach((d, i) => { if (!d.inView) return; const r = runs[runs.length - 1]; if (r && r[1] === i - 1) r[1] = i; else runs.push([i, i]); });
    return runs;
  }, [days, filtered]);
  const viewDays = days.filter(d => d.inView).length;

  return (
    <section className="d2-card tl-strip" data-testid="daily-strip" aria-label="Daily P&L">
      <header className="tl-strip-h">
        <h3>Daily P&L<span> · {n} {n === 1 ? 'day' : 'days'}{filtered ? ` · ${viewDays} in view` : ''} · click a day to show it</span></h3>
        {ai && (
          <button type="button" className="tl-strip-ai" onClick={() => onRule(ai.rule)} data-ai title={`Show trades with this rule broken (${ai.trades} trades on those days)`} data-testid="strip-ai">
            <AiMark /><span>{ai.text}</span>
          </button>
        )}
      </header>
      <div ref={ref} className="tl-strip-c">
        {w > 0 && n > 0 && (
          <svg width={w} height={H + 18} role="img" aria-label={`Daily P&L for ${n} days`}>
            {viewRuns.map(([a, b]) => <rect key={a} x={a * bw} y={0} width={(b - a + 1) * bw} height={H} fill="var(--d2-chip)" opacity={0.7} />)}
            <line x1={0} x2={w} y1={mid} y2={mid} stroke="var(--line)" />
            {days.map((d, i) => {
              const h = Math.max(1.5, (Math.abs(d.net) / max) * (mid - 3));
              const x = i * bw + (bw > 4 ? bw * 0.12 : 0);
              const ww = Math.max(1, bw > 4 ? bw * 0.76 : bw - 0.2);
              return (
                <rect key={d.day} x={x} y={d.net >= 0 ? mid - h : mid} width={ww} height={h} rx={bw > 6 ? 1 : 0}
                  fill={d.net >= 0 ? 'var(--d2-g)' : 'var(--d2-r)'} opacity={filtered && !d.inView ? 0.35 : 1} />
              );
            })}
            {/* Hit areas: the whole column per day, so thin bars are still clickable. */}
            {days.map((d, i) => (
              <rect key={`h${d.day}`} x={i * bw} y={0} width={Math.max(bw, 1)} height={H} fill="transparent" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(h => (h === d ? null : h))} onClick={() => onDay(d.day)}>
                <title>{`${d.day}: ${d.net >= 0 ? '+' : '−'}$${Math.abs(d.net).toLocaleString('en-US', { maximumFractionDigits: 2 })} · ${d.n} trade${d.n === 1 ? '' : 's'}`}</title>
              </rect>
            ))}
            {months.map(m => <text key={m.i} x={m.i * bw + 1} y={H + 14} fontSize={11} fill="var(--dim)">{m.label}</text>)}
          </svg>
        )}
        {hover && <div className="tl-strip-tip" aria-hidden>{hover.day} · <b className={hover.net >= 0 ? 'up' : 'dn'}>{money(hover.net)}</b> · {hover.n} trade{hover.n === 1 ? '' : 's'}</div>}
      </div>
    </section>
  );
}
