'use client';

// Market overview (E10) with sector rotation and correlation (E14) and the
// weekly market brief (E15): crypto breadth, movers, a volume heatmap and
// bubble map, sectors, Fear & Greed, altcoin season, and FX/indices beside it.
import Link from '@/components/v6/ui/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Sparkline from '@/components/v6/ui/sparkline';
import { fmtPct, fmtPrice, fmtUsd, hubApi, toneOf, type MarketBrief, type Overview, type SectorRow } from '@/lib/hub-api';
import { squarify } from '@/lib/treemap';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/markets.css';
import Freshness from '@/components/v6/ui/freshness';
import { Chg, Delta, Kpi, Pair, Spark, Split } from '@/components/v6/ui/lux';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Green or red, stronger the bigger the move (full at ±8 %). */
const heat = (chg: number) => {
  const k = Math.min(1, Math.abs(chg) / 8);
  return `color-mix(in srgb, ${chg >= 0 ? 'var(--g)' : 'var(--r)'} ${Math.round(18 + k * 72)}%, var(--s2))`;
};

export default function OverviewPage() {
  const o = useLoad(() => hubApi.overview(), []);
  const brief = useLoad(() => hubApi.brief(), []);
  usePoll(() => void o.reload(), 2 * 60_000);
  return (
    <AppShell legacy={false} pageTitle="Market overview" pageSubtitle={<>Crypto and markets at a glance{o.data && <> · <Freshness at={o.data.asOf} /></>}</>}>
      <div className="x-page ov-page" data-testid="ov-page">
        {brief.data && <BriefCard b={brief.data} />}
        {o.error ? <ErrorCard message={o.error} onRetry={o.reload} /> : !o.data ? <div className="x-skel" style={{ height: 420 }} /> : (
          <>
            <KpiStrip o={o.data} />
            <MacroTiles o={o.data} />
            <section className="x-card" aria-label="Heatmap">
              <div className="x-ch"><h2>Top 50 by volume</h2><span className="x-sub">Tile size is 24h volume, colour is the 24h move</span></div>
              <Heatmap rows={o.data.heatmap} />
            </section>
            <div className="ov-two">
              <Movers title="Top gainers (24h)" rows={o.data.gainers} testId="ov-gainers" />
              <Movers title="Top losers (24h)" rows={o.data.losers} testId="ov-losers" />
            </div>
            <section className="x-card" aria-label="Bubble map">
              <div className="x-ch"><h2>Bubble map</h2><span className="x-sub">24h move against 24h volume; bubble size is volume</span></div>
              <Bubbles rows={o.data.heatmap} />
            </section>
            <Sectors sectors={o.data.sectors} />
            <CorrelationCard />
            <p className="cp-fine">Crypto from Binance (top 100 USDT pairs, stablecoins left out). Sectors are a hand-kept map; unlisted coins count as Other. Updated {new Date(o.data.asOf).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function BriefCard({ b }: { b: MarketBrief }) {
  return (
    <section className="x-card ov-brief lx-feature" aria-label="Weekly market brief" data-testid="ov-brief">
      <span className="lx-eyebrow">This week in markets</span>
      <h2>{b.headline}</h2>
      <p className="ov-brief-sum">{b.summary}</p>
      <ul>{b.bullets.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <div className="ov-watch"><span className="lx-eyebrow lx-eyebrow--mut">Worth watching</span><p>{b.watch}</p></div>
      <p className="cp-fine">Not financial advice.</p>
    </section>
  );
}

function KpiStrip({ o }: { o: Overview }) {
  const b = o.breadth;
  const fg = o.fearGreed;
  const alt = o.altSeason;
  return (
    <section className="lx-kpis" aria-label="Market gauges">
      <Kpi testId="ov-breadth" label="Breadth · top 100" side={<Delta v={b.medianChange} digits={2} />}
        value={<><span className="pos">{b.up}</span><small>up</small> <span className="neg">{b.down}</span><small>down</small></>}
        sub={<>Median move <span className={`m ${toneOf(b.medianChange)}`}>{fmtPct(b.medianChange)}</span></>}
        viz={<Split g={b.up} n={b.flat} r={b.down} />} />
      {fg ? (
        <Kpi testId="ov-fng" label="Fear & Greed" side={<span className="x-muted">30 days</span>}
          value={<span className={fg.value >= 55 ? 'pos' : fg.value <= 45 ? 'neg' : ''}>{fg.value}<small>{fg.label}</small></span>}
          sub={<div className="ov-gauge"><i style={{ left: `${fg.value}%` }} /></div>}
          viz={<Spark values={fg.history.map(h => h.value)} />} />
      ) : <Kpi testId="ov-fng" label="Fear & Greed" value={<span className="x-muted">—</span>} sub="Unavailable right now" />}
      {alt.index != null ? (
        <Kpi testId="ov-altseason" label={`Altcoin season · ${alt.window} days`} side={<span className="x-muted">{alt.label === 'neither' ? 'Neither season' : alt.label}</span>}
          value={<>{alt.index}<small>/ 100</small></>}
          sub={<div className="ov-gauge ov-gauge--alt"><i style={{ left: `${alt.index}%` }} /></div>}
          viz={<span className="lx-kpi-s">{alt.index}% of {alt.counted} top alts beat BTC ({fmtPct(alt.btc90, 1)})</span>} />
      ) : <Kpi testId="ov-altseason" label={`Altcoin season · ${alt.window} days`} value={<span className="x-muted">—</span>} sub="Not enough history yet" />}
    </section>
  );
}

function MacroTiles({ o }: { o: Overview }) {
  const groups = ['Indices', 'Forex', 'Commodities'];
  return (
    <section className="x-card" aria-label="FX, indices and commodities" data-testid="ov-macro">
      <div className="x-ch"><h2>Beyond crypto</h2><span className="x-sub">Change on the day</span></div>
      <div className="ov-macro">
        {groups.map(g => (
          <div key={g} className="ov-macro-g">
            <div className="ov-macro-h">{g}</div>
            {o.macro.filter(m => m.group === g).map(m => (
              <Link key={m.symbol} href={`/charts?symbol=${m.symbol}&tf=1d`} className="ov-mt">
                <span>{m.name}</span>
                {m.spark.length > 2 ? <Sparkline values={m.spark} width={64} height={18} /> : <span />}
                <span className="m">{fmtPrice(m.price)}</span>
                <span className={`m ${toneOf(m.change1d)}`}>{fmtPct(m.change1d)}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Heatmap({ rows }: { rows: Overview['heatmap'] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = Math.max(260, Math.min(520, w * 0.5));
  const tiles = useMemo(() => squarify(rows, r => Math.sqrt(r.volume24h), { x: 0, y: 0, w, h }), [rows, w, h]);
  return (
    <div ref={ref} className="ov-heat" style={{ height: h }} data-testid="ov-heatmap">
      {tiles.map(({ item: r, rect }) => (
        <Link key={r.symbol} href={`/charts?symbol=${r.symbol}&tf=1h`} className="ov-tile" title={`${r.base}: ${fmtPct(r.change24h)} · ${fmtUsd(r.volume24h)} · ${r.sector}`}
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, background: heat(r.change24h) }}>
          {rect.w > 38 && rect.h > 26 && <><b>{r.base}</b>{rect.h > 40 && <span className="m">{fmtPct(r.change24h, 1)}</span>}</>}
        </Link>
      ))}
    </div>
  );
}

function Bubbles({ rows }: { rows: Overview['heatmap'] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 300;
  const pad = 36;
  const xs = rows.map(r => r.change24h);
  const lim = Math.max(2, ...xs.map(Math.abs)) * 1.1;
  const vols = rows.map(r => Math.log10(Math.max(1, r.volume24h)));
  const vMin = Math.min(...vols);
  const vMax = Math.max(...vols);
  const maxVol = Math.max(...rows.map(r => r.volume24h));
  const X = (c: number) => pad + ((c + lim) / (2 * lim)) * (w - pad * 2);
  const Y = (v: number) => h - pad - ((v - vMin) / Math.max(0.001, vMax - vMin)) * (h - pad * 2);
  return (
    <div ref={ref} className="ov-bub" data-testid="ov-bubbles">
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="24h move against volume">
          <line x1={X(0)} x2={X(0)} y1={pad / 2} y2={h - pad} stroke="var(--line-2)" strokeDasharray="3 3" />
          <text x={pad} y={h - 8} className="mk-pc-axis">{fmtPct(-lim, 0)}</text>
          <text x={w - pad} y={h - 8} className="mk-pc-axis" textAnchor="end">{fmtPct(lim, 0)}</text>
          <text x={X(0)} y={h - 8} className="mk-pc-axis" textAnchor="middle">0</text>
          {rows.map((r, i) => {
            const rad = 6 + Math.sqrt(r.volume24h / maxVol) * 24;
            return (
              <Link key={r.symbol} href={`/charts?symbol=${r.symbol}&tf=1h`}>
                <g>
                  <title>{`${r.base}: ${fmtPct(r.change24h)} · ${fmtUsd(r.volume24h)}`}</title>
                  <circle cx={X(r.change24h)} cy={Y(vols[i]!)} r={rad} fill={heat(r.change24h)} stroke="var(--s1)" strokeWidth={1} />
                  {rad > 13 && <text x={X(r.change24h)} y={Y(vols[i]!) + 3.5} textAnchor="middle" className="ov-bub-t">{r.base}</text>}
                </g>
              </Link>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Movers({ title, rows, testId }: { title: string; rows: Overview['gainers']; testId: string }) {
  return (
    <section className="x-card" aria-label={title} data-testid={testId}>
      <div className="x-ch"><h2>{title}</h2></div>
      <ol className="ov-movers">
        {rows.map((r, i) => (
          <li key={r.symbol}>
            <span className="ov-rank m">{i + 1}</span>
            <Link href={`/charts?symbol=${r.symbol}&tf=1h`} className="ov-mv-pair"><Pair base={r.base} symbol={r.symbol} quote={null} /></Link>
            <span className="m x-muted">{fmtPrice(r.price)}</span>
            <Chg v={r.change24h} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Sectors({ sectors }: { sectors: SectorRow[] }) {
  const named = sectors.filter(s => s.sector !== 'Other');
  // One coin isn't a sector trend, and it would set the chart's scale for everyone.
  const pts = named.filter(s => s.vsBtc7d != null && s.vsBtc30d != null && s.count >= 2);
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 280;
  const pad = 30;
  // Each axis scales to its own spread, so the points use the whole chart.
  const limX = Math.max(2, ...pts.map(s => Math.abs(s.vsBtc30d!))) * 1.2;
  const limY = Math.max(2, ...pts.map(s => Math.abs(s.vsBtc7d!))) * 1.2;
  const X = (v: number) => pad + ((v + limX) / (2 * limX)) * (w - pad * 2);
  const Y = (v: number) => h - pad - ((v + limY) / (2 * limY)) * (h - pad * 2);
  // Labels: right of the dot, else left, else nudged down/up until they don't overlap another.
  const placed: Array<{ x: number; y: number; w: number }> = [];
  const labelAt = (s: SectorRow) => {
    const cx = X(s.vsBtc30d!), cy = Y(s.vsBtc7d!), tw = s.sector.length * 6.6;
    const hit = (x: number, y: number) => placed.some(p => x < p.x + p.w + 4 && x + tw + 4 > p.x && Math.abs(y - p.y) < 14)
      || pts.some(o => o !== s && Math.abs(Y(o.vsBtc7d!) - (y - 4)) < 7 && X(o.vsBtc30d!) > x - 6 && X(o.vsBtc30d!) < x + tw + 6);
    for (const dy of [0, 14, -14, 28, -28, 42]) {
      for (const x of [cx + 9, cx - 9 - tw]) {
        const y = cy + 4 + dy;
        if (x >= pad && x + tw <= w - pad && !hit(x, y)) { placed.push({ x, y, w: tw }); return { x, y }; }
      }
    }
    placed.push({ x: cx + 9, y: cy + 4, w: tw });
    return { x: cx + 9, y: cy + 4 };
  };
  const quad = (s: SectorRow) => (s.vsBtc30d! >= 0 ? (s.vsBtc7d! >= 0 ? 'Leading' : 'Weakening') : (s.vsBtc7d! >= 0 ? 'Improving' : 'Lagging'));
  return (
    <section className="x-card" aria-label="Sectors" data-testid="ov-sectors">
      <div className="x-ch"><h2>Sectors</h2><span className="x-sub">Average move of the coins in each sector</span></div>
      <div className="x-tblwrap">
        <table className="x-tbl trd-tbl sc-tbl ov-sec">
          <thead><tr><th>Sector</th><th className="r">Coins</th><th className="r">24h</th><th className="r">7d</th><th className="r">30d</th><th className="r">7d vs BTC</th><th>Rotation</th><th>Biggest</th></tr></thead>
          <tbody>
            {named.map(s => (
              <tr key={s.sector}>
                <td><b>{s.sector}</b></td>
                <td className="r m" data-label="Coins">{s.count}</td>
                <td className={`r m ${toneOf(s.change24h)}`} data-label="24h">{fmtPct(s.change24h, 1)}</td>
                <td className={`r m ${toneOf(s.change7d)}`} data-label="7d">{fmtPct(s.change7d, 1)}</td>
                <td className={`r m ${toneOf(s.change30d)}`} data-label="30d">{fmtPct(s.change30d, 1)}</td>
                <td className={`r m ${toneOf(s.vsBtc7d)}`} data-label="7d vs BTC">{fmtPct(s.vsBtc7d, 1)}</td>
                <td data-label="Rotation">{s.vsBtc7d != null && s.vsBtc30d != null ? <span className={`x-tag ${quad(s) === 'Leading' ? 'x-tag--g' : quad(s) === 'Lagging' ? 'x-tag--r' : ''}`}>{quad(s)}</span> : <span className="x-muted">—</span>}</td>
                <td className="x-muted" data-label="Biggest">{s.leaders.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pts.length > 1 && (
        <div ref={ref} className="ov-rot" data-testid="ov-rotation">
          <div className="ov-rot-h">Rotation vs BTC: 30-day trend across, 7-day momentum up (sectors with two or more coins)</div>
          {w > 0 && (
            <svg width={w} height={h} role="img" aria-label="Sector rotation">
              <line x1={X(0)} x2={X(0)} y1={pad} y2={h - pad} stroke="var(--line-2)" />
              <line x1={pad} x2={w - pad} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" />
              <text x={w - pad} y={pad + 4} textAnchor="end" className="mk-pc-axis">Leading</text>
              <text x={pad} y={pad + 4} className="mk-pc-axis">Improving</text>
              <text x={pad} y={h - pad - 6} className="mk-pc-axis">Lagging</text>
              <text x={w - pad} y={h - pad - 6} textAnchor="end" className="mk-pc-axis">Weakening</text>
              {(placed.length = 0, pts.map(s => {
                const at = labelAt(s);
                return (
                  <g key={s.sector}>
                    <circle cx={X(s.vsBtc30d!)} cy={Y(s.vsBtc7d!)} r={5} fill={s.vsBtc7d! >= 0 ? 'var(--g)' : 'var(--r)'} stroke="var(--s1)" strokeWidth={2} />
                    <text x={at.x} y={at.y} className="ov-rot-t">{s.sector}</text>
                  </g>
                );
              }))}
            </svg>
          )}
        </div>
      )}
    </section>
  );
}

function CorrelationCard() {
  const [days, setDays] = useState<30 | 90 | 180>(90);
  const c = useLoad(() => hubApi.correlation(days), [days]);
  const cell = (v: number | null) => (v == null ? 'var(--s2)' : `color-mix(in srgb, ${v >= 0 ? 'var(--g)' : 'var(--r)'} ${Math.round(Math.abs(v) * 85)}%, var(--s2))`);
  return (
    <section className="x-card" aria-label="Correlation" data-testid="ov-corr">
      <div className="x-ch">
        <h2>Correlation · top 16</h2>
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Window">
          {([30, 90, 180] as const).map(d => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} data-testid={`ov-corr-${d}`}>{d}d</button>)}
        </div>
      </div>
      {c.error ? <p className="cp-err">{c.error}</p> : !c.data ? <div className="x-skel" style={{ height: 300 }} /> : (
        <div className="ov-corr-wrap">
          <table className="ov-corr" data-testid="ov-corr-table">
            <thead><tr><th />{c.data.symbols.map(s => <th key={s} scope="col"><span>{s}</span></th>)}</tr></thead>
            <tbody>
              {c.data.matrix.map((row, i) => (
                <tr key={c.data!.symbols[i]}>
                  <th scope="row">{c.data!.symbols[i]}</th>
                  {row.map((v, j) => <td key={j} style={{ background: cell(v) }} title={`${c.data!.symbols[i]} / ${c.data!.symbols[j]}: ${v == null ? 'not enough data' : v.toFixed(2)}`} className="m">{v == null ? '' : v.toFixed(2).replace('0.', '.').replace('-.', '−.')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cp-fine">Correlation of daily returns over {days} days: 1 moves together, 0 unrelated, −1 opposite.</p>
    </section>
  );
}
