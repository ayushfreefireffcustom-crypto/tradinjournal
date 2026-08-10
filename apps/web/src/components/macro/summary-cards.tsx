'use client';

import { useCountUp } from '@/hooks/use-count-up';
import type { MacroState } from '@/lib/macro-api';
import { formatIndicatorValue, formatSignedPct, deltaPct } from '@/lib/macro-format';

type CardKey = 'inflation' | 'rates' | 'gdp' | 'labour';

interface CardDef {
  key: CardKey;
  title: string;
  series: string[];
  fallbackSeries?: string[];
  bullWhen: 'up' | 'down';
  noteBull: string;
  noteBear: string;
}

const CARDS: CardDef[] = [
  {
    key: 'inflation',
    title: 'INFLATION TREND',
    series: ['CPILFESL', 'CPIAUCSL', 'PCEPILFE'],
    bullWhen: 'down',
    noteBull: 'Cooling prices open room for policy easing.',
    noteBear: 'Sticky inflation keeps the Fed restrictive.',
  },
  {
    key: 'rates',
    title: 'INTEREST-RATE TREND',
    series: ['DFF', 'FEDFUNDS'],
    fallbackSeries: ['FEDTARMD'],
    bullWhen: 'down',
    noteBull: 'Cutting cycle / lower front-end supports risk.',
    noteBear: 'Higher-for-longer pressures duration and equities.',
  },
  {
    key: 'gdp',
    title: 'GDP GROWTH',
    series: ['GDPNOW', 'GDPC1'],
    bullWhen: 'up',
    noteBull: 'Growth holding — soft-landing narrative intact.',
    noteBear: 'Growth slowing — watch recession odds climb.',
  },
  {
    key: 'labour',
    title: 'LABOUR MARKET',
    series: ['PAYEMS', 'UNRATE', 'ICSA'],
    bullWhen: 'up',
    noteBull: 'Hiring resilient — demand still firm.',
    noteBear: 'Hiring slowdown — labour cooling into the Fed.',
  },
];

function pick(macro: MacroState['macro'], keys: string[]) {
  const by = new Map(macro.map(m => [m.key, m]));
  for (const k of keys) {
    const row = by.get(k);
    if (row) return row;
  }
  return null;
}

function cardTone(def: CardDef, row: NonNullable<ReturnType<typeof pick>>): 'bull' | 'bear' | 'neutral' {
  if (row.key === 'UNRATE') {
    const d = deltaPct(row.value, row.prev);
    if (d == null) return 'neutral';
    return d > 0 ? 'bear' : d < 0 ? 'bull' : 'neutral';
  }
  if (row.key === 'ICSA') {
    const d = deltaPct(row.value, row.prev);
    if (d == null) return 'neutral';
    return d > 0 ? 'bear' : d < 0 ? 'bull' : 'neutral';
  }
  const d = deltaPct(row.value, row.prev);
  if (d == null) return 'neutral';
  if (def.bullWhen === 'down') return d < 0 ? 'bull' : d > 0 ? 'bear' : 'neutral';
  return d > 0 ? 'bull' : d < 0 ? 'bear' : 'neutral';
}

function AnimatedValue({ value, unit }: { value: number; unit: string | null | undefined }) {
  const n = useCountUp(value, { duration: 1000, decimals: 2 });
  return <>{formatIndicatorValue(n ?? value, unit)}</>;
}

/** Four hero summary cards — Inflation / Rates / GDP / Labour. */
export default function SummaryCards({ macro }: { macro: MacroState['macro'] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 items-stretch" data-testid="macro-summary-cards">
      {CARDS.map((def, i) => {
        const row = pick(macro, def.series) ?? (def.fallbackSeries ? pick(macro, def.fallbackSeries) : null);
        const tone = row ? cardTone(def, row) : 'neutral';
        const d = row ? deltaPct(row.value, row.prev) : null;
        const toneCls = tone === 'bull' ? 'text-profit border-profit/30 bg-profit/10' : tone === 'bear' ? 'text-loss border-loss/30 bg-loss/10' : 'text-fg-3 border-border bg-surface-hover';
        const note = tone === 'bull' ? def.noteBull : tone === 'bear' ? def.noteBear : 'Awaiting a clear trend print.';

        return (
          <article
            key={def.key}
            className="tcard p-4 flex flex-col h-full min-h-[140px] rise"
            style={{ ['--i' as string]: i }}
            data-testid={`macro-summary-${def.key}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] tracking-[0.18em] text-fg-3">{def.title}</div>
              <span className={`text-[9px] tracking-[0.12em] px-1.5 py-0.5 rounded border ${toneCls}`}>
                {tone === 'bull' ? 'BULLISH' : tone === 'bear' ? 'BEARISH' : 'NEUTRAL'}
              </span>
            </div>
            <div className="mt-3 numeric text-2xl font-display font-black text-fg">
              {row ? <AnimatedValue value={row.value} unit={row.unit} /> : '—'}
            </div>
            <div className="text-[11px] text-fg-3 mt-1">
              {row?.label ?? 'No print'}
              {d != null && (
                <span className={`numeric ml-2 ${d > 0 ? 'text-profit' : d < 0 ? 'text-loss' : ''}`}>
                  {formatSignedPct(d, 1)} vs prior
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-3 mt-auto pt-3 leading-relaxed">{note}</p>
          </article>
        );
      })}
    </div>
  );
}
