'use client';

import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

type Regime = NonNullable<MacroState['regime']>;
type PillTone = 'green' | 'red' | 'neutral';

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

function derivePills(regime: Regime, macro: MacroState['macro']): { label: string; tone: PillTone }[] {
  const by = new Map(macro.map(m => [m.key, m]));
  const net = by.get('NET_LIQUIDITY');
  const liqExpanding = net && net.prev != null ? net.value > net.prev : regime.growth === 'up';
  const riskOn = regime.growth === 'up' && regime.inflation === 'down';
  const fragile = (regime.recessionOdds ?? 0) >= 25;
  return [
    riskOn ? { label: fragile ? 'Risk-on (fragile)' : 'Risk-on', tone: 'neutral' } : { label: 'Risk-off bias', tone: 'red' },
    { label: liqExpanding ? 'Liquidity expanding' : 'Liquidity tightening', tone: 'neutral' },
    { label: regime.inflation === 'down' ? 'Inflation falling' : 'Inflation rising', tone: regime.inflation === 'down' ? 'green' : 'red' },
    { label: regime.growth === 'up' ? 'Growth firming' : 'Growth slowing', tone: regime.growth === 'up' ? 'green' : 'red' },
  ];
}

const TAG: Record<PillTone, string> = { green: 'x-tag x-tag--g', red: 'x-tag x-tag--r', neutral: 'x-tag' };

/** Narrative regime card with status tags and the key tension. */
export default function RegimeNarrative({
  regime,
  macro,
}: {
  regime: MacroState['regime'];
  macro: MacroState['macro'];
}) {
  if (!regime) {
    return (
      <section className="x-card mc-rn" data-testid="macro-regime-narrative-empty">
        <div className="x-ch"><h2>Current macro regime</h2></div>
        <p className="mc-rn-body">No regime classified yet. It appears after the first data ingest.</p>
      </section>
    );
  }

  const copy = NARRATIVE[regime.label] ?? NARRATIVE.Unclear!;
  const odds = regime.recessionOdds;
  return (
    <section className="x-card mc-rn" data-testid="macro-regime-narrative" aria-labelledby="mc-rn-t">
      <div className="x-ch"><h2>Current macro regime</h2>
        {odds != null && <span className="x-r"><span className="x-tag">Recession risk <b className="m"><CountUp value={odds} suffix="%" duration={1000} /></b></span></span>}</div>
      <h3 id="mc-rn-t" className="mc-rn-t" data-testid="regime-narrative-title">{copy.title}</h3>
      <p className="mc-rn-body">{copy.body}</p>
      <div className="mc-tags">{derivePills(regime, macro).map(p => <span key={p.label} className={TAG[p.tone]}>{p.label}</span>)}</div>
      <div className="mc-callout"><i /><p><b>Key tension</b> {copy.tension}</p></div>
    </section>
  );
}
