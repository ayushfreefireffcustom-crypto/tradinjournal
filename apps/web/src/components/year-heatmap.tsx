'use client';

import { useMemo, useState } from 'react';
import type { Trade } from '@/lib/api';
import { aggregateByCloseDate, buildYearView, calMoney, cellBg } from '@/lib/calendar';

const WD = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

// GitHub-style trailing-year consistency grid: one cell per day, coloured by that
// day's net P&L. Hover a cell for its date / net / trade count.
export default function YearHeatmap({ trades }: { trades: Trade[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  const { weeks, monthLabels, maxAbs, totalNet, tradingDays } = useMemo(() => {
    const byDay = aggregateByCloseDate(trades);
    return buildYearView(byDay);
  }, [trades]);

  const CELL = 13, GAP = 3, STEP = CELL + GAP;
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

      <div className="relative overflow-x-auto no-scrollbar">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="relative ml-8 h-4" style={{ width: weeks.length * STEP }}>
            {monthLabels.map(m => (
              <span key={`${m.col}-${m.label}`} className="absolute text-[9px] tracking-widest text-fg-3 uppercase" style={{ left: m.col * STEP }}>{m.label}</span>
            ))}
          </div>

          <div className="flex gap-2">
            {/* Weekday rail */}
            <div className="flex flex-col justify-between shrink-0 py-[1px]" style={{ height: 7 * STEP - GAP }}>
              {WD.map((d, i) => (
                <span key={i} className="text-[8px] tracking-widest text-fg-3 uppercase leading-none h-[13px] flex items-center">{d}</span>
              ))}
            </div>

            {/* Week columns */}
            <svg
              width={weeks.length * STEP}
              height={7 * STEP - GAP}
              className="shrink-0"
              onPointerLeave={() => setHover(null)}
            >
              {weeks.map((week, wi) =>
                week.map((cell, di) => {
                  if (!cell) return null;
                  const x = wi * STEP, y = di * STEP;
                  const agg = cell.agg;
                  const fill = agg ? cellBg(agg.netPnl, maxAbs) : 'var(--color-surface)';
                  const text = agg
                    ? `${cell.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · ${calMoney(agg.netPnl)} · ${agg.trades}T`
                    : `${cell.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · no trades`;
                  return (
                    <rect
                      key={`${wi}-${di}`}
                      x={x} y={y} width={CELL} height={CELL} rx={2.5}
                      fill={fill}
                      stroke={isToday(cell.date) ? 'var(--color-fg)' : agg ? 'transparent' : 'var(--color-border-soft)'}
                      strokeWidth={isToday(cell.date) ? 1.5 : 1}
                      className="cursor-pointer transition-[filter] duration-150 hover:brightness-150"
                      onPointerEnter={() => setHover({ x: x + CELL, y, text })}
                      data-testid={agg ? `heat-${cell.key}` : undefined}
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
            style={{ left: Math.min(hover.x + 44, 640), top: hover.y + 20 }}
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
    </div>
  );
}
