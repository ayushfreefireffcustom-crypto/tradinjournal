'use client';

// Analytics v2 views: the Overview hero and the six focused sections. Every
// number comes from GET /api/insights/analytics; each chart has an Explain
// button (goes to the AI coach) and at most one AI line in its footer.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CaretDown, ChatCircleText, Check, Funnel } from '@phosphor-icons/react';
import type { AiLine } from '@/lib/dashboard-v2-api';
import { fmtAi, isFlat, kmoney, money, pct, plural, rfmt, tone } from '@/lib/dashboard-v2-format';
import {
  addedBy, fmtHold, navText, VIEW_LABEL, whatIfSteps,
  type AnalyticsV2DTO, type AnalyticsView, type AnaNavItem, type AnaWhatIf,
} from '@/lib/analytics-v2-api';
import { AiFoot, AiMark, Empty, Toggle, Widget } from '@/components/dashboard-v2/ui';
import { DistChart, MaeScatter, RollingChart } from '@/components/dashboard-v2/charts';
import { Calendar, ExitBars, HBars, HoldScatter, HourHeat, LossBars, MonthBars, Quadrant, ScoreStrips, SegBars, SmallMultiples, Waterfall, type Fall } from './charts';

export interface ViewCtx {
  d: AnalyticsV2DTO;
  ai: boolean;
  rangeShort: string;
  explain: (what: string, summary: string) => void;
}
const SES = { ASIA: 'Asia', LONDON: 'London', NY: 'NY' } as const;
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const trades = (n: number) => `${n} trade${n === 1 ? '' : 's'}`;
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

// ─── small pieces ────────────────────────────────────────────────────────────

/** One AI line inline (section headers). */
export function AiInline({ line }: { line: AiLine | null }) {
  if (!line) return null;
  const v = fmtAi(line);
  return (
    <span className="a2-one" data-ai>
      <AiMark />
      <span className="a2-one-t">
        {line.text}{v && <> <span className={`d2-n ${line.fmt === 'money' ? 'mny' : ''} ${line.tone === 'up' ? 'up' : line.tone === 'dn' ? 'dn' : ''}`}>{v}</span></>}
        {line.suffix && <> {line.suffix}</>}
      </span>
    </span>
  );
}

function RNote({ withR, n }: { withR: number; n: number }) {
  return <div className="d2-note" data-testid="r-note">In $: R needs a stop at entry ({withR} of {n} have one).</div>;
}

function Slot({ span, children }: { span: 4 | 6 | 8 | 12; children: ReactNode }) {
  return <div className={`a2-slot a2-s${span}`}>{children}</div>;
}

function Section({ no, id, fig, figTone, one, children }: { no: string; id: AnalyticsView; fig: string; figTone: string; one: AiLine | null; children: ReactNode }) {
  return (
    <section className="a2-sec" id={`a2-${id}`} data-testid={`view-${id}`} aria-label={VIEW_LABEL[id]}>
      <header className="a2-sh">
        <span className="a2-no">{no}</span>
        <h2>{VIEW_LABEL[id]}</h2>
        {fig && <span className={`a2-fig d2-n ${figTone}`}>{fig}</span>}
        <AiInline line={one} />
      </header>
      <div className="a2-grid">{children}</div>
    </section>
  );
}

