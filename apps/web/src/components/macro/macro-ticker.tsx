'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatMacroNumber, formatSignedPct } from '@/lib/macro-format';
import RefBadge from './ref-badge';

const REF = new Set(['SPX', 'NDX', 'OIL', 'UST', 'DXY']);

const DISPLAY: Record<string, string> = {
  BTC: 'BTC/USD',
  ETH: 'ETH/USD',
  SOL: 'SOL/USD',
  XAU: 'XAU/USD',
  XAG: 'XAG/USD',
  SPX: 'S&P 500',
  NDX: 'NASDAQ 100',
  OIL: 'WTI',
  DXY: 'DXY',
  UST: 'US10Y',
};

function TickItem({ m }: { m: MacroState['markets'][number] }) {
  const up = (m.changePct ?? 0) > 0;
  const down = (m.changePct ?? 0) < 0;
  const tone = up ? 'text-profit' : down ? 'text-loss' : 'text-fg-3';
  const arrow = up ? '▲' : down ? '▼' : '·';
  return (
    <div className="flex items-center gap-2.5 px-5 shrink-0 border-r border-border-soft/80">
      <span className="text-[10px] tracking-[0.14em] text-fg-2 flex items-center gap-1.5 whitespace-nowrap">
        {DISPLAY[m.symbol] ?? m.symbol}
        {REF.has(m.symbol) && <RefBadge />}
      </span>
      <span className="numeric text-[12px] text-fg whitespace-nowrap">{formatMacroNumber(m.price)}</span>
      <span className={`numeric text-[11px] flex items-center gap-1 whitespace-nowrap ${tone}`}>
        <span className="text-[9px]">{arrow}</span>
        {m.changePct == null ? '—' : formatSignedPct(m.changePct)}
      </span>
    </div>
  );
}

/** Continuous right→left marquee ticker (seamless loop). */
export default function MacroTicker({ markets }: { markets: MacroState['markets'] }) {
  if (!markets.length) {
    return (
      <div className="shrink-0 flex items-center border-b border-border-soft bg-surface/40 h-9 px-3" data-testid="macro-ticker">
        <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot mr-2" />
        <span className="text-[10px] tracking-[0.2em] text-fg-3">LIVE</span>
        <span className="ml-3 text-[11px] text-fg-3" data-testid="macro-ticker-empty">
          Waiting for first ingest…
        </span>
      </div>
    );
  }

  // Duplicate strip so translateX(-50%) loops without a gap.
  const strip = [...markets, ...markets];

  return (
    <div
      className="shrink-0 relative flex items-center h-9 border-b border-border-soft bg-surface/40 overflow-hidden"
      data-testid="macro-ticker"
    >
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-1.5 px-3 bg-gradient-to-r from-app via-app/95 to-transparent pr-8 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
        <span className="text-[10px] tracking-[0.2em] text-fg-3">LIVE</span>
      </div>

      <div className="flex items-center w-full overflow-hidden pl-16">
        <div
          className="macro-marquee-track flex items-center w-max"
          style={{ ['--marquee-dur' as string]: `${Math.max(28, markets.length * 6)}s` }}
        >
          {strip.map((m, i) => (
            <TickItem key={`${m.symbol}-${i}`} m={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
