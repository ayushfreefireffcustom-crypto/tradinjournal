'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/app-shell';
import { Loader } from '@/components/loader';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import CountUp from '@/components/macro/count-up';
import { macroApi, type MacroState } from '@/lib/macro-api';
import { biasTone, formatSignedPct } from '@/lib/macro-format';

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
const REF_NOTE: Record<string, string> = { SPX: 'Ref · SPY', NDX: 'Ref · QQQ', OIL: 'Ref · USO', UST: 'Ref · TLT', DXY: 'Ref · ICE' };
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
  const fmtPrice = (n: number) => (symbol === 'UST' ? `${n.toFixed(2)}%` : n.toLocaleString('en-US', { minimumFractionDigits: n >= 1000 ? 1 : 2, maximumFractionDigits: n >= 1000 ? 1 : 2 }));

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} crumbParent="Macro" pageTitle={name}>
      {loading ? (
        <div className="mc-load"><Loader label="Loading asset" /></div>
      ) : (
        <div className="v3-page ma" data-testid="macro-asset-page">
          <header className="ma-head">
            <Link href="/macro" className="v3-link">‹ Macro</Link><span className="sl">/</span>
            <h1>{name} <span>{TICK[symbol] ?? symbol}</span></h1>
            {REF_NOTE[symbol] && <span className="v3-pill v" title="Charted via a reference instrument">{REF_NOTE[symbol]}</span>}
          </header>

          {error && <div className="d-err" role="alert"><span>{error}</span></div>}
          {!bias && !error && <div className="v3-card d-empty"><b>Unknown asset “{symbol}”</b>Open an asset from the macro bias grid.</div>}

          {bias && (
            <>
              <section className="v3-card ma-hero">
                <div>
                  <span className="mc-lbl">Bias score</span>
                  <div className="ma-big"><b className={`num ${tone === 'bull' ? 'lg' : tone === 'bear' ? 'sh' : ''}`}><CountUp value={Math.round(bias.score)} suffix="%" duration={1000} /></b><span>{strength(bias.score)}</span></div>
                  <div className="ma-bar"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, bias.score))}%` }} /></div>
                </div>
                <div>
                  <span className="mc-lbl">Last price</span>
                  {quote ? (
                    <>
                      <div className="ma-big"><b className="num">{fmtPrice(quote.price)}</b>
                        {quote.changePct != null && <span className={`num ${quote.changePct >= 0 ? 'lg' : 'sh'}`}>{quote.changePct >= 0 ? '▲' : '▼'} {formatSignedPct(quote.changePct)}</span>}</div>
                      <p className="ma-sub num">Updated {new Date(quote.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</p>
                    </>
                  ) : <div className="ma-big"><b className="mute">—</b><span className="mute">Quote pending</span></div>}
                </div>
              </section>

              <section className="v3-card ma-ev" aria-labelledby="ma-ev-t">
                <h3 id="ma-ev-t" className="mc-lbl">Evidence</h3>
                <div className="ma-chips">
                  {bias.supporting.length === 0 && bias.opposing.length === 0 && <span className="mute">No factor breakdown yet.</span>}
                  {bias.supporting.map(x => <span key={`+${x}`} className="v3-pill g">+ {x}</span>)}
                  {bias.opposing.map(x => <span key={`-${x}`} className="v3-pill r">− {x}</span>)}
                </div>
              </section>

              {tv && (
                <section className="v3-card ma-chart" data-testid="macro-asset-tv">
                  <div className="v3-ch"><h3>Chart <span>· {TICK[symbol] ?? symbol} · 1h</span></h3><span className="mute" style={{ fontSize: 13.5 }}>TradingView · free embed</span></div>
                  <iframe title={`${name} chart`} loading="lazy"
                    src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(tv)}&interval=60&theme=dark&style=1&locale=en&hideideas=1&hidetoptoolbar=1&hidesidetoolbar=1&toolbarbg=0F0F0F&backgroundColor=0F0F0F`} />
                </section>
              )}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
