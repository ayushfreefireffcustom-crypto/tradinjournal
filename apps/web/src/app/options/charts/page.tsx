'use client';

// Options charts (G9): the rolling at-the-money straddle, a strangle's
// premium, and open interest across several strikes, for one expiry.
// Single-contract charts (price, mark, IV, OI) live in the contract panel.
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { ErrorCard, useLoad } from '@/components/v6/copy/parts';
import { LineChart } from '@/components/v6/options/charts';
import OptionsHead, { useOptionsCtx } from '@/components/v6/options/head';
import { daysLabel, expiryLabel, fmtNum, fmtUsd, optionsApi, type Resolution } from '@/lib/options-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/options.css';

const RANGES: Array<[Resolution, number, string]> = [['15m', 1, '1D'], ['1h', 3, '3D'], ['1h', 7, '7D']];
const COLORS = ['var(--sc-1)', 'var(--sc-2)', 'var(--sc-3)', 'var(--sc-4)', 'var(--g)'];
const tFmt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function OptionsChartsPage() {
  const [ctx, setCtx] = useOptionsCtx();
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [range, setRange] = useState(1);
  const [put, setPut] = useState<number | null>(null);
  const [call, setCall] = useState<number | null>(null);
  const [oiKind, setOiKind] = useState<'call' | 'put'>('call');
  const [oiStrikes, setOiStrikes] = useState<number[]>([]);
  useEffect(() => { setExpiry(undefined); setPut(null); setCall(null); setOiStrikes([]); }, [ctx?.underlying, ctx?.env]);
  const ch = useLoad(() => (ctx ? optionsApi.chain(ctx.env, ctx.underlying, expiry) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, expiry]);
  const d = ch.data;
  const strikes = d ? [...new Set(d.quotes.map((q) => q.strike))].sort((a, b) => a - b) : [];
  const nearK = (target: number) => strikes.reduce((a, k) => (Math.abs(k - target) < Math.abs(a - target) ? k : a), strikes[0] ?? 0);
  // Defaults: a ~5 % strangle and the 5 strikes around the money.
  useEffect(() => {
    if (!d || !strikes.length) return;
    if (put == null || !strikes.includes(put)) setPut(nearK(d.spot * 0.95));
    if (call == null || !strikes.includes(call)) setCall(nearK(d.spot * 1.05));
    if (!oiStrikes.length || oiStrikes.some((k) => !strikes.includes(k))) { const i = strikes.indexOf(nearK(d.spot)); setOiStrikes(strikes.slice(Math.max(0, i - 2), i + 3)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  const [res, days] = [RANGES[range]![0], RANGES[range]![1]];
  const straddle = useLoad(() => (ctx && d ? optionsApi.premium(ctx.env, ctx.underlying, d.expiry, res, days) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, d?.expiry, res, days]);
  const strangle = useLoad(() => (ctx && d && put != null && call != null && put <= call ? optionsApi.premium(ctx.env, ctx.underlying, d.expiry, res, days, { put, call }) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, d?.expiry, res, days, put, call]);
  const oi = useLoad(async () => {
    if (!ctx || !d || !oiStrikes.length) return null;
    return Promise.all(oiStrikes.map(async (k) => ({ k, candles: (await optionsApi.candles(ctx.env, `${oiKind === 'call' ? 'C' : 'P'}-${ctx.underlying}-${k}-${d.expiry}`, 'oi', res, days)).candles })));
  }, [ctx?.env, ctx?.underlying, d?.expiry, res, days, oiKind, oiStrikes.join(',')]);

  return (
    <AppShell legacy={false} pageTitle="Options charts" pageSubtitle="Premium and open interest over time">
      <div className="x-page op-page" data-testid="op-charts-page">
        {ctx && <OptionsHead ctx={ctx} setCtx={setCtx} spot={d?.spot} />}
        {ch.error && !d ? <ErrorCard message={ch.error} onRetry={ch.reload} /> : !d ? <div className="x-skel" style={{ height: 520 }} /> : (
          <>
            <div className="op-chart-bar">
              <div className="op-exps" role="tablist" aria-label="Expiry">{d.expiries.map((e) => <button key={e.code} type="button" role="tab" aria-selected={d.expiry === e.code} onClick={() => setExpiry(e.code)} data-testid={`op-ch-exp-${e.code}`}><b>{expiryLabel(e.expiry)}</b><span className="x-muted">{daysLabel(e.days)}</span></button>)}</div>
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Range">{RANGES.map(([, , l], i) => <button key={l} type="button" role="radio" aria-checked={range === i} onClick={() => setRange(i)} data-testid={`op-ch-r-${l}`}>{l}</button>)}</div>
            </div>
            <section className="x-card" aria-label="Rolling ATM straddle" data-testid="op-ch-straddle">
              <div className="x-ch"><h2>Rolling ATM straddle</h2><span className="x-sub">call + put marks at the strike nearest the index, each bar</span></div>
              {straddle.error ? <p className="cp-err">{straddle.error}</p> : !straddle.data ? <div className="x-skel" style={{ height: 240 }} /> : (
                <LineChart testId="op-ch-straddle-chart" height={240}
                  series={[{ key: 'premium', label: 'Straddle', color: 'var(--sc-1)', points: straddle.data.points.map((p) => [p.t, p.premium] as [number, number]) }]}
                  xFmt={tFmt} yFmt={(v) => fmtUsd(v, 0)} empty="No marks for this expiry in this range" />
              )}
              {straddle.data?.points.length ? <p className="x-muted op-fine">Now {fmtUsd(straddle.data.points.at(-1)!.premium, 0)} at strike {fmtNum(straddle.data.points.at(-1)!.callStrike, 0)}, or ±{((straddle.data.points.at(-1)!.premium / straddle.data.points.at(-1)!.spot) * 100).toFixed(2)}% of the index.</p> : null}
            </section>
            <section className="x-card" aria-label="Strangle premium" data-testid="op-ch-strangle">
              <div className="x-ch"><h2>Strangle premium</h2>
                <label className="op-inline">Put <select className="x-input" value={put ?? ''} onChange={(e) => setPut(Number(e.target.value))} data-testid="op-ch-put">{strikes.filter((k) => k <= d.spot * 1.02).map((k) => <option key={k} value={k}>{fmtNum(k, 0)}</option>)}</select></label>
                <label className="op-inline">Call <select className="x-input" value={call ?? ''} onChange={(e) => setCall(Number(e.target.value))} data-testid="op-ch-call">{strikes.filter((k) => k >= d.spot * 0.98).map((k) => <option key={k} value={k}>{fmtNum(k, 0)}</option>)}</select></label>
              </div>
              {strangle.error ? <p className="cp-err">{strangle.error}</p> : !strangle.data ? <div className="x-skel" style={{ height: 220 }} /> : (
                <LineChart testId="op-ch-strangle-chart" height={220}
                  series={[{ key: 'premium', label: `${fmtNum(put, 0)} put + ${fmtNum(call, 0)} call`, color: 'var(--sc-3)', points: strangle.data.points.map((p) => [p.t, p.premium] as [number, number]) }]}
                  xFmt={tFmt} yFmt={(v) => fmtUsd(v, 0)} empty="No marks for these strikes in this range" />
              )}
            </section>
            <section className="x-card" aria-label="Open interest by strike over time" data-testid="op-ch-oi">
              <div className="x-ch"><h2>Open interest across strikes</h2>
                <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Side"><button type="button" role="radio" aria-checked={oiKind === 'call'} onClick={() => setOiKind('call')}>Calls</button><button type="button" role="radio" aria-checked={oiKind === 'put'} onClick={() => setOiKind('put')} data-testid="op-ch-oi-puts">Puts</button></div>
              </div>
              <div className="op-chips" role="group" aria-label="Strikes (up to 5)">
                {strikes.filter((k) => Math.abs(k / d.spot - 1) <= 0.08).map((k) => {
                  const on = oiStrikes.includes(k);
                  return <button key={k} type="button" className={`x-chip ${on ? 'is-on' : ''}`} aria-pressed={on} disabled={!on && oiStrikes.length >= 5} onClick={() => setOiStrikes(on ? oiStrikes.filter((x) => x !== k) : [...oiStrikes, k].sort((a, b) => a - b))} data-testid={`op-ch-k-${k}`}>{fmtNum(k, 0)}</button>;
                })}
              </div>
              {oi.error ? <p className="cp-err">{oi.error}</p> : !oi.data ? <div className="x-skel" style={{ height: 240 }} /> : (
                <LineChart testId="op-ch-oi-chart" height={240}
                  series={oi.data.map((s, i) => ({ key: String(s.k), label: fmtNum(s.k, 0), color: COLORS[i % COLORS.length]!, points: s.candles.filter((c) => c.c != null).map((c) => [c.t, c.c! / d.contractValue] as [number, number]) }))}
                  xFmt={tFmt} yFmt={(v) => fmtNum(v, 0)} empty="Pick strikes" />
              )}
              <p className="x-muted op-fine">In contracts.</p>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
