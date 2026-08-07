'use client';

import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel, formatScore } from '@/lib/macro-format';

export default function BullBearScanner({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-scanner-empty">
        No bias scores yet — run an ingest after FRED is configured.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="macro-scanner">
      {bias.map(b => {
        const tone = biasTone(b.label);
        return (
          <div key={b.asset} className="tcard p-4" data-testid={`macro-scanner-${b.asset}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-display font-black text-lg tracking-tight">{b.asset}</div>
              <div className="numeric text-sm text-fg-3">
                {formatScore(b.score)} · {formatBiasLabel(b.label)}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[10px] tracking-[0.16em] text-profit mb-1">SUPPORTING</div>
                {b.supporting.length === 0 ? (
                  <p className="text-[12px] text-fg-3">None this print</p>
                ) : (
                  <ul className="space-y-1">
                    {b.supporting.map(s => (
                      <li key={s} className="text-[12px] text-fg-2">+ {s}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-[10px] tracking-[0.16em] text-loss mb-1">OPPOSING</div>
                {b.opposing.length === 0 ? (
                  <p className="text-[12px] text-fg-3">None this print</p>
                ) : (
                  <ul className="space-y-1">
                    {b.opposing.map(s => (
                      <li key={s} className="text-[12px] text-fg-2">− {s}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div
              className={`mt-3 h-1 rounded-full ${
                tone === 'bull' ? 'bg-profit/40' : tone === 'bear' ? 'bg-loss/40' : 'bg-border'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
