'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import DayDialog from '@/components/v6/calendar/day-dialog';
import { mondayMonth, notedDays } from '@/components/v6/calendar/month';
import { VBars } from '@/components/v6/analytics/cards';
import { SideChip } from '@/components/v6/desk';
import { api, type BrokerAccount, type JournalEntry, type Trade } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { aggregateByCloseDate, buildMonthView, dayKey, MONTHS } from '@/lib/calendar';
import { fmtUsd, fmtUsdCompact } from '@/lib/dashboard-v6';
import { tickerMark } from '@/lib/desk';
import '@/styles/v6/calendar.css';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const compact = (v: number) => { const a = Math.abs(v); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${a >= 999.5 ? `${(a / 1000).toFixed(a >= 9950 ? 0 : 1)}k` : a < 1 ? a.toFixed(1) : Math.round(a)}`; };
const sc = (v: number) => (v > 0 ? `+${fmtUsdCompact(v)}` : fmtUsdCompact(v));
// Whole dollars in the grid, but cents under $1 so a −$0.40 day doesn't read as $0.
const cell = (v: number) => fmtUsd(v, Math.abs(v) < 1 ? 2 : 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sameDay = (iso: string, d: Date) => { const c = new Date(iso); return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() && c.getDate() === d.getDate(); };

function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h5" />
    </svg>
  );
}
function Chev({ dir }: { dir: 'l' | 'r' }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={dir === 'l' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} /></svg>;
}

export default function CalendarPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
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
    // Journal notes only add the note marker; the calendar still works without them.
    api.journal.list(acc.id).then(j => setJournal(Array.isArray(j) ? j : []), () => setJournal([]));
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

  const byDay = useMemo(() => aggregateByCloseDate(trades), [trades]);
  const { monthStats, maxAbs } = useMemo(() => buildMonthView(view.year, view.month, byDay), [byDay, view]);
  const weeks = useMemo(() => mondayMonth(view.year, view.month, byDay), [byDay, view]);
  const noted = useMemo(() => notedDays(journal, trades), [journal, trades]);

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

  // Net P&L per weekday for the month on screen (local close day).
  const weekday = useMemo(() => {
    const rows = DOW.map(d => ({ key: d, label: d, net: 0, n: 0 }));
    for (const w of weeks) w.cells.forEach((c, i) => { if (c.agg) { rows[i]!.net += c.agg.netPnl; rows[i]!.n += c.agg.trades; } });
    return rows.filter((r, i) => i < 5 || r.n > 0);
  }, [weeks]);
  const weekendTrades = weekday.length > 5;

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

  const tradesOn = useCallback((d: Date) => trades.filter(t => t.status === 'CLOSED' && t.closeTime && sameDay(t.closeTime, d)), [trades]);
  const dayTrades = useMemo(() => (openDay ? tradesOn(openDay) : []), [openDay, tradesOn]);
  const [today] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); });
  const todayTrades = useMemo(() => tradesOn(today).sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!)), [tradesOn, today]);
  const todayNet = todayTrades.reduce((s, t) => s + t.netPnl, 0);
  const todayNoted = noted.has(dayKey(today.getFullYear(), today.getMonth(), today.getDate()));

  const has = monthStats.tradingDays > 0;
  const tint = (v: number) => `${Math.round(9 + Math.min(1, Math.abs(v) / maxAbs) * 38)}%`;
  const monthLabel = `${MONTHS[view.month]} ${view.year}`;
  const subtitle = selected
    ? <>{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · daily P&amp;L by close date</>
    : 'Daily P&L by close date';

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Calendar" pageSubtitle={subtitle}>
      <div className="x-page cl-page" data-testid="calendar-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="calendar-error">
            <span>{error}</span><button className="x-btn x-btn--sm" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        <section className="x-strip x-strip--card cl-sum" data-testid="calendar-summary" aria-label="Month summary">
          <div><span>Month net P&amp;L</span><b className={`m ${has ? tone(monthStats.net) : ''}`}>{has ? fmtUsd(monthStats.net) : '—'}</b><small>{error && !has ? '—' : plural(monthStats.tradeCount, 'trade')}</small></div>
          <div><span>Trading days</span><b className="m">{error && !has ? '—' : monthStats.tradingDays}</b><small>{has ? `${facts.green} green · ${facts.red} red` : error ? 'Couldn’t load trades' : 'No trades this month'}</small></div>
          <div><span>Best day</span><b className={`m ${has && monthStats.best > 0 ? 'pos' : ''}`}>{has && monthStats.best > 0 ? fmtUsd(monthStats.best) : '—'}</b><small>{has && monthStats.best > 0 ? facts.best : '—'}</small></div>
          <div><span>Worst day</span><b className={`m ${has && monthStats.worst < 0 ? 'neg' : ''}`}>{has && monthStats.worst < 0 ? fmtUsd(monthStats.worst) : '—'}</b><small>{has && monthStats.worst < 0 ? facts.worst : has ? 'No red days' : '—'}</small></div>
        </section>

        <div className="cl-row">
          <section className="x-card cl-cal" aria-label={`${monthLabel} calendar`}>
            <div className="x-ch cl-head">
              <h2 className="cl-month" key={monthLabel} data-dir={dir}>{MONTHS[view.month]} <span>{view.year}</span></h2>
              <div className="x-r cl-nav" role="group" aria-label="Change month">
                <button className="x-btn x-btn--icon x-btn--sm" onClick={() => shiftMonth(-1)} aria-label="Previous month" data-testid="cal-prev"><Chev dir="l" /></button>
                <button className="x-btn x-btn--sm" onClick={goToday} aria-pressed={onThisMonth} data-testid="cal-today">Today</button>
                <button className="x-btn x-btn--icon x-btn--sm" onClick={() => shiftMonth(1)} aria-label="Next month" data-testid="cal-next"><Chev dir="r" /></button>
              </div>
            </div>

            <div className="cl-body" style={{ ['--we' as string]: weekendTrades ? '1fr' : '.55fr' }}>
              <div className="cl-grid cl-dow" aria-hidden>{DOW.map(d => <span key={d}>{d}</span>)}<span className="wk">Week</span></div>
              {loading && !trades.length ? (
                <div className="cl-weeks">{[0, 1, 2, 3, 4].map(i => <div key={i} className="cl-grid">{Array.from({ length: 8 }).map((_, j) => <div key={j} className="x-skel x-skel--in cl-sk" />)}</div>)}</div>
              ) : (
                <div className="cl-weeks" key={monthLabel} data-dir={dir}>
                  {weeks.map(w => {
                    const wMax = Math.max(1, ...w.cells.map(c => Math.abs(c.agg?.netPnl ?? 0)));
                    return (
                      <div key={w.index} className="cl-grid">
                        {w.cells.map((c, di) => {
                          const day = c.date.getDate();
                          const we = di >= 5 ? 'we' : '';
                          if (!c.inMonth) return <div key={c.key} className={`cl-day out ${we}`} aria-hidden><span className="cl-dn">{day}</span></div>;
                          const a = c.agg, isNote = noted.has(c.key);
                          const isToday = c.date.getTime() === today.getTime();
                          const cls = `cl-day ${a ? (a.netPnl >= 0 ? 'g' : 'l') : 'z'} ${we} ${isToday ? 'today' : ''}`;
                          const body = (
                            <>
                              <span className="cl-dn">{day}</span>
                              {isNote && <span className="cl-note" title="Journal note written"><NoteIcon /></span>}
                              {a && <><b className="m cl-amt"><span className="f">{cell(a.netPnl)}</span><span className="c">{sc(a.netPnl)}</span><span className="t">{compact(a.netPnl)}</span></b><small>{plural(a.trades, 'trade')}</small></>}
                            </>
                          );
                          return a ? (
                            <button key={c.key} className={cls} style={{ ['--p' as string]: tint(a.netPnl) }} data-testid={`cal-day-${day}`} onClick={() => setOpenDay(new Date(view.year, view.month, day))}
                              aria-label={`${MONTHS[view.month]} ${day}: ${fmtUsd(a.netPnl)}, ${plural(a.trades, 'trade')}${isNote ? ', journal note written' : ''}`}>{body}</button>
                          ) : <div key={c.key} className={cls} data-testid={`cal-day-${day}`}>{body}</div>;
                        })}
                        <div className="cl-day cl-wk">
                          <span>Week {w.index}</span>
                          {w.days > 0 ? <><b className={`m cl-amt ${tone(w.net)}`}><span className="f">{cell(w.net)}</span><span className="c">{sc(w.net)}</span><span className="t">{compact(w.net)}</span></b><small>{plural(w.trades, 'trade')}</small></> : <><b className="x-dim">—</b><small>No trades</small></>}
                          <span className="cl-mini" aria-hidden>
                            {w.cells.map(c => {
                              const v = c.agg?.netPnl ?? 0;
                              return <i key={c.key} className={c.agg ? (v >= 0 ? 'g' : 'l') : ''} style={c.agg ? { height: `${Math.max(14, (Math.abs(v) / wMax) * 100)}%` } : undefined} />;
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="cl-foot">
              <span className="cl-lg" aria-hidden>Loss<i className="l" /><i className="l2" /><i className="z" /><i className="g2" /><i className="g" />Profit</span>
              <span className="cl-lg"><NoteIcon size={13} />Journal note written</span>
            </div>
            {!loading && !has && (
              <p className="cl-empty" data-testid="calendar-empty">No closed trades in {monthLabel}. Use the arrows or your arrow keys to browse other months.</p>
            )}

            {has && (
              <ul className="cl-wlist" aria-label="Weekly totals">
                {weeks.filter(w => w.days > 0).map(w => {
                  const ins = w.cells.filter(c => c.inMonth);
                  const range = `${ins[0]!.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${ins[ins.length - 1]!.date.getDate()}`;
                  return (
                    <li key={w.index}>
                      <span><b>Week {w.index}</b><small>{range}</small></span>
                      <span><b className={`m ${tone(w.net)}`}>{cell(w.net)}</b><small>{plural(w.trades, 'trade')} · {plural(w.days, 'day')}</small></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="cl-side">
            <section className="x-card cl-today" data-testid="calendar-today">
              <div className="x-ch"><h2>Today</h2><div className="x-r">{today.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</div></div>
              {todayTrades.length ? (
                <>
                  <div className="cl-today-net">
                    <b className={`m ${tone(todayNet)}`}>{fmtUsd(todayNet)}</b>
                    <span>{plural(todayTrades.length, 'trade')} · {todayTrades.filter(t => t.netPnl > 0).length} won</span>
                  </div>
                  <div className="cl-today-list">
                    {todayTrades.slice(0, 3).map(t => (
                      <button key={t.positionId} className="cl-today-row" onClick={() => setOpenDay(today)}>
                        <span className="x-mk">{tickerMark(t.symbol)}</span>
                        <span className="cl-today-sym"><b>{t.symbol}</b><SideChip dir={t.direction} /></span>
                        <b className={`m ${tone(t.netPnl)}`}>{fmtUsd(t.netPnl)}</b>
                      </button>
                    ))}
                    {todayTrades.length > 3 && <button className="x-link cl-today-more" onClick={() => setOpenDay(today)}>See all {todayTrades.length} trades</button>}
                  </div>
                </>
              ) : <p className="cl-today-none">No closed trades yet today.</p>}
              {todayNoted
                ? <Link href="/notebook" className="x-btn x-btn--full">Today&rsquo;s note is written · open journal</Link>
                : <Link href="/notebook" className="x-btn x-btn--hi x-btn--full">Journal today</Link>}
            </section>

            <section className="x-card cl-wd" data-testid="calendar-weekday">
              <div className="x-ch"><h2>By weekday</h2><span className="x-sub">{monthLabel}</span></div>
              {has ? <VBars values bars={weekday} tipLabel={b => `${b.label} in ${MONTHS[view.month]}`} height={200} />
                : <div className="cl-wd-empty">No closed trades this month.</div>}
            </section>
          </aside>
        </div>
      </div>

      {openDay && <DayDialog date={openDay} trades={dayTrades} accountId={selected?.id} onClose={() => setOpenDay(null)} />}
      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
