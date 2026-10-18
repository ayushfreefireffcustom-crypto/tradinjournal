'use client';

import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

type Regime = NonNullable<MacroState['regime']>;

const NARRATIVE: Record<string, { title: string; body: string; tension: string }> = {
  Goldilocks: {
    title: 'Disinflationary growth',
    body: 'Output is expanding while inflation cools — historically the friendliest tape for risk assets, though late-cycle fragility can reverse quickly.',
    tension: 'Markets are pricing a soft landing. Watch labour prints and core inflation for confirmation that the Fed can ease without a hard stop.',
  },
  Reflation: {
    title: 'Reflationary expansion',
    body: 'Growth and inflation are both rising — commodities and cyclicals typically lead while duration stays under pressure.',
    tension: 'The Fed may stay restrictive longer. Risk assets need earnings growth to outrun higher discount rates.',
  },
  Stagflation: {
    title: 'Stagflation pressure',
    body: 'Weak growth with sticky inflation — the hardest regime for policy and for most risk assets outside real assets.',
    tension: 'Policy is trapped between growth support and inflation control. Expect higher vol and choppy risk appetite.',
  },
  Deflation: {
    title: 'Disinflationary slowdown',
    body: 'Growth and inflation both falling — duration and quality usually outperform as the market prices easier policy.',
    tension: 'Recession odds matter more than inflation here. Credit stress and labour deterioration are the key tells.',
  },
  Unclear: {
    title: 'Regime unclear',
    body: 'Growth and inflation signals are mixed or incomplete — confluence leans on other factors until the quadrant resolves.',
    tension: 'Wait for the next labour and inflation prints before sizing directional macro bets aggressively.',
  },
};

function derivePills(regime: Regime, macro: MacroState['macro']) {
  const by = new Map(macro.map(m => [m.key, m]));
  const net = by.get('NET_LIQUIDITY');
  const liqExpanding =
    net && net.prev != null ? net.value > net.prev : regime.growth === 'up';
  const riskOn = regime.growth === 'up' && regime.inflation === 'down';
  const fragile = (regime.recessionOdds ?? 0) >= 25;

  return {
    risk: riskOn
      ? { label: fragile ? 'Risk-on (fragile)' : 'Risk-on', tone: 'blue' as const, on: true }
      : { label: 'Risk-off bias', tone: 'red' as const, on: true },
    liquidity: {
      label: liqExpanding ? 'Liquidity expanding' : 'Liquidity tightening',
      tone: 'purple' as const,
      on: true,
    },
    inflation: {
      label: regime.inflation === 'down' ? 'Inflation falling' : 'Inflation rising',
      tone: regime.inflation === 'down' ? ('green' as const) : ('orange' as const),
      on: true,
    },
    growth: {
      label: regime.growth === 'up' ? 'Growth firming' : 'Growth slowing',
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
      <section className="mr" data-testid="macro-regime-narrative-empty">
        <span className="mc-lbl">Current macro regime</span>
        <p className="mr-body">No regime classified yet — waiting on the first data ingest.</p>
      </section>
    );
  }

  const copy = NARRATIVE[regime.label] ?? NARRATIVE.Unclear!;
  const pills = derivePills(regime, macro);
  const odds = regime.recessionOdds;
  const pillList = [pills.risk, pills.liquidity, pills.inflation, pills.growth] as const;

  const words = copy.title.split(' ');
  const last = words.pop();
  return (
    <section className="mr" data-testid="macro-regime-narrative" aria-labelledby="mr-t">
      <div className="mr-top"><span className="mc-lbl">Current macro regime</span>
        {odds != null && <span className="mr-odds num">Recession risk <CountUp value={odds} suffix="%" duration={1000} /></span>}</div>
      <h2 id="mr-t" data-testid="regime-narrative-title">{words.join(' ')} <em>{last}.</em></h2>
      <p className="mr-body">{copy.body}</p>
      <div className="mr-pills">{pillList.map((p, i) => <span key={p.label} className={`t-${p.tone}`} style={{ animationDelay: `${i * 70}ms` }}>{p.label}</span>)}</div>
      <div className="mr-key"><b>Key tension:</b> {copy.tension}</div>
    </section>
  );
}
