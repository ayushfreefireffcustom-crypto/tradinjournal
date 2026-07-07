'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type Trade } from '@/lib/api';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DayAgg { netPnl: number; trades: number }

// Local-date key so cells match what the trader sees in their own timezone.
function dayKey(y: number, m: number, d: number): string { return `${y}-${m}-${d}`; }

function money(v: number): string {
  const sign = v < 0 ? '-' : '+';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${a.toFixed(a < 100 ? 0 : 0)}`;
}

export default function CalendarPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const initAccounts = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { initAccounts(); }, [initAccounts]);

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

  // Aggregate closed trades by local close-date.
  const byDay = useMemo(() => {
    const map = new Map<string, DayAgg>();
    for (const t of trades) {
      if (t.status !== 'CLOSED' || !t.closeTime) continue;
      const d = new Date(t.closeTime);
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      const agg = map.get(key) ?? { netPnl: 0, trades: 0 };
      agg.netPnl += t.netPnl;
      agg.trades += 1;
      map.set(key, agg);
    }
    return map;
  }, [trades]);

  // Build the calendar grid (leading blanks + this month's days, padded to full weeks).
  const weeks = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [view]);

  const monthStats = useMemo(() => {
    let net = 0, tradeCount = 0, tradingDays = 0, best = -Infinity, worst = Infinity;
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const agg = byDay.get(dayKey(view.year, view.month, d));
      if (!agg) continue;
      net += agg.netPnl;
      tradeCount += agg.trades;
      tradingDays += 1;
      best = Math.max(best, agg.netPnl);
      worst = Math.min(worst, agg.netPnl);
    }
    return {
      net, tradeCount, tradingDays,
      best: best === -Infinity ? 0 : best,
      worst: worst === Infinity ? 0 : worst,
    };
  }, [byDay, view]);

  const maxAbs = useMemo(() => {
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    let m = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const agg = byDay.get(dayKey(view.year, view.month, d));
      if (agg) m = Math.max(m, Math.abs(agg.netPnl));
    }
    return m;
  }, [byDay, view]);

  function shiftMonth(delta: number) {
    setView(v => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }
  function goToday() { setView({ year: now.getFullYear(), month: now.getMonth() }); }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    setSelected(a);
    setShowConnect(false);
  }

  const isToday = (d: number) => now.getFullYear() === view.year && now.getMonth() === view.month && now.getDate() === d;

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
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
            <button onClick={() => shiftMonth(-1)} data-testid="cal-prev" className="w-9 h-9 border border-border-soft text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center">←</button>
            <button onClick={goToday} data-testid="cal-today" className="px-3 h-9 border border-border-soft text-[10px] tracking-[0.22em] text-fg-2 hover:text-fg hover:border-border-strong">TODAY</button>
            <button onClick={() => shiftMonth(1)} data-testid="cal-next" className="w-9 h-9 border border-border-soft text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center">→</button>
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
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 py-1">{w}</div>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: 35 }).map((_, i) => <div key={i} className="aspect-square sm:aspect-[4/3] bg-surface animate-pulse" />)}
            </div>
          ) : (
            <div className="flex flex-col gap-1 sm:gap-2">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
                  {week.map((d, di) => {
                    if (d === null) return <div key={di} className="aspect-square sm:aspect-[4/3]" />;
                    const agg = byDay.get(dayKey(view.year, view.month, d));
                    const pos = agg ? agg.netPnl >= 0 : false;
                    const intensity = agg ? Math.min(1, Math.abs(agg.netPnl) / maxAbs) : 0;
                    const bg = agg
                      ? (pos ? `rgba(0, 197, 102, ${0.08 + intensity * 0.5})` : `rgba(255, 59, 48, ${0.08 + intensity * 0.5})`)
                      : undefined;
                    return (
                      <div
                        key={di}
                        data-testid={`cal-day-${d}`}
                        className={`aspect-square sm:aspect-[4/3] border p-1.5 sm:p-2 flex flex-col ${agg ? '' : 'bg-surface/40'} ${isToday(d) ? 'border-fg' : 'border-border-soft'}`}
                        style={bg ? { background: bg } : undefined}
                      >
                        <span className={`text-[10px] sm:text-[11px] numeric ${isToday(d) ? 'text-fg font-bold' : 'text-fg-3'}`}>{d}</span>
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
