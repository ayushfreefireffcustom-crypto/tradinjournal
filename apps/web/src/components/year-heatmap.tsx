'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Trade } from '@/lib/api';
import { aggregateByCloseDate, buildYearView, calMoney, cellBg, dayKey } from '@/lib/calendar';
import DayTradesModal from './day-trades-modal';

const WD = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const RAIL = 30;   // weekday label rail width
const MIN_CELL = 6;
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

  // Day-level consistency numbers from the same trailing-year cells.
  const stats = useMemo(() => {
    let green = 0, best = -Infinity, worst = Infinity, run = 0, longest = 0;
    for (const week of weeks) for (const c of week) {
      if (!c?.agg) continue;
      const n = c.agg.netPnl;
      if (n > 0) { green++; run++; longest = Math.max(longest, run); } else run = 0;
      best = Math.max(best, n); worst = Math.min(worst, n);
    }
    return { green, best, worst, longest };
  }, [weeks]);

  const cols = weeks.length;
  // Cell size that fills the available width, clamped to sane bounds.
  const avail = Math.max(0, cw - RAIL);
  // Tighter gaps on narrow cards so a full year still fits before we ever scroll.
  const fit = (g: number) => Math.floor((avail - (cols - 1) * g) / cols);
  const GAP = cw === 0 || fit(3) >= 9 ? 3 : 2;
  const cell = cw === 0 ? 13 : Math.max(MIN_CELL, Math.min(MAX_CELL, fit(GAP)));
  const step = cell + GAP;
  const gridW = cols * step - GAP;
  const gridH = 7 * step - GAP;

  // If the year still doesn't fit (phones), start scrolled to the latest weeks.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [cell, cols]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  return (
    <section className="v3-card a-card a-year" data-testid="year-heatmap">
      <div className="v3-ch">
        <h3>Consistency <span className="d-opt">· trailing 12 months</span></h3>
        <span className="a-readout num"><b className={totalNet >= 0 ? 'lg' : 'sh'}>{calMoney(totalNet).replace('-', '−')}</b> · {tradingDays} trading days</span>
      </div>

      <div ref={wrapRef} className={`relative overflow-x-auto no-scrollbar a-year-bd ${cw > 0 && RAIL + gridW > cw ? 'is-ovf' : ''}`}>
        <div className="mx-auto" style={{ width: RAIL + gridW }}>
          {/* Month labels (aligned to the grid, offset past the rail) */}
          <div className="relative h-4" style={{ marginLeft: RAIL, width: gridW }}>
            {monthLabels.filter((m, i) => !monthLabels[i + 1] || monthLabels[i + 1]!.col - m.col >= 3).map(m => (
              <span key={`${m.col}-${m.label}`} className="absolute text-[11px] text-fg-3" style={{ left: m.col * step }}>{m.label}</span>
            ))}
          </div>

          <div className="flex" style={{ gap: GAP + 3 }}>
            {/* Weekday rail */}
            <div className="flex flex-col justify-between shrink-0" style={{ height: gridH, width: RAIL - GAP - 3 }}>
              {WD.map((d, i) => (
                <span key={i} className="text-[10px] text-fg-3 leading-none flex items-center" style={{ height: cell }}>{d}</span>
              ))}
            </div>

            {/* Week columns */}
            <svg width={gridW} height={gridH} className="shrink-0" onPointerLeave={() => setHover(null)}>
              {weeks.map((week, wi) =>
                week.map((c, di) => {
                  if (!c) return null;
                  const x = wi * step, y = di * step;
                  const agg = c.agg;
                  const fill = agg ? cellBg(agg.netPnl, maxAbs) : 'var(--yh-empty, #F4F3F8)';
                  const text = agg
                    ? `${c.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · ${calMoney(agg.netPnl)} · ${agg.trades}T`
                    : `${c.date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })} · no trades`;
                  return (
                    <rect
                      key={`${wi}-${di}`}
                      x={x} y={y} width={cell} height={cell} rx={Math.min(3, cell / 4)}
                      style={{ fill, stroke: isToday(c.date) ? 'var(--acc, #08C465)' : 'transparent' }}
                      strokeWidth={isToday(c.date) ? 1.5 : 1}
                      className={`transition-[filter] duration-150 ${agg ? 'cursor-pointer hover:brightness-110' : ''}`}
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
            className="pointer-events-none absolute z-10 rounded-full bg-[var(--yh-tip,#100F17)] text-[var(--yh-tip-fg,#fff)] px-2.5 py-1 text-[12px] numeric whitespace-nowrap shadow-lg"
            style={{ left: Math.min(hover.x + 8, Math.max(0, cw - 150)), top: hover.y + 22 }}
            data-testid="heat-tooltip"
          >
            {hover.text}
          </div>
        )}
      </div>

      <div className="a-year-ft">
        {tradingDays > 0 && (
          <dl className="a-year-st" data-testid="year-heatmap-stats">
            <div><dt>Green days</dt><dd className="num">{stats.green}<small>/{tradingDays}</small></dd></div>
            <div><dt>Best day</dt><dd className={`num ${stats.best >= 0 ? 'lg' : 'sh'}`}>{calMoney(stats.best).replace('-', '−')}</dd></div>
            <div><dt>Worst day</dt><dd className={`num ${stats.worst >= 0 ? 'lg' : 'sh'}`}>{calMoney(stats.worst).replace('-', '−')}</dd></div>
            <div><dt>Longest green run</dt><dd className="num">{stats.longest}<small> {stats.longest === 1 ? 'day' : 'days'}</small></dd></div>
          </dl>
        )}
        <div className="a-year-lg" aria-hidden>
          <span>Loss</span>
          <i style={{ background: cellBg(-maxAbs, maxAbs) }} />
          <i style={{ background: 'var(--yh-empty, #F4F3F8)' }} />
          <i style={{ background: cellBg(maxAbs, maxAbs) }} />
          <span>Profit</span>
        </div>
      </div>

      {selectedDay && (
        <DayTradesModal date={selectedDay} trades={dayTrades} accountId={accountId} onClose={() => setSelectedDay(null)} />
      )}
    </section>
  );
}
