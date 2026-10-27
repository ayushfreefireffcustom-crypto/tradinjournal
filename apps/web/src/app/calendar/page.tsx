'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DayTradesModal from '@/components/day-trades-modal';
import { api, type BrokerAccount, type Trade } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { aggregateByCloseDate, buildMonthView, dayKey, MONTHS } from '@/lib/calendar';
import { money, moneyShort, compact, tone } from '@/components/v3/format';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      setTrades(await api.trades.list(acc.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (selected) loadTrades(selected);
    else if (!accountsLoading) setLoading(false); // zero brokers: don’t load forever
  }, [selected, accountsLoading, loadTrades]);

  // Aggregate closed trades by local close-date, then build the month grid
  // (with per-week totals) via the shared calendar helpers.
  const byDay = useMemo(() => aggregateByCloseDate(trades), [trades]);
  const { weeks, weekTotals, monthStats, maxAbs } = useMemo(() => buildMonthView(view.year, view.month, byDay), [byDay, view]);

  const facts = useMemo(() => {
    let green = 0, red = 0, bestD = 0, worstD = 0;
    const dim = new Date(view.year, view.month + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const a = byDay.get(dayKey(view.year, view.month, d));
      if (!a) continue;
      if (a.netPnl >= 0) green++; else red++;
      if (a.netPnl === monthStats.best && !bestD) bestD = d;
      if (a.netPnl === monthStats.worst && !worstD) worstD = d;
    }
    const lbl = (d: number) => new Date(view.year, view.month, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { green, red, best: bestD ? lbl(bestD) : '', worst: worstD ? lbl(worstD) : '' };
  }, [byDay, view, monthStats]);

  const shiftMonth = useCallback((delta: 1 | -1) => {
    setDir(delta);
    setView(v => { const m = v.month + delta; return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }; });
  }, []);
  const goToday = () => { const n = new Date(); setDir(n.getFullYear() * 12 + n.getMonth() >= view.year * 12 + view.month ? 1 : -1); setView({ year: n.getFullYear(), month: n.getMonth() }); };
  const onThisMonth = view.year === now.getFullYear() && view.month === now.getMonth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openDay || (e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') shiftMonth(-1);
      if (e.key === 'ArrowRight') shiftMonth(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shiftMonth, openDay]);

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a);
    setShowConnect(false);
  }

  const dayTrades = useMemo(() => {
    if (!openDay) return [];
    const k = dayKey(openDay.getFullYear(), openDay.getMonth(), openDay.getDate());
    return trades.filter(t => t.status === 'CLOSED' && t.closeTime && (() => { const d = new Date(t.closeTime!); return dayKey(d.getFullYear(), d.getMonth(), d.getDate()) === k; })());
  }, [openDay, trades]);

  // Day numbers for the leading/trailing cells from neighbouring months.
  const firstDow = new Date(view.year, view.month, 1).getDay();
  const prevLen = new Date(view.year, view.month, 0).getDate();
  const isToday = (d: number) => onThisMonth && now.getDate() === d;
  const intensity = (v: number) => Math.min(1, Math.abs(v) / maxAbs);
  const has = monthStats.tradingDays > 0;

  const nav = (
    <div className="v3-seg c-nav" role="group" aria-label="Change month">
      <button onClick={() => shiftMonth(-1)} aria-label="Previous month" data-testid="cal-prev">‹</button>
      <button onClick={goToday} aria-pressed={onThisMonth} data-testid="cal-today">Today</button>
      <button onClick={() => shiftMonth(1)} aria-label="Next month" data-testid="cal-next">›</button>
    </div>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Calendar">
      <div className="v3-page" data-testid="calendar-page">
        <header className="t-head">
          <div>
            <p className="v3-sub" style={{ marginTop: 0 }}>Daily P&amp;L</p>
            <h1 className="v3-h1 c-h1" key={`${view.year}-${view.month}`} data-dir={dir}><b>{MONTHS[view.month]}</b> <em className="num">{view.year}</em></h1>
          </div>
          {nav}
        </header>

        {error && (
          <div className="d-err" role="alert" data-testid="calendar-error" style={{ marginBottom: 18 }}>
            <span>{error}</span><button className="v3-btn v3-btn--o" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        <section className="v3-card a-kpis c-kpis" data-testid="calendar-summary" aria-label="Month summary">
          <div><span>Month net P&amp;L</span><b className={`num ${has ? tone(monthStats.net) : ''}`}>{has ? money(monthStats.net) : '—'}</b><small>{error && !has ? '—' : `${monthStats.tradeCount} trade${monthStats.tradeCount === 1 ? '' : 's'}`}</small></div>
          <div><span>Trading days</span><b className="num">{error && !has ? '—' : monthStats.tradingDays}</b><small>{has ? `${facts.green} green · ${facts.red} red` : error ? 'Couldn’t load trades' : 'No trades this month'}</small></div>
          <div><span>Best day</span><b className={`num ${has && monthStats.best > 0 ? 'lg' : ''}`}>{has && monthStats.best > 0 ? money(monthStats.best) : '—'}</b><small>{has && monthStats.best > 0 ? facts.best : '—'}</small></div>
          <div><span>Worst day</span><b className={`num ${has && monthStats.worst < 0 ? 'sh' : ''}`}>{has && monthStats.worst < 0 ? money(monthStats.worst) : '—'}</b><small>{has && monthStats.worst < 0 ? facts.worst : has ? 'No red days' : '—'}</small></div>
        </section>

        <section className="v3-card c-card">
          <div className="c-grid c-dow">{DOW.map(d => <span key={d}>{d}</span>)}<span className="wk">Weekly</span></div>
          {loading && !trades.length ? (
            <div className="c-grid">{Array.from({ length: 40 }).map((_, i) => <div key={i} className="skel d-sk c-sk" />)}</div>
          ) : (
            <div className="c-weeks" key={`${view.year}-${view.month}`} data-dir={dir}>
              {weeks.map((week, wi) => {
                const wt = weekTotals[wi]!;
                return (
                  <div key={wi} className="c-grid">
                    {week.map((cell, di) => {
                      if (cell.day === null) {
                        const n = wi === 0 ? prevLen - firstDow + 1 + di : di - (week.findIndex(c => c.day === null)) + 1;
                        return <div key={di} className="c-day x" aria-hidden><span>{n}</span></div>;
                      }
                      const a = cell.agg;
                      const day = cell.day;
                      const cls = `c-day ${a ? (a.netPnl >= 0 ? 'w' : 'l') : ''} ${isToday(day) ? 't' : ''}`;
                      const style = a ? { ['--k' as string]: intensity(a.netPnl).toFixed(2) } : undefined;
                      const body = <><span className="num">{day}</span>{a && <><b className="num"><span className="f">{moneyShort(a.netPnl)}</span><span className="c">{compact(a.netPnl)}</span></b><small>{a.trades} trade{a.trades === 1 ? '' : 's'}</small></>}</>;
                      return a ? (
                        <button key={di} className={cls} style={style} data-testid={`cal-day-${day}`} onClick={() => setOpenDay(new Date(view.year, view.month, day))}
                          aria-label={`${MONTHS[view.month]} ${day}: ${money(a.netPnl)}, ${a.trades} trade${a.trades === 1 ? '' : 's'}`}>{body}</button>
                      ) : <div key={di} className={cls} data-testid={`cal-day-${day}`}>{body}</div>;
                    })}
                    <div className="c-day wk">
                      <span>Week</span>
                      {wt.days > 0 ? <><b className={`num ${tone(wt.netPnl)}`}>{moneyShort(wt.netPnl)}</b><small className="num">{wt.trades} trade{wt.trades === 1 ? '' : 's'}</small></> : <><b className="mute">—</b><small>0 trades</small></>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && !has && (
            <p className="c-empty" data-testid="calendar-empty">No closed trades in {MONTHS[view.month]} {view.year}. Use ‹ › or your arrow keys to browse other months.</p>
          )}
        </section>
      </div>

      {openDay && <DayTradesModal date={openDay} trades={dayTrades} accountId={selected?.id} onClose={() => setOpenDay(null)} />}
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
