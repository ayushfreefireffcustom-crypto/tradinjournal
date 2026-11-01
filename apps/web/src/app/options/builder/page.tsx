'use client';

// Multi-leg builder (G6–G8): templates, legs, the payoff at expiry and at a
// chosen date with a target-price slider, the summary numbers and the
// analysis panel. Legs are priced at the mark unless a price is typed.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, useLoad } from '@/components/v6/copy/parts';
import { LineChart } from '@/components/v6/options/charts';
import OptionsHead, { useOptionsCtx } from '@/components/v6/options/head';
import OrderPanel from '@/components/v6/options/order-panel';
import { ApiError } from '@/lib/copy-api';
import {
  daysLabel, expiryLabel, fmtCompact, fmtNum, fmtUsd, ivPct, loadLegs, optionsApi, saveLegs,
  type Analysis, type ChainData, type LegInput, type TemplateInfo,
} from '@/lib/options-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/options.css';

const CATS: Array<[TemplateInfo['categories'][number], string]> = [['popular', 'Popular'], ['bullish', 'Bullish'], ['bearish', 'Bearish'], ['neutral', 'Neutral'], ['hedging', 'Hedging']];
const FILL: Record<string, string> = { easy: 'Easy', ok: 'Fair', hard: 'Thin', no_quote: 'No quote' };

