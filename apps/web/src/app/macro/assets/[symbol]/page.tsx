'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CaretLeft } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { LoadingScreen } from '@/components/loader';
import CountUp from '@/components/macro/count-up';
import RefBadge from '@/components/macro/ref-badge';
import { macroApi, type MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel, formatMacroNumber, formatSignedPct } from '@/lib/macro-format';

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

const TV_SYMBOL: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  XAU: 'OANDA:XAUUSD',
  XAG: 'OANDA:XAGUSD',
  SPX: 'AMEX:SPY',
  NDX: 'NASDAQ:QQQ',
  OIL: 'AMEX:USO',
  DXY: 'TVC:DXY',
  UST: 'AMEX:TLT',
};

const REF = new Set(['SPX', 'NDX', 'OIL', 'UST', 'DXY']);

export default function MacroAssetPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? '').toUpperCase();
  const [state, setState] = useState<MacroState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    macroApi
      .state()
      .then(setState)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const bias = state?.bias.find(b => b.asset === symbol);
  const quote = state?.markets.find(m => m.symbol.toUpperCase() === symbol);
  const tone = bias ? biasTone(bias.label) : 'neutral';
  const toneCls = tone === 'bull' ? 'text-profit' : tone === 'bear' ? 'text-loss' : 'text-fg-3';
  const tv = TV_SYMBOL[symbol];
  const changeTone =
    quote?.changePct == null ? 'text-fg-3' : quote.changePct >= 0 ? 'text-profit' : 'text-loss';

  return (
    <AppShell pageTitle={NAMES[symbol] ?? symbol} pageSubtitle="// ASSET DEEP DIVE">
      {loading ? (
        <LoadingScreen label="Loading asset" />
      ) : (
        <div
          className="px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5 max-w-[1200px] mx-auto space-y-2.5 sm:space-y-3"
          data-testid="macro-asset-page"
        >
          {/* Compact header */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/macro"
              className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-fg-3 hover:text-fg tracking-[0.12em] focus-ring rounded px-1 py-1 -ml-1"
            >
              <CaretLeft size={14} weight="bold" />
              <span className="hidden xs:inline sm:inline">MACRO</span>
            </Link>
            <div className="h-3 w-px bg-border-soft shrink-0" />
            <h1 className="font-display font-black text-lg sm:text-2xl tracking-tight truncate flex items-center gap-2 min-w-0">
              <span className="truncate">{NAMES[symbol] ?? symbol}</span>
              <span className="text-[11px] sm:text-[12px] font-medium text-fg-3 tracking-wide shrink-0">
                {symbol}
              </span>
              {REF.has(symbol) && <RefBadge />}
            </h1>
          </div>

          {error && <div className="tcard p-3 text-loss text-sm">{error}</div>}

          {!bias && !error && (
            <div className="tcard p-4 text-sm text-fg-3">
              Unknown asset “{symbol}”. Open an asset from the macro bias grid.
            </div>
          )}

          {bias && (
            <>
              {/* Hero: bias + price side-by-side on every width */}
              <div className="tcard p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  <div className="min-w-0 border-r border-border-soft pr-3 sm:pr-6">
                    <div className="text-[9px] sm:text-[10px] tracking-[0.16em] text-fg-3">BIAS SCORE</div>
                    <div className={`numeric text-2xl sm:text-4xl font-display font-black mt-1 leading-none ${toneCls}`}>
                      <CountUp value={bias.score} suffix="%" duration={1000} />
                    </div>
                    <div className={`text-[11px] sm:text-[13px] font-medium mt-1.5 ${toneCls}`}>
                      {formatBiasLabel(bias.label)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] sm:text-[10px] tracking-[0.16em] text-fg-3">LAST PRICE</div>
                    {quote ? (
                      <>
                        <div className="numeric text-2xl sm:text-4xl font-display font-black mt-1 leading-none text-fg">
                          {formatMacroNumber(quote.price)}
                        </div>
                        <div className={`text-[11px] sm:text-[13px] font-medium mt-1.5 numeric ${changeTone}`}>
                          {quote.changePct == null ? '—' : formatSignedPct(quote.changePct)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="numeric text-2xl sm:text-4xl font-display font-black mt-1 leading-none text-fg-3">
                          —
                        </div>
                        <div className="text-[11px] text-fg-3 mt-1.5">Quote pending</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Evidence as chips — wraps cleanly on narrow screens */}
              <div className="tcard p-3 sm:p-4">
                <div className="text-[9px] sm:text-[10px] tracking-[0.16em] text-fg-3 mb-2">
                  // EVIDENCE
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bias.supporting.length === 0 && bias.opposing.length === 0 && (
                    <span className="text-[12px] text-fg-3">No factor breakdown yet.</span>
                  )}
                  {bias.supporting.map(s => (
                    <span
                      key={`+${s}`}
                      className="text-[10px] sm:text-[11px] px-2 py-1 rounded border border-profit/25 bg-profit/10 text-profit"
                    >
                      + {s}
                    </span>
                  ))}
                  {bias.opposing.map(s => (
                    <span
                      key={`-${s}`}
                      className="text-[10px] sm:text-[11px] px-2 py-1 rounded border border-loss/25 bg-loss/10 text-loss"
                    >
                      − {s}
                    </span>
                  ))}
                </div>
              </div>

              {tv && (
                <div className="tcard p-0 overflow-hidden" data-testid="macro-asset-tv">
                  <div className="px-3 py-1.5 sm:py-2 border-b border-border-soft text-[10px] tracking-[0.16em] text-fg-3 flex items-center justify-between">
                    <span>// TRADINGVIEW</span>
                    <span className="hidden sm:inline">free embed</span>
                  </div>
                  <iframe
                    title={`${symbol} chart`}
                    src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tv)}&interval=60&theme=dark&style=1&locale=en&hideideas=1&hidetoptoolbar=0&hidesidetoolbar=1`}
                    className="w-full border-0 h-[min(58vh,420px)] sm:h-[min(62vh,520px)] lg:h-[min(68vh,640px)] min-h-[320px]"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
