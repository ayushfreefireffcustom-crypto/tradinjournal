'use client';

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel } from '@/lib/macro-format';
import CountUp from './count-up';
import RefBadge from './ref-badge';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold',
  XAG: 'Silver',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude Oil',
  DXY: 'US Dollar Index',
  UST: 'US Treasuries',
};

const REF_SYMBOLS = new Set(['SPX', 'NDX', 'OIL', 'UST']);

function chip(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit';
  if (tone === 'bear') return 'text-loss';
  return 'text-fg-3';
}
function bar(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'bg-profit';
  if (tone === 'bear') return 'bg-loss';
  return 'bg-fg-3';
}

/** Dense asset bias grid — IITian-style middle band. */
export default function AssetBiasGrid({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-asset-bias-empty">
        No asset bias scores yet.
      </div>
    );
  }

  return (
    <section data-testid="macro-asset-bias-grid">
      <div className="flex items-center justify-between mb-2 px-0.5 gap-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// ASSET MACRO BIAS</div>
        <div className="text-[10px] tracking-[0.08em] text-fg-3 flex items-center gap-1 shrink-0">
          <span className="hidden sm:inline">Tap a card to open deep dive</span>
          <span className="sm:hidden">Tap to open</span>
          <CaretRight size={10} weight="bold" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 items-stretch">
        {bias.map((b, i) => {
          const tone = biasTone(b.label);
          return (
            <Link
              key={b.asset}
              href={`/macro/assets/${b.asset.toLowerCase()}`}
              aria-label={`Open ${NAMES[b.asset] ?? b.asset} deep dive`}
              className="group tcard tcard-hover p-2.5 sm:p-3 flex flex-col h-full min-h-[108px] sm:min-h-[120px] focus-ring rise cursor-pointer relative"
              style={{ ['--i' as string]: i }}
              data-testid={`macro-bias-card-${b.asset}`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-fg tracking-wide truncate group-hover:text-fg">
                    {NAMES[b.asset] ?? b.asset}
                  </div>
                  <div className="text-[10px] text-fg-3 mt-0.5 flex items-center gap-1">
                    {b.asset}
                    {REF_SYMBOLS.has(b.asset) && <RefBadge />}
                  </div>
                </div>
                <CountUp
                  value={b.score}
                  suffix="%"
                  className={`numeric text-lg font-display font-black shrink-0 ${chip(tone)}`}
                  duration={900}
                />
              </div>
              <div className="mt-auto pt-3">
                <div className="h-1.5 rounded-full bg-border-soft overflow-hidden">
                  <div
                    className={`h-full bar-grow-x ${bar(tone)}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, b.score))}%`,
                      ['--i' as string]: i,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className={`text-[10px] tracking-[0.08em] ${chip(tone)}`}>
                    {formatBiasLabel(b.label)}
                  </div>
                  <span className="text-[9px] tracking-[0.12em] text-fg-3 flex items-center gap-0.5 opacity-70 group-hover:opacity-100 group-hover:text-fg transition-opacity">
                    OPEN
                    <CaretRight size={10} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
