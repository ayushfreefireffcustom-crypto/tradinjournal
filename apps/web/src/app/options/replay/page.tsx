'use client';

// Expiry replay (G10): the builder's legs as paper trades, walked to their
// first expiry on a flat price (pure time decay) or on the index's own recent
// moves replayed from today. Scrub, play at three speeds, or melt to expiry.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, useLoad } from '@/components/v6/copy/parts';
import { LineChart } from '@/components/v6/options/charts';
import OptionsHead, { useOptionsCtx } from '@/components/v6/options/head';
import { ApiError } from '@/lib/copy-api';
import { daysLabel, expiryLabel, fmtNum, fmtUsd, loadLegs, optionsApi, saveLegs, type LegInput, type ReplayData } from '@/lib/options-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/options.css';

// A full replay takes about a minute at 1×, whatever its length.
const SPEEDS = [1, 4, 16] as const;
const QUICK: Array<[string, string]> = [['long_straddle', 'Long straddle'], ['short_strangle', 'Short strangle'], ['iron_condor', 'Iron condor']];
const tFmt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function OptionsReplayPage() {
  const toast = useToast();
  const [ctx, setCtx] = useOptionsCtx();
  const [legs, setLegs] = useState<LegInput[] | null>(null);
  const [path, setPath] = useState<'flat' | 'recorded'>('flat');
  const [r, setR] = useState<ReplayData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const base = useLoad(() => (ctx ? optionsApi.chain(ctx.env, ctx.underlying) : Promise.resolve(null)), [ctx?.env, ctx?.underlying]);

  useEffect(() => {
    if (!ctx) return;
    const s = loadLegs();
    setLegs(s && s.underlying === ctx.underlying && s.env === ctx.env ? s.legs : []);
  }, [ctx?.underlying, ctx?.env]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx || !legs?.length) { setR(null); return; }
    let live = true;
    setErr(null); setPlaying(false);
    optionsApi.replay({ env: ctx.env, underlying: ctx.underlying, legs, path }).then(
      (d) => { if (live) { setR(d); setI(0); } },
      (e) => { if (live) { setR(null); setErr(e instanceof ApiError ? e.message : 'Could not replay these legs.'); } },
    );
    return () => { live = false; };
  }, [ctx, legs, path]);
  const n = r?.replay.frames.length ?? 0;
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || !n) return;
    timer.current = setInterval(() => setI((k) => { if (k >= n - 1) { setPlaying(false); return k; } return k + 1; }), Math.max(16, 60_000 / Math.max(1, n) / speed));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, n]);

  async function quick(id: string) {
    if (!ctx || !base.data) return;
    const exp = base.data.expiries.find((e) => e.days >= 2)?.code ?? base.data.expiry;
    try { const l = await optionsApi.template({ env: ctx.env, underlying: ctx.underlying, template: id, expiry: exp, qty: 1 }); saveLegs({ underlying: ctx.underlying, env: ctx.env, legs: l }); setLegs(l); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not build that'); }
  }

  const f = r?.replay.frames[Math.min(i, n - 1)];
  const left = r && f ? (r.replay.end - f.t) / 86_400_000 : 0;
  const k0 = (v: number) => fmtNum(v, 0);
  return (
    <AppShell legacy={false} pageTitle="Expiry replay" pageSubtitle="Paper legs walked to expiry">
      <div className="x-page op-page" data-testid="op-replay-page">
        {ctx && <OptionsHead ctx={ctx} setCtx={setCtx} spot={r?.spot ?? base.data?.spot} />}
        {legs && !legs.length ? (
          <div className="x-card x-empty" data-testid="op-replay-empty">
            <b>Nothing to replay yet</b>
            <p>Build a position in the <Link className="x-link" href="/options/builder">builder</Link>, or start from one of these.</p>
            <div className="op-leg-add">{QUICK.map(([id, l]) => <button key={id} type="button" className="x-btn x-btn--sm" onClick={() => void quick(id)} disabled={!base.data} data-testid={`op-rq-${id}`}>{l}</button>)}</div>
          </div>
        ) : err ? <ErrorCard message={err} /> : !r || !f ? <div className="x-skel" style={{ height: 520 }} /> : (
          <>
            <section className="x-card op-rp-ctl" aria-label="Replay controls" data-testid="op-rp-ctl">
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Price path">
                <button type="button" role="radio" aria-checked={path === 'flat'} onClick={() => setPath('flat')} data-testid="op-rp-flat">Price stays put</button>
                <button type="button" role="radio" aria-checked={path === 'recorded'} onClick={() => setPath('recorded')} data-testid="op-rp-recorded">Recorded moves</button>
              </div>
              <button type="button" className="x-btn x-btn--sm x-btn--hi" onClick={() => { if (i >= n - 1) setI(0); setPlaying((p) => !p); }} data-testid="op-rp-play">{playing ? 'Pause' : i >= n - 1 ? 'Replay' : 'Play'}</button>
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Speed">{SPEEDS.map((s) => <button key={s} type="button" role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} data-testid={`op-rp-x${s}`}>{s}×</button>)}</div>
              <button type="button" className="x-btn x-btn--sm" onClick={() => { setPlaying(false); setI(n - 1); }} data-testid="op-rp-melt">Melt to expiry</button>
              <input type="range" className="op-rp-scrub" min={0} max={n - 1} step={1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Time" data-testid="op-rp-scrub" />
              <span className="x-muted op-fine">{r.path === 'recorded' && r.recorded ? `${r.underlying}'s moves from ${tFmt(r.recorded.from)} to ${tFmt(r.recorded.to)}, replayed from today's price and fitted to the time left.` : 'Price held at today’s index: only time moves.'}</span>
            </section>
            <section className="op-strip" aria-label="Now in the replay" data-testid="op-rp-strip">
              <div><span>Time</span><b className="m">{tFmt(f.t)}</b><small className="x-muted">{left > 0.01 ? `${daysLabel(left)} to expiry` : 'at expiry'}</small></div>
              <div><span>Index</span><b className="m">{fmtNum(f.spot, 1)}</b><small className="x-muted">{`${f.spot >= r.spot ? '+' : '−'}${Math.abs((f.spot / r.spot - 1) * 100).toFixed(2)}%`}</small></div>
              <div><span>P&amp;L</span><b className={`m ${f.pnl >= 0 ? 'pos' : 'neg'}`} data-testid="op-rp-pnl">{fmtUsd(f.pnl)}</b></div>
              <div><span>Delta · Theta</span><b className="m">{fmtNum(f.greeks.delta, 4)} · {fmtUsd(f.greeks.theta)}/d</b></div>
              <div><span>±1σ so far</span><b className="m">{f.band ? `${k0(f.band.lo)}–${k0(f.band.hi)}` : '—'}</b></div>
            </section>
            <div className="ov-two">
              <section className="x-card" aria-label="Payoff now">
                <div className="x-ch"><h2>Payoff</h2><span className="x-sub">now vs at expiry</span></div>
                <LineChart testId="op-rp-payoff" height={260} zero fillZero="now"
                  series={[
                    { key: 'now', label: 'Now', color: 'var(--sc-2)', points: r.replay.grid.map((s, k) => [s, f.curve[k]!] as [number, number]) },
                    { key: 'exp', label: 'At expiry', color: 'var(--tx)', dashed: true, width: 1.2, points: r.replay.grid.map((s, k) => [s, r.replay.expiryCurve[k]!] as [number, number]) },
                  ]}
                  markers={[{ x: f.spot, label: 'Index', color: 'var(--sc-1)' }, ...(f.band ? [{ x: f.band.lo, label: '−1σ', color: 'var(--dim)' }, { x: f.band.hi, label: '+1σ', color: 'var(--dim)' }] : [])]}
                  xFmt={k0} yFmt={(v) => fmtUsd(v, 0)} />
              </section>
              <section className="x-card" aria-label="Path">
                <div className="x-ch"><h2>Path and P&amp;L</h2></div>
                <LineChart testId="op-rp-path" height={120} cursorX={f.t}
                  series={[
                    { key: 'spot', label: 'Index', color: 'var(--sc-1)', points: r.replay.frames.slice(0, i + 1).map((x) => [x.t, x.spot] as [number, number]) },
                    { key: 'hi', label: '+1σ', color: 'var(--dim)', dashed: true, width: 1, points: r.replay.frames.filter((x) => x.band).map((x) => [x.t, x.band!.hi] as [number, number]) },
                    { key: 'lo', label: '−1σ', color: 'var(--dim)', dashed: true, width: 1, points: r.replay.frames.filter((x) => x.band).map((x) => [x.t, x.band!.lo] as [number, number]) },
                  ]}
                  xFmt={tFmt} yFmt={k0} />
                <LineChart testId="op-rp-pnlchart" height={120} zero cursorX={f.t}
                  series={[{ key: 'pnl', label: 'P&L', color: f.pnl >= 0 ? 'var(--g)' : 'var(--r)', points: r.replay.frames.slice(0, i + 1).map((x) => [x.t, x.pnl] as [number, number]) }]}
                  xFmt={tFmt} yFmt={(v) => fmtUsd(v, 0)} yDomain={[Math.min(...r.replay.frames.map((x) => x.pnl)), Math.max(...r.replay.frames.map((x) => x.pnl))]} />
              </section>
            </div>
            <section className="x-card" aria-label="Legs">
              <div className="x-ch"><h2>Paper legs</h2><Link className="x-link" href="/options/builder">Edit in the builder</Link></div>
              <div className="x-tblwrap">
                <table className="x-tbl op-tbl" data-testid="op-rp-legs">
                  <thead><tr><th>Leg</th><th className="r">Entry</th><th className="r">Now</th><th className="r">P&amp;L</th></tr></thead>
                  <tbody>{r.legs.map((l, k) => {
                    const pnl = l.side * l.qty * r.contractValue * (f.values[k]! - l.price);
                    return <tr key={k}><td className="m">{l.side > 0 ? 'Buy' : 'Sell'} {l.qty} {l.symbol ?? `${r.underlying} future`}{l.expiry ? <span className="x-muted"> · {expiryLabel(l.expiry)}</span> : null}</td><td className="r m">{fmtNum(l.price, 1)}</td><td className="r m">{fmtNum(f.values[k]!, 1)}</td><td className={`r m ${pnl >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(pnl)}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <p className="x-muted op-fine">Paper only: priced with Black-Scholes at each leg’s IV from when you built it, so IV changes aren’t replayed.</p>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
