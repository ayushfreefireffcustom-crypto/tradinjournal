'use client';

import { useMemo } from 'react';
import { CalendarBlank, ArrowsLeftRight, Clock, Coins, Target, Warning, Trophy, ChartLineUp, Lightbulb } from '@phosphor-icons/react';
import type { AccountStats, Trade, JournalEntry } from '@/lib/api';
import { buildInsights, type InsightIcon, type Tone } from '@/lib/insights';

const ICONS: Record<InsightIcon, typeof CalendarBlank> = {
  calendar: CalendarBlank,
  direction: ArrowsLeftRight,
  clock: Clock,
  coin: Coins,
  target: Target,
  warning: Warning,
  trophy: Trophy,
  session: ChartLineUp,
};

const toneColor: Record<Tone, string> = {
  profit: 'var(--color-profit)',
  loss: 'var(--color-loss)',
  warning: 'var(--color-warning)',
  neutral: 'var(--color-fg-2)',
};

export default function InsightsStrip({ stats, trades, journal }: { stats: AccountStats; trades: Trade[]; journal: JournalEntry[] }) {
  const insights = useMemo(() => buildInsights(stats, trades, journal), [stats, trades, journal]);
  if (insights.length === 0) return null;

  return (
    <div className="tcard p-4 sm:p-5 mb-3" data-testid="insights-strip">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={15} weight="fill" className="text-warning" />
        <span className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Insights</span>
        <span className="text-[10px] text-fg-3 numeric ml-auto">{insights.length}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {insights.map((ins, i) => {
          const Icon = ICONS[ins.icon];
          const color = toneColor[ins.tone];
          return (
            <div
              key={ins.id}
              className="rise flex items-start gap-2.5 rounded-[var(--radius-btn)] border border-border-soft bg-app/40 px-3 py-2.5"
              style={{ ['--i' as string]: i, borderLeft: `2px solid ${color}` }}
              data-testid={`insight-${ins.id}`}
            >
              <Icon size={16} weight="bold" color={color} className="shrink-0 mt-px" />
              <span className="text-[11.5px] leading-snug text-fg-2">{ins.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
