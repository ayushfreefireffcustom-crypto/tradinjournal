'use client';

// Option chain (G2, G3): calls | strike | puts for one expiry, with an expiry
// carousel, the expiry's key numbers, and columns you can show, hide and
// reorder. A contract opens in the side panel (G4).
import { Fragment, useEffect, useMemo, useState, type DragEvent } from 'react';
import AppShell from '@/components/app-shell';
import { useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import ContractPanel from '@/components/v6/options/contract-panel';
import OptionsHead, { useOptionsCtx } from '@/components/v6/options/head';
import { daysLabel, expiryLabel, fmtCompact, fmtNum, fmtUsd, ivPct, optionsApi, type OptionQuote } from '@/lib/options-api';
import '@/styles/v6/markets.css';
import '@/styles/v6/options.css';

type Col = 'mark' | 'bid' | 'ask' | 'bidSize' | 'askSize' | 'last' | 'markIv' | 'bidIv' | 'askIv' | 'delta' | 'gamma' | 'theta' | 'vega' | 'oi' | 'volume' | 'change24h';
const COLS: Record<Col, { label: string; cell: (q: OptionQuote) => string; tone?: (q: OptionQuote) => string }> = {
  mark: { label: 'Mark', cell: (q) => fmtNum(q.mark, 1) },
  bid: { label: 'Bid', cell: (q) => fmtNum(q.bid, 1), tone: () => 'pos' },
  ask: { label: 'Ask', cell: (q) => fmtNum(q.ask, 1), tone: () => 'neg' },
  bidSize: { label: 'Bid size', cell: (q) => fmtCompact(q.bidSize) },
  askSize: { label: 'Ask size', cell: (q) => fmtCompact(q.askSize) },
  last: { label: 'Last', cell: (q) => fmtNum(q.last, 1) },
  markIv: { label: 'IV', cell: (q) => ivPct(q.markIv) },
  bidIv: { label: 'Bid IV', cell: (q) => ivPct(q.bidIv) },
  askIv: { label: 'Ask IV', cell: (q) => ivPct(q.askIv) },
  delta: { label: 'Delta', cell: (q) => fmtNum(q.delta, 3) },
  gamma: { label: 'Gamma', cell: (q) => (q.gamma == null ? '—' : q.gamma.toExponential(1)) },
  theta: { label: 'Theta', cell: (q) => fmtNum(q.theta, 1) },
  vega: { label: 'Vega', cell: (q) => fmtNum(q.vega, 1) },
  oi: { label: 'OI', cell: (q) => fmtCompact(q.oi) },
  volume: { label: 'Volume', cell: (q) => fmtCompact(q.volume) },
  change24h: { label: '24h', cell: (q) => (q.change24h == null ? '—' : `${q.change24h >= 0 ? '+' : '−'}${Math.abs(q.change24h).toFixed(1)}%`), tone: (q) => (q.change24h == null ? '' : q.change24h >= 0 ? 'pos' : 'neg') },
};
const ALL = Object.keys(COLS) as Col[];
const DEFAULT: Col[] = ['oi', 'volume', 'delta', 'markIv', 'bid', 'mark', 'ask'];
const COLS_KEY = 'tradelogs.options.columns';
const loadCols = (): Col[] => { try { const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null') as Col[] | null; if (Array.isArray(v) && v.length && v.every((c) => c in COLS)) return v; } catch { /* ignore */ } return DEFAULT; };

function ColumnSettings({ cols, onChange, onClose }: { cols: Col[]; onChange: (c: Col[]) => void; onClose: () => void }) {
  const order = [...cols, ...ALL.filter((c) => !cols.includes(c))];
  const [drag, setDrag] = useState<Col | null>(null);
  const move = (c: Col, to: number) => { const shown = cols.filter((x) => x !== c); shown.splice(Math.max(0, Math.min(shown.length, to)), 0, c); onChange(shown); };
  const onDrop = (e: DragEvent, target: Col) => { e.preventDefault(); if (drag && drag !== target && cols.includes(target)) move(drag, cols.indexOf(target)); setDrag(null); };
  return (
    <Modal title="Columns" sub="Shown on both sides; calls mirror puts so the strike sits in the middle. Drag to reorder." onClose={onClose} testId="op-cols-dialog"
      footer={<><button className="x-btn" onClick={() => onChange(DEFAULT)} data-testid="op-cols-reset">Reset</button><button className="x-btn x-btn--hi" onClick={onClose}>Done</button></>}>
      <ul className="op-cols">
        {order.map((c) => {
          const on = cols.includes(c);
          const i = cols.indexOf(c);
          return (
            <li key={c} draggable={on} onDragStart={() => setDrag(c)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, c)} className={drag === c ? 'is-drag' : ''} data-testid={`op-col-${c}`}>
              <span className="op-grip" aria-hidden>{on ? '⋮⋮' : ''}</span>
              <label><input type="checkbox" checked={on} onChange={() => onChange(on ? cols.filter((x) => x !== c) : [...cols, c])} disabled={on && cols.length === 1} /> {COLS[c].label}</label>
              {on && <span className="op-col-mv"><button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={i === 0} onClick={() => move(c, i - 1)} aria-label={`Move ${COLS[c].label} up`}>↑</button><button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={i === cols.length - 1} onClick={() => move(c, i + 1)} aria-label={`Move ${COLS[c].label} down`}>↓</button></span>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export default function OptionsChainPage() {
  const [ctx, setCtx] = useOptionsCtx();
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const [cols, setCols] = useState<Col[]>(DEFAULT);
  const [colsOpen, setColsOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [near, setNear] = useState(true);
  useEffect(() => { setCols(loadCols()); }, []);
  const pickCols = (c: Col[]) => { setCols(c); try { localStorage.setItem(COLS_KEY, JSON.stringify(c)); } catch { /* ignore */ } };
  useEffect(() => { setExpiry(undefined); setOpen(null); }, [ctx?.underlying, ctx?.env]);
  const ch = useLoad(() => (ctx ? optionsApi.chain(ctx.env, ctx.underlying, expiry) : Promise.resolve(null)), [ctx?.env, ctx?.underlying, expiry]);
  usePoll(() => void ch.reload(), 15_000, !!ctx);
  const d = ch.data;
  const rows = useMemo(() => {
    if (!d) return [];
    const by = new Map<number, { call?: OptionQuote; put?: OptionQuote }>();
    for (const q of d.quotes) { const r = by.get(q.strike) ?? {}; r[q.kind] = q; by.set(q.strike, r); }
    let list = [...by.entries()].sort((a, b) => a[0] - b[0]);
    // "Near the money": the 10 strikes either side of the index.
    if (near && list.length > 20) { const i = list.findIndex(([k]) => k >= d.spot); const c = i < 0 ? list.length : i; list = list.slice(Math.max(0, c - 10), c + 10); }
    return list;
  }, [d, near]);
  const spotAt = d ? rows.findIndex(([k]) => k >= d.spot) : -1;
  const s = d?.stats;
  const callCols = [...cols].reverse();

  return (
    <AppShell legacy={false} pageTitle="Options" pageSubtitle="Delta Exchange India option chain">
      <div className="x-page op-page" data-testid="op-chain-page">
        {ctx && <OptionsHead ctx={ctx} setCtx={setCtx} spot={d?.spot} right={<button className="x-btn x-btn--sm" onClick={() => setColsOpen(true)} data-testid="op-cols">Columns</button>} />}
        {ch.error && !d ? <ErrorCard message={ch.error} onRetry={ch.reload} /> : !d ? <div className="x-skel" style={{ height: 520 }} /> : (
          <>
            <div className="op-exps" role="tablist" aria-label="Expiry" data-testid="op-expiries">
              {d.expiries.map((e) => (
                <button key={e.code} type="button" role="tab" aria-selected={d.expiry === e.code} onClick={() => setExpiry(e.code)} data-testid={`op-exp-${e.code}`}>
                  <b>{expiryLabel(e.expiry)}</b><span className="x-muted">{daysLabel(e.days)}</span>
                </button>
              ))}
            </div>
            {s && (
              <section className="op-strip" aria-label="This expiry" data-testid="op-strip">
                <div><span>ATM IV</span><b className="m">{ivPct(s.atmIv)}</b></div>
                <div><span>Expected move</span><b className="m">{s.straddle == null ? '—' : `±${fmtUsd(s.straddle, 0)}`}</b><small className="x-muted">{s.straddle == null ? '' : `±${((s.straddle / d.spot) * 100).toFixed(2)}% · ATM straddle`}</small></div>
                <div><span>25Δ risk reversal</span><b className={`m ${s.rr25 == null ? '' : s.rr25 >= 0 ? 'pos' : 'neg'}`}>{s.rr25 == null ? '—' : `${s.rr25 >= 0 ? '+' : '−'}${Math.abs(s.rr25 * 100).toFixed(1)} vol`}</b><small className="x-muted">{s.rr25 == null ? '' : s.rr25 >= 0 ? 'calls richer' : 'puts richer'}</small></div>
                <div><span>Max pain</span><b className="m">{fmtNum(s.maxPain, 0)}</b></div>
                <div><span>Put/call OI</span><b className="m">{s.callOi ? (s.putOi / s.callOi).toFixed(2) : '—'}</b><small className="x-muted">{fmtCompact(s.callOi)} calls · {fmtCompact(s.putOi)} puts</small></div>
              </section>
            )}
            <section className="x-card op-chain-card" aria-label="Option chain">
              <div className="op-chain-top">
                <span><b className="pos">Calls</b></span>
                <label className="op-near"><input type="checkbox" checked={near} onChange={(e) => setNear(e.target.checked)} data-testid="op-near" /> Near the money</label>
                <span><b className="neg">Puts</b></span>
              </div>
              <div className="x-tblwrap op-tblwrap">
                <table className="x-tbl op-tbl" data-testid="op-chain">
                  <thead><tr>{callCols.map((c) => <th key={`c${c}`} className="r">{COLS[c].label}</th>)}<th className="op-k">Strike</th>{cols.map((c) => <th key={`p${c}`} className="r">{COLS[c].label}</th>)}</tr></thead>
                  <tbody>
                    {rows.map(([k, r], i) => (
                      <Fragment key={k}>
                        {i === spotAt && <tr className="op-spotrow" aria-hidden><td colSpan={cols.length * 2 + 1}><span className="m">Index {fmtNum(d.spot, 2)}</span></td></tr>}
                        <tr data-testid={`op-row-${k}`}>
                          {callCols.map((c) => <td key={`c${c}`} className={`r m op-cell ${k < d.spot ? 'op-itm' : ''} ${COLS[c].tone?.(r.call!) ?? ''}`} onClick={() => r.call && setOpen(r.call.symbol)} data-testid={c === 'mark' ? `op-c-${k}` : undefined}>{r.call ? COLS[c].cell(r.call) : '—'}</td>)}
                          <td className={`op-k m ${k === s?.atmStrike ? 'is-atm' : ''}`}>{fmtNum(k, 2)}</td>
                          {cols.map((c) => <td key={`p${c}`} className={`r m op-cell ${k > d.spot ? 'op-itm' : ''} ${COLS[c].tone?.(r.put!) ?? ''}`} onClick={() => r.put && setOpen(r.put.symbol)} data-testid={c === 'mark' ? `op-p-${k}` : undefined}>{r.put ? COLS[c].cell(r.put) : '—'}</td>)}
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="x-muted op-fine">Prices are in USD per 1 {d.underlying} (one contract is {d.contractValue} {d.underlying}). Shaded cells are in the money. Click a price to open the contract. Updates every 15 seconds.</p>
            </section>
          </>
        )}
      </div>
      {open && ctx && <ContractPanel ctx={ctx} symbol={open} onClose={() => setOpen(null)} />}
      {colsOpen && <ColumnSettings cols={cols} onChange={pickCols} onClose={() => setColsOpen(false)} />}
    </AppShell>
  );
}
