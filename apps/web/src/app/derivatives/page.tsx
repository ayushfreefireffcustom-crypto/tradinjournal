'use client';

// Derivatives (E11, E17): funding, open interest, long/short and squeezes for
// USDT perpetuals (Bybit public data), with what changed since your last look.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import { fmtPct, fmtPrice, fmtUsd, hubApi, toneOf, type DerivRow, type SqueezeKind } from '@/lib/hub-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import Freshness from '@/components/v6/ui/freshness';

const SNAP_KEY = 'tradelogs.derivatives.snapshot';
interface Snapshot { at: number; rows: Record<string, { f: number | null; oi: number | null }> }
const readSnap = (): Snapshot | null => { try { const s = localStorage.getItem(SNAP_KEY); return s ? JSON.parse(s) as Snapshot : null; } catch { return null; } };
const writeSnap = (rows: DerivRow[]) => { try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), rows: Object.fromEntries(rows.map(r => [r.symbol, { f: r.funding, oi: r.oiValue }])) })); } catch { /* ignore */ } };

const SQUEEZE: Record<SqueezeKind, { label: string; hint: string; tone: string }> = {
  short_squeeze: { label: 'Short squeeze', hint: 'Price up while open interest fell: shorts closing', tone: 'x-tag--g' },
  long_squeeze: { label: 'Long squeeze', hint: 'Price down while open interest fell: longs closing', tone: 'x-tag--r' },
  long_build: { label: 'Longs building', hint: 'Price and open interest both up', tone: '' },
  short_build: { label: 'Shorts building', hint: 'Price down while open interest rose', tone: '' },
};
const fmtFunding = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(4)}%`);
const ago = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
function countdown(t: number | null, now: number) {
  if (t == null) return '—';
  const s = Math.max(0, Math.round((t - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

type SortKey = 'turnover' | 'funding' | 'annualised' | 'oi' | 'oiChange' | 'long' | 'change';
const SORT: Record<SortKey, (r: DerivRow) => number | null> = {
  turnover: r => r.turnover24h, funding: r => r.funding, annualised: r => r.annualised, oi: r => r.oiValue, oiChange: r => r.oiChange24h, long: r => r.longRatio, change: r => r.change24h,
};

export default function DerivativesPage() {
  const d = useLoad(() => hubApi.derivatives(), []);
  usePoll(() => void d.reload(), 5 * 60_000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  // Your previous visit's numbers, read once; this visit's are saved as you leave.
  const prev = useRef<Snapshot | null | undefined>(undefined);
  if (prev.current === undefined && typeof window !== 'undefined') prev.current = readSnap();
  const latest = useRef<DerivRow[]>([]);
  useEffect(() => { if (d.data?.rows.length) latest.current = d.data.rows; }, [d.data]);
  useEffect(() => {
    const save = () => { if (latest.current.length) writeSnap(latest.current); };
    window.addEventListener('pagehide', save);
    return () => { save(); window.removeEventListener('pagehide', save); };
  }, []);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'turnover', dir: -1 });
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const list = (d.data?.rows ?? []).filter(r => !q.trim() || r.base.includes(q.trim().toUpperCase()));
    const get = SORT[sort.key];
    return [...list].sort((a, b) => { const x = get(a); const y = get(b); if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; return (x - y) * sort.dir; });
  }, [d.data, sort, q]);
  const data = d.data;
  const snap = prev.current;
  const delta = (r: DerivRow) => {
    const p = snap?.rows[r.symbol];
    if (!p) return null;
    return { f: p.f != null && r.funding != null ? r.funding - p.f : null, oi: p.oi && r.oiValue != null ? (r.oiValue / p.oi - 1) * 100 : null };
  };
  const head = (key: SortKey, label: string) => (
    <th className="r"><button type="button" className={`sc-sort ${sort.key === key ? 'on' : ''}`} onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} data-testid={`dv-sort-${key}`}>{label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></th>
  );

  return (
    <AppShell legacy={false} pageTitle="Derivatives" pageSubtitle={<>Funding, open interest and positioning across USDT perpetuals {d.data && <> · <Freshness at={d.data.asOf} /></>}</>}>
      <div className="x-page dv" data-testid="dv-page">
        {d.error ? <ErrorCard message={d.error} onRetry={d.reload} /> : !data ? <div className="x-skel" style={{ height: 420 }} /> : !data.source ? (
          <div className="x-card x-empty" data-testid="dv-down"><b>No derivatives data right now</b><p>{data.note}</p><button className="x-btn" onClick={() => void d.reload()}>Try again</button></div>
        ) : (
          <>
            <section className="ov-kpis" aria-label="Totals">
              <div className="x-card ov-kpi" data-testid="dv-oi"><div className="ov-kpi-h">Open interest · top {data.rows.length}</div><div className="ov-kpi-v"><b className="m">{fmtUsd(data.totals.oiValue)}</b></div><div className="ov-kpi-s">Value of open positions</div></div>
              <div className="x-card ov-kpi" data-testid="dv-funding"><div className="ov-kpi-h">Average funding</div><div className="ov-kpi-v"><b className={`m ${toneOf(data.totals.weightedFunding)}`}>{fmtFunding(data.totals.weightedFunding)}</b></div><div className="ov-kpi-s">Per period, weighted by open interest{data.totals.weightedFunding != null ? ` · ${fmtPct(data.totals.weightedFunding * 3 * 365, 1)} a year` : ''}</div></div>
              <div className="x-card ov-kpi" data-testid="dv-positive"><div className="ov-kpi-h">Longs paying shorts</div><div className="ov-kpi-v"><b className="m">{data.totals.positiveShare == null ? '—' : `${Math.round(data.totals.positiveShare * 100)}%`}</b> of contracts</div><div className="ov-kpi-s">Positive funding means longs pay shorts</div></div>
            </section>
            {snap && <p className="cp-fine" data-testid="dv-since">Changes in the table are since your last look, {ago(Date.now() - snap.at)} ago.</p>}

            <div className="ov-two">
              <section className="x-card" aria-label="Squeezes" data-testid="dv-squeezes">
                <div className="x-ch"><h2>Squeezes and builds</h2><span className="x-sub">Price and open interest over 24h, top {data.detailFor} by volume</span></div>
                {(() => {
                  const sq = data.rows.filter(r => r.squeeze).sort((a, b) => Math.abs(b.oiChange24h ?? 0) - Math.abs(a.oiChange24h ?? 0));
                  return !sq.length ? <p className="x-muted dv-none">Nothing big right now: no move of 2% in price with 3% in open interest.</p> : (
                    <ul className="ov-movers dv-list">
                      {sq.map(r => <li key={r.symbol} title={SQUEEZE[r.squeeze!].hint}><b>{r.base}</b><span className={`x-tag ${SQUEEZE[r.squeeze!].tone}`}>{SQUEEZE[r.squeeze!].label}</span><span className="m"><span className={toneOf(r.change24h)}>{fmtPct(r.change24h, 1)}</span> · OI <span className={toneOf(r.oiChange24h)}>{fmtPct(r.oiChange24h, 1)}</span></span></li>)}
                    </ul>
                  );
                })()}
              </section>
              <section className="x-card" aria-label="Funding extremes" data-testid="dv-extremes">
                <div className="x-ch"><h2>Funding extremes</h2><span className="x-sub">Next funding, per period</span></div>
                {(() => {
                  const f = data.rows.filter(r => r.funding != null).sort((a, b) => b.funding! - a.funding!);
                  const hi = f.slice(0, 5);
                  const lo = f.slice(-5).reverse();
                  const li = (r: DerivRow) => <li key={r.symbol}><b>{r.base}</b><span className="m x-muted">{fmtPct(r.annualised, 0)} / yr</span><span className={`m ${toneOf(r.funding)}`}>{fmtFunding(r.funding)}</span></li>;
                  return <div className="dv-ext"><div><div className="ov-macro-h">Highest: longs pay most</div><ul className="ov-movers">{hi.map(li)}</ul></div><div><div className="ov-macro-h">Lowest: shorts pay most</div><ul className="ov-movers">{lo.map(li)}</ul></div></div>;
                })()}
              </section>
            </div>

            <section className="x-card" aria-label="Open interest leaders" data-testid="dv-oi-leaders">
              <div className="x-ch"><h2>Open interest leaders</h2></div>
              <div className="dv-bars">
                {(() => {
                  const top = [...data.rows].filter(r => r.oiValue).sort((a, b) => b.oiValue! - a.oiValue!).slice(0, 10);
                  const max = top[0]?.oiValue ?? 1;
                  return top.map(r => (
                    <div key={r.symbol} className="dv-bar">
                      <b>{r.base}</b>
                      <span className="dv-bar-t"><i style={{ width: `${(r.oiValue! / max) * 100}%` }} /></span>
                      <span className="m">{fmtUsd(r.oiValue)}</span>
                      <span className={`m ${toneOf(r.oiChange24h)}`}>{r.oiChange24h == null ? '—' : fmtPct(r.oiChange24h, 1)}</span>
                      <span className="m x-muted">{r.longRatio == null ? '—' : `${Math.round(r.longRatio * 100)}% long`}</span>
                    </div>
                  ));
                })()}
              </div>
            </section>

            <section className="x-card" aria-label="All perpetuals">
              <div className="x-ch"><h2>All perpetuals</h2><input className="x-input dv-q" placeholder="Filter, e.g. SOL" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter pairs" data-testid="dv-q" /></div>
              <div className="x-tblwrap">
                <table className="x-tbl trd-tbl sc-tbl" data-testid="dv-table">
                  <thead><tr>
                    <th>Pair</th><th className="r">Price</th>{head('change', '24h')}{head('funding', 'Next funding')}<th className="r">Last</th>{head('annualised', 'Per year')}<th className="r">Next in</th>{head('oi', 'Open interest')}{head('oiChange', 'OI 24h')}{head('long', 'Long')}<th className="r">Since last look</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => {
                      const dl = delta(r);
                      return (
                        <tr key={r.symbol} data-testid={`dv-row-${r.base}`}>
                          <td><Link className="x-link" href={`/charts?symbol=${r.base.replace(/^1000/, '')}USDT&tf=1h`}><b>{r.base}</b></Link><span className="x-muted sc-quote">-PERP</span></td>
                          <td className="r m" data-label="Price">{fmtPrice(r.price)}</td>
                          <td className={`r m ${toneOf(r.change24h)}`} data-label="24h">{fmtPct(r.change24h)}</td>
                          <td className={`r m ${toneOf(r.funding)}`} data-label="Next funding">{fmtFunding(r.funding)}</td>
                          <td className={`r m ${toneOf(r.lastFunding)}`} data-label="Last">{fmtFunding(r.lastFunding)}</td>
                          <td className={`r m ${toneOf(r.annualised)}`} data-label="Per year">{fmtPct(r.annualised, 1)}</td>
                          <td className="r m" data-label="Next in">{countdown(r.nextFundingTime, now)}{r.fundingIntervalH !== 8 ? <span className="x-muted"> · {r.fundingIntervalH}h</span> : null}</td>
                          <td className="r m" data-label="Open interest">{fmtUsd(r.oiValue)}</td>
                          <td className={`r m ${toneOf(r.oiChange24h)}`} data-label="OI 24h">{fmtPct(r.oiChange24h, 1)}</td>
                          <td className="r m" data-label="Long">{r.longRatio == null ? '—' : `${Math.round(r.longRatio * 100)}%`}</td>
                          <td className="r m" data-label="Since last look">{dl ? <><span className={toneOf(dl.f)}>{dl.f == null ? '—' : `${dl.f > 0 ? '+' : ''}${dl.f.toFixed(4)}`}</span> · <span className={toneOf(dl.oi)}>{fmtPct(dl.oi, 1)}</span></> : <span className="x-muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="cp-fine">From Bybit’s public market data, updated {new Date(data.asOf).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Last funding, 24h open-interest change and long share are for the top {data.detailFor} by volume. Liquidations aren’t shown: there’s no public feed we can reach reliably, and we won’t estimate them.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
