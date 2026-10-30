'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import CountUp from '@/components/macro/count-up';
import { macroApi, type MacroState } from '@/lib/macro-api';
import { biasTone, formatSignedPct } from '@/lib/macro-format';
import { BiasTag, IChevronL, ScoreTrack, useDocTheme } from '@/components/v6/macro/ui';
import MacroCompliance from '@/components/v6/macro/compliance';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold',
  XAG: 'Silver',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude oil',
  DXY: 'US dollar',
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

const TICK: Record<string, string> = { XAU: 'XAUUSD', XAG: 'XAGUSD', BTC: 'BTCUSD', ETH: 'ETHUSD', SOL: 'SOLUSD', SPX: 'SPX', NDX: 'NDX', OIL: 'WTI', DXY: 'DXY', UST: 'US10Y' };
// Reference instruments are proxies (ETFs/indices) rather than the exact asset.
const REF_NOTE: Record<string, string> = { SPX: 'Ref SPY', NDX: 'Ref QQQ', OIL: 'Ref USO', UST: 'Ref TLT', DXY: 'Ref ICE' };
// TradingView embed palette per app theme (matches the card surface tokens).
const TV_BG = { dark: 'rgba(19,19,19,1)', light: 'rgba(255,255,255,1)' } as const;
function strength(score: number): string {
  if (score >= 70) return 'Strongly bullish';
  if (score >= 60) return 'Moderately bullish';
  if (score >= 55) return 'Mildly bullish';
  if (score > 45) return 'Neutral';
  if (score > 40) return 'Mildly bearish';
  if (score > 30) return 'Moderately bearish';
  return 'Strongly bearish';
}

export default function MacroAssetPage() {
  const { accounts, selected, select } = useAccounts();
  const params = useParams<{ symbol: string }>();
  const symbol = (params?.symbol ?? '').toUpperCase();
  const [state, setState] = useState<MacroState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const theme = useDocTheme();

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
  const tv = TV_SYMBOL[symbol];
  const name = NAMES[symbol] ?? symbol;
  const tick = TICK[symbol] ?? symbol;
  const fmtPrice = (n: number) => (symbol === 'UST' ? `${n.toFixed(2)}%` : n.toLocaleString('en-US', { minimumFractionDigits: n >= 1000 ? 1 : 2, maximumFractionDigits: n >= 1000 ? 1 : 2 }));
  const bg = encodeURIComponent(TV_BG[theme]);

  const subtitle = (
    <>
      <span className="m">{tick}</span>
      {REF_NOTE[symbol] && <span className="x-tag" title="Charted via a reference instrument">{REF_NOTE[symbol]}</span>}
    </>
  );

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle={name} pageSubtitle={subtitle}
      actions={<Link href="/macro" className="x-btn"><IChevronL />Macro</Link>}>
      {loading ? (
        <div className="mc mc-asset" role="status" aria-label="Loading asset">
          <div className="x-skel mc-sk-hero" />
          <div className="x-skel mc-sk-wide" />
        </div>
      ) : (
        <div className="mc mc-asset" data-testid="macro-asset-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
          {!bias && !error && (
            <div className="x-card x-empty">
              <b>Unknown asset “{symbol}”</b>
              <p>Open an asset from the macro bias grid.</p>
              <Link href="/macro" className="x-btn x-btn--hi">Back to macro</Link>
            </div>
          )}

          {bias && (
            <>
              <section className="x-card mc-ah">
                <div className="mc-ah-c">
                  <span className="x-label">Bias score</span>
                  <div className="mc-big">
                    <b className={tone === 'bull' ? 'pos' : tone === 'bear' ? 'neg' : ''}><CountUp value={Math.round(bias.score)} suffix="%" duration={1000} /></b>
                    <BiasTag tone={tone} />
                  </div>
                  <p className="mc-ah-s">{strength(bias.score)}</p>
                  <ScoreTrack score={bias.score} tone={tone} />
                  <div className="mc-scale-ax"><span>Bearish</span><span>Neutral <b className="m">45–55</b></span><span>Bullish</span></div>
                </div>
                <div className="mc-ah-c">
                  <span className="x-label">Last price</span>
                  {quote ? (
                    <>
                      <div className="mc-big">
                        <b>{fmtPrice(quote.price)}</b>
                        {quote.changePct != null && <span className={`x-tag x-tag--m ${quote.changePct > 0 ? 'x-tag--g' : quote.changePct < 0 ? 'x-tag--r' : ''}`}>{formatSignedPct(quote.changePct)}</span>}
                      </div>
                      <p className="mc-ah-s">Updated <span className="m">{new Date(quote.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}</span> UTC</p>
                    </>
                  ) : <div className="mc-big"><b className="x-dim">—</b><span className="x-muted">Quote pending</span></div>}
                </div>
              </section>

              <section className="x-card" aria-labelledby="mc-ev-t">
                <div className="x-ch"><h2 id="mc-ev-t">Evidence</h2><span className="x-sub">factors behind the score</span></div>
                {bias.supporting.length === 0 && bias.opposing.length === 0 ? <p className="x-muted mc-p">No factor breakdown yet.</p> : (
                  <div className="mc-evd">
                    <div><span className="x-label">Supporting</span><div className="mc-tags">{bias.supporting.length ? bias.supporting.map(x => <span key={`+${x}`} className="x-tag x-tag--g">+ {x}</span>) : <span className="x-dim">None</span>}</div></div>
                    <div><span className="x-label">Opposing</span><div className="mc-tags">{bias.opposing.length ? bias.opposing.map(x => <span key={`-${x}`} className="x-tag x-tag--r">− {x}</span>) : <span className="x-dim">None</span>}</div></div>
                  </div>
                )}
              </section>

              {tv && (
                <section className="x-card mc-tv" data-testid="macro-asset-tv">
                  <div className="x-ch"><h2>Chart</h2><span className="x-sub"><span className="m">{tick}</span> · 1h</span><span className="x-r">TradingView embed</span></div>
                  <iframe key={theme} title={`${name} chart`} loading="lazy"
                    src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tv)}&interval=60&theme=${theme}&style=1&locale=en&hideideas=1&hidetoptoolbar=1&hidesidetoolbar=1&toolbarbg=${bg}&backgroundColor=${bg}`} />
                </section>
              )}
            </>
          )}
          <MacroCompliance />
        </div>
      )}
    </AppShell>
  );
}
