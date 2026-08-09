'use client';

import type { MacroState } from '@/lib/macro-api';

function bp(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(n * 100)}bp`;
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

  const Row = ({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) => (
    <div className="flex items-center justify-between py-2 border-b border-border-soft last:border-b-0">
      <span className="text-[12px] text-fg-2">{label}</span>
      <span className="text-right">
        <span className="numeric text-[15px] text-fg">{value}</span>
        {sub && <div className="text-[10px] mt-0.5">{sub}</div>}
      </span>
    </div>
  );

  return (
    <div className="tcard p-4" data-testid="macro-policy-rates">
      <div className="flex items-center justify-between border-b border-border-soft pb-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// POLICY RATES</div>
        <div className="text-[10px] tracking-[0.14em] text-fg-3">FED · ECB</div>
      </div>

      <div className="mt-1">
        {typeof fed === 'number' && <Row label="US · Fed Funds" value={`${fed.toFixed(2)}%`} />}
        {typeof dot === 'number' && (
          <Row
            label="FOMC Median Dot"
            value={`${dot.toFixed(2)}%`}
            sub={
              dotGap == null ? null : (
                <span className={dotGap < 0 ? 'text-loss' : dotGap > 0 ? 'text-profit' : 'text-fg-3'}>
                  {bp(dotGap)} vs now · {dotGap < -0.05 ? 'cuts projected' : dotGap > 0.05 ? 'hikes projected' : 'on hold'}
                </span>
              )
            }
          />
        )}
        {typeof ecb === 'number' && <Row label="Euro Area · ECB" value={`${ecb.toFixed(2)}%`} />}
      </div>

      {divergence != null && (
        <div className="mt-2 pt-2 border-t border-border-soft flex items-center justify-between text-[10px]">
          <span className="text-fg-3 tracking-[0.12em]">FED − ECB DIVERGENCE</span>
          <span className={`numeric ${divergence > 0 ? 'text-profit' : divergence < 0 ? 'text-loss' : 'text-fg-3'}`}>
            {bp(divergence)}
          </span>
        </div>
      )}
    </div>
  );
}
