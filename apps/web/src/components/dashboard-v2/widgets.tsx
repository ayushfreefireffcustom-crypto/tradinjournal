'use client';

// HTML widgets for Dashboard v2: KPI ribbon, leaks, heatmap, behaviour, before
// you trade, plan, symbols and recent trades.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowsVertical, CalendarBlank, CaretDown, CaretRight, Clock, CurrencyCircleDollar, GlobeHemisphereWest, Hourglass, Lightning, Lock, Moon, Scales, ShieldCheck, Target, TrendDown, type Icon } from '@phosphor-icons/react';
import type { AiLine, DashBehaviour, DashHeatmap, DashKpis, DashPlanRule, DashRecentTrade, DashSymbolRow, HourCellDTO, LeakDTO } from '@/lib/dashboard-v2-api';
import { DAY_SHORT, fmtAi, fmtDate, isFlat, kmoney, money, pct, plural, rfmt, SESSION_SHORT, spct, tone, toneColor } from '@/lib/dashboard-v2-format';
import { clock, shortDate } from '@/lib/tradelog-v2-api';
import { Empty } from './ui';
import { Spark } from './charts';

/** Money for the KPI ribbon: compact above $100k so the cell never overflows. */
const kpiMoney = (v: number, plus = true) => (Math.abs(v) >= 100_000 ? kmoney(v, { plus }) : money(v, { plus }));

