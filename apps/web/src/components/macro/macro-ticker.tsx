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
export default function MacroTicker({ markets, asOf }: { markets: MacroState['markets']; asOf?: string | null }) {
  // "Live" only when the quotes are fresh; otherwise say how old they are.
  const age = asOf ? Date.now() - new Date(asOf).getTime() : Infinity;
  const live = age < 2 * 3600_000;
  // Enough copies that one pass is wider than the screen, so the loop never shows a gap.
  const reps = Math.max(1, Math.ceil(8 / Math.max(1, markets.length)));
  const pass = Array.from({ length: reps }, () => markets).flat();
  return (
    <div className="mc-tk" data-testid="macro-ticker" aria-label="Market tape">
      <span className={`mc-tk-live ${live ? '' : 'mc-tk-stale'}`}><i className="x-dot" />{live ? 'Live' : asOf ? `As of ${new Date(asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Waiting'}</span>
      {markets.length === 0 ? <span className="mc-tk-empty" data-testid="macro-ticker-empty">Waiting for the first data ingest</span> : (
        <div className="mc-tk-scroll">
          <div className="mc-tk-track" style={{ ['--mc-dur' as string]: `${Math.max(30, pass.length * 7)}s` }}>
            {pass.map((m, i) => <TickItem key={`${m.symbol}-a${i}`} m={m} hidden={i >= markets.length} />)}
            {pass.map((m, i) => <TickItem key={`${m.symbol}-b${i}`} m={m} hidden />)}
          </div>
        </div>
      )}
    </div>
  );
}