export function FilterSel({ label, value, all, options, onChange, icon, disabled }: { label: string; value: string; all: string; options: Array<{ v: string; label: string }>; onChange: (v: string) => void; icon?: boolean; disabled?: boolean }) {
  const cur = options.find(o => o.v === value);
  return (
    <label className={`d2-fp d2-fsel${value ? ' set' : ''}${disabled ? ' off' : ''}`} data-testid={`filter-${label.toLowerCase()}`}>
      {icon && <Funnel size={14} aria-hidden />}
      <span>{label}</span> <b>{cur ? cur.label.replace(/ \(\d+\)$/, '') : all}</b><CaretDown size={11} aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={`${label} filter`} disabled={disabled}>
        <option value="">{label}: {all}</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ─── left menu ───────────────────────────────────────────────────────────────

export function ViewNav({ view, nav, ai, onPick }: { view: AnalyticsView; nav: AnaNavItem[]; ai: boolean; onPick: (v: AnalyticsView) => void }) {
  const ref = useRef<HTMLElement>(null);
  // On phones the menu is a horizontal scroller: keep the chosen view in sight.
  useEffect(() => {
    const el = ref.current, on = el?.querySelector<HTMLElement>('[aria-current=page]');
    if (!el || !on || el.scrollWidth <= el.clientWidth) return;
    const left = on.offsetLeft - 8, right = on.offsetLeft + on.offsetWidth + 8;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  }, [view]);
  return (
    <nav ref={ref} className="a2-nav" aria-label="Analytics views" data-testid="view-nav">
      <span className="a2-cap">Views</span>
      {nav.map(n => {
        const t = navText(n);
        return (
          <button key={n.view} type="button" className={view === n.view ? 'on' : ''} aria-current={view === n.view ? 'page' : undefined} onClick={() => onPick(n.view)} data-testid={`nav-${n.view}`}>
            <span>{VIEW_LABEL[n.view]}</span>
            {t && <b className={`d2-n ${n.fmt !== 'weeks' && n.fmt !== 'r' ? 'mny' : ''} ${n.tone === 'up' ? 'up' : n.tone === 'dn' ? 'dn' : ''}`}>{t}</b>}
          </button>
        );
      })}
      {ai && <span className="a2-aion" data-ai><i aria-hidden />TRADElogs AI on</span>}
    </nav>
  );
}

// ─── overview hero ───────────────────────────────────────────────────────────

export function Hero({ c }: { c: ViewCtx }) {
  const { d, ai } = c;
  const o = d.overview!;
  const wr = (a: { n: number; wins: number }) => (a.n ? pct(a.wins / a.n) : '–');
  const stats = [
    { id: 'net', cap: `Net · ${c.rangeShort}`, v: money(o.net.net), t: tone(o.net.net), sub: `${trades(o.net.n)} · PF ${o.net.profitFactor == null ? '–' : o.net.profitFactor.toFixed(2)}` },
    o.edge
      ? { id: 'edge', cap: `Edge · ${o.edge.label}`, v: money(o.edge.net), t: 'up', sub: `${trades(o.edge.n)} · ${wr(o.edge)} won` }
      : { id: 'edge', cap: 'Edge', v: '–', t: '', sub: 'No session is net positive' },
    o.bleed
      ? { id: 'bleed', cap: `Bleed · ${o.bleed.label}`, v: money(o.bleed.net), t: 'dn', sub: `${trades(o.bleed.n)} · ${wr(o.bleed)} won` }
      : { id: 'bleed', cap: 'Bleed', v: '$0', t: '', sub: 'Every session is net positive' },
    o.rulesBroken
      ? { id: 'rules', cap: 'Rules broken', v: money(o.rulesBroken.net), t: tone(o.rulesBroken.net), sub: `${trades(o.rulesBroken.n)} · ${wr(o.rulesBroken)} won` }
      : { id: 'rules', cap: 'Rules broken', v: '–', t: '', sub: `Needs ${d.minTrades} trades` },
  ];
  const segSummary = o.segments.map(s => `${s.symbol} ${SES[s.session]} ${money(s.net)} (${s.n} trades, ${pct(s.wins / s.n)} won)`).join('; ');
  return (
    <section className="a2-sec" id="a2-overview" data-testid="view-overview-hero" aria-label="Overview">
      <header className="a2-sh"><span className="a2-no">OVERVIEW</span><h2>Where your edge comes from, and where you bleed</h2></header>
      <div className="d2-card a2-hero" data-testid="hero">
        <div className="a2-hstats">
          {stats.map(s => (
            <div key={s.id} data-testid={`hero-${s.id}`}>
              <span className="d2-cap">{s.cap}</span>
              <b className={`d2-n ${s.v !== '–' ? 'mny' : 'd2-dim'} ${s.t}`}>{s.v}</b>
              <small>{s.sub}</small>
            </div>
          ))}
        </div>
        <div className="a2-pane">
          <div className="a2-ph">
            <h3>Net by symbol × session</h3>
            <span>trades · win%</span>
            <button type="button" className="d2-ex a2-pex" onClick={() => c.explain('net by symbol and session', segSummary)} data-ai aria-label="Explain net by symbol and session"><ChatCircleText size={13} /><span>Explain</span></button>
          </div>
          {o.segments.length ? <SegBars rows={o.segments} /> : <Empty title="No segment has 3 trades yet" note="A segment is one symbol in one session." />}
          {o.segmentsHidden > 0 && <div className="a2-sub">{o.segmentsHidden} segments in the middle not shown</div>}
        </div>
        <div className="a2-pane">
          <div className="a2-ph">
            <h3>Win rate vs avg {o.segUnit === 'R' ? 'R' : '$'}</h3>
            <span>bubble = trades</span>
            <button type="button" className="d2-ex a2-pex" onClick={() => c.explain('win rate against average result per segment', `overall win rate ${pct(o.winRate)}; ${o.segments.map(s => `${s.symbol} ${SES[s.session]} ${pct(s.wins / s.n)} won, avg ${o.segUnit === 'R' ? rfmt(s.avg) : money(s.avg)}`).join('; ')}`)} data-ai aria-label="Explain win rate against average result"><ChatCircleText size={13} /><span>Explain</span></button>
          </div>
          {o.segments.length ? <Quadrant rows={o.segments} winRate={o.winRate} unit={o.segUnit} ai={ai} /> : <Empty title="Nothing to plot yet" />}
          {o.segUnit === '$' && <RNote withR={d.counts.withR} n={d.counts.trades} />}
        </div>
        {ai && <div className="a2-hfoot"><AiFoot line={o.ai} link="Explain" onClick={() => c.explain('overview', `net ${money(o.net.net)}; ${stats.map(s => `${s.cap} ${s.v} (${s.sub})`).join('; ')}`)} /></div>}
      </div>
    </section>
  );
}

// ─── 01 performance ──────────────────────────────────────────────────────────

export function Performance({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const p = d.performance!;
  const [unit, setUnit] = useState<'$' | 'R'>('$');
  const [back, setBack] = useState(0);
  const u = p.rUnit ? unit : '$';
  const s = p.stats;
  const worst = p.weeks.find(w => w.start === p.worstWeek);
  const cells: Array<[string, ReactNode, string?]> = [
    ['Win rate', pct(s.winRate, 1), trades(d.counts.trades)],
    ['Profit factor', s.profitFactor == null ? '–' : s.profitFactor.toFixed(2)],
    ['Expectancy', s.expectancyR != null ? rfmt(s.expectancyR) : money(s.expectancy), s.expectancyR != null ? `${money(s.expectancy)} per trade` : 'per trade'],
    ['Avg win', money(s.avgWin)], ['Avg loss', money(s.avgLoss)],
    ['Best trade', money(s.best)], ['Worst trade', money(s.worst)],
    ['Longest win run', String(s.maxWinStreak), 'trades'], ['Longest loss run', String(s.maxLossStreak), 'trades'],
    ['Median hold', fmtHold(s.medianHoldMs)],
    ['Long', money(s.long.net), s.long.n ? `${trades(s.long.n)} · ${pct(s.long.wins / s.long.n)} won` : 'no trades'],
    ['Short', money(s.short.net), s.short.n ? `${trades(s.short.n)} · ${pct(s.short.wins / s.short.n)} won` : 'no trades'],
  ];
  return (
    <Section no={no} id="performance" fig={money(d.overview!.net.net)} figTone={tone(d.overview!.net.net)} one={p.ai.header}>
      <Slot span={8}>
        <Widget id="calendar" title="Calendar" sub={`· daily net ${u === 'R' ? 'R' : 'P&L'}, UTC`} span={8}
          tools={<Toggle label="Unit" value={u} onChange={setUnit} options={[{ v: '$', label: '$' }, { v: 'R', label: 'R', disabled: !p.rUnit, title: p.rUnit ? undefined : 'R needs a stop at entry on most trades' }]} />}
          onExplain={() => c.explain('daily P&L calendar', `${p.days.length} trading days over ${p.weeks.length} weeks, ${p.greenWeeks} green weeks${worst ? `, worst week of ${worst.start} ${money(worst.net)} on ${worst.n} trades` : ''}; weekly nets: ${p.weeks.slice(-16).map(w => `${w.start} ${money(w.net)}`).join(', ')}`)}
          foot={ai ? <AiFoot line={p.ai.calendar} /> : null}>
          <Calendar perf={p} unit={u} ai={ai} back={back} onBack={setBack} />
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="months" title="By month" sub="· net, trades, win%" span={4}
          onExplain={() => c.explain('P&L by month', p.months.map(m => `${m.key} ${money(m.net)} on ${m.n} trades (${pct(m.wins / m.n)} won)`).join('; '))}
          foot={ai ? <AiFoot line={p.ai.months} /> : null}>
          <MonthBars months={p.months} ai={ai} />
        </Widget>
      </Slot>
      <Slot span={12}>
        <Widget id="stats" title="Statistics" sub="· this range and filters" span={12}
          onExplain={() => c.explain('trading statistics', cells.map(([k, v, sub]) => `${k} ${typeof v === 'string' ? v : ''}${sub ? ` (${sub})` : ''}`).join('; '))}
          foot={ai ? <AiFoot line={p.ai.stats} /> : null}>
          <dl className="a2-stats">
            {cells.map(([k, v, sub]) => {
              const money_ = typeof v === 'string' && v.includes('$');
              const t = typeof v === 'string' && (k === 'Long' || k === 'Short' || k.startsWith('Expect') || k.startsWith('Best') || k.startsWith('Worst') || k.startsWith('Avg')) ? (v.startsWith('−') ? 'dn' : v.startsWith('+') ? 'up' : '') : '';
              return <div key={k}><dt>{k}</dt><dd className={`d2-n ${money_ ? 'mny' : ''} ${t}`}>{v}</dd>{sub && <small>{sub}</small>}</div>;
            })}
          </dl>
        </Widget>
      </Slot>
    </Section>
  );
}

// ─── 02 time ─────────────────────────────────────────────────────────────────

export function Time({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const t = d.time!;
  const [metric, setMetric] = useState<'$' | 'win'>('$');
  const nav = d.nav.find(n => n.view === 'time');
  return (
    <Section no={no} id="time" fig={navText(nav)} figTone={nav ? tone(nav.value) : ''} one={t.ai.header}>
      <Slot span={8}>
        <Widget id="hourday" title="Hour × weekday" sub={`· ${metric === '$' ? 'net P&L' : 'win rate'}, UTC open`} span={8}
          tools={<Toggle label="Metric" value={metric} onChange={setMetric} options={[{ v: '$', label: '$' }, { v: 'win', label: 'Win%' }]} />}
          onExplain={() => c.explain('hour by weekday heat map', `${t.late ? `after ${hh(t.late.from)} UTC: ${money(t.late.net)} on ${t.late.n} trades, ${pct(t.late.wins / t.late.n)} won; ` : ''}${t.bestHours ? `best window ${hh(t.bestHours.from)}–${hh(t.bestHours.to)} UTC ${money(t.bestHours.inside.net)}, outside it ${money(t.bestHours.outside.net)}; ` : ''}by weekday: ${t.dayTotals.filter(x => x.n).map(x => `${DAY_SHORT[x.day]} ${money(x.net)}`).join(', ')}; by hour: ${t.hourTotals.filter(x => x.n).map(x => `${hh(x.hour)} ${money(x.net)}`).join(', ')}`)}
          foot={ai ? <AiFoot line={t.ai.heat} /> : null}>
          <HourHeat time={t} metric={metric} ai={ai} />
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="sessions" title="By session" sub="· UTC" span={4}
          onExplain={() => c.explain('P&L by session', t.sessions.map(s => `${SES[s.session]} ${money(s.net)} on ${s.n} trades (${s.n ? pct(s.wins / s.n) : '–'} won)`).join('; '))}
          foot={ai ? <AiFoot line={t.ai.sessions} /> : null}>
          <HBars label="Net by session" rows={t.sessions.filter(s => s.n).sort((a, b) => b.net - a.net).map(s => ({ key: s.session, label: s.session === 'NY' ? 'New York' : SES[s.session], sub: `${trades(s.n)} · ${pct(s.wins / s.n)} won`, value: s.net, tip: `${SES[s.session]}: ${money(s.net)}` }))} />
          <div className="a2-sub">Asia 22–07 · London 07–13 · New York 13–22 UTC</div>
        </Widget>
      </Slot>
    </Section>
  );
}

// ─── 03 symbols ──────────────────────────────────────────────────────────────

export function Symbols({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const s = d.symbols!;
  const [shared, setShared] = useState<'shared' | 'own'>('shared');
  const nav = d.nav.find(n => n.view === 'symbols');
  const cells = new Map(s.grid.cells.map(x => [`${x.symbol}|${x.session}`, x]));
  const mx = Math.max(1e-9, ...s.grid.cells.map(x => Math.abs(x.net)));
  return (
    <Section no={no} id="symbols" fig={navText(nav)} figTone={nav ? tone(nav.value) : ''} one={s.ai.header}>
      <Slot span={8}>
        <Widget id="mults" title="Cumulative P&L by symbol" sub={shared === 'shared' ? '· same scale' : '· own scale'} span={8}
          tools={<Toggle label="Scale" value={shared} onChange={setShared} options={[{ v: 'shared', label: 'Shared y' }, { v: 'own', label: 'Own y' }]} />}
          onExplain={() => c.explain('cumulative P&L by symbol', s.series.map(x => `${x.symbol} ${money(x.net)} on ${x.n} trades, ${pct(x.wins / x.n)} won, PF ${x.profitFactor ?? '–'}, lost in ${x.monthsLost} of ${x.monthsTraded} months`).join('; '))}
          foot={ai ? <AiFoot line={s.ai.series} /> : null}>
          <SmallMultiples series={s.series} shared={shared === 'shared'} ai={ai} total={d.overview!.net.net} />
          {s.hidden > 0 && <div className="a2-sub">{s.hidden} more symbol{s.hidden === 1 ? '' : 's'} with fewer trades. Pick one in the Symbol filter.</div>}
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="symses" title="Symbol × session" sub="· net P&L" span={4}
          onExplain={() => c.explain('symbol by session grid', s.grid.cells.filter(x => x.n).map(x => `${x.symbol} ${SES[x.session]} ${money(x.net)} (${x.n} trades)`).join('; '))}
          foot={ai ? <AiFoot line={s.ai.grid} /> : null}>
          <div className="a2-ss" role="table" aria-label="Net P&L by symbol and session">
            <div role="row" className="a2-ssr a2-ssh"><span role="columnheader" />{(['ASIA', 'LONDON', 'NY'] as const).map(x => <span key={x} role="columnheader">{SES[x]}</span>)}</div>
            {s.grid.symbols.map(sym => (
              <div role="row" key={sym} className={`a2-ssr${ai && s.grid.flagged === sym ? ' flagd' : ''}`} data-testid={`ss-${sym}`}>
                <span role="rowheader">{sym}</span>
                {(['ASIA', 'LONDON', 'NY'] as const).map(x => {
                  const cell = cells.get(`${sym}|${x}`);
                  if (!cell || !cell.n) return <span key={x} role="cell" className="a2-ssc empty">–</span>;
                  const a = Math.min(1, Math.sqrt(Math.abs(cell.net) / mx));
                  return (
                    <span key={x} role="cell" className={`a2-ssc${a > 0.62 ? ' strong' : ''}`} style={{ background: isFlat(cell.net) ? 'var(--d2-chip)' : cell.net >= 0 ? `rgba(8,196,101,${(0.12 + a * 0.8).toFixed(2)})` : `rgba(254,58,49,${(0.12 + a * 0.8).toFixed(2)})` }} title={`${sym} ${SES[x]}: ${money(cell.net)} · ${cell.wins}/${cell.n} won`}>
                      <b className="mny">{kmoney(cell.net).replace('$', '')}</b><small>{cell.n} tr</small>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </Widget>
      </Slot>
    </Section>
  );
}

// ─── 04 risk & R ─────────────────────────────────────────────────────────────

export function Risk({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const r = d.risk!;
  const T = d.counts.trades;
  const [win, setWin] = useState<'20' | '50'>('20');
  const roll = win === '50' && r.rolling50 ? r.rolling50 : r.rolling20;
  const nav = d.nav.find(n => n.view === 'risk');
  const dist = r.distribution;
  return (
    <Section no={no} id="risk" fig={navText(nav)} figTone={nav ? tone(nav.value) : ''} one={r.ai.header}>
      <Slot span={4}>
        <Widget id="dist" title={dist?.unit === 'R' ? 'R distribution' : 'P&L distribution'} sub={`· ${plural(T, 'trade')}`} span={4}
          onExplain={dist ? () => c.explain('trade result distribution', `unit ${dist.unit}, mean ${dist.unit === 'R' ? rfmt(dist.mean) : money(dist.mean)}${dist.tail ? `, ${dist.tail.trades} trades past ${dist.unit === 'R' ? '−1.25R' : money(dist.tail.threshold)} lost ${money(dist.tail.net)}` : ''}`) : undefined}
          foot={<>{dist && dist.unit === '$' && <RNote withR={r.withR} n={T} />}{ai ? <AiFoot line={r.ai.distribution} /> : null}</>}>
          {dist ? <DistChart dist={dist} ai={ai} /> : <Empty title="Needs 5 trades" note={`${T} so far.`} />}
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="hold" title="Time in trade vs result" sub={r.hold ? `· ${r.hold.unit}` : ''} span={4}
          onExplain={r.hold ? () => c.explain('time in trade against result', `${r.hold!.points.length} trades${r.hold!.ratio != null ? `, losers held ${r.hold!.ratio}× as long as winners (median)` : ''}${r.hold!.longLosers ? `, ${r.hold!.longLosers.n} losers held over ${fmtHold(r.hold!.longLosers.thresholdMs)} lost ${money(r.hold!.longLosers.net)}` : ''}`) : undefined}
          foot={<>{r.hold?.unit === '$' && <RNote withR={r.withR} n={T} />}{ai ? <AiFoot line={r.ai.hold} /> : null}</>}>
          {r.hold ? <HoldScatter hold={r.hold} ai={ai} /> : <Empty title="Needs 10 trades" note={`${T} so far.`} />}
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="mae" title="MAE / MFE" sub="· worst vs best point" span={4}
          onExplain={r.maeMfe ? () => c.explain('MAE/MFE scatter', `${r.maeMfe!.points.length} trades${r.maeMfe!.gaveBack ? `, ${r.maeMfe!.gaveBack.trades} losers were in profit first (${money(r.maeMfe!.gaveBack.net)})` : ''}`) : undefined}
          foot={ai ? <AiFoot line={r.ai.maeMfe} /> : null}>
          {r.maeMfe ? <MaeScatter mm={r.maeMfe} ai={ai} /> : <Empty title="No MAE / MFE data yet" note={`Needs the price path of each trade. ${r.withMae} of ${plural(T, 'trade')} ${T === 1 ? 'has' : 'have'} it.`} />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="rolling" title="Rolling expectancy" sub={roll ? `· ${roll.window} trades` : ''} span={6}
          tools={r.rolling20 ? <Toggle label="Window" value={win} onChange={setWin} options={[{ v: '20', label: '20' }, { v: '50', label: '50', disabled: !r.rolling50, title: r.rolling50 ? undefined : 'Needs 60 trades' }]} /> : null}
          onExplain={roll ? () => c.explain('rolling expectancy', `${roll.window}-trade average now ${roll.now} ${roll.unit}, low ${roll.low.v} ${roll.unit}`) : undefined}
          foot={<>{roll?.unit === '$' && <RNote withR={r.withR} n={T} />}{ai ? <AiFoot line={r.ai.rolling} /> : null}</>}>
          {roll ? <RollingChart roll={roll} ai={ai} /> : <Empty title="Needs 30 trades" note={`${T} so far.`} />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="exit" title="Exit efficiency" sub="· winners: kept ÷ best open profit" span={6}
          onExplain={r.exit ? () => c.explain('exit efficiency', `${r.exit!.n} winners kept on average ${pct(r.exit!.avg)} of their best open profit; bins ${r.exit!.bins.map(b => `${pct(b.from)}–${pct(b.to)}: ${b.n}`).join(', ')}`) : undefined}
          foot={ai ? <AiFoot line={r.ai.exit} /> : null}>
          {r.exit ? <ExitBars exit={r.exit} ai={ai} /> : <Empty title="Needs MAE / MFE data" note={`Exit efficiency compares each winner with its best open profit. ${r.withMae} of ${plural(T, 'trade')} ${T === 1 ? 'has' : 'have'} it.`} />}
        </Widget>
      </Slot>
    </Section>
  );
}

// ─── 05 behaviour ────────────────────────────────────────────────────────────

export function Behaviour({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const b = d.behaviour!;
  const T = d.counts.trades;
  const nav = d.nav.find(n => n.view === 'behaviour');
  const wf = b.waterfall;
  const cols: Fall[] = wf ? [
    { key: 'kept', label: 'Rules kept', sub: `${wf.kept.n} tr`, value: wf.kept.net, kind: 'base' },
    ...wf.rules.map(r => ({ key: r.key, label: r.label, sub: `${r.n} tr`, value: r.net, kind: 'step' as const })),
    { key: 'net', label: 'Net', sub: `${wf.total.n} tr`, value: wf.total.net, kind: 'total' },
  ] : [];
  const avgWr = d.overview!.winRate;
  const unit = b.bySize?.unit ?? '$';
  const fmtU = (v: number) => (unit === 'R' ? rfmt(v) : money(v));
  return (
    <Section no={no} id="behaviour" fig={navText(nav)} figTone={nav ? tone(nav.value) : ''} one={b.ai.header}>
      <Slot span={8}>
        <Widget id="rules" title="P&L by rule" sub="· each trade once, first rule broken" span={8}
          onExplain={wf ? () => c.explain('P&L by rule waterfall', `rules kept ${money(wf.kept.net)} on ${wf.kept.n} trades; ${wf.rules.map(r => `${r.label} ${money(r.net)} on ${r.n} trades (${pct(r.wins / r.n)} won)`).join('; ')}; net ${money(wf.total.net)}`) : undefined}
          foot={ai ? <AiFoot line={b.ai.waterfall} /> : null}>
          {wf ? <Waterfall cols={cols} label="Net P&L by the first rule each trade broke" /> : <Empty title={`Needs ${d.minTrades} trades`} note={`${T} so far. The losing-hour rule needs your own history as the baseline.`} />}
        </Widget>
      </Slot>
      <Slot span={4}>
        <Widget id="score" title="Behaviour score" sub="· bar = trade" span={4}
          onExplain={b.score ? () => c.explain('behaviour score', `score ${b.score!.score}, last 30 ${b.score!.last30}; ${b.score!.parts.map(p => `${p.label} ${p.score} (last 30: ${p.last30})`).join(', ')}`) : undefined}
          foot={ai ? <AiFoot line={b.ai.score} /> : null}>
          {b.score && b.strips ? <ScoreStrips b={b.strips} parts={b.score.parts} ai={ai} /> : <Empty title={`Needs ${d.minTrades} trades`} note={`${T} so far.`} />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="losses" title="Win rate by losses that day" sub="· losing trades in a row earlier that UTC day" span={6}
          onExplain={b.byLosses.length ? () => c.explain('win rate by losses earlier that day', b.byLosses.map(x => `${x.key} lost: ${x.n} trades, ${x.n ? pct(x.wins / x.n) : '–'} won, ${money(x.net)}${x.size != null ? `, ${x.size}× usual size` : ''}`).join('; ')) : undefined}
          foot={ai ? <AiFoot line={b.ai.losses} /> : null}>
          {b.byLosses.length ? <LossBars rows={b.byLosses} avg={avgWr} /> : <Empty title="Needs 10 trades" note={`${T} so far.`} />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="size" title={`Avg ${unit === 'R' ? 'R' : 'result'} by size`} sub="· volume ÷ your usual size on that symbol" span={6}
          onExplain={b.bySize ? () => c.explain('average result by position size', b.bySize!.rows.map(x => `${x.label}: ${x.n} trades, ${pct(x.wins / x.n)} won, avg ${fmtU(x.avg)}`).join('; ')) : undefined}
          foot={<>{b.bySize?.unit === '$' && <RNote withR={d.counts.withR} n={T} />}{ai ? <AiFoot line={b.ai.size} /> : null}</>}>
          {b.bySize ? <HBars label="Average result by size" unit={unit} rows={b.bySize.rows.map(x => ({ key: x.key, label: x.label, sub: `${trades(x.n)} · ${pct(x.wins / x.n)} won`, value: x.avg }))} /> : <Empty title="Sizes look the same" note="Needs at least two size groups with 3+ trades (symbols with 3+ trades)." />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="tags" title="Setup edge" sub="· net P&L by journal tag" span={6}
          onExplain={b.tags.length ? () => c.explain('net P&L by setup tag', b.tags.map(x => `${x.label} ${money(x.net)} on ${x.n} trades`).join('; ')) : undefined}>
          {b.tags.length ? <HBars compact label="Net by tag" rows={b.tags.map(x => ({ key: x.label, label: x.label, sub: `${trades(x.n)} · ${pct(x.wins / x.n)} won`, value: x.net }))} /> : <Empty title="No tagged trades" note="Tag your setups in the Journal to see which ones carry your edge." />}
        </Widget>
      </Slot>
      <Slot span={6}>
        <Widget id="emotions" title="Psychology edge" sub="· net P&L by emotion" span={6}
          onExplain={b.emotions.length ? () => c.explain('net P&L by emotion', b.emotions.map(x => `${x.label} ${money(x.net)} on ${x.n} trades`).join('; ')) : undefined}>
          {b.emotions.length ? <HBars compact label="Net by emotion" rows={b.emotions.map(x => ({ key: x.label, label: x.label, sub: `${trades(x.n)} · ${pct(x.wins / x.n)} won`, value: x.net }))} /> : <Empty title="No emotions logged" note="Log how you felt on a trade in Journal › Trade review to see which states pay." />}
        </Widget>
      </Slot>
    </Section>
  );
}

// ─── 06 what-if ──────────────────────────────────────────────────────────────

function FixList({ w, mask, onToggle }: { w: AnaWhatIf; mask: number; onToggle: (i: number) => void }) {
  const mx = Math.max(1, ...w.fixes.map(f => f.alone), w.breakEven?.gain ?? 0, ...w.fixes.map((_, i) => Math.abs(addedBy(w, mask, i))));
  const bar = (v: number) => `${Math.max(1.5, (100 * Math.abs(v)) / mx)}%`;
  return (
    <div className="a2-fixes" role="list">
      {w.fixes.map((f, i) => {
        const on = !!(mask & (1 << i));
        const add = addedBy(w, mask, i);
        return (
          <div key={f.key} className="a2-fix" role="listitem">
            <label className="a2-fixl">
              <input type="checkbox" checked={on} onChange={() => onToggle(i)} data-testid={`fix-${i}`} />
              <span className="a2-box" aria-hidden>{on && <Check size={11} weight="bold" />}</span>
              <span className="a2-fixt">{f.label}</span>
            </label>
            <div className="a2-fixb">
              <div><i className="lt" style={{ width: bar(f.alone) }} /><span>alone <span className="mny">{kmoney(f.alone)}</span></span></div>
              <div><i className={add >= 0 ? 'up' : 'dn'} style={{ width: bar(add) }} /><b className={`mny ${tone(add)}`}>{on ? 'counted' : 'on top'} {kmoney(add)}</b></div>
            </div>
          </div>
        );
      })}
      <div className="a2-fix off" role="listitem">
        <label className="a2-fixl"><span className="a2-box" aria-hidden /><span className="a2-fixt">Break-even at +1R<small className="dn">{w.breakEvenNeeds === 'mae' ? 'needs MAE/MFE data' : w.breakEvenNeeds === 'r' ? 'needs R (stop at entry)' : w.breakEven ? '' : 'no loser reached +1R'}</small></span></label>
        <div className="a2-fixb">{w.breakEven && <div title={`${plural(w.breakEven.trades, 'loser')} reached +1R first`}><i className="lt" style={{ width: bar(w.breakEven.gain) }} /><span>alone <span className="mny">{kmoney(w.breakEven.gain)}</span></span></div>}</div>
      </div>
      <div className="a2-sub">Light bar: rule alone · solid: added in order, overlaps removed</div>
    </div>
  );
}

export function WhatIf({ c, no }: { c: ViewCtx; no: string }) {
  const { d, ai } = c;
  const w = d.whatif!;
  const [mask, setMask] = useState(w.defaultMask);
  useEffect(() => setMask(w.defaultMask), [w]);
  const steps = whatIfSteps(w, mask);
  const total = w.base + (w.gains[mask] ?? 0);
  const nav = d.nav.find(n => n.view === 'whatif');
  const cols: Fall[] = [
    { key: 'actual', label: 'Actual', sub: `${d.counts.trades} tr`, value: w.base, kind: 'total' },
    ...steps.map(s => ({ key: s.key, label: s.label, sub: `−${s.trades} tr`, value: s.delta, kind: 'step' as const })),
    { key: 'with', label: steps.length ? 'With fixes' : 'Actual', sub: `${d.counts.trades - (w.removed[mask] ?? 0)} tr`, value: total, kind: 'goal' },
  ];
  const line: AiLine | null = steps.length ? { text: `${plural(w.removed[mask] ?? 0, 'trade')} removed`, value: null, fmt: 'text', tone: 'flat', trades: w.removed[mask] ?? 0 } : null;
  return (
    <Section no={no} id="whatif" fig={navText(nav)} figTone={nav ? tone(nav.value) : ''} one={w.ai.header}>
      {w.fixes.length ? <>
        <Slot span={6}>
          <Widget id="fixes" title="Net with fixes added" sub="· in order, no double counting" span={6}
            onExplain={() => c.explain('what-if with fixes added', `actual ${money(w.base)}; ${steps.map(s => `${s.label} adds ${money(s.delta)} (${s.trades} trades skipped)`).join('; ')}; result ${money(total)}`)}
            foot={ai ? <AiFoot line={mask === w.defaultMask ? w.ai.steps : line} /> : null}>
            <Waterfall cols={cols} label="Net with the chosen fixes added in order" />
          </Widget>
        </Slot>
        <Slot span={6}>
          <Widget id="alone" title="Rules, alone vs in order" span={6}
            onExplain={() => c.explain('rules alone against in order', w.fixes.map((f, i) => `${f.label}: alone ${money(f.alone)}, in order ${money(addedBy(w, mask, i))}`).join('; '))}
            foot={ai ? <AiFoot line={w.ai.rules} /> : null}>
            <FixList w={w} mask={mask} onToggle={i => setMask(m => m ^ (1 << i))} />
          </Widget>
        </Slot>
      </> : (
        <Slot span={12}>
          <Widget id="fixes" title="Net with fixes added" span={12}>
            <Empty title={d.counts.trades < 10 ? 'Needs 10 trades' : 'Nothing to fix'} note={d.counts.trades < 10 ? `${d.counts.trades} so far.` : 'No group of 3+ trades you could have skipped before entry lost money.'} />
          </Widget>
        </Slot>
      )}
    </Section>
  );
}

export const SECTIONS: Array<{ id: Exclude<AnalyticsView, 'overview'>; C: (p: { c: ViewCtx; no: string }) => ReactNode }> = [
  { id: 'performance', C: Performance }, { id: 'time', C: Time }, { id: 'symbols', C: Symbols },
  { id: 'risk', C: Risk }, { id: 'behaviour', C: Behaviour }, { id: 'whatif', C: WhatIf },
];
