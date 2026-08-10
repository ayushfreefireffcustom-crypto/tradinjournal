'use client';

import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

type Regime = NonNullable<MacroState['regime']>;

const NARRATIVE: Record<string, { title: string; body: string; tension: string }> = {
  Goldilocks: {
    title: 'Disinflationary Growth',
    body: 'Output is expanding while inflation cools — historically the friendliest tape for risk assets, though late-cycle fragility can reverse quickly.',
    tension: 'Markets are pricing a soft landing. Watch labour prints and core inflation for confirmation that the Fed can ease without a hard stop.',
  },
  Reflation: {
    title: 'Reflationary Expansion',
    body: 'Growth and inflation are both rising — commodities and cyclicals typically lead while duration stays under pressure.',
    tension: 'The Fed may stay restrictive longer. Risk assets need earnings growth to outrun higher discount rates.',
  },
  Stagflation: {
    title: 'Stagflation Pressure',
    body: 'Weak growth with sticky inflation — the hardest regime for policy and for most risk assets outside real assets.',
    tension: 'Policy is trapped between growth support and inflation control. Expect higher vol and choppy risk appetite.',
  },
  Deflation: {
    title: 'Disinflationary Slowdown',
    body: 'Growth and inflation both falling — duration and quality usually outperform as the market prices easier policy.',
    tension: 'Recession odds matter more than inflation here. Credit stress and labour deterioration are the key tells.',
  },
  Unclear: {
    title: 'Regime Unclear',
    body: 'Growth and inflation signals are mixed or incomplete — confluence leans on other factors until the quadrant resolves.',
    tension: 'Wait for the next labour and inflation prints before sizing directional macro bets aggressively.',
  },
};

function pill(active: boolean, tone: 'blue' | 'purple' | 'green' | 'orange' | 'red'): string {
  const base = 'text-[9px] tracking-[0.12em] uppercase px-2 py-1 rounded border';
  if (!active) return `${base} text-fg-3 border-border-soft`;
  if (tone === 'blue') return `${base} text-sky-300 border-sky-400/40 bg-sky-400/10`;
  if (tone === 'purple') return `${base} text-violet-300 border-violet-400/40 bg-violet-400/10`;
  if (tone === 'green') return `${base} text-profit border-profit/40 bg-profit/10`;
  if (tone === 'orange') return `${base} text-warning border-warning/40 bg-warning/10`;
  return `${base} text-loss border-loss/40 bg-loss/10`;
}

function derivePills(regime: Regime, macro: MacroState['macro']) {
  const by = new Map(macro.map(m => [m.key, m]));
  const net = by.get('NET_LIQUIDITY');
  const liqExpanding =
    net && net.prev != null ? net.value > net.prev : regime.growth === 'up';
  const riskOn = regime.growth === 'up' && regime.inflation === 'down';
  const fragile = (regime.recessionOdds ?? 0) >= 25;

  return {
    risk: riskOn
      ? { label: fragile ? 'RISK-ON (FRAGILE)' : 'RISK-ON', tone: 'blue' as const, on: true }
      : { label: 'RISK-OFF BIAS', tone: 'red' as const, on: true },
    liquidity: {
      label: liqExpanding ? 'LIQUIDITY: EXPANDING' : 'LIQUIDITY: TIGHTENING',
      tone: 'purple' as const,
      on: true,
    },
    inflation: {
      label: regime.inflation === 'down' ? 'INFLATION: FALLING' : 'INFLATION: RISING',
      tone: regime.inflation === 'down' ? ('green' as const) : ('orange' as const),
      on: true,
    },
    growth: {
      label: regime.growth === 'up' ? 'GROWTH: FIRMING' : 'GROWTH: SLOWING',
      tone: regime.growth === 'up' ? ('green' as const) : ('orange' as const),
      on: true,
    },
  };
}

/** Narrative regime card with status pills + key tension — IITian-style hero. */
export default function RegimeNarrative({
  regime,
  macro,
}: {
  regime: MacroState['regime'];
  macro: MacroState['macro'];
}) {
  if (!regime) {
    return (
      <div className="tcard p-4 sm:p-5 h-full min-h-[280px] flex flex-col" data-testid="macro-regime-narrative-empty">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// CURRENT MACRO REGIME</div>
        <p className="text-sm text-fg-3 mt-4 flex-1 flex items-center">No regime classified yet — waiting on FRED ingest.</p>
      </div>
    );
  }

  const copy = NARRATIVE[regime.label] ?? NARRATIVE.Unclear!;
  const pills = derivePills(regime, macro);
  const odds = regime.recessionOdds;
  const pillList = [pills.risk, pills.liquidity, pills.inflation, pills.growth] as const;

  return (
    <div
      className="tcard p-3 sm:p-5 flex flex-col h-full min-h-[220px] sm:min-h-[280px] rise"
      style={{ ['--i' as string]: 1 }}
      data-testid="macro-regime-narrative"
    >
      <div className="flex items-center justify-between shrink-0 gap-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// CURRENT MACRO REGIME</div>
        {odds != null && (
          <span className="text-[9px] tracking-[0.12em] px-2 py-1 rounded border border-border-soft text-fg-2">
            RECESSION RISK:{' '}
            <CountUp value={odds} suffix="%" className="numeric text-fg" duration={1000} />
          </span>
        )}
      </div>

      <h2 className="font-display font-black text-xl sm:text-2xl tracking-tight text-fg mt-3 fade-up" data-testid="regime-narrative-title">
        {copy.title}
      </h2>
      <p className="text-[12px] text-fg-3 leading-relaxed mt-2">{copy.body}</p>

      <div className="flex flex-wrap gap-1.5 mt-4">
        {pillList.map((p, i) => (
          <span
            key={p.label}
            className={`${pill(p.on, p.tone)} pill-in`}
            style={{ ['--i' as string]: i }}
          >
            {p.label}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <div className="rounded-[var(--radius-btn)] border border-sky-400/30 bg-sky-400/5 p-3 fade-up">
          <div className="text-[9px] tracking-[0.16em] text-sky-300 mb-1">KEY TENSION</div>
          <p className="text-[12px] text-fg-2 leading-relaxed">{copy.tension}</p>
        </div>
      </div>
    </div>
  );
}
