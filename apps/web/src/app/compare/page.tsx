'use client';

// Compare (E13): up to six symbols rebased to 0 % on one chart, with a
// relative-strength table and a CSV of the series.
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import SymbolSearch from '@/components/charts/symbol-search';
import { compareCsv, compareSeries } from '@/lib/compare';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { fmtPct, toneOf } from '@/lib/hub-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';

const RANGES: Array<{ id: string; label: string; tf: MarketTimeframe; bars: number }> = [
  { id: '7d', label: '7D', tf: '1h', bars: 168 },
  { id: '30d', label: '30D', tf: '4h', bars: 180 },
  { id: '90d', label: '90D', tf: '1d', bars: 90 },
  { id: '1y', label: '1Y', tf: '1d', bars: 365 },
];
const COLORS = ['var(--g)', '#5B8DEF', '#F5A524', '#C26BF0', '#FE3A31', '#2EC4C4'];
const DEFAULT = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const MAX = 6;

export default function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT);
  const [range, setRange] = useState('90d');
  const [series, setSeries] = useState<Record<string, Candle[] | 'error'>>({});
  const [hover, setHover] = useState<number | null>(null);

  // Restore from the URL (?s=BTCUSDT,ETHUSDT&r=30d) after mount.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('s')?.split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9]{2,30}$/.test(x)).slice(0, MAX);
    if (s?.length) setSymbols([...new Set(s)]);
    const r = q.get('r');
    if (r && RANGES.some(x => x.id === r)) setRange(r);
  }, []);
  useEffect(() => { window.history.replaceState(null, '', `/compare?s=${symbols.join(',')}&r=${range}`); }, [symbols, range]);

  const rg = RANGES.find(r => r.id === range)!;
  useEffect(() => {
    let alive = true;
    setSeries({});
    for (const s of symbols) {
      marketApi.candles({ symbol: s, tf: rg.tf, limit: rg.bars })
        .then(r => { if (alive) setSeries(m => ({ ...m, [s]: r.candles })); })
        .catch(() => { if (alive) setSeries(m => ({ ...m, [s]: 'error' })); });
    }
    return () => { alive = false; };
  }, [symbols, rg.tf, rg.bars]);

  const ready = symbols.filter(s => Array.isArray(series[s]));
  const failed = symbols.filter(s => series[s] === 'error');
  const loading = symbols.some(s => series[s] === undefined);
  const cmp = useMemo(() => compareSeries(ready.map(s => series[s] as Candle[])), [ready.join(','), series]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const blob = new Blob([compareCsv(ready, cmp)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `compare-${ready.join('-')}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <AppShell legacy={false} pageTitle="Compare" pageSubtitle="Up to six markets on one chart, rebased to the same start"
      actions={<button className="x-btn" onClick={exportCsv} disabled={!cmp.times.length} data-testid="cmp-export">Export CSV</button>}>
      <div className="x-page" data-testid="cmp-page">
        <section className="x-card cmp-controls">
          <div className="cmp-chips" data-testid="cmp-chips">
            {symbols.map((s, i) => (
              <span key={s} className="cmp-chip" style={{ borderColor: COLORS[i] }}>
                <i style={{ background: COLORS[i] }} />{s}
                {symbols.length > 1 && <button type="button" aria-label={`Remove ${s}`} onClick={() => setSymbols(x => x.filter(y => y !== s))} data-testid={`cmp-rm-${s}`}>×</button>}
              </span>
            ))}
            {symbols.length < MAX && <div className="cmp-add"><SymbolSearch value="" onSelect={s => setSymbols(x => (x.includes(s) || x.length >= MAX ? x : [...x, s]))} /></div>}
          </div>
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Range">
            {RANGES.map(r => <button key={r.id} type="button" role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)} data-testid={`cmp-r-${r.id}`}>{r.label}</button>)}
          </div>
        </section>

        <section className="x-card" aria-label="Chart">
          {failed.length > 0 && <p className="cp-err">No data for {failed.join(', ')}.</p>}
          {loading && !cmp.times.length ? <div className="x-skel" style={{ height: 360 }} /> : !cmp.times.length ? (
            <div className="x-empty"><b>Nothing to compare</b><p>These markets don’t share any bars in this range.</p></div>
          ) : <Overlay cmp={cmp} symbols={ready} colors={ready.map(s => COLORS[symbols.indexOf(s)]!)} tf={rg.tf} hover={hover} setHover={setHover} />}
        </section>

        {cmp.times.length > 0 && (
          <section className="x-card" aria-label="Relative strength">
            <div className="x-ch"><h2>Relative strength</h2><span className="x-sub">Over {rg.label.toLowerCase()} on {rg.tf} bars, {cmp.times.length} shared bars</span></div>
            <div className="x-tblwrap">
              <table className="x-tbl trd-tbl sc-tbl" data-testid="cmp-table">
                <thead><tr><th>Market</th><th className="r">Return</th><th className="r">vs {ready[0]}</th><th className="r">Max drawdown</th><th className="r">Volatility / bar</th><th className="r">Corr. to {ready[0]}</th></tr></thead>
                <tbody>
                  {ready.map((s, k) => {
                    const st = cmp.stats[k]!;
                    return (
                      <tr key={s} data-testid={`cmp-row-${s}`}>
                        <td><i className="cmp-dot" style={{ background: COLORS[symbols.indexOf(s)] }} /><b>{s}</b></td>
                        <td className={`r m ${toneOf(st.ret)}`} data-label="Return">{fmtPct(st.ret)}</td>
                        <td className={`r m ${k === 0 ? '' : toneOf(st.vsFirst)}`} data-label={`vs ${ready[0]}`}>{k === 0 ? '—' : fmtPct(st.vsFirst)}</td>
                        <td className="r m neg" data-label="Max drawdown">{st.maxDd == null ? '—' : `${st.maxDd.toFixed(2)}%`}</td>
                        <td className="r m" data-label="Volatility / bar">{st.vol == null ? '—' : `${st.vol.toFixed(2)}%`}</td>
                        <td className="r m" data-label={`Corr. to ${ready[0]}`}>{st.corrToFirst == null ? '—' : st.corrToFirst.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Overlay({ cmp, symbols, colors, tf, hover, setHover }: { cmp: ReturnType<typeof compareSeries>; symbols: string[]; colors: string[]; tf: MarketTimeframe; hover: number | null; setHover: (i: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const h = 380;
  const padL = 8, padR = 60, padT = 12, padB = 24;
  const all = cmp.pct.flat();
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const n = cmp.times.length;
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const Y = (v: number) => padT + ((hi - v) / span) * (h - padT - padB);
  const ticks = [lo, lo + span / 4, lo + span / 2, lo + (3 * span) / 4, hi];
  const fmtT = (t: number) => new Date(t).toLocaleString(undefined, tf === '1d' ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div ref={ref} className="cmp-chart" data-testid="cmp-chart">
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Rebased performance"
          onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1)); setHover(i >= 0 && i < n ? i : null); }}
          onMouseLeave={() => setHover(null)}>
          {ticks.map(v => <g key={v}><line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" /><text x={w - padR + 6} y={Y(v) + 4} className="mk-pc-axis">{fmtPct(v, 1)}</text></g>)}
          <line x1={padL} x2={w - padR} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" />
          {cmp.pct.map((p, k) => <polyline key={symbols[k]} fill="none" stroke={colors[k]} strokeWidth={1.8} points={p.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} data-testid="cmp-line" />)}
          {[0, Math.floor(n / 2), n - 1].map(i => <text key={i} x={X(i)} y={h - 6} className="mk-pc-axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{fmtT(cmp.times[i]!)}</text>)}
          {hover != null && <line x1={X(hover)} x2={X(hover)} y1={padT} y2={h - padB} stroke="var(--mut)" strokeDasharray="3 3" />}
        </svg>
      )}
      {hover != null && (
        <div className="cmp-tip" data-testid="cmp-tip">
          <b>{fmtT(cmp.times[hover]!)}</b>
          {symbols.map((s, k) => <span key={s}><i style={{ background: colors[k] }} />{s} <span className={`m ${toneOf(cmp.pct[k]![hover])}`}>{fmtPct(cmp.pct[k]![hover]!)}</span></span>)}
        </div>
      )}
    </div>
  );
}
