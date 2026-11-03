'use client';

// Signals (E7): a technical rating, Strong sell … Strong buy, for the most
// traded pairs on 1h, 4h and 1d. Open a row to see every vote behind it.
import Link from '@/components/v6/ui/link';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import SymbolSearch from '@/components/charts/symbol-search';
import {
  RATING_TEXT, SIGNAL_TFS, signalsApi,
  type RatingGroup, type RatingLabel, type SignalCell, type SignalRow, type SignalTf, type TfRating,
} from '@/lib/signals-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/markets.css';
import Freshness from '@/components/v6/ui/freshness';
import { Chg, Kpi, Pair, Split } from '@/components/v6/ui/lux';

type Show = 'all' | 'buy' | 'sell';
const isBuy = (l: RatingLabel | null | undefined) => l === 'buy' || l === 'strong_buy';
const isSell = (l: RatingLabel | null | undefined) => l === 'sell' || l === 'strong_sell';
const px = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
const num = (v: number | null) => (v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toLocaleString('en-US', { maximumSignificantDigits: 3 }));
const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Pill({ cell, testId }: { cell: Pick<SignalCell, 'label' | 'ma' | 'osc'> | null; testId?: string }) {
  if (!cell?.label) return <span className="x-muted" title="Not enough history on this timeframe" data-testid={testId}>—</span>;
  return <span className={`sg-pill sg-${cell.label}`} title={`Moving averages ${signed(cell.ma)} · Oscillators ${signed(cell.osc)}`} data-testid={testId}>{RATING_TEXT[cell.label]}</span>;
}

