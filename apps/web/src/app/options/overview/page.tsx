'use client';

// Options overview (G5): the priced move per expiry, gamma centre and flip,
// 25-delta skew, the term structure, the smile, and OI by strike and expiry.
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { ErrorCard, useLoad, usePoll } from '@/components/v6/copy/parts';
import { LineChart, MirrorBars } from '@/components/v6/options/charts';
import OptionsHead, { useOptionsCtx } from '@/components/v6/options/head';
import { daysLabel, expiryLabel, fmtCompact, fmtNum, fmtUsd, ivPct, optionsApi } from '@/lib/options-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/options.css';

export default function OptionsOverviewPage() {
  const [ctx, setCtx] = useOptionsCtx();
  const [expiry, setExpiry] = useState<string | null>(null);
  const [oiMode, setOiMode] = useState<'oi' | 'gex'>('oi');
  useEffect(() => { setExpiry(null); }, [ctx?.underlying, ctx?.env]);
  const o = useLoad(() => (ctx ? optionsApi.overview(ctx.env, ctx.underlying, expiry) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, expiry]);
  const ch = useLoad(() => (ctx && o.data?.expiry ? optionsApi.chain(ctx.env, ctx.underlying, o.data.expiry) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, o.data?.expiry]);
  usePoll(() => void o.reload(), 30_000, !!ctx);
  const d = o.data;
  const sel = d?.expiries.find((e) => e.code === d.expiry);
  // The strike window that matters: ±15 % of the index.
  const near = (k: number) => !!d && Math.abs(k / d.spot - 1) <= 0.15;
  const k0 = (v: number) => fmtNum(v, 0);
  const smile = ch.data ? ch.data.quotes.filter((q) => near(q.strike) && q.markIv != null) : [];
  return (
    <AppShell legacy={false} pageTitle="Options overview" pageSubtitle="What the options market is pricing">
      <div className="x-page op-page" data-testid="op-overview-page">
        {ctx && <OptionsHead ctx={ctx} setCtx={setCtx} spot={d?.spot} />}
        {o.error && !d ? <ErrorCard message={o.error} onRetry={o.reload} /> : !d ? <div className="x-skel" style={{ height: 520 }} /> : (
          <>
            <section className="op-strip" aria-label="Market" data-testid="op-ov-strip">
              <div><span>Gamma centre</span><b className="m">{d.gammaCentre == null ? '—' : k0(d.gammaCentre)}</b><small className="x-muted">where gamma × OI is concentrated</small></div>
              <div><span>Gamma flip</span><b className="m">{d.gammaFlip == null ? '—' : k0(d.gammaFlip)}</b><small className="x-muted">{d.gammaFlip == null ? 'no flip within ±30 %' : d.spot > d.gammaFlip ? 'index above: dealers long gamma' : 'index below: dealers short gamma'}</small></div>
              <div><span>Net gamma</span><b className={`m ${d.netGex >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(d.netGex, 0)}</b><small className="x-muted">per 1 % move, calls + / puts −</small></div>
              <div><span>Term slope</span><b className="m">{d.termSlope == null ? '—' : `${d.termSlope >= 0 ? '+' : '−'}${Math.abs(d.termSlope).toFixed(1)} vol`}</b><small className="x-muted">{d.termSlope == null ? '' : d.termSlope >= 0 ? 'later expiries cost more (contango)' : 'near-term fear (backwardation)'}</small></div>
              <div><span>Put/call OI</span><b className="m">{d.putCallOi == null ? '—' : d.putCallOi.toFixed(2)}</b><small className="x-muted">{fmtCompact(d.callOi)} calls · {fmtCompact(d.putOi)} puts</small></div>
            </section>

            <section className="x-card" aria-label="By expiry" data-testid="op-ov-expiries">
              <div className="x-ch"><h2>By expiry</h2><span className="x-sub">Expected move is the ATM straddle; ±1σ is from ATM IV</span></div>
              <div className="x-tblwrap">
                <table className="x-tbl op-tbl">
                  <thead><tr><th>Expiry</th><th className="r">ATM IV</th><th className="r">Expected move</th><th className="r">±1σ</th><th className="r">25Δ RR</th><th className="r">25Δ fly</th><th className="r">Max pain</th><th className="r">Calls OI</th><th className="r">Puts OI</th><th /></tr></thead>
                  <tbody>
                    {d.expiries.map((e) => (
                      <tr key={e.code} className={e.code === d.expiry ? 'is-sel' : ''}>
                        <td>{expiryLabel(e.expiry)} <span className="x-muted">{daysLabel(e.days)}</span></td>
                        <td className="r m">{ivPct(e.atmIv)}</td>
                        <td className="r m">{e.straddle == null ? '—' : `±${fmtUsd(e.straddle, 0)}`} <span className="x-muted">{e.straddle == null ? '' : `${((e.straddle / d.spot) * 100).toFixed(1)}%`}</span></td>
                        <td className="r m">{e.sigmaMove == null ? '—' : `±${fmtUsd(e.sigmaMove, 0)}`}</td>
                        <td className={`r m ${e.rr25 == null ? '' : e.rr25 >= 0 ? 'pos' : 'neg'}`}>{e.rr25 == null ? '—' : `${e.rr25 >= 0 ? '+' : '−'}${Math.abs(e.rr25 * 100).toFixed(1)}`}</td>
                        <td className="r m">{e.fly25 == null ? '—' : fmtNum(e.fly25 * 100, 1)}</td>
                        <td className="r m">{fmtNum(e.maxPain, 0)}</td>
                        <td className="r m">{fmtCompact(e.callOi)}</td>
                        <td className="r m">{fmtCompact(e.putOi)}</td>
                        <td><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setExpiry(e.code)} aria-pressed={e.code === d.expiry} data-testid={`op-ov-pick-${e.code}`}>{e.code === d.expiry ? 'Shown' : 'Show'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="ov-two">
              <section className="x-card" aria-label="Term structure">
                <div className="x-ch"><h2>Term structure</h2><span className="x-sub">ATM IV by days to expiry</span></div>
                <LineChart testId="op-ov-term" height={220} series={[{ key: 'atm', label: 'ATM IV', color: 'var(--sc-1)', points: d.term.filter((t) => t.atmIv != null).map((t) => [t.days, t.atmIv!] as [number, number]) }]}
                  xFmt={(x) => `${x.toFixed(x < 3 ? 1 : 0)}d`} yFmt={(y) => ivPct(y)} />
              </section>
              <section className="x-card" aria-label="Smile">
                <div className="x-ch"><h2>Smile</h2><span className="x-sub">{sel ? `${expiryLabel(sel.expiry)} · mark IV by strike` : ''}</span></div>
                <LineChart testId="op-ov-smile" height={220}
                  series={[
                    { key: 'calls', label: 'Calls', color: 'var(--g)', points: smile.filter((q) => q.kind === 'call').map((q) => [q.strike, q.markIv!] as [number, number]) },
                    { key: 'puts', label: 'Puts', color: 'var(--r)', points: smile.filter((q) => q.kind === 'put').map((q) => [q.strike, q.markIv!] as [number, number]) },
                  ]}
                  markers={[{ x: d.spot, label: 'Index' }]} xFmt={k0} yFmt={(y) => ivPct(y)} />
              </section>
            </div>

            <section className="x-card" aria-label="By strike" data-testid="op-ov-strikes">
              <div className="x-ch"><h2>{oiMode === 'oi' ? 'Open interest by strike' : 'Gamma by strike'}</h2>
                <span className="x-sub">{sel ? expiryLabel(sel.expiry) : ''}</span>
                <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Measure" style={{ marginLeft: 'auto' }}>
                  <button type="button" role="radio" aria-checked={oiMode === 'oi'} onClick={() => setOiMode('oi')} data-testid="op-ov-oi">OI</button>
                  <button type="button" role="radio" aria-checked={oiMode === 'gex'} onClick={() => setOiMode('gex')} data-testid="op-ov-gex">Gamma</button>
                </div>
              </div>
              <MirrorBars testId="op-ov-bars" height={240}
                rows={d.strikes.filter((r) => near(r.strike)).map((r) => (oiMode === 'oi' ? { x: r.strike, up: r.callOi, down: r.putOi } : { x: r.strike, up: Math.max(0, r.gex), down: Math.max(0, -r.gex) }))}
                upLabel={oiMode === 'oi' ? 'Calls' : 'Positive gamma'} downLabel={oiMode === 'oi' ? 'Puts' : 'Negative gamma'} xFmt={k0} yFmt={oiMode === 'oi' ? fmtCompact : (v) => fmtUsd(v, 0)}
                markers={[{ x: d.spot, label: 'Index' }, ...(sel?.maxPain ? [{ x: sel.maxPain, label: 'Max pain', color: 'var(--sc-1)' }] : []), ...(d.gammaCentre ? [{ x: d.gammaCentre, label: 'Gamma centre', color: 'var(--sc-2)' }] : [])]} />
            </section>

            <section className="x-card" aria-label="OI by expiry">
              <div className="x-ch"><h2>Open interest by expiry</h2><span className="x-sub">contracts</span></div>
              <MirrorBars testId="op-ov-exp-bars" height={200} rows={d.expiries.map((e) => ({ x: e.expiry, up: e.callOi, down: e.putOi }))} upLabel="Calls" downLabel="Puts" xFmt={(x) => expiryLabel(x)} yFmt={fmtCompact} />
            </section>
            <p className="x-muted op-fine">Gamma uses the usual convention that dealers hold the calls people buy and the puts they sell; it describes positioning, not a forecast.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
