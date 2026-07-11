'use client';

import { useMemo, useState } from 'react';
import type { Trade } from '@/lib/api';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { aggregateByCloseDate, buildMonthView, calMoney, cellBg, WEEKDAYS, MONTHS } from '@/lib/calendar';

// Compact month calendar with a right-hand Weekly-totals column, for embedding
// on the dashboard. Reuses the shared calendar aggregation.
export default function DashboardCalendar({ trades }: { trades: Trade[] }) {
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const byDay = useMemo(() => aggregateByCloseDate(trades), [trades]);
  const { weeks, weekTotals, monthStats, maxAbs } = useMemo(
    () => buildMonthView(view.year, view.month, byDay),
    [view, byDay],
  );

  function shiftMonth(delta: number) {
    setView(v => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }
  const isToday = (d: number | null) =>
    d !== null && now.getFullYear() === view.year && now.getMonth() === view.month && now.getDate() === d;

  return (
    <div className="tcard p-4 sm:p-5" data-testid="dashboard-calendar">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Calendar</div>
          <div className="font-display font-bold text-[16px] tracking-tight mt-0.5 numeric">{MONTHS[view.month]} {view.year}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] numeric mr-1 ${monthStats.net >= 0 ? 'text-profit' : 'text-loss'}`}>
            {monthStats.tradingDays ? calMoney(monthStats.net) : '—'}
          </span>
          <button onClick={() => shiftMonth(-1)} data-testid="dcal-prev" className="w-8 h-8 border border-border-soft rounded-md text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring"><CaretLeft size={13} weight="bold" /></button>
          <button onClick={() => setView({ year: now.getFullYear(), month: now.getMonth() })} data-testid="dcal-today" className="px-2.5 h-8 border border-border-soft rounded-md text-[10px] tracking-widest text-fg-2 hover:text-fg hover:border-border-strong press focus-ring">TODAY</button>
          <button onClick={() => shiftMonth(1)} data-testid="dcal-next" className="w-8 h-8 border border-border-soft rounded-md text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring"><CaretRight size={13} weight="bold" /></button>
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-7 md:grid-cols-8 gap-1 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-[9px] tracking-widest text-fg-3 py-1">{w}</div>
        ))}
        <div className="hidden md:block text-center text-[9px] tracking-widest text-fg-3 py-1">WEEKLY</div>
      </div>

      {/* Weeks */}
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 md:grid-cols-8 gap-1">
            {week.map((cell, di) => {
              if (cell.day === null) return <div key={di} className="aspect-square md:aspect-[4/3]" />;
              const agg = cell.agg;
              const pos = agg ? agg.netPnl >= 0 : false;
              return (
                <div
                  key={di}
                  data-testid={`dcal-day-${cell.day}`}
                  className={`aspect-square md:aspect-[4/3] rounded-md border p-1 flex flex-col overflow-hidden ${agg ? '' : 'bg-surface/40'} ${isToday(cell.day) ? 'border-fg' : 'border-border-soft'}`}
                  style={agg ? { background: cellBg(agg.netPnl, maxAbs) } : undefined}
                >
                  <span className={`text-[9px] md:text-[10px] numeric ${isToday(cell.day) ? 'text-fg font-bold' : 'text-fg-3'}`}>{cell.day}</span>
                  {agg && (
                    <div className="mt-auto text-right leading-tight">
                      <div className={`text-[9px] md:text-[11px] font-display font-bold tracking-tight numeric ${pos ? 'text-profit' : 'text-loss'}`}>{calMoney(agg.netPnl)}</div>
                      <div className="hidden md:block text-[8px] tracking-widest text-fg-3 numeric">{agg.trades}T</div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Weekly total */}
            <div className="hidden md:flex aspect-[4/3] rounded-md border border-border bg-surface-hover flex-col items-center justify-center">
              {weekTotals[wi]!.days > 0 ? (
                <>
                  <span className={`text-[11px] font-semibold numeric ${weekTotals[wi]!.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{calMoney(weekTotals[wi]!.netPnl)}</span>
                  <span className="text-[8px] tracking-widest text-fg-3 numeric">{weekTotals[wi]!.trades}T</span>
                </>
              ) : (
                <span className="text-[10px] text-fg-3">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
