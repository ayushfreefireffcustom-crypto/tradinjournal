'use client';

import { useCountUp } from '@/hooks/use-count-up';
import type { MacroState } from '@/lib/macro-api';
import { formatIndicatorValue, deltaPct } from '@/lib/macro-format';
import { Spark, type Tone } from '@/components/v6/macro/ui';

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
    title: 'Inflation trend',
    series: ['CPILFESL', 'CPIAUCSL', 'PCEPILFE'],
    bullWhen: 'down',
    noteBull: 'Cooling prices open room for policy easing.',
    noteBear: 'Sticky inflation keeps the Fed restrictive.',
  },
  {
    key: 'rates',
    title: 'Interest-rate trend',
    series: ['DFF', 'FEDFUNDS'],
    fallbackSeries: ['FEDTARMD'],
    bullWhen: 'down',
    noteBull: 'Cutting cycle / lower front-end supports risk.',
    noteBear: 'Higher-for-longer pressures duration and equities.',
  },
  {
    key: 'gdp',
    title: 'GDP growth',
    series: ['GDPNOW', 'GDPC1'],
    bullWhen: 'up',
    noteBull: 'Growth holding — soft-landing narrative intact.',
    noteBear: 'Growth slowing — watch recession odds climb.',
  },
  {
    key: 'labour',
    title: 'Labour market',
    series: ['UNRATE', 'PAYEMS', 'ICSA'],
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

function cardTone(def: CardDef, row: NonNullable<ReturnType<typeof pick>>): Tone {
  const d = deltaPct(row.value, row.prev);
  if (d == null) return 'neutral';
  // Rising unemployment or claims is softening, not strength.
  if (row.key === 'UNRATE' || row.key === 'ICSA') return d > 0 ? 'bear' : d < 0 ? 'bull' : 'neutral';
  if (def.bullWhen === 'down') return d < 0 ? 'bull' : d > 0 ? 'bear' : 'neutral';
  return d > 0 ? 'bull' : d < 0 ? 'bear' : 'neutral';
}

function AnimatedValue({ value, unit }: { value: number; unit: string | null | undefined }) {
  const n = useCountUp(value, { duration: 1000, decimals: 2 });
  return <>{formatIndicatorValue(n ?? value, unit)}</>;
}

const WORD: Record<CardKey, [string, string, string]> = {
  // [rising, falling, flat]
  inflation: ['heating', 'cooling', 'flat'], rates: ['hiking', 'easing', 'on hold'],
  gdp: ['accelerating', 'slowing', 'steady'], labour: ['softening', 'tightening', 'steady'],
};

/** Four trend cards: inflation, rates, GDP, labour, each with a direction word and history. */
export default function SummaryCards({ macro }: { macro: MacroState['macro'] }) {
  return (
    <div className="mc-sum" data-testid="macro-summary-cards">
      {CARDS.map(def => {
        const row = pick(macro, def.series) ?? (def.fallbackSeries ? pick(macro, def.fallbackSeries) : null);
        const tone = row ? cardTone(def, row) : 'neutral';
        const d = row ? deltaPct(row.value, row.prev) : null;
        const w = row?.key === 'PAYEMS' ? (['strengthening', 'softening', 'steady'] as [string, string, string]) : WORD[def.key];
        const dirWord = d == null || Math.abs(d) < 0.05 ? w[2] : d > 0 ? w[0] : w[1];
        const note = tone === 'bull' ? def.noteBull : tone === 'bear' ? def.noteBear : 'Awaiting a clear trend print.';
        return (
          <article key={def.key} className="x-card mc-sum-c" data-testid={`macro-summary-${def.key}`} title={note}>
            <div className="x-stat">
              <span className="l">{def.title}</span>
              <b>{row ? <AnimatedValue value={row.value} unit={row.unit} /> : '—'}</b>
              {row && <small className={tone === 'bull' ? 'pos' : tone === 'bear' ? 'neg' : ''}>{dirWord[0]!.toUpperCase() + dirWord.slice(1)}{row.label ? <span className="x-dim"> · {row.label}</span> : null}</small>}
            </div>
            <div className="mc-sum-s"><Spark values={row?.history ?? []} tone={tone} width={120} height={36} fluid area /></div>
          </article>
        );
      })}
    </div>
  );
}
