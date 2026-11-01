'use client';

// One contract (G4): price, change, index, IV, volume, Greeks, the order book,
// and its charts (G9: traded price, mark, IV solved from the mark, open
// interest). "Buy" / "Sell" send it to the builder as a leg.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { useLoad, usePoll } from '@/components/v6/copy/parts';
import { LineChart } from './charts';
import { addLeg, daysLabel, expiryLabel, fmtCompact, fmtNum, fmtUsd, ivPct, optionsApi, type CandleKind, type OptionsCtx, type Resolution } from '@/lib/options-api';

const KINDS: Array<[CandleKind, string]> = [['mark', 'Mark'], ['price', 'Traded'], ['iv', 'IV'], ['oi', 'Open interest']];
const RANGES: Array<[Resolution, number, string]> = [['15m', 1, '1D'], ['1h', 3, '3D'], ['1h', 7, '7D'], ['4h', 30, '30D']];

export default function ContractPanel({ ctx, symbol, onClose }: { ctx: OptionsCtx; symbol: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const c = useLoad(() => optionsApi.contract(ctx.env, symbol), [ctx.env, symbol]);
  usePoll(() => void c.reload(), 15_000);
  const [kind, setKind] = useState<CandleKind>('mark');
  const [range, setRange] = useState(1);
  const [res, days] = [RANGES[range]![0], RANGES[range]![1]];
  const hist = useLoad(() => optionsApi.candles(ctx.env, symbol, kind, res, days), [ctx.env, symbol, kind, res, days]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const d = c.data;
  const q = d?.quote;
  const send = (side: 1 | -1) => {
    if (!q) return;
    addLeg(ctx, { kind: q.kind, side, qty: 1, strike: q.strike, expiry: q.expiryCode });
    toast.success(`${side === 1 ? 'Buy' : 'Sell'} ${q.symbol} added to the builder`);
    router.push('/options/builder');
  };
  const maxSize = d ? Math.max(1, ...d.book.bids.map((b) => b.size), ...d.book.asks.map((a) => a.size)) : 1;
  const yFmt = (v: number) => (kind === 'iv' ? ivPct(v) : kind === 'oi' ? fmtNum(v, 3) : fmtNum(v, 1));
  return (
    <aside className="op-panel" role="dialog" aria-label={`Contract ${symbol}`} data-testid="op-panel">
      <div className="op-panel-h">
        <div>
          <h2 className="m">{symbol}</h2>
          {q && <span className="x-muted">{q.kind === 'call' ? 'Call' : 'Put'} · strike {fmtNum(q.strike, 2)} · expires {expiryLabel(q.expiry)} ({daysLabel(d!.days)})</span>}
        </div>
        <button type="button" className="x-btn x-btn--ghost x-btn--sm" onClick={onClose} aria-label="Close contract" data-testid="op-panel-close">✕</button>
      </div>
      {c.error && !d ? <p className="cp-err">{c.error}</p> : !q ? <div className="x-skel" style={{ height: 300 }} /> : (
        <>
          <div className="op-kv" data-testid="op-panel-stats">
            <div><span>Mark</span><b className="m">{fmtNum(q.mark, 2)}</b></div>
            <div><span>24h</span><b className={`m ${q.change24h == null ? '' : q.change24h >= 0 ? 'pos' : 'neg'}`}>{q.change24h == null ? '—' : `${q.change24h >= 0 ? '+' : '−'}${Math.abs(q.change24h).toFixed(2)}%`}</b></div>
            <div><span>Index</span><b className="m">{fmtNum(d!.spot, 2)}</b></div>
            <div><span>Mark IV</span><b className="m">{ivPct(q.markIv)}</b></div>
            <div><span>Volume</span><b className="m">{fmtCompact(q.volume)}</b></div>
            <div><span>Open interest</span><b className="m">{fmtCompact(q.oi)} <small className="x-muted">{fmtUsd(q.oiUsd, 0)}</small></b></div>
          </div>
          <div className="op-greeks" data-testid="op-panel-greeks">
            <span>Δ <b className="m">{fmtNum(q.delta, 3)}</b></span><span>Γ <b className="m">{q.gamma == null ? '—' : q.gamma.toExponential(2)}</b></span>
            <span>Θ <b className="m">{fmtNum(q.theta, 2)}</b>/day</span><span>Vega <b className="m">{fmtNum(q.vega, 2)}</b></span>
          </div>
          <p className="x-muted op-fine">Per 1 {d!.underlying}; one contract is {d!.contractValue} {d!.underlying}, so a contract costs about {fmtUsd(q.mark != null ? q.mark * d!.contractValue : null)}.</p>
          <div className="op-trade">
            <button type="button" className="x-btn op-buy" onClick={() => send(1)} data-testid="op-panel-buy">Buy · {fmtNum(q.ask, 1)}</button>
            <button type="button" className="x-btn op-sell" onClick={() => send(-1)} data-testid="op-panel-sell">Sell · {fmtNum(q.bid, 1)}</button>
          </div>
          <section aria-label="Order book" data-testid="op-book">
            <div className="op-sub">Order book <span className="x-muted">contracts</span></div>
            <div className="op-book">
              <div>{d!.book.bids.length ? d!.book.bids.map((b, i) => <div key={i} className="op-lvl"><i className="g" style={{ width: `${(b.size / maxSize) * 100}%` }} /><span className="m">{fmtCompact(b.size)}</span><b className="m pos">{fmtNum(b.price, 1)}</b></div>) : <p className="x-muted">No bids</p>}</div>
              <div>{d!.book.asks.length ? d!.book.asks.map((a, i) => <div key={i} className="op-lvl op-lvl--a"><i className="r" style={{ width: `${(a.size / maxSize) * 100}%` }} /><b className="m neg">{fmtNum(a.price, 1)}</b><span className="m">{fmtCompact(a.size)}</span></div>) : <p className="x-muted">No asks</p>}</div>
            </div>
          </section>
          <section aria-label="Charts">
            <div className="op-chart-bar">
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Series">{KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} data-testid={`op-pk-${k}`}>{l}</button>)}</div>
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Range">{RANGES.map(([, , l], i) => <button key={l} type="button" role="radio" aria-checked={range === i} onClick={() => setRange(i)}>{l}</button>)}</div>
            </div>
            {hist.error ? <p className="cp-err">{hist.error}</p> : !hist.data ? <div className="x-skel" style={{ height: 200 }} /> : (
              <LineChart testId="op-panel-chart" height={200}
                series={[{ key: kind, label: KINDS.find((k) => k[0] === kind)![1], color: kind === 'iv' ? 'var(--sc-3)' : kind === 'oi' ? 'var(--sc-2)' : 'var(--sc-1)', points: hist.data.candles.filter((x) => x.c != null).map((x) => [x.t, x.c!] as [number, number]) }]}
                xFmt={(t) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} yFmt={yFmt}
                empty={kind === 'price' ? 'No trades in this range' : 'No history yet'} />
            )}
            {kind === 'iv' && <p className="x-muted op-fine">Delta doesn’t publish IV history, so this is solved from each mark against the index with Black-Scholes.</p>}
          </section>
        </>
      )}
    </aside>
  );
}
