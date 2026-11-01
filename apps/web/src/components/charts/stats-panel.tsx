'use client';

// Symbol deep-dive stats beside the chart (E12): returns, realised volatility,
// drawdown, up days, beta and correlation with BTC, liquidity and funding.
import { useEffect, useState } from 'react';
import { useLoad } from '@/components/v6/copy/parts';
import { fmtPct, fmtUsd, hubApi, toneOf } from '@/lib/hub-api';

function Countdown({ at }: { at: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((at - now) / 1000));
  return <span className="m">{Math.floor(s / 3600)}h {String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m {String(s % 60).padStart(2, '0')}s</span>;
}

export default function StatsPanel({ symbol }: { symbol: string }) {
  const st = useLoad(() => hubApi.stats(symbol), [symbol]);
  const s = st.data;
  const row = (label: string, value: React.ReactNode, hint?: string) => <div className="mk-st-row" title={hint}><span>{label}</span><span>{value}</span></div>;
  return (
    <section className="x-card mk-st" aria-label="Symbol stats" data-testid="stats-panel">
      <div className="mk-pt-hd"><b>Stats</b><span className="x-muted">{symbol}</span></div>
      {st.error ? <p className="x-muted mk-pt-msg">{st.error}</p> : !s ? <div className="x-skel" style={{ height: 160 }} /> : (
        <>
          <div className="mk-st-ret" data-testid="stats-returns">
            {([['7D', s.returns.d7], ['30D', s.returns.d30], ['90D', s.returns.d90], ['YTD', s.returns.ytd]] as const).map(([k, v]) => (
              <div key={k}><span className="x-muted">{k}</span><b className={`m ${toneOf(v)}`}>{fmtPct(v, 1)}</b></div>
            ))}
          </div>
          {row('Realised vol (30d)', <span className="m">{s.realisedVol30 == null ? '—' : `${s.realisedVol30.toFixed(1)}%`}</span>, 'Annualised standard deviation of daily returns')}
          {row('Max drawdown (90d)', <span className="m neg">{s.maxDrawdown90 == null ? '—' : `${s.maxDrawdown90.toFixed(1)}%`}</span>, 'Worst fall from a high')}
          {row('Up days (90d)', <span className="m">{s.upDayRatio90 == null ? '—' : `${Math.round(s.upDayRatio90 * 100)}%`}</span>)}
          {s.symbol !== 'BTCUSDT' && row(`Beta / corr vs ${s.benchmark}`, <span className="m">{s.beta90 == null ? '—' : s.beta90.toFixed(2)} / {s.corr90 == null ? '—' : s.corr90.toFixed(2)}</span>, 'Over the last 90 days of daily returns')}
          {s.volume24h != null && row('24h volume', <span className="m">{fmtUsd(s.volume24h)}</span>)}
          {s.funding && (
            <>
              {row('Funding (next)', <span className={`m ${toneOf(s.funding.funding)}`}>{s.funding.funding == null ? '—' : `${s.funding.funding > 0 ? '+' : ''}${s.funding.funding.toFixed(4)}%`}</span>, `Every ${s.funding.fundingIntervalH}h on Bybit perpetuals`)}
              {s.funding.nextFundingTime != null && row('Next funding in', <Countdown at={s.funding.nextFundingTime} />)}
              {s.funding.oiValue != null && row('Open interest', <span className="m">{fmtUsd(s.funding.oiValue)}</span>)}
            </>
          )}
          <p className="mk-pt-note">Daily closes{s.crypto ? '' : ' (trading days)'}, {s.bars} bars.</p>
        </>
      )}
    </section>
  );
}
