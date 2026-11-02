'use client';

// Consistency grid: one cell per day, tinted by that day's net P&L, over the
// trailing year or from the first month with a trade, whichever is shorter.
// Cells scale to the card width; on phones the grid scrolls, starting at today.
import { useLayoutEffect, useMemo, useState } from 'react';
import type { Trade } from '@/lib/api';
import { aggregateByCloseDate, buildYearView, dayKey } from '@/lib/calendar';
import { fmtUsd } from '@/lib/dashboard-v6';
import { fmtUsd as plainUsd } from '@/lib/format';
import DayDialog from '@/components/v6/calendar/day-dialog';
import { ACard, Facts, useSize } from './kit';

const RAIL = 30, TOP = 18, MIN_CELL = 8, MAX_CELL = 22;
const WD = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const fill = (v: number, max: number) => {
  const p = Math.round(18 + Math.min(1, Math.abs(v) / max) * 62);
  return `color-mix(in srgb, ${v >= 0 ? 'var(--g)' : 'var(--r)'} ${p}%, var(--s3))`;
};

export default function YearHeatmap({ trades, accountId }: { trades: Trade[]; accountId?: string }) {
  const [ref, { w: cw }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; date: Date; v: number | null; n: number } | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { weeks, monthLabels, maxAbs, totalNet, tradingDays, since } = useMemo(() => {
    const v = buildYearView(aggregateByCloseDate(trades));
    // Start at the first month with a trade, so a young account isn't mostly empty squares.
    const firstCol = v.weeks.findIndex(w => w.some(c => c?.agg));
    if (firstCol < 0) return { ...v, since: null };
    const first = v.weeks[firstCol]!.find(c => c?.agg)!.date;
    const monthStart = new Date(first.getFullYear(), first.getMonth(), 1);
    let from = firstCol;
    while (from > 0 && v.weeks[from - 1]!.some(c => c && c.date >= monthStart)) from--;
    if (from === 0) return { ...v, since: null };
    return {
      ...v,
      weeks: v.weeks.slice(from),
      monthLabels: v.monthLabels.map(m => ({ ...m, col: m.col - from })).filter(m => m.col >= 0),
      since: monthStart,
    };
  }, [trades]);
  const dayTrades = useMemo(() => {
    if (!selectedDay) return [];
    const key = dayKey(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
    return trades.filter(t => {
      if (t.status !== 'CLOSED' || !t.closeTime) return false;
      const d = new Date(t.closeTime);
      return dayKey(d.getFullYear(), d.getMonth(), d.getDate()) === key;
    });
  }, [selectedDay, trades]);

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

  // Net P&L per calendar month in view (QW.6), oldest first; months without a trade show "—".
  const months = useMemo(() => {
    const m = new Map<string, { label: string; net: number; days: number }>();
    for (const week of weeks) for (const c of week) {
      if (!c) continue;
      const k = `${c.date.getFullYear()}-${c.date.getMonth()}`;
      if (!m.has(k)) m.set(k, { label: c.date.toLocaleDateString('en-US', { month: 'short', ...(c.date.getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) }), net: 0, days: 0 });
      if (c.agg) { const e = m.get(k)!; e.net += c.agg.netPnl; e.days++; }
    }
    const list = [...m.values()];
    const first = list.findIndex(x => x.days > 0); // the grid's first week can start in the month before
    return first < 0 ? [] : list.slice(first);
  }, [weeks]);

  const cols = weeks.length;
  const gap = cw && (cw - RAIL) / cols < 12 ? 2 : 3;
  const cell = cw === 0 ? 12 : Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((cw - RAIL - (cols - 1) * gap) / cols)));
  const step = cell + gap;
  const gridW = RAIL + cols * step - gap, gridH = TOP + 7 * step - gap;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [cell, cols, ref]);

  const today = new Date();
  const isToday = (d: Date) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const labels = monthLabels.filter((m, i) => !monthLabels[i + 1] || monthLabels[i + 1]!.col - m.col >= 3);
  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ACard title="Consistency" sub={since ? `since ${since.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'trailing 12 months'} testId="year-heatmap"
      right={<span className="an-yh-sum"><b className={`m ${totalNet > 0 ? 'pos' : totalNet < 0 ? 'neg' : ''}`}>{tradingDays ? fmtUsd(totalNet, 0) : '—'}</b> · {tradingDays} trading days</span>}>
      <div className="an-yh" ref={ref} onPointerLeave={() => setHover(null)}>
        <svg width={gridW} height={gridH} role="img" aria-label={`Daily net P&L heatmap, ${tradingDays} trading days`}>
          {labels.map(m => <text key={`${m.col}-${m.label}`} x={RAIL + m.col * step} y={11} fontSize="10.5" fill="var(--axis)">{m.label}</text>)}
          {WD.map((d, i) => d && <text key={i} x={0} y={TOP + i * step + cell / 2 + 3.5} fontSize="10" fill="var(--axis)">{d}</text>)}
          {weeks.map((week, wi) => week.map((c, di) => {
            if (!c) return null;
            const x = RAIL + wi * step, y = TOP + di * step, agg = c.agg;
            return (
              <rect key={`${wi}-${di}`} x={x} y={y} width={cell} height={cell} rx={Math.min(3, cell / 4)}
                style={{ fill: agg ? fill(agg.netPnl, maxAbs) : 'var(--s3)', cursor: agg ? 'pointer' : undefined }}
                stroke={isToday(c.date) ? 'var(--tx)' : 'none'} strokeWidth={1.5}
                onPointerEnter={() => setHover({ x: x + cell, y: di > 2 ? y - 60 : y + cell + 6, date: c.date, v: agg?.netPnl ?? null, n: agg?.trades ?? 0 })}
                onClick={agg ? () => setSelectedDay(c.date) : undefined}
                data-testid={agg ? `heat-${c.key}` : undefined} />
            );
          }))}
        </svg>
        {hover && (
          <div className="dk-tip an-tip" style={{ left: Math.max(0, Math.min(hover.x + 8, gridW - 170)), top: Math.max(0, hover.y) }} data-testid="heat-tooltip">
            <span>{fmtDay(hover.date)}</span>
            {hover.v == null ? <b>No trades</b> : <><b className={`m ${hover.v > 0 ? 'pos' : hover.v < 0 ? 'neg' : ''}`}>{fmtUsd(hover.v)}</b><span>{hover.n} trade{hover.n === 1 ? '' : 's'}</span></>}
          </div>
        )}
      </div>
      {tradingDays > 0 && (
        <ul className="an-yh-months" aria-label="Net P&L by month" data-testid="year-months">
          {months.map(mo => (
            <li key={mo.label}>
              <span>{mo.label}</span>
              <b className={`m mny ${mo.days ? (mo.net > 0 ? 'pos' : mo.net < 0 ? 'neg' : '') : 'x-dim'}`}>{mo.days ? plainUsd(mo.net, { digits: 0, signed: true }) : '—'}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="an-yh-ft">
        {tradingDays > 0 ? (
          <div data-testid="year-heatmap-stats" className="an-yh-stats">
            <Facts items={[
              { l: 'Green days', v: `${stats.green} / ${tradingDays}` },
              { l: 'Best day', v: fmtUsd(stats.best, 0), c: stats.best > 0 ? 'pos' : 'neg' },
              { l: 'Worst day', v: fmtUsd(stats.worst, 0), c: stats.worst < 0 ? 'neg' : 'pos' },
              { l: 'Longest green run', v: `${stats.longest} day${stats.longest === 1 ? '' : 's'}` },
            ]} />
          </div>
        ) : <p className="x-muted an-yh-none">No closed trades in the last 12 months.</p>}
        <div className="an-yh-lg" aria-hidden>
          <span>Loss</span>
          <i style={{ background: fill(-maxAbs, maxAbs) }} /><i style={{ background: fill(-maxAbs * 0.3, maxAbs) }} />
          <i style={{ background: 'var(--s3)' }} />
          <i style={{ background: fill(maxAbs * 0.3, maxAbs) }} /><i style={{ background: fill(maxAbs, maxAbs) }} />
          <span>Profit</span>
        </div>
      </div>
      {selectedDay && <DayDialog date={selectedDay} trades={dayTrades} accountId={accountId} onClose={() => setSelectedDay(null)} />}
    </ACard>
  );
}
