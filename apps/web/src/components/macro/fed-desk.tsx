'use client';

import type { MacroState } from '@/lib/macro-api';
import { deltaPct, formatIndicatorValue } from '@/lib/macro-format';
import { PanelHead } from '@/components/v6/macro/ui';
import PolicyRates from './policy-rates';

function pick(macro: MacroState['macro'], ...keys: string[]) {
  for (const k of keys) {
    const row = macro.find(m => m.key === k);
    if (row) return row;
  }
  return null;
}

/** Fed desk: funds vs dots and a simple stance meter (no paid NLP). */
export default function FedDesk({ macro }: { macro: MacroState['macro'] }) {
  const fed = pick(macro, 'DFF', 'FEDFUNDS');
  const dot = pick(macro, 'FEDTARMD');
  const real = pick(macro, 'DFII10');
  const be = pick(macro, 'T10YIE');
  const mort = pick(macro, 'MORTGAGE30US');

  const gap = fed && dot ? dot.value - fed.value : null;
  let stance: 'DOVISH' | 'NEUTRAL' | 'HAWKISH' = 'NEUTRAL';
  if (gap != null) {
    if (gap < -0.25) stance = 'DOVISH';
    else if (gap > 0.25) stance = 'HAWKISH';
  } else if (fed) {
    const d = deltaPct(fed.value, fed.prev);
    if (d != null && d < -1) stance = 'DOVISH';
    if (d != null && d > 1) stance = 'HAWKISH';
  }
  const tag = stance === 'DOVISH' ? 'x-tag x-tag--g' : stance === 'HAWKISH' ? 'x-tag x-tag--r' : 'x-tag';
  const needle = stance === 'DOVISH' ? 22 : stance === 'HAWKISH' ? 78 : 50;
  const val = (r: ReturnType<typeof pick>) => (r ? formatIndicatorValue(r.value, r.unit) : '—');

  return (
    <div className="mc-stack" data-testid="macro-fed-desk">
      <PanelHead eyebrow="Federal Reserve" title="Policy desk" right={<span className={tag}>Stance: {stance.toLowerCase()}</span>} />

      <div className="mc-2">
        <section className="x-card mc-fd">
          <div className="x-ch"><h2>Path meter</h2></div>
          <p className="x-muted mc-p">A simple stance from fed funds against the median FOMC dot, not speech analysis. Cuts are projected when the dots sit below the current effective rate.</p>
          <div className="mc-fd-m" role="img" aria-label={`Stance ${stance.toLowerCase()}`}>
            <span className="mc-fd-track" />
            <i style={{ left: `${needle}%` }} />
          </div>
          <div className="mc-fd-ax"><span className="pos">Dovish</span><span>Neutral</span><span className="neg">Hawkish</span></div>
          <div className="x-strip" style={{ ['--n' as string]: 2 }}>
            <div><span>Effective funds</span><b className="m">{val(fed)}</b></div>
            <div><span>Median dot</span><b className="m">{val(dot)}</b></div>
          </div>
        </section>
        <PolicyRates macro={macro} />
      </div>

      <div className="x-strip x-strip--card mc-strip3" style={{ ['--n' as string]: 3 }}>
        <div><span>10Y real yield</span><b className="m">{val(real)}</b></div>
        <div><span>10Y breakeven</span><b className="m">{val(be)}</b></div>
        <div><span>30Y mortgage</span><b className="m">{val(mort)}</b></div>
      </div>
    </div>
  );
}