/** Chains by expiry code, fetched as legs need them. */
function useChains(env: string | undefined, und: string | undefined, codes: string[]) {
  const [map, setMap] = useState<Record<string, ChainData>>({});
  const key = `${env}|${und}`;
  const last = useRef(key);
  useEffect(() => { if (last.current !== key) { last.current = key; setMap({}); } }, [key]);
  useEffect(() => {
    if (!env || !und) return;
    for (const c of codes) if (!map[c]) optionsApi.chain(env as 'live' | 'testnet', und, c).then((d) => setMap((m) => ({ ...m, [c]: d })), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, codes.join(',')]);
  return map;
}

export default function OptionsBuilderPage() {
  const toast = useToast();
  const [ctx, setCtx] = useOptionsCtx();
  const [legs, setLegs] = useState<LegInput[]>([]);
  const [cat, setCat] = useState<TemplateInfo['categories'][number]>('popular');
  const [tplExpiry, setTplExpiry] = useState<string | undefined>(undefined);
  const [tplQty, setTplQty] = useState(1);
  const [dayOffset, setDayOffset] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [a, setA] = useState<Analysis | null>(null);
  const [aErr, setAErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  // Which underlying and source the legs on screen belong to (saving uses this, not ctx, so a switch can't write one market's legs under another).
  const [legsFor, setLegsFor] = useState<{ underlying: string; env: 'live' | 'testnet' } | null>(null);
  const tpls = useLoad(() => optionsApi.templates(), []);
  const base = useLoad(() => (ctx ? optionsApi.chain(ctx.env, ctx.underlying) : Promise.resolve(null)), [ctx?.env, ctx?.underlying]);

  // Legs saved for this underlying and source (from the chain's Buy/Sell too).
  useEffect(() => {
    if (!ctx) return;
    const s = loadLegs();
    setLegs(s && s.underlying === ctx.underlying && s.env === ctx.env ? s.legs : []);
    setLegsFor({ underlying: ctx.underlying, env: ctx.env });
    setDayOffset(0); setTarget(null); setA(null);
  }, [ctx?.underlying, ctx?.env]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (legsFor) saveLegs({ ...legsFor, legs }); }, [legs, legsFor]);
  useEffect(() => { if (base.data && !tplExpiry) setTplExpiry(base.data.expiries.find((e) => e.days >= 5)?.code ?? base.data.expiry); }, [base.data, tplExpiry]);

  const codes = useMemo(() => [...new Set(legs.filter((l) => l.kind !== 'future' && l.expiry).map((l) => l.expiry!))], [legs]);
  const chains = useChains(ctx?.env, ctx?.underlying, codes);
  const firstExp = a ? Math.min(...a.legs.filter((l) => l.expiry).map((l) => l.expiry!)) : null;
  const maxDays = firstExp && a ? Math.max(0, Math.floor((firstExp - a.asOf) / 86_400_000)) : 0;
  const at = a && dayOffset > 0 ? a.asOf + dayOffset * 86_400_000 : undefined;

  // Re-analyse after edits settle.
  useEffect(() => {
    if (!ctx) return;
    const ready = legs.length && legs.every((l) => l.kind === 'future' || (l.strike && l.expiry));
    if (!ready) { setA(null); setAErr(null); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      setBusy(true);
      optionsApi.analyze({ env: ctx.env, underlying: ctx.underlying, legs, at }).then(
        (r) => { if (n === seq.current) { setA(r); setAErr(null); } },
        (e) => { if (n === seq.current) setAErr(e instanceof ApiError ? e.message : 'Could not analyse these legs.'); },
      ).finally(() => { if (n === seq.current) setBusy(false); });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(legs), ctx?.env, ctx?.underlying, at]);

  const setLeg = (i: number, patch: Partial<LegInput>) => setLegs((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const strikesFor = (code?: string) => (code && chains[code] ? [...new Set(chains[code]!.quotes.map((q) => q.strike))].sort((x, y) => x - y) : []);
  const addOption = () => {
    const d = base.data;
    if (!d) return;
    const code = tplExpiry ?? d.expiry;
    const ks = code === d.expiry ? [...new Set(d.quotes.map((q) => q.strike))] : strikesFor(code);
    const k = ks.reduce((x, y) => (Math.abs(y - d.spot) < Math.abs(x - d.spot) ? y : x), ks[0] ?? d.stats.atmStrike ?? 0);
    setLegs((ls) => [...ls, { kind: 'call', side: 1, qty: 1, strike: k || undefined, expiry: code } as LegInput].slice(0, 8));
  };
  async function applyTemplate(t: TemplateInfo) {
    if (!ctx || !tplExpiry) return;
    try { setLegs(await optionsApi.template({ env: ctx.env, underlying: ctx.underlying, template: t.id, expiry: tplExpiry, qty: tplQty })); setDayOffset(0); setTarget(null); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not build that template'); }
  }

  // Readout at the target price, interpolated from the payoff curve.
  const readAt = (s: number, key: 'expiry' | 'now') => {
    const p = a?.payoff ?? [];
    if (!p.length) return null;
    const i = p.findIndex((x) => x.s >= s);
    if (i <= 0) return p[0]![key];
    const x0 = p[i - 1]!;
    const x1 = p[i]!;
    return x0[key] + ((x1[key] - x0[key]) * (s - x0.s)) / (x1.s - x0.s);
  };
  const tgt = target ?? a?.spot ?? null;
  const lo = a?.payoff[0]?.s ?? 0;
  const hi = a?.payoff.at(-1)?.s ?? 0;
  const s = a?.summary;
  const units = a?.contractValue ?? 0;
  const k0 = (v: number) => fmtNum(v, 0);

  return (
    <AppShell legacy={false} pageTitle="Options builder" pageSubtitle="Combine legs, see the payoff and what you’re taking on">
      <div className="x-page op-page" data-testid="op-builder-page">
        {ctx && <OptionsHead ctx={ctx} setCtx={setCtx} spot={a?.spot ?? base.data?.spot} />}
        {base.error && !base.data ? <ErrorCard message={base.error} onRetry={base.reload} /> : !base.data ? <div className="x-skel" style={{ height: 520 }} /> : (
          <div className="op-bcols">
            <div className="op-bleft">
              <section className="x-card" aria-label="Templates" data-testid="op-templates">
                <div className="x-ch"><h2>Templates</h2></div>
                <div className="x-seg x-seg--in x-seg--sm op-cats" role="tablist" aria-label="Category">{CATS.map(([c, l]) => <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} data-testid={`op-cat-${c}`}>{l}</button>)}</div>
                <div className="op-tpl-opts">
                  <label className="op-inline">Expiry <select className="x-input" value={tplExpiry ?? ''} onChange={(e) => setTplExpiry(e.target.value)} data-testid="op-tpl-expiry">{base.data.expiries.map((e) => <option key={e.code} value={e.code}>{expiryLabel(e.expiry)} · {daysLabel(e.days)}</option>)}</select></label>
                  <label className="op-inline">Contracts <input className="x-input m op-qty" type="number" min={1} max={100000} value={tplQty} onChange={(e) => setTplQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} data-testid="op-tpl-qty" /></label>
                </div>
                <div className="op-tpls">{(tpls.data ?? []).filter((t) => t.categories.includes(cat)).map((t) => (
                  <button key={t.id} type="button" className="op-tpl" onClick={() => void applyTemplate(t)} title={t.about} data-testid={`op-tpl-${t.id}`}><b>{t.name}</b><span className="x-muted">{t.about}</span></button>
                ))}</div>
              </section>
              <section className="x-card" aria-label="Legs" data-testid="op-legs">
                <div className="x-ch"><h2>Legs</h2><span className="x-sub">{legs.length}/8</span>{legs.length > 0 && <button type="button" className="x-btn x-btn--sm x-btn--ghost" style={{ marginLeft: 'auto' }} onClick={() => setLegs([])} data-testid="op-clear">Clear</button>}</div>
                {!legs.length && <p className="x-muted">Pick a template, add a leg, or press Buy / Sell on a contract in the chain.</p>}
                {legs.map((l, i) => {
                  const ks = strikesFor(l.expiry);
                  const res = a?.legs[i];
                  return (
                    <div key={i} className="op-leg" data-testid={`op-leg-${i}`}>
                      <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Side">
                        <button type="button" role="radio" aria-checked={l.side === 1} onClick={() => setLeg(i, { side: 1 })} className={l.side === 1 ? 'op-on-buy' : ''}>Buy</button>
                        <button type="button" role="radio" aria-checked={l.side === -1} onClick={() => setLeg(i, { side: -1 })} className={l.side === -1 ? 'op-on-sell' : ''} data-testid={`op-leg-${i}-sell`}>Sell</button>
                      </div>
                      <select className="x-input" value={l.kind} onChange={(e) => setLeg(i, e.target.value === 'future' ? { kind: 'future', strike: undefined, expiry: undefined, price: undefined } : { kind: e.target.value as 'call' | 'put', expiry: l.expiry ?? base.data!.expiry, strike: l.strike ?? base.data!.stats.atmStrike ?? undefined, price: undefined })} aria-label="Type" data-testid={`op-leg-${i}-kind`}>
                        <option value="call">Call</option><option value="put">Put</option><option value="future">Future</option>
                      </select>
                      {l.kind !== 'future' ? (
                        <>
                          <select className="x-input" value={l.expiry ?? ''} onChange={(e) => setLeg(i, { expiry: e.target.value, price: undefined })} aria-label="Expiry" data-testid={`op-leg-${i}-expiry`}>{base.data!.expiries.map((e) => <option key={e.code} value={e.code}>{expiryLabel(e.expiry)}</option>)}</select>
                          <select className="x-input m" value={l.strike ?? ''} onChange={(e) => setLeg(i, { strike: Number(e.target.value), price: undefined })} aria-label="Strike" data-testid={`op-leg-${i}-strike`}>
                            {!ks.includes(l.strike ?? -1) && l.strike != null && <option value={l.strike}>{k0(l.strike)}</option>}
                            {ks.map((k) => <option key={k} value={k}>{k0(k)}</option>)}
                          </select>
                        </>
                      ) : <span className="x-muted op-leg-fut">at the index</span>}
                      <input className="x-input m op-qty" type="number" min={1} value={l.qty} onChange={(e) => setLeg(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} aria-label="Contracts" data-testid={`op-leg-${i}-qty`} />
                      <input className="x-input m op-price" type="number" min={0} step="any" placeholder={res ? fmtNum(res.mark ?? res.price, 1) : 'mark'} value={l.price ?? ''} onChange={(e) => setLeg(i, { price: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} aria-label="Price (blank = mark)" data-testid={`op-leg-${i}-price`} />
                      <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setLegs((ls) => ls.filter((_, k) => k !== i))} aria-label={`Remove leg ${i + 1}`} data-testid={`op-leg-${i}-rm`}>✕</button>
                      {res && <span className="op-leg-info x-muted m">{res.symbol ?? 'Future'} · {fmtNum(res.price, 1)}{res.iv != null ? ` · IV ${ivPct(res.iv)}` : ''}</span>}
                    </div>
                  );
                })}
                <div className="op-leg-add">
                  <button type="button" className="x-btn x-btn--sm" onClick={addOption} disabled={legs.length >= 8} data-testid="op-add-leg">Add option</button>
                  <button type="button" className="x-btn x-btn--sm" onClick={() => setLegs((ls) => [...ls, { kind: 'future', side: 1, qty: 1 } as LegInput].slice(0, 8))} disabled={legs.length >= 8} data-testid="op-add-future">Add future</button>
                </div>
              </section>
            </div>
            <div className="op-bright">
              <section className="x-card" aria-label="Payoff" data-testid="op-payoff">
                <div className="x-ch"><h2>Payoff</h2>{busy && <span className="x-muted" data-testid="op-busy">Updating…</span>}</div>
                {aErr ? <p className="cp-err" data-testid="op-analyze-err">{aErr}</p> : !a ? <div className="op-empty x-muted">Add legs to see the payoff.</div> : (
                  <>
                    <LineChart testId="op-payoff-chart" height={300} zero fillZero="expiry"
                      series={[
                        { key: 'expiry', label: 'At expiry', color: 'var(--tx)', points: a.payoff.map((p) => [p.s, p.expiry] as [number, number]) },
                        { key: 'now', label: dayOffset ? `In ${dayOffset}d` : 'Today', color: 'var(--sc-2)', dashed: true, points: a.payoff.map((p) => [p.s, p.now] as [number, number]) },
                      ]}
                      markers={[{ x: a.spot, label: 'Index' }, ...a.summary.breakevens.filter((b) => b >= lo && b <= hi).map((b) => ({ x: b, label: `BE ${k0(b)}`, color: 'var(--sc-1)' })), ...(a.sigma ? [{ x: a.sigma.lo, label: '−1σ', color: 'var(--dim)' }, { x: a.sigma.hi, label: '+1σ', color: 'var(--dim)' }] : []), ...(tgt != null ? [{ x: tgt, label: 'Target', color: 'var(--sc-3)' }] : [])]}
                      xFmt={k0} yFmt={(v) => fmtUsd(v, 0)} />
                    <div className="op-sliders">
                      <label>Target price <b className="m" data-testid="op-target-v">{k0(tgt ?? 0)}</b> <span className="x-muted">({tgt ? `${tgt >= a.spot ? '+' : '−'}${Math.abs((tgt / a.spot - 1) * 100).toFixed(1)}%` : ''})</span>
                        <input type="range" min={lo} max={hi} step={(hi - lo) / 200 || 1} value={tgt ?? a.spot} onChange={(e) => setTarget(Number(e.target.value))} data-testid="op-target" />
                      </label>
                      <label>Date <b className="m" data-testid="op-date-v">{dayOffset ? new Date(a.asOf + dayOffset * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Today'}</b> <span className="x-muted">{maxDays ? `of ${maxDays}d to expiry` : ''}</span>
                        <input type="range" min={0} max={Math.max(0, maxDays)} step={1} value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))} disabled={!maxDays} data-testid="op-date" />
                      </label>
                    </div>
                    {tgt != null && <p className="op-target-read" data-testid="op-target-read">At {k0(tgt)}: <b className={`m ${(readAt(tgt, 'now') ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(readAt(tgt, 'now'))}</b> {dayOffset ? `in ${dayOffset}d` : 'today'} · <b className={`m ${(readAt(tgt, 'expiry') ?? 0) >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(readAt(tgt, 'expiry'))}</b> at expiry</p>}
                  </>
                )}
              </section>
              {a && s && (
                <>
                  <section className="op-strip" aria-label="Summary" data-testid="op-summary">
                    <div><span>{s.netPremium >= 0 ? 'Premium paid' : 'Premium received'}</span><b className="m">{fmtUsd(Math.abs(s.netPremium))}</b></div>
                    <div><span>Max profit</span><b className="m pos">{s.maxProfit == null ? 'Unlimited' : fmtUsd(s.maxProfit)}</b></div>
                    <div><span>Max loss</span><b className="m neg">{s.maxLoss == null ? 'Unlimited' : fmtUsd(s.maxLoss)}</b></div>
                    <div><span>Reward / risk</span><b className="m">{s.riskReward == null ? '—' : `${s.riskReward.toFixed(2)}×`}</b></div>
                    <div><span>Chance of profit</span><b className="m">{s.probProfit == null ? '—' : `${(s.probProfit * 100).toFixed(0)}%`}</b><small className="x-muted">{a.vol ? `at ${ivPct(a.vol)} IV` : ''}</small></div>
                    <div><span>Breakevens</span><b className="m">{s.breakevens.length ? s.breakevens.map(k0).join(' · ') : '—'}</b></div>
                  </section>
                  <section className="x-card" aria-label="Greeks and margin" data-testid="op-greeks">
                    <div className="op-greeks op-greeks--wide">
                      <span>Delta <b className="m">{fmtNum(s.greeks.delta, 4)}</b> {a.underlying}</span>
                      <span>Gamma <b className="m">{s.greeks.gamma.toExponential(2)}</b></span>
                      <span>Theta <b className={`m ${s.greeks.theta >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(s.greeks.theta)}</b>/day</span>
                      <span>Vega <b className="m">{fmtUsd(s.greeks.vega)}</b>/vol</span>
                    </div>
                    <p className="x-muted op-fine">Contracts are {units} {a.underlying} each. Margin: {s.maxLoss == null ? 'this has unlimited risk; Delta sets the margin when you place it.' : s.netPremium > 0 && s.maxLoss != null && Math.abs(s.maxLoss + s.netPremium) < 1e-6 ? `the premium paid, ${fmtUsd(s.netPremium)}.` : `at least the max loss, ${fmtUsd(-s.maxLoss)}; Delta confirms the exact amount when you place it.`}</p>
                  </section>
                  <section className="x-card" aria-label="Analysis" data-testid="op-analysis">
                    <div className="x-ch"><h2>Analysis</h2></div>
                    <div className="op-kv op-kv--4">
                      <div><span>Premium at risk</span><b className="m">{fmtUsd(a.analysis.premiumAtRisk)}</b></div>
                      <div><span>Decay per day</span><b className={`m ${(a.analysis.decayPerDayPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{a.analysis.decayPerDayPct == null ? '—' : `${a.analysis.decayPerDayPct >= 0 ? '+' : '−'}${Math.abs(a.analysis.decayPerDayPct).toFixed(2)}%`}</b><small className="x-muted">{a.analysis.decayPerDayPct == null ? '' : a.analysis.decayPerDayPct >= 0 ? 'earned from time' : 'paid for time'}</small></div>
                      <div><span>To breakeven</span><b className="m">{a.analysis.toBreakevenPct == null ? '—' : `${a.analysis.toBreakevenPct >= 0 ? '+' : '−'}${Math.abs(a.analysis.toBreakevenPct).toFixed(2)}%`}</b></div>
                      <div><span>Net gamma exposure</span><b className="m">{fmtUsd(s.greeks.gamma * a.spot * a.spot * 0.01, 2)}</b><small className="x-muted">per 1 % move</small></div>
                    </div>
                    {a.analysis.legs.length > 0 && (
                      <div className="x-tblwrap">
                        <table className="x-tbl op-tbl" data-testid="op-analysis-legs">
                          <thead><tr><th>Contract</th><th>Fill</th><th className="r">Spread</th><th className="r">At touch</th><th>Price vs smile</th><th className="r">Δ-weighted OI</th><th className="r">Gamma at strike</th></tr></thead>
                          <tbody>{a.analysis.legs.map((l, i) => (
                            <tr key={i}>
                              <td className="m">{l.symbol}</td>
                              <td><span className={`x-tag ${l.fill === 'easy' ? 'x-tag--g' : l.fill === 'hard' || l.fill === 'no_quote' ? 'x-tag--r' : ''}`}>{FILL[l.fill]}</span></td>
                              <td className="r m">{l.spreadPct == null ? '—' : `${l.spreadPct.toFixed(1)}%`}</td>
                              <td className="r m">{fmtCompact(l.topSize)}</td>
                              <td>{l.richCheap == null ? '—' : <><span className={`x-tag ${l.richCheap === 'rich' ? 'x-tag--r' : l.richCheap === 'cheap' ? 'x-tag--g' : ''}`}>{l.richCheap === 'rich' ? 'Rich' : l.richCheap === 'cheap' ? 'Cheap' : 'Fair'}</span> <span className="m x-muted">{Math.abs(l.ivEdge!) < 0.05 ? '' : l.ivEdge! > 0 ? '+' : '−'}{Math.abs(l.ivEdge!).toFixed(1)} vol</span></>}</td>
                              <td className="r m">{fmtCompact(l.deltaWeightedOi)}</td>
                              <td className={`r m ${l.gexAtStrike == null ? '' : l.gexAtStrike >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(l.gexAtStrike, 0)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                    <p className="x-muted op-fine">Fill: spread and size at the best price against this leg’s size. Price vs smile: this contract’s IV against the curve through its neighbours. Chance of profit assumes a lognormal move at the ATM IV; it isn’t a forecast. <Link className="x-link" href="/options/replay">Replay it to expiry</Link>.</p>
                  </section>
                </>
              )}
              {ctx && legs.length > 0 && <OrderPanel ctx={ctx} setCtx={setCtx} legs={legs} />}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
