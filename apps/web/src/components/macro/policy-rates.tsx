'use client';

import type { MacroState } from '@/lib/macro-api';

function bp(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 100))}bp`;
}

/** Central-bank policy snapshot: Fed vs its own dot-plot path, and vs the ECB. */
export default function PolicyRates({ macro }: { macro: MacroState['macro'] }) {
  const v = new Map(macro.map(m => [m.key, m.value]));
  const fed = v.get('FEDFUNDS') ?? v.get('DFF');
  const dot = v.get('FEDTARMD');
  const ecb = v.get('ECBDFR');

  if (typeof fed !== 'number' && typeof ecb !== 'number') return null;

  const dotGap = typeof fed === 'number' && typeof dot === 'number' ? dot - fed : null;
  const divergence = typeof fed === 'number' && typeof ecb === 'number' ? fed - ecb : null;

  return (
    <section className="x-card mc-pr" data-testid="macro-policy-rates">
      <div className="x-ch"><h2>Policy rates</h2><span className="x-sub">Fed and ECB</span></div>
      <div className="mc-rows">
        {typeof fed === 'number' && <div className="mc-row"><span>US fed funds</span><b className="m">{fed.toFixed(2)}%</b></div>}
        {typeof dot === 'number' && (
          <div className="mc-row">
            <span>FOMC median dot
              {dotGap != null && <small className={dotGap < 0 ? 'neg' : dotGap > 0 ? 'pos' : ''}><span className="m">{bp(dotGap)}</span> vs now · {dotGap < -0.05 ? 'cuts projected' : dotGap > 0.05 ? 'hikes projected' : 'on hold'}</small>}
            </span>
            <b className="m">{dot.toFixed(2)}%</b>
          </div>
        )}
        {typeof ecb === 'number' && <div className="mc-row"><span>Euro area ECB deposit</span><b className="m">{ecb.toFixed(2)}%</b></div>}
      </div>
      {divergence != null && (
        <div className="x-inset mc-pr-f"><span>Fed − ECB divergence</span><b className={`m ${divergence > 0 ? 'pos' : divergence < 0 ? 'neg' : ''}`}>{bp(divergence)}</b></div>
      )}
    </section>
  );
}
