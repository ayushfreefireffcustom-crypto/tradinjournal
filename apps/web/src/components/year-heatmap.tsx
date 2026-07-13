'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/api';
import { aggregateByCloseDate, buildYearView, calMoney, cellBg, dayKey } from '@/lib/calendar';
import DayTradesModal from './day-trades-modal';

const WD = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const RAIL = 30;   // weekday label rail width
const GAP = 3;
const MIN_CELL = 9;
const MAX_CELL = 26;

// GitHub-style trailing-year consistency grid: one cell per day, coloured by that
// day's net P&L. Cells scale to fill the card width (clamped), so the grid never
// leaves a big empty gap on wide screens or overflow on narrow ones.
export default function YearHeatmap({ trades, accountId }: { trades: Trade[]; accountId?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Closed trades on the selected calendar day (local close-date), for the modal.
  const dayTrades = useMemo(() => {
    if (!selectedDay) return [];
    const key = dayKey(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
    return trades.filter(t => {
      if (t.status !== 'CLOSED' || !t.closeTime) return false;
      const d = new Date(t.closeTime);
      return dayKey(d.getFullYear(), d.getMonth(), d.getDate()) === key;
    });
  }, [selectedDay, trades]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => { for (const e of entries) setCw(e.contentRect.width); });
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { weeks, monthLabels, maxAbs, totalNet, tradingDays } = useMemo(() => {
    const byDay = aggregateByCloseDate(trades);
    return buildYearView(byDay);
  }, [trades]);

  const cols = weeks.length;
  // Cell size that fills the available width, clamped to sane bounds.
  const avail = Math.max(0, cw - RAIL);
  const cell = cw === 0
    ? 13
    : Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((avail - (cols - 1) * GAP) / cols)));
  const step = cell + GAP;
  const gridW = cols * step - GAP;
  const gridH = 7 * step - GAP;

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  return (
    <div className="tcard p-4 sm:p-5" data-testid="year-heatmap">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Consistency</div>
          <div className="font-display font-bold text-[16px] tracking-tight mt-0.5">Trailing 12 months</div>
        </div>
        <div className="text-right">
          <div className={`font-display font-bold text-[15px] numeric ${totalNet >= 0 ? 'text-profit' : 'text-loss'}`}>{calMoney(totalNet)}</div>
          <div className="text-[9px] tracking-widest text-fg-3 uppercase numeric">{tradingDays} trading days</div>
        </div>
      </div>

      <div ref={wrapRef} className="relative overflow-x-auto no-scrollbar">
        <div className="mx-auto" style={{ width: RAIL + gridW }}>
          {/* Month labels (aligned to the grid, offset past the rail) */}
          <div className="relative h-4" style={{ marginLeft: RAIL, width: gridW }}>
            {monthLabels.map(m => (
              <span key={`${m.col}-${m.label}`} className="absolute text-[9px] tracking-widest text-fg-3 uppercase" style={{ left: m.col * step }}>{m.label}</span>
            ))}
          </div>

          <div className="flex" style={{ gap: GAP + 3 }}>
            {/* Weekday rail */}
            <div className="flex flex-col justify-between shrink-0" style={{ height: gridH, width: RAIL - GAP - 3 }}>
              {WD.map((d, i) => (
                <span key={i} className="text-[8px] tracking-widest text-fg-3 uppercase leading-none flex items-center" style={{ height: cell }}>{d}</span>
              ))}
            </div>

            {/* Week columns */}
            <svg width={gridW} height={gridH} className="shrink-0" onPointerLeave={() => setHover(null)}>
              {weeks.map((week, wi) =>
                week.map((c, di) => {
                  if (!c) return null;
                  const x = wi * step, y = di * step;
                  const agg = c.agg;
                  const fill = agg ? cellBg(agg.netPnl, maxAbs) : 'var(--color-surface)';
                  const text = agg
                    ? `${c.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · ${calMoney(agg.netPnl)} · ${agg.trades}T`
                    : `${c.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · no trades`;
                  return (
                    <rect
                      key={`${wi}-${di}`}
                      x={x} y={y} width={cell} height={cell} rx={Math.min(3, cell / 4)}
                      fill={fill}
                      stroke={isToday(c.date) ? 'var(--color-fg)' : agg ? 'transparent' : 'var(--color-border-soft)'}
                      strokeWidth={isToday(c.date) ? 1.5 : 1}
                      className={`transition-[filter] duration-150 ${agg ? 'cursor-pointer hover:brightness-150' : ''}`}
                      onPointerEnter={() => setHover({ x: RAIL + x + cell, y, text })}
                      onClick={agg ? () => setSelectedDay(c.date) : undefined}
                      data-testid={agg ? `heat-${c.key}` : undefined}
                    />
                  );
                }),
              )}
            </svg>
          </div>
        </div>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border-soft bg-surface/95 backdrop-blur px-2 py-1 text-[10px] numeric tracking-wide shadow-[var(--shadow-card)] whitespace-nowrap"
            style={{ left: Math.min(hover.x + 8, Math.max(0, cw - 150)), top: hover.y + 22 }}
            data-testid="heat-tooltip"
          >
            {hover.text}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[9px] tracking-widest text-fg-3 uppercase">
        <span>Loss</span>
        <span className="w-3 h-3 rounded-[2px]" style={{ background: cellBg(-maxAbs, maxAbs) }} />
        <span className="w-3 h-3 rounded-[2px]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }} />
        <span className="w-3 h-3 rounded-[2px]" style={{ background: cellBg(maxAbs, maxAbs) }} />
        <span>Profit</span>
      </div>

      {selectedDay && (
        <DayTradesModal date={selectedDay} trades={dayTrades} accountId={accountId} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}
