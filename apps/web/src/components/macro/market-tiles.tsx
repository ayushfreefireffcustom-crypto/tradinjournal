'use client';

import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel, formatMacroNumber, formatSignedPct } from '@/lib/macro-format';
import CountUp from './count-up';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold (spot)',
  XAG: 'Silver (spot)',
  DXY: 'Dollar Index',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude Oil',
  UST: 'US Treasuries',
};

function chip(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit border-profit/30 bg-profit/10';
  if (tone === 'bear') return 'text-loss border-loss/30 bg-loss/10';
  return 'text-fg-3 border-border bg-surface-hover';
}

/** Live market tiles fused with each asset's confluence bias. */
export default function MarketTiles({
  markets,
  bias,
}: {
  markets: MacroState['markets'];
  bias: MacroState['bias'];
}) {
  if (!markets.length) return null;
  const biasBy = new Map(bias.map(b => [b.asset, b]));

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 items-stretch" data-testid="macro-market-tiles">
      {markets.map((m, i) => {
        const up = (m.changePct ?? 0) > 0;
        const down = (m.changePct ?? 0) < 0;
        const priceTone = up ? 'text-profit' : down ? 'text-loss' : 'text-fg';
        const b = biasBy.get(m.symbol);
        const tone = b ? biasTone(b.label) : 'neutral';
        return (
          <div
            key={m.symbol}
            className="tcard tcard-hover p-3 flex flex-col h-full min-h-[112px] rise"
            style={{ ['--i' as string]: i }}
            data-testid={`macro-tile-${m.symbol}`}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] tracking-[0.16em] text-fg font-medium">{m.symbol}</div>
                <div className="text-[10px] text-fg-3 leading-tight">{NAMES[m.symbol] ?? m.symbol}</div>
              </div>
              {b && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${chip(tone)}`}>
                  {formatBiasLabel(b.label)}
                </span>
              )}
            </div>
            <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
              <span className="numeric text-lg text-fg">{formatMacroNumber(m.price)}</span>
              <span className={`numeric text-[12px] ${priceTone}`}>
                {m.changePct == null ? '—' : formatSignedPct(m.changePct)}
              </span>
            </div>
            {b && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-border-soft overflow-hidden">
                  <div
                    className={`h-full bar-grow-x ${tone === 'bull' ? 'bg-profit' : tone === 'bear' ? 'bg-loss' : 'bg-fg-3'}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, b.score))}%`,
                      ['--i' as string]: i,
                    }}
                  />
                </div>
                <CountUp value={b.score} className="numeric text-[10px] text-fg-3 w-6 text-right" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
