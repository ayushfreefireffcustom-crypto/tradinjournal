'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatMacroNumber, formatSignedPct } from '@/lib/macro-format';


const DISPLAY: Record<string, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  SOL: 'SOL/USD',
  XAU: 'XAUUSD',
  XAG: 'XAG/USD',
  SPX: 'SPX',
  NDX: 'NDX',
  OIL: 'WTI',
  DXY: 'DXY',
  UST: 'US10Y',
};

function TickItem({ m }: { m: MacroState['markets'][number] }) {
  const c = m.changePct ?? 0;
  return (
    <span className="mt-item">
      <b>{DISPLAY[m.symbol] ?? m.symbol}</b>
      <span className="num">{m.symbol === 'UST' ? `${m.price.toFixed(2)}%` : formatMacroNumber(m.price)}</span>
      <span className={`num ${c > 0 ? 'up' : c < 0 ? 'dn' : ''}`}>{m.changePct == null ? '—' : formatSignedPct(m.changePct)}</span>
    </span>
  );
}

/** Continuous right→left marquee (seamless loop; pauses on hover). */
export default function MacroTicker({ markets }: { markets: MacroState['markets'] }) {
  const strip = [...markets, ...markets];
  return (
    <div className="mt" data-testid="macro-ticker" aria-label="Market tape">
      <span className="mt-live"><i />Live</span>
      {markets.length === 0 ? <span className="mt-empty" data-testid="macro-ticker-empty">Waiting for first ingest…</span> : (
        <div className="mt-viewport"><div className="mt-track" style={{ ['--mt-dur' as string]: `${Math.max(30, markets.length * 7)}s` }}>
          {strip.map((m, i) => <TickItem key={`${m.symbol}-${i}`} m={m} />)}
        </div></div>
      )}
    </div>
  );
}
