'use client';

import { useCountUp } from '@/hooks/use-count-up';
import type { MacroState } from '@/lib/macro-api';
import { formatIndicatorValue, deltaPct } from '@/lib/macro-format';

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

const WORD: Record<CardKey, [string, string, string]> = {
  // [rising, falling, flat]
  inflation: ['heating', 'cooling', 'flat'], rates: ['hiking', 'easing', 'on hold'],
  gdp: ['accelerating', 'slowing', 'steady'], labour: ['softening', 'tightening', 'steady'],
};

function Spark({ values, tone }: { values: number[]; tone: string }) {
  if (values.length < 2) return <div className="ms-spark" />;
  const mn = Math.min(...values), mx = Math.max(...values), sp = mx - mn || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 6 + (1 - (v - mn) / sp) * 40] as const);
  const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
  const col = tone === 'bull' ? '#08C465' : tone === 'bear' ? '#FE3A31' : '#A1A1AA';
  const id = `ms${Math.round(values[values.length - 1]! * 1000)}${values.length}${tone}`;
  return (
    <svg className="ms-spark" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".22" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L100,50 L0,50Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Four trend cards — Inflation / Rates / GDP / Labour, with direction words and history. */
export default function SummaryCards({ macro }: { macro: MacroState['macro'] }) {
  return (
    <div className="ms" data-testid="macro-summary-cards">
      {CARDS.map((def, i) => {
        const row = pick(macro, def.series) ?? (def.fallbackSeries ? pick(macro, def.fallbackSeries) : null);
        const tone = row ? cardTone(def, row) : 'neutral';
        const d = row ? deltaPct(row.value, row.prev) : null;
        // Payrolls rising is strength; unemployment/claims rising is softening.
        const w = row?.key === 'PAYEMS' ? (['strengthening', 'softening', 'steady'] as [string, string, string]) : WORD[def.key];
        const dirWord = d == null || Math.abs(d) < 0.05 ? w[2] : d > 0 ? w[0] : w[1];
        const arrow = d == null || Math.abs(d) < 0.05 ? '–' : d > 0 ? '▲' : '▼';
        const cls = tone === 'bull' ? 'lg' : tone === 'bear' ? 'sh' : 'v';
        const note = tone === 'bull' ? def.noteBull : tone === 'bear' ? def.noteBear : 'Awaiting a clear trend print.';
        return (
          <article key={def.key} className="v3-card ms-card" style={{ animationDelay: `${i * 60}ms` }} data-testid={`macro-summary-${def.key}`} title={note}>
            <span className="mc-lbl">{def.title}</span>
            <div className="ms-v"><b className="num">{row ? <AnimatedValue value={row.value} unit={row.unit} /> : '—'}</b>
              {row && <span className={cls}>{arrow} {dirWord}</span>}</div>
            <Spark values={row?.history ?? []} tone={tone} />
          </article>
        );
      })}
    </div>
  );
}
