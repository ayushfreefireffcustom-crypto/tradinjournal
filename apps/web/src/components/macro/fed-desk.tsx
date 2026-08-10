'use client';

import type { MacroState } from '@/lib/macro-api';
import PolicyRates from './policy-rates';
import { deltaPct, formatIndicatorValue } from '@/lib/macro-format';

function pick(macro: MacroState['macro'], ...keys: string[]) {
  for (const k of keys) {
    const row = macro.find(m => m.key === k);
    if (row) return row;
  }
  return null;
}

/** Fed desk — funds vs dots + simple stance meter (no paid NLP). */
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

  const stanceCls =
    stance === 'DOVISH' ? 'text-profit border-profit/30 bg-profit/10'
    : stance === 'HAWKISH' ? 'text-loss border-loss/30 bg-loss/10'
    : 'text-fg-3 border-border bg-surface-hover';

  const needle = stance === 'DOVISH' ? 22 : stance === 'HAWKISH' ? 78 : 50;

  return (
    <div className="space-y-3" data-testid="macro-fed-desk">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// FEDERAL RESERVE</div>
          <h2 className="font-display font-black text-xl tracking-tight mt-1">Policy Desk</h2>
        </div>
        <span className={`text-[10px] tracking-[0.14em] px-2.5 py-1 rounded border ${stanceCls}`}>
          STANCE · {stance}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <div className="tcard p-4 flex flex-col h-full min-h-[220px]">
          <div className="text-[10px] tracking-[0.16em] text-fg-3">// PATH METER</div>
          <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">
            Simple stance from funds vs the median FOMC dot — not speech NLP. Cuts projected when
            dots sit below the current effective rate.
          </p>
          <div className="mt-6 relative h-3 rounded-full bg-border-soft overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-profit/20" />
            <div className="absolute inset-y-0 right-0 w-1/2 bg-loss/20" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-fg border-2 border-app"
              style={{ left: `calc(${needle}% - 6px)` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[9px] tracking-[0.14em] text-fg-3">
            <span className="text-profit">DOVISH</span>
            <span>NEUTRAL</span>
            <span className="text-loss">HAWKISH</span>
          </div>
          <div className="mt-auto pt-4 grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <div className="text-[9px] tracking-[0.14em] text-fg-3">EFFECTIVE FUNDS</div>
              <div className="numeric text-lg text-fg mt-0.5">
                {fed ? formatIndicatorValue(fed.value, fed.unit) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.14em] text-fg-3">MEDIAN DOT</div>
              <div className="numeric text-lg text-fg mt-0.5">
                {dot ? formatIndicatorValue(dot.value, dot.unit) : '—'}
              </div>
            </div>
          </div>
        </div>

        <PolicyRates macro={macro} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { label: '10Y REAL YIELD', row: real },
          { label: '10Y BREAKEVEN', row: be },
          { label: '30Y MORTGAGE', row: mort },
        ].map(({ label, row }) => (
          <div key={label} className="tcard p-4">
            <div className="text-[10px] tracking-[0.16em] text-fg-3">{label}</div>
            <div className="numeric text-xl font-display font-black text-fg mt-2">
              {row ? formatIndicatorValue(row.value, row.unit) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
