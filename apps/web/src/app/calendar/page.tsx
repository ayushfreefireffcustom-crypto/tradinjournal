'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type Trade } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { aggregateByCloseDate, buildMonthView, calMoney as money, cellBg, WEEKDAYS, MONTHS } from '@/lib/calendar';

export default function CalendarPage() {
  const { accounts, selected, select, setAccounts } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

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
  useEffect(() => { if (selected) loadTrades(selected); }, [selected, loadTrades]);

  // Aggregate closed trades by local close-date, then build the month grid
  // (with per-week totals) via the shared calendar helpers.
  const byDay = useMemo(() => aggregateByCloseDate(trades), [trades]);
  const { weeks, weekTotals, monthStats, maxAbs } = useMemo(
    () => buildMonthView(view.year, view.month, byDay),
    [byDay, view],
  );

  function shiftMonth(delta: number) {
    setView(v => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }
  function goToday() { setView({ year: now.getFullYear(), month: now.getMonth() }); }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a);
    setShowConnect(false);
  }

  const isToday = (d: number) => now.getFullYear() === view.year && now.getMonth() === view.month && now.getDate() === d;

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Calendar"
      pageSubtitle="// DAILY P&L"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="calendar-page">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">[ CALENDAR // DAILY P&L ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2 numeric">
              {MONTHS[view.month]!.toUpperCase()} {view.year}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shiftMonth(-1)} data-testid="cal-prev" className="w-9 h-9 rounded-md border border-border-soft text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring"><CaretLeft size={14} weight="bold" /></button>
            <button onClick={goToday} data-testid="cal-today" className="px-3 h-9 rounded-md border border-border-soft text-[10px] tracking-[0.22em] text-fg-2 hover:text-fg hover:border-border-strong press focus-ring">TODAY</button>
            <button onClick={() => shiftMonth(1)} data-testid="cal-next" className="w-9 h-9 rounded-md border border-border-soft text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring"><CaretRight size={14} weight="bold" /></button>
          </div>
        </div>

        {error && (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 text-[12px]" data-testid="calendar-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadTrades(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        {/* Month summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-testid="calendar-summary">
          {[
            { l: 'Month net P&L', v: monthStats.tradingDays ? money(monthStats.net) : '—', c: monthStats.net >= 0 ? 'text-profit' : 'text-loss' },
            { l: 'Trading days', v: String(monthStats.tradingDays), c: 'text-fg' },
            { l: 'Best day', v: monthStats.tradingDays ? money(monthStats.best) : '—', c: 'text-profit' },
            { l: 'Worst day', v: monthStats.tradingDays ? money(monthStats.worst) : '—', c: 'text-loss' },
          ].map(k => (
            <div key={k.l} className="tcard p-4">
              <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{k.l}</div>
              <div className={`font-display font-black text-2xl tracking-tighter mt-2 numeric ${k.c}`}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="tcard p-3 sm:p-4">
          <div className="grid grid-cols-7 md:grid-cols-8 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 py-1">{w}</div>
            ))}
            <div className="hidden md:block text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 py-1">WEEKLY</div>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 md:grid-cols-8 gap-1 sm:gap-2">
              {Array.from({ length: 40 }).map((_, i) => <div key={i} className="aspect-square sm:aspect-[4/3] shimmer" />)}
            </div>
          ) : (
            <div className="flex flex-col gap-1 sm:gap-2">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 md:grid-cols-8 gap-1 sm:gap-2">
                  {week.map((cell, di) => {
                    if (cell.day === null) return <div key={di} className="aspect-square sm:aspect-[4/3]" />;
                    const agg = cell.agg;
                    const pos = agg ? agg.netPnl >= 0 : false;
                    return (
                      <div
                        key={di}
                        data-testid={`cal-day-${cell.day}`}
                        className={`aspect-square sm:aspect-[4/3] rounded-md border p-1.5 sm:p-2 flex flex-col overflow-hidden transition-[filter] duration-[var(--dur-hover)] hover:brightness-125 ${agg ? '' : 'bg-surface/40'} ${isToday(cell.day) ? 'border-fg' : 'border-border-soft'}`}
                        style={agg ? { background: cellBg(agg.netPnl, maxAbs) } : undefined}
                      >
                        <span className={`text-[10px] sm:text-[11px] numeric ${isToday(cell.day) ? 'text-fg font-bold' : 'text-fg-3'}`}>{cell.day}</span>
                        {agg && (
                          <div className="mt-auto text-right">
                            <div className={`text-[10px] sm:text-[13px] font-display font-bold tracking-tight numeric ${pos ? 'text-profit' : 'text-loss'}`}>
                              {money(agg.netPnl)}
                            </div>
                            <div className="text-[8px] sm:text-[9px] tracking-widest text-fg-3 numeric">{agg.trades} {agg.trades === 1 ? 'TRADE' : 'TRADES'}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Weekly total */}
                  <div className="hidden md:flex aspect-[4/3] rounded-md border border-border bg-surface-hover flex-col items-center justify-center">
                    {weekTotals[wi]!.days > 0 ? (
                      <>
                        <span className={`text-[11px] sm:text-[13px] font-semibold numeric ${weekTotals[wi]!.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{money(weekTotals[wi]!.netPnl)}</span>
                        <span className="text-[8px] sm:text-[9px] tracking-widest text-fg-3 numeric">{weekTotals[wi]!.trades}T</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-fg-3">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && monthStats.tradingDays === 0 && (
          <div className="text-center text-fg-3 text-[12px] mt-4" data-testid="calendar-empty">
            No closed trades in {MONTHS[view.month]} {view.year}.
          </div>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
