'use client';

// HTML widgets for Dashboard v2: KPI ribbon, leaks, heatmap, behaviour, before
// you trade, plan, symbols and recent trades.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CaretDown, Clock, Hourglass, Lock, Scales, Target } from '@phosphor-icons/react';
import type { DashBehaviour, DashHeatmap, DashKpis, DashPlanRule, DashRecentTrade, DashSymbolRow, HourCellDTO, LeakDTO } from '@/lib/dashboard-v2-api';
import { DAY_SHORT, fmtDate, kmoney, money, pct, rfmt, SESSION_SHORT, spct, tone } from '@/lib/dashboard-v2-format';
import { AiMark, Empty } from './ui';
import { MiniLine, Spark } from './charts';

/** Money for the KPI ribbon: compact above $100k so the cell never overflows. */
const kpiMoney = (v: number, plus = true) => (Math.abs(v) >= 100_000 ? kmoney(v, { plus }) : money(v, { plus }));

export function KpiRibbon({ k, trades, behaviour, minTrades, ai }: { k: DashKpis; trades: number; behaviour: DashBehaviour | null; minTrades: number; ai: boolean }) {
  const payoff = k.avgLoss < 0 && k.avgWin > 0 ? k.avgWin / -k.avgLoss : null;
  const cells: Array<{ id: string; label: string; value: React.ReactNode; small: React.ReactNode }> = [
    { id: 'net', label: 'Net P&L', value: <b className={`d2-n mny ${tone(k.netPnl)}`}>{kpiMoney(k.netPnl)}</b>, small: <><span title="Return on the balance at the start of the range">{k.returnPct != null ? spct(k.returnPct) : `${trades} trades`}</span><MiniLine vals={k.equitySpark} w={48} /></> },
    { id: 'balance', label: 'Balance', value: <b className="d2-n mny">{kpiMoney(k.balance, false)}</b>, small: <span>peak <span className="mny">{kpiMoney(k.peakBalance, false)}</span></span> },
    { id: 'last30', label: `${Math.min(30, k.last30.days)} session${k.last30.days === 1 ? '' : 's'}`, value: <b className={`d2-n mny ${tone(k.last30.net)}`}>{kpiMoney(k.last30.net)}</b>, small: <span title={`The last ${k.last30.days} days with a closed trade`}>{k.last30.green} of {k.last30.days} green</span> },
    { id: 'winrate', label: 'Win rate', value: <b className="d2-n">{pct(k.winRate, 1)}</b>, small: k.rollingWinRate.length > 1 ? <><span title="Win rate over the last 20 trades, along the range">roll 20</span><MiniLine vals={k.rollingWinRate} w={48} /></> : <span>{trades} trades</span> },
    { id: 'pf', label: 'Profit factor', value: <b className="d2-n">{k.profitFactor == null ? '–' : k.profitFactor.toFixed(2)}</b>, small: <span className="mny">{k.profitFactor == null ? 'no losing trades' : `${money(k.grossProfit, { plus: false })} / ${money(k.grossLoss, { plus: false })}`}</span> },
    {
      id: 'exp', label: 'Expectancy',
      value: k.expectancyR != null ? <b className={`d2-n ${tone(k.expectancyR)}`}>{rfmt(k.expectancyR)}</b> : <b className={`d2-n mny ${tone(k.expectancy)}`}>{money(k.expectancy)}</b>,
      small: k.expectancyR != null ? <span className="mny">{money(k.expectancy)} per trade</span> : <span title="In $: R needs a stop at entry">per trade</span>,
    },
    { id: 'avg', label: 'Avg win/loss', value: <b className="d2-n">{payoff == null ? '–' : `${payoff.toFixed(2)}×`}</b>, small: <span className="mny">{money(k.avgWin)} / {money(k.avgLoss)}</span> },
    { id: 'dd', label: 'Drawdown', value: <b className={`d2-n ${k.maxDrawdown ? 'dn' : ''}`}>{k.maxDrawdown ? spct(-k.maxDrawdown.pct) : '0.0%'}</b>, small: <span>{k.maxDrawdown ? <><span className="mny">{money(-k.maxDrawdown.amount)}</span> · {fmtDate(new Date(k.maxDrawdown.at).getTime())}</> : 'no drawdown'}</span> },
    {
      id: 'behaviour', label: 'Behaviour',
      value: behaviour ? <b className="d2-n">{behaviour.score}<small>/100</small></b> : <b className="d2-n d2-dim">–</b>,
      small: behaviour
        ? <><span className={behaviour.last30 < behaviour.score ? 'dn' : behaviour.last30 > behaviour.score ? 'up' : ''}>{behaviour.last30} last 30</span>{ai && <AiMark short />}</>
        : <span>needs {minTrades} trades</span>,
    },
  ];
  return (
    <section className="d2-card d2-kr" aria-label="Key numbers" data-testid="kpi-ribbon">
      {cells.map(c => <div key={c.id} data-testid={`kpi-${c.id}`}><span className="d2-cap">{c.label}</span>{c.value}<small>{c.small}</small></div>)}
    </section>
  );
}