export default function SignalsPage() {
  const [universe, setUniverse] = useState<25 | 50 | 100>(50);
  const [sortTf, setSortTf] = useState<SignalTf>('4h');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = useLoad(() => signalsApi.list(universe), [universe]);
  usePoll(() => void list.reload(), 5 * 60_000);

  const rows = useMemo(() => {
    const all = list.data?.rows ?? [];
    const kept = all.filter(r => show === 'all' || (show === 'buy' ? isBuy(r.ratings[sortTf]?.label) : isSell(r.ratings[sortTf]?.label)));
    const key = (r: SignalRow) => r.ratings[sortTf]?.score;
    // Strongest first in the direction being shown; unknowns last.
    const dir = show === 'sell' ? 1 : -1;
    return [...kept].sort((a, b) => { const x = key(a); const y = key(b); if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; return (x - y) * dir; });
  }, [list.data, show, sortTf]);

  const breadth = useMemo(() => SIGNAL_TFS.map(tf => {
    const ls = (list.data?.rows ?? []).map(r => r.ratings[tf]?.label).filter(Boolean);
    return { tf, buy: ls.filter(isBuy).length, sell: ls.filter(isSell).length, neutral: ls.filter(l => l === 'neutral').length };
  }), [list.data]);

  return (
    <AppShell legacy={false} pageTitle="Signals" pageSubtitle={<>Technical ratings for top crypto pairs{list.data && <> · <Freshness at={list.data.asOf} /></>}</>}>
      <div className="x-page" data-testid="sg-page">
        <section className="x-card sg-controls" aria-label="Options">
          <div className="sg-search"><span className="x-muted">Rate any symbol</span><SymbolSearch value="" onSelect={s => setOpen(s)} /></div>
          <div className="sg-segs">
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Universe">
              {([25, 50, 100] as const).map(u => <button key={u} type="button" role="radio" aria-checked={universe === u} onClick={() => setUniverse(u)} data-testid={`sg-uni-${u}`}>Top {u}</button>)}
            </div>
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Show">
              {(['all', 'buy', 'sell'] as const).map(s => <button key={s} type="button" role="radio" aria-checked={show === s} onClick={() => setShow(s)} data-testid={`sg-show-${s}`}>{s === 'all' ? 'All' : s === 'buy' ? 'Buys' : 'Sells'}</button>)}
            </div>
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Rank by timeframe">
              {SIGNAL_TFS.map(tf => <button key={tf} type="button" role="radio" aria-checked={sortTf === tf} onClick={() => setSortTf(tf)} data-testid={`sg-tf-${tf}`}>{tf}</button>)}
            </div>
          </div>
        </section>

        {list.error ? <ErrorCard message={list.error} onRetry={list.reload} /> : !list.data ? <div className="x-skel cp-skel-table" /> : (
          <>
            <section className="lx-kpis" aria-label="Breadth" data-testid="sg-breadth">
              {breadth.map(b => {
                const total = b.buy + b.sell + b.neutral || 1;
                const lean = b.buy >= b.sell ? { n: b.buy, w: 'buy', t: 'pos' } : { n: b.sell, w: 'sell', t: 'neg' };
                return (
                  <Kpi key={b.tf} label={<span className="lx-eyebrow lx-eyebrow--mut">{b.tf} rating</span>} side={<span className="x-muted">bar from {when(list.data!.barTimes[b.tf])}</span>}
                    value={<span className={lean.t}>{Math.round((lean.n / total) * 100)}%<small>{lean.w}</small></span>}
                    sub={<><span className="pos">{b.buy} buy</span> · {b.neutral} neutral · <span className="neg">{b.sell} sell</span></>}
                    viz={<Split g={b.buy} n={b.neutral} r={b.sell} />} />
                );
              })}
            </section>
            <section className={`x-card ${list.loading ? 'sc-stale' : ''}`} aria-label="Ratings" aria-busy={list.loading}>
              <div className="x-ch"><h2 data-testid="sg-count">{show === 'all' ? `${rows.length} pairs` : `${rows.length} ${show === 'buy' ? 'buys' : 'sells'} on ${sortTf}`}</h2><span className="x-sub">Ranked by the {sortTf} rating · open a pair to see why</span></div>
              {!rows.length ? <div className="x-empty" data-testid="sg-empty"><b>None right now</b><p>Nothing in the top {universe} rates {show === 'buy' ? 'a buy' : 'a sell'} on {sortTf}.</p></div> : (
                <div className="x-tblwrap">
                  <table className="x-tbl trd-tbl sg-tbl" data-testid="sg-table">
                    <thead><tr><th>Pair</th><th className="r">Price</th><th className="r">24h</th>{SIGNAL_TFS.map(tf => <th key={tf} className={tf === sortTf ? 'sg-on' : ''}>{tf}</th>)}</tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.symbol} className="x-click" tabIndex={0} onClick={() => setOpen(r.symbol)} onKeyDown={e => { if (e.key === 'Enter') setOpen(r.symbol); }} data-testid={`sg-row-${r.symbol}`}>
                          <td><Pair base={r.base} /></td>
                          <td className="r m" data-label="Price">{px(r.price)}</td>
                          <td className="r" data-label="24h"><Chg v={r.change24h} /></td>
                          {SIGNAL_TFS.map(tf => <td key={tf} data-label={tf}><Pill cell={r.ratings[tf]} testId={`sg-${r.symbol}-${tf}`} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <p className="cp-fine sg-nfa">Ratings count simple indicator votes on closed bars. They describe the chart; they don&rsquo;t predict it. Not financial advice.</p>
          </>
        )}
      </div>
      {open && <SymbolDetail symbol={open} onClose={() => setOpen(null)} />}
    </AppShell>
  );
}

function Gauge({ score, label }: { score: number | null; label: RatingLabel | null }) {
  return (
    <div className="sg-gauge" data-testid="sg-gauge">
      <div className="sg-track" aria-hidden="true">
        {score != null && <i className="sg-mark" style={{ left: `${((score + 1) / 2) * 100}%` }} />}
      </div>
      <div className="sg-scale"><span>Strong sell</span><span>Sell</span><span>Neutral</span><span>Buy</span><span>Strong buy</span></div>
      <div className="sg-verdict">{label ? <span className={`sg-pill sg-${label}`}>{RATING_TEXT[label]}</span> : <span className="x-muted">Not enough history</span>}{score != null && <span className="m x-muted"> {signed(score)}</span>}</div>
    </div>
  );
}

function Votes({ title, g }: { title: string; g: RatingGroup | null }) {
  if (!g) return null;
  return (
    <div className="sg-votes" data-testid={`sg-votes-${title.startsWith('Moving') ? 'ma' : 'osc'}`}>
      <div className="sg-vhead"><b>{title}</b>{g.label && <span className={`sg-pill sg-${g.label}`}>{RATING_TEXT[g.label]}</span>}</div>
      <div className="sg-vcount"><span className="pos">{g.buy} buy</span> · <span>{g.neutral} neutral</span> · <span className="neg">{g.sell} sell</span></div>
      <ul>
        {g.components.map(c => (
          <li key={c.name} className={c.value == null ? 'sg-out' : ''}>
            <span className="sg-cname">{c.name}</span>
            <span className="m sg-cval">{num(c.value)}</span>
            <span className={`sg-vote ${c.value == null ? '' : c.vote > 0 ? 'pos' : c.vote < 0 ? 'neg' : ''}`} title={c.reason}>{c.value == null ? '—' : c.vote > 0 ? 'Buy' : c.vote < 0 ? 'Sell' : 'Neutral'}</span>
            <span className="sg-why x-muted">{c.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SymbolDetail({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const d = useLoad(() => signalsApi.symbol(symbol), [symbol]);
  const [tf, setTf] = useState<SignalTf>('4h');
  const r: TfRating | undefined = d.data?.timeframes.find(t => t.tf === tf);
  return (
    <Modal title={`${symbol} technical rating`} wide onClose={onClose} testId="sg-detail"
      sub={r?.barTime ? `${tf} bar that opened ${when(r.barTime)} · ${r.bars} closed bars` : undefined}
      footer={<><Link className="x-btn" href={`/charts?symbol=${encodeURIComponent(symbol)}&tf=${tf}`}>Open chart</Link><button className="x-btn x-btn--hi" onClick={onClose}>Done</button></>}>
      {d.error ? <p className="cp-err" data-testid="sg-detail-error">{d.error}</p> : !d.data ? <div className="x-skel" style={{ height: 240 }} /> : (
        <div className="sg-detail">
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Timeframe">
            {d.data.timeframes.map(t => (
              <button key={t.tf} type="button" role="radio" aria-checked={tf === t.tf} onClick={() => setTf(t.tf)} data-testid={`sg-dtf-${t.tf}`}>
                {t.tf}{t.label ? ` · ${RATING_TEXT[t.label]}` : ''}
              </button>
            ))}
          </div>
          {r && <Gauge score={r.score} label={r.label} />}
          {r && r.bars > 0 && r.bars < d.data.minBars && <p className="cp-fine">Only {r.bars} closed bars on {tf}: the longest averages sit out until there are {d.data.minBars}.</p>}
          {r && (r.ma || r.osc) ? <div className="sg-groups"><Votes title="Moving averages" g={r.ma} /><Votes title="Oscillators" g={r.osc} /></div>
            : <p className="x-muted">No {tf} candles for {symbol} yet.</p>}
          <p className="cp-fine">Each moving average votes buy with price above it, sell below. Oscillators vote only at a turning extreme or on a momentum signal. The rating is the average of the two groups. Not financial advice.</p>
        </div>
      )}
    </Modal>
  );
}
