'use client';

import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel, formatScore } from '@/lib/macro-format';

function chip(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'bg-profit/15 text-profit border-profit/30';
  if (tone === 'bear') return 'bg-loss/15 text-loss border-loss/30';
  return 'bg-surface-hover text-fg-3 border-border';
}

export default function BiasRow({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" data-testid="macro-bias-row">
      {bias.map(b => {
        const tone = biasTone(b.label);
        return (
          <div key={b.asset} className="tcard p-3" data-testid={`macro-bias-${b.asset}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] tracking-[0.16em] text-fg-3">{b.asset}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chip(tone)}`}>
                {formatBiasLabel(b.label)}
              </span>
            </div>
            <div className="numeric text-2xl font-display font-black mt-2">{formatScore(b.score)}</div>
            <div className="mt-2 h-1.5 rounded-full bg-border-soft overflow-hidden">
              <div
                className={`h-full ${tone === 'bull' ? 'bg-profit' : tone === 'bear' ? 'bg-loss' : 'bg-fg-3'}`}
                style={{ width: `${Math.max(0, Math.min(100, b.score))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