export function LeaksList({ rows, trades }: { rows: LeakDTO[]; trades: number }) {
  if (!rows.length) return trades < 10
    ? <Empty title="Needs 10 trades" note={`${trades} so far. Leaks are groups of 3+ trades.`} />
    : <Empty title="No leaks found" note="Every group we check is net positive." />;
  const mx = Math.max(...rows.map(r => -r.net));
  return (
    <div className="d2-leaks" role="list">
      {rows.map((r, i) => (
        <div key={r.key} role="listitem" className="d2-leak">
          <div className="d2-leak-l"><b>{r.label}</b><small>{r.sub}</small></div>
          <div className="d2-leak-b"><i style={{ width: `${Math.max(3, (100 * -r.net) / mx)}%`, opacity: 1 - i * 0.13 }} /></div>
          <b className="d2-n dn mny">{kmoney(r.net)}</b>
        </div>
      ))}
    </div>
  );
}

export function Heatmap({ hm, metric, ai }: { hm: DashHeatmap; metric: '$' | 'win'; ai: boolean }) {
  const S = ['ASIA', 'LONDON', 'NY'] as const;
  const mxNet = Math.max(1, ...hm.cells.map(c => Math.abs(c.net)));
  const cell = (s: string, d: number) => hm.cells.find(c => c.session === s && c.day === d)!;
  const cols = hm.days.length;
  // Cells drop $ and the + sign (colour already says it) so they fit narrow grids;
  // 7-day grids drop the minus too (the cell is red, its tooltip and the totals keep the sign).
  const cellMoney = (v: number) => kmoney(v).replace('$', '').replace('+', '');
  const cellNet = (v: number) => (cols > 5 ? cellMoney(v).replace('−', '').replace('-', '') : cellMoney(v));
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
            const strong = c.n > 0 && a > 0.7;
            const solid = c.n > 0 && a > 0.88; // white text in light theme only on the deepest cells
            const bg = c.n ? `rgba(${pos ? '8,196,101' : '254,58,49'},${(0.08 + a * 0.62).toFixed(2)})` : 'var(--d2-card2)';
            return (
              <div key={`${s}${d}`} className={`d2-hc${isW ? ' worst' : isB ? ' best' : ''}${strong ? ' strong' : ''}${solid ? ' solid' : ''}`} style={{ background: bg }}
                title={c.n ? `${SESSION_SHORT[s]} ${DAY_SHORT[d]}: ${money(c.net)} · ${c.wins} of ${c.n} won` : 'No trades'}>
                <b className="d2-n">{c.n ? (metric === '$' ? cellNet(c.net) : pct(wr)) : '–'}</b>
                <small>{isW ? <em className="d2-flag" data-ai>Skip</em> : isB ? <em className="d2-flag g" data-ai>Best</em> : c.n ? `${c.n} tr` : ''}</small>
              </div>
            );
          }),
          <b key={`${s}t`} className={`d2-ht d2-n ${metric === '$' ? tone(st.net) : ''}`}>{st.n ? (metric === '$' ? kmoney(st.net) : pct(st.wins / st.n)) : '–'}</b>,
        ];
      })}
      <span className="d2-hl">Total</span>
      {hm.dayTotals.map(d => <b key={d.day} className={`d2-ht c d2-n ${metric === '$' ? tone(d.net) : ''}`}>{d.n ? (metric === '$' ? (cols > 5 ? cellMoney(d.net) : kmoney(d.net)) : pct(d.wins / d.n)) : '–'}</b>)}
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
                  <i style={{ background: r.net >= 0 ? 'var(--d2-g)' : 'var(--d2-r)' }} /><b>{r.symbol}</b>
                  {r.tag?.kind === 'pause' && <span className="d2-aitag dn" data-ai title="TRADElogs AI: net negative with a profit factor under 0.7">Pause</span>}
                  {r.tag?.kind === 'share' && <span className="d2-aitag up d2-hide-s" data-ai title="TRADElogs AI: share of net P&L">{pct(r.tag.pct ?? 0)} of profit</span>}
                </span>
              </td>
              <td className="d2-n">{r.trades}</td>
              <td className="d2-n">{pct(r.winRate)}</td>
              <td className="d2-n d2-hide-s">{r.profitFactor == null ? '–' : r.profitFactor.toFixed(2)}</td>
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
export function RecentTable({ rows }: { rows: DashRecentTrade[] }) {
  return (
    <div className="d2-tbl">
      <table className="d2-dt">
        <thead><tr><th>Time</th><th>Symbol</th><th>P&amp;L</th><th data-ai>Grade</th></tr></thead>
        <tbody>
          {rows.map(t => {
            const d = new Date(t.closeTime);
            return (
              <tr key={t.id}>
                <td><Link href={`/trades/${encodeURIComponent(t.id)}`} className="d2-rl">{DAY_SHORT[d.getUTCDay()]} {d.toISOString().slice(11, 16)}</Link></td>
                <td><b>{t.symbol}</b> <span className="d2-sd">{t.side === 'LONG' ? 'L' : 'S'}</span></td>
                <td><b className={`d2-n mny ${tone(t.net)}`}>{money(t.net)}</b></td>
                <td data-ai>{t.grade
                  ? <span className={`d2-gd ${GRADE_CLS[t.grade]}`} title={t.reasons.length ? t.reasons.join(' · ') : 'No process flags'}>{t.grade}</span>
                  : <span className="d2-dim" title="Grades need 20 trades">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
