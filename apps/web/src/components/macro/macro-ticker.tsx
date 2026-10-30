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

function TickItem({ m, hidden }: { m: MacroState['markets'][number]; hidden?: boolean }) {
  const c = m.changePct ?? 0;
  return (
    <span className="mc-tk-i" aria-hidden={hidden || undefined}>
      <b>{DISPLAY[m.symbol] ?? m.symbol}</b>
      <span className="m">{m.symbol === 'UST' ? `${m.price.toFixed(2)}%` : formatMacroNumber(m.price)}</span>
      <span className={`m ${c > 0 ? 'pos' : c < 0 ? 'neg' : 'x-muted'}`}>{m.changePct == null ? '—' : formatSignedPct(m.changePct)}</span>
    </span>
  );
}

/** Continuous right→left market tape (seamless loop; pauses on hover and for reduced motion). */
export default function MacroTicker({ markets }: { markets: MacroState['markets'] }) {
  return (
    <div className="mc-tk" data-testid="macro-ticker" aria-label="Market tape">
      <span className="mc-tk-live"><i className="x-dot" />Live</span>
      {markets.length === 0 ? <span className="mc-tk-empty" data-testid="macro-ticker-empty">Waiting for the first data ingest</span> : (
        <div className="mc-tk-scroll">
          <div className="mc-tk-track" style={{ ['--mc-dur' as string]: `${Math.max(30, markets.length * 7)}s` }}>
            {markets.map(m => <TickItem key={m.symbol} m={m} />)}
            {markets.map(m => <TickItem key={`${m.symbol}-2`} m={m} hidden />)}
          </div>
        </div>
      )}
    </div>
  );
}