/** A sparkline that fills its box (the KPI tiles). */
function Trend({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return <span className="d2-trend" aria-hidden />;
  const mn = Math.min(...vals), mx = Math.max(...vals), W = 120, H = 26;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(1)} ${(H - 2 - ((v - mn) / (mx - mn || 1)) * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="d2-trend" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
/** How far below its running peak the curve sat at each point (0 or less). */
const underwater = (vals: number[]) => { let peak = -Infinity; return vals.map(v => { peak = Math.max(peak, v); return v - peak; }); };

function Ring({ score }: { score: number }) {
  const c = 2 * Math.PI * 8, f = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg className="d2-ring" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--track)" strokeWidth="2.5" />
      <circle cx="10" cy="10" r="8" fill="none" stroke={score >= 60 ? 'var(--d2-g)' : score >= 40 ? 'var(--mut)' : 'var(--d2-r)'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 10 10)" />
    </svg>
  );
}

/** Key numbers: four tiles with a trend each, and a strip of five supporting figures. */
export function KpiRibbon({ k, trades, behaviour, minTrades, ai }: { k: DashKpis; trades: number; behaviour: DashBehaviour | null; minTrades: number; ai: boolean }) {
  const payoff = k.avgLoss < 0 && k.avgWin > 0 ? k.avgWin / -k.avgLoss : null;
  const wins = Math.round(k.winRate * trades);
  const gp = Math.abs(k.grossProfit), gl = Math.abs(k.grossLoss);
  const dd = underwater(k.equitySpark);
  const tiles: Array<{ id: string; label: string; chip?: React.ReactNode; value: React.ReactNode; sub: React.ReactNode; viz: React.ReactNode }> = [
    {
      id: 'net', label: 'Net P&L',
      chip: k.returnPct != null ? <span className={`d2-chip ${tone(k.returnPct)}`} title="Return on the balance at the start of the range">{spct(k.returnPct)}</span> : undefined,
      value: <b className={`d2-n mny ${tone(k.netPnl)}`}>{kpiMoney(k.netPnl)}</b>,
      sub: <span>{plural(trades, 'trade')}</span>,
      viz: <Trend vals={k.equitySpark} color={k.netPnl < 0 ? 'var(--d2-r)' : 'var(--d2-g)'} />,
    },
    {
      id: 'winrate', label: 'Win rate',
      value: <b className="d2-n">{pct(k.winRate, 1)}</b>,
      sub: <span><span className="d2-n">{wins}</span> of <span className="d2-n">{trades}</span> won</span>,
      viz: k.rollingWinRate.length > 1 ? <span className="d2-viz" title="Win rate over the last 20 trades, along the range"><Trend vals={k.rollingWinRate} color="var(--mut)" /></span> : <span className="d2-trend" aria-hidden />,
    },
    {
      id: 'pf', label: 'Profit factor',
      // Above 1 the account made more than it lost: green; below 1, red.
      value: <b className={`d2-n ${k.profitFactor == null ? '' : k.profitFactor > 1 ? 'up' : k.profitFactor < 1 ? 'dn' : ''}`}>{k.profitFactor == null ? '–' : k.profitFactor.toFixed(2)}</b>,
      sub: k.profitFactor == null ? <span>no losing trades</span> : <span><span className="mny up">{money(gp, { plus: false })}</span> won / <span className="mny dn">{money(gl, { plus: false })}</span> lost</span>,
      viz: gp + gl > 0 ? <span className="d2-split" aria-hidden><i style={{ width: `${(100 * gp) / (gp + gl)}%` }} /></span> : <span className="d2-trend" aria-hidden />,
    },
    {
      id: 'dd', label: 'Max drawdown',
      value: k.maxDrawdown?.pct != null || !k.maxDrawdown
        ? <b className={`d2-n ${k.maxDrawdown ? 'dn' : ''}`}>{k.maxDrawdown ? spct(-k.maxDrawdown.pct!) : '0.0%'}</b>
        : <b className="d2-n dn mny">{kpiMoney(-k.maxDrawdown.amount)}</b>,
      sub: <span>{k.maxDrawdown ? <>{k.maxDrawdown.pct != null && <><span className="mny dn">{money(-k.maxDrawdown.amount)}</span> · </>}{fmtDate(new Date(k.maxDrawdown.at).getTime())}</> : 'no drawdown'}</span>,
      viz: <span className="d2-viz" title="How far below its peak the balance sat"><Trend vals={dd} color={k.maxDrawdown ? 'var(--d2-r)' : 'var(--mut)'} /></span>,
    },
  ];
  const strip: Array<{ id: string; label: string; value: React.ReactNode; small: React.ReactNode }> = [
    { id: 'balance', label: 'Balance', value: <span className="mny">{kpiMoney(k.balance, false)}</span>, small: <>peak <span className="mny">{kpiMoney(k.peakBalance, false)}</span></> },
    {
      id: 'exp', label: 'Expectancy',
      value: k.expectancyR != null ? <span className={tone(k.expectancyR)}>{rfmt(k.expectancyR)}</span> : <span className={`mny ${tone(k.expectancy)}`}>{money(k.expectancy)}</span>,
      small: k.expectancyR != null ? <><span className={`mny ${tone(k.expectancy)}`}>{money(k.expectancy)}</span> a trade</> : <span title="In $: R needs a stop at entry">a trade</span>,
    },
    { id: 'avg', label: 'Avg win / loss', value: <span>{payoff == null ? '–' : `${payoff.toFixed(2)}×`}</span>, small: <span className="mny"><span className="up">{money(k.avgWin, { plus: false })}</span> / <span className="dn">{money(Math.abs(k.avgLoss), { plus: false })}</span></span> },
    {
      id: 'last30', label: `Last ${Math.min(30, k.last30.days)} session${k.last30.days === 1 ? '' : 's'}`,
      value: <span className={`mny ${tone(k.last30.net)}`}>{kpiMoney(k.last30.net)}</span>,
      small: <span title={`The last ${k.last30.days} days with a closed trade`}><span className="up">{k.last30.green} green</span> · <span className="dn">{k.last30.days - k.last30.green} red</span></span>,
    },
    {
      id: 'behaviour', label: 'Behaviour',
      value: behaviour ? <><Ring score={behaviour.score} />{behaviour.score}</> : <span className="d2-dim">–</span>,
      small: behaviour
        ? <><span>/100</span> <span className={behaviour.last30 < behaviour.score ? 'dn' : behaviour.last30 > behaviour.score ? 'up' : ''} data-ai>{behaviour.last30} last 30</span></>
        : <span>needs {minTrades} trades</span>,
    },
  ];
  void ai;
  return (
    <section className="d2-tray d2-kpis" aria-label="Key numbers" data-testid="kpi-ribbon">
      <div className="d2-kt">
        {tiles.map(t => (
          <div key={t.id} className="d2-tile d2-k" data-testid={`kpi-${t.id}`}>
            <div className="d2-k-l">{t.label}{t.chip}</div>
            <div className="d2-k-v">{t.value}</div>
            <div className="d2-k-s">{t.sub}</div>
            <div className="d2-k-z">{t.viz}</div>
          </div>
        ))}
      </div>
      <div className="d2-ks">
        {strip.map(c => (
          <div key={c.id} data-testid={`kpi-${c.id}`}>
            <span className="d2-cap">{c.label}</span>
            <b className="d2-n">{c.value}<small>{c.small}</small></b>
          </div>
        ))}
      </div>
    </section>
  );
}

const LEAK_ICON: Array<[RegExp, Icon]> = [
  [/^late$/, Moon], [/^after-losses$/, TrendDown], [/^revenge$/, Lightning], [/^oversized$/, Scales], [/^moved-stop$/, ArrowsVertical],
  [/^sym:/, CurrencyCircleDollar], [/^ses:/, GlobeHemisphereWest], [/^day:/, CalendarBlank],
];
const leakIcon = (key: string): Icon => LEAK_ICON.find(([re]) => re.test(key))?.[1] ?? TrendDown;

export function LeaksList({ rows, trades }: { rows: LeakDTO[]; trades: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return trades < 10
    ? <Empty title="Needs 10 trades" note={`${trades} so far. Leaks are groups of 3+ trades.`} />
    : <Empty title="No leaks found" note="Every group we check is net positive." />;
  const mx = Math.max(...rows.map(r => -r.net));
  const shown = all ? rows : rows.slice(0, 3);
  return (
    <>
      <div className="d2-leaks" role="list">
        {shown.map((r, i) => {
          const I = leakIcon(r.key);
          return (
            <div key={r.key} role="listitem" className="d2-tile d2-leak">
              <span className="d2-glyph sm" aria-hidden><I size={20} /></span>
              <div className="d2-leak-l">
                <b>{r.label}</b><small>{r.sub}</small>
                <div className="d2-leak-b" aria-hidden><i style={{ width: `${Math.max(3, (100 * -r.net) / mx)}%`, opacity: 1 - i * 0.12 }} /></div>
              </div>
              <b className="d2-n dn mny">{kmoney(r.net)}</b>
            </div>
          );
        })}
      </div>
      {rows.length > 3 && (
        <button type="button" className="d2-more" onClick={() => setAll(v => !v)} aria-expanded={all}>
          {all ? 'Show top 3' : `Show all ${rows.length}`}<CaretRight size={12} style={{ transform: all ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
        </button>
      )}
    </>
  );
}

/** The leaks widget's footer: what skipping them would have kept, as one green line. */
export function KeepLine({ line }: { line: AiLine | null }) {
  if (!line) return null;
  const v = fmtAi(line);
  return (
    <div className="d2-keep" data-ai>
      <ShieldCheck size={18} weight="regular" aria-hidden />
      <span>{line.text.replace(/:\s*$/, '')}{line.suffix ? <span className="d2-dim"> {line.suffix}</span> : null}</span>
      {v && <b className={`d2-n mny ${line.tone === 'dn' ? 'dn' : 'up'}`}>{v}</b>}
    </div>
  );
}

export function Heatmap({ hm, metric, ai }: { hm: DashHeatmap; metric: '$' | 'win'; ai: boolean }) {
  const S = ['ASIA', 'LONDON', 'NY'] as const;
  const mxNet = Math.max(1, ...hm.cells.map(c => Math.abs(c.net)));
  const cell = (s: string, d: number) => hm.cells.find(c => c.session === s && c.day === d)!;
  const cols = hm.days.length;
  // Cells drop the $ (the header says net P&L) but always keep the sign, so a
  // loss never reads like a win; empty cells stay blank instead of a row of dashes.
  const cellMoney = (v: number) => kmoney(v).replace('$', '');
  // Inside a cell cents are noise and don't fit a phone: whole dollars, "<1" under a dollar
  // (the tooltip keeps the exact figure).
  const cellNet = (v: number) => (Math.abs(v) >= 1000 ? cellMoney(v) : isFlat(v) ? '0' : `${v < 0 ? '−' : '+'}${Math.abs(v) < 1 ? '<1' : Math.round(Math.abs(v))}`);
  return (
    <div className={`d2-hm${cols > 5 ? ' dense' : ''}`} style={{ gridTemplateColumns: `var(--hm-l) repeat(${cols}, minmax(0, 1fr)) var(--hm-r)` }} role="table" aria-label="Net P&L by session and weekday (UTC)">
      <span />
      {hm.days.map(d => <span key={d} className="d2-hh">{DAY_SHORT[d]}</span>)}
      <span className="d2-hh r">Total</span>
      {S.map(s => {
        const st = hm.sessions.find(x => x.session === s)!;
        return [
          <span key={`${s}l`} className="d2-hl">{s === 'LONDON' ? <><span className="d2-hl-l">London</span><span className="d2-hl-s">Ldn</span></> : SESSION_SHORT[s]}</span>,
          ...hm.days.map(d => {
            const c = cell(s, d);
            const isB = ai && hm.best?.session === s && hm.best.day === d;
            const isW = ai && hm.worst?.session === s && hm.worst.day === d;
            const wr = c.n ? c.wins / c.n : 0;
            const a = metric === '$' ? Math.min(1, Math.abs(c.net) / mxNet) : Math.min(1, Math.abs(wr - 0.5) * 2);
            const pos = metric === '$' ? c.net >= 0 : wr >= 0.5;
            // A cell that nets to $0.00 (or exactly 50% won) is neither green nor red.
            const flat = metric === '$' ? isFlat(c.net) : wr === 0.5;
            const strong = c.n > 0 && !flat && a > 0.7;
            const bg = !c.n ? 'var(--d2-card2)' : flat ? 'var(--d2-chip)' : `rgba(${pos ? '8,196,101' : '254,58,49'},${(0.08 + a * 0.62).toFixed(2)})`;
            return (
              <div key={`${s}${d}`} className={`d2-hc${isW ? ' worst' : isB ? ' best' : ''}${strong ? ' strong' : ''}`} style={{ background: bg }}
                title={c.n ? `${SESSION_SHORT[s]} ${DAY_SHORT[d]}: ${money(c.net)} · ${c.wins} of ${c.n} won` : 'No trades'}>
                <b className="d2-n">{c.n ? (metric === '$' ? cellNet(c.net) : pct(wr)) : ''}</b>
                <small>{isW ? <em className="d2-flag" data-ai>Skip</em> : isB ? <em className="d2-flag g" data-ai>Best</em> : c.n ? `${c.n} tr` : ''}</small>
              </div>
            );
          }),
          <b key={`${s}t`} className={`d2-ht d2-n ${metric === '$' ? tone(st.net) : ''}`}>{st.n ? (metric === '$' ? kmoney(st.net) : pct(st.wins / st.n)) : ''}</b>,
        ];
      })}
      <span className="d2-hl">Total</span>
      {hm.dayTotals.map(d => <b key={d.day} className={`d2-ht c d2-n ${metric === '$' ? tone(d.net) : ''}`}>{d.n ? (metric === '$' ? cellMoney(d.net) : pct(d.wins / d.n)) : ''}</b>)}
      {(() => { const t = hm.sessions.reduce((a, s) => ({ n: a.n + s.n, wins: a.wins + s.wins, net: a.net + s.net }), { n: 0, wins: 0, net: 0 }); return <b className={`d2-ht d2-n ${metric === '$' ? tone(t.net) : ''}`}>{metric === '$' ? kmoney(t.net) : t.n ? pct(t.wins / t.n) : '–'}</b>; })()}
    </div>
  );
}

export function BehaviourBars({ b }: { b: DashBehaviour }) {
  return (
    <div className="d2-beh">
      <div className="d2-big d2-n">{b.score}<small>/100</small></div>
      <div className="d2-beh-rows">
        {b.parts.map(p => {
          const d = p.last30 - p.score;
          return (
            <div key={p.key} className="d2-beh-row">
              <div><b>{p.label}</b><small className={d < 0 ? 'dn' : d > 0 ? 'up' : ''}>{d < 0 ? '−' : d > 0 ? '+' : '±'}{Math.abs(d)} last 30</small></div>
              <div className="d2-beh-bar" aria-hidden><i style={{ width: `${p.score}%` }} /><em style={{ left: `${p.last30}%` }} /></div>
              <b className="d2-n">{p.score}</b>
            </div>
          );
        })}
        <div className="d2-beh-axis" aria-hidden><span>0</span><span>50</span><span>100</span></div>
      </div>
    </div>
  );
}

/** "Before you trade": pick symbol and side; win rate by UTC hour with the current hour marked. */
export function useNowUtc(): { h: number; m: number } {
  const [now, setNow] = useState<{ h: number; m: number } | null>(null);
  useEffect(() => {
    const set = () => { const d = new Date(); setNow({ h: d.getUTCHours(), m: d.getUTCMinutes() }); };
    set();
    const id = setInterval(set, 30_000);
    return () => clearInterval(id);
  }, []);
  return now ?? { h: 0, m: 0 };
}

export function BeforeYouTrade({ hours, symbols, children }: {
  hours: HourCellDTO[]; symbols: string[];
  children: (s: { cells: HourCellDTO[]; symbol: string; side: 'LONG' | 'SHORT'; now: { h: number; m: number }; picker: React.ReactNode }) => React.ReactNode;
}) {
  const now = useNowUtc();
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const sym = symbols.includes(symbol) ? symbol : symbols[0] ?? '';
  // Default side: the one you trade more on this symbol.
  const sides = useMemo(() => {
    const n = { LONG: 0, SHORT: 0 };
    for (const c of hours) if (c.symbol === sym) n[c.side] += c.n;
    return n;
  }, [hours, sym]);
  useEffect(() => { setSide(sides.SHORT > sides.LONG ? 'SHORT' : 'LONG'); }, [sym, sides]);
  const cells = hours.filter(c => c.symbol === sym && c.side === side);
  const picker = (
    <div className="d2-pick">
      <label className="d2-sel"><span className="sr-only">Symbol</span>
        <select value={sym} onChange={e => setSymbol(e.target.value)} aria-label="Symbol">{symbols.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <CaretDown size={11} />
      </label>
      <div className="d2-tg" role="group" aria-label="Side">
        {(['LONG', 'SHORT'] as const).map(s => <button key={s} type="button" className={side === s ? 'on' : ''} aria-pressed={side === s} onClick={() => setSide(s)}>{s === 'LONG' ? 'Long' : 'Short'}</button>)}
      </div>
      <span className="d2-now"><Clock size={13} />{String(now.h).padStart(2, '0')}:{String(now.m).padStart(2, '0')} UTC</span>
    </div>
  );
  return <>{children({ cells, symbol: sym, side, now, picker })}</>;
}

const PLAN_ICON = { clock: Clock, target: Target, scales: Scales, hourglass: Hourglass, lock: Lock } as const;
export function PlanList({ rules }: { rules: DashPlanRule[] }) {
  return (
    <div className="d2-plan">
      {rules.map((r, i) => {
        const Icon = PLAN_ICON[r.icon];
        return (
          <div key={i}>
            <span><Icon size={15} />{r.text}</span>
            <b className={`d2-n ${r.tone === 'up' ? 'up' : r.tone === 'dn' ? 'dn' : ''} ${r.fmt === 'money' ? 'mny' : ''}`}>{r.fmt === 'money' ? money(r.value) : `${pct(r.value)} won`}</b>
          </div>
        );
      })}
    </div>
  );
}

export function SymbolsTable({ rows, rangeLabel }: { rows: DashSymbolRow[]; rangeLabel: string }) {
  const unit = rows[0]?.avgUnit ?? '$';
  return (
    <div className="d2-tbl">
      <table className="d2-dt">
        <thead><tr><th>Symbol</th><th>Trades</th><th>Win%</th><th className="d2-hide-s">PF</th><th className="d2-hide-s">Avg {unit}</th><th className="d2-hide-m">{rangeLabel} curve</th><th>Net</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.symbol}>
              <td>
                <span className="d2-sym">
                  <i style={{ background: toneColor(r.net, 'var(--d2-g)', 'var(--d2-r)') }} /><b>{r.symbol}</b>
                  {r.tag?.kind === 'pause' && <span className="d2-aitag dn" data-ai title="TRADElogs AI: net negative with a profit factor under 0.7">Pause</span>}
                  {r.tag?.kind === 'share' && <span className="d2-aitag up d2-hide-s" data-ai title="TRADElogs AI: share of the profit made by your winning symbols">{pct(r.tag.pct ?? 0)} of profit</span>}
                </span>
              </td>
              <td className="d2-n">{r.trades}</td>
              <td className="d2-n">{pct(r.winRate)}</td>
              <td className={`d2-n d2-hide-s ${r.profitFactor == null ? '' : r.profitFactor > 1 ? 'up' : r.profitFactor < 1 ? 'dn' : ''}`}>{r.profitFactor == null ? '–' : r.profitFactor.toFixed(2)}</td>
              <td className={`d2-n d2-hide-s ${tone(r.avg)}`}><span className={unit === '$' ? 'mny' : ''}>{unit === 'R' ? rfmt(r.avg) : money(r.avg)}</span></td>
              <td className="d2-hide-m"><Spark vals={r.spark} /></td>
              <td><b className={`d2-n mny ${tone(r.net)}`}>{money(r.net)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GRADE_CLS: Record<string, string> = { A: 'up', B: 'up', C: 'mid', D: 'dn', F: 'dn' };
const DAY = 86_400_000;
/** "today", "yesterday", "Tue", or "12 Nov" (your time zone). */
function dayWord(ms: number, now: number): string {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const diff = Math.floor((d0.getTime() - ms) / DAY) + 1;
  if (ms >= d0.getTime()) return 'today';
  if (diff <= 1) return 'yesterday';
  if (diff < 6) return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
  return shortDate(ms);
}
const held = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 2 * DAY ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / DAY)}d`);

/**
 * The latest closed trades, newest first, as tiles: symbol, side, when it closed (your time
 * zone) and how long it was held, R, P&L and the process grade. Grades only appear once
 * they exist (they need MIN_TRADES trades); the page says so in the footer.
 */
export function RecentTable({ rows }: { rows: DashRecentTrade[] }) {
  const graded = rows.some(t => t.grade);
  const hasR = rows.some(t => t.r != null);
  const now = Date.now();
  return (
    <div className={`d2-trs${hasR ? ' has-r' : ''}${graded ? ' has-g' : ''}`} role="list">
      {rows.map(t => {
        const open = new Date(t.openTime).getTime();
        const close = new Date(t.closeTime).getTime();
        return (
          <Link key={t.id} role="listitem" href={`/trades/${encodeURIComponent(t.id)}`} className="d2-tile d2-tr"
            title={`Opened ${shortDate(open)} ${clock(open)} · closed ${shortDate(close)} ${clock(close)}`}>
            <span className="d2-symb" aria-hidden>{t.symbol.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()}</span>
            <span className="d2-tr-l">
              <b>{t.symbol} <span className={`d2-side ${t.side === 'LONG' ? 'up' : 'dn'}`}>{t.side === 'LONG' ? 'Long' : 'Short'}</span></b>
              <small><span className="d2-n">{clock(close)}</span> · {dayWord(close, now)} · held {held(Math.max(0, close - open))}</small>
            </span>
            {hasR && <span className={`d2-n d2-tr-r ${t.r == null ? 'd2-dim' : tone(t.r)}`}>{t.r == null ? '–' : rfmt(t.r)}</span>}
            <b className={`d2-n mny d2-tr-p ${tone(t.net)}`}>{money(t.net, { dec: 2 })}</b>
            {graded && (t.grade
              ? <span className={`d2-gd ${GRADE_CLS[t.grade]}`} data-ai title={t.reasons.length ? t.reasons.map(r => r.replace(/^Your rule: /, '')).join(' · ') : 'No process flags'}>{t.grade}</span>
              : <span className="d2-gd d2-dim" data-ai title="Not graded">–</span>)}
          </Link>
        );
      })}
    </div>
  );
}
