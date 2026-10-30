'use client';

// Raw MT5 deal ledger. Every fill as the broker reported it; the position view
// is reconstructed from these. Stacked cards on phones.
import type { Deal } from '@/lib/api';
import { fmtPrice } from '@/lib/desk';
import '@/styles/v6/trades.css';

interface Props {
  deals: Deal[];
  loading: boolean;
  error?: string;
  /** Cap rendered rows (the ledger can be long). */
  limit?: number;
}

const ENTRY: Record<Deal['entry'], string> = { IN: 'Open', OUT: 'Close', INOUT: 'Reverse', OUT_BY: 'Close by' };
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const money = (p: number) => `${p >= 0 ? '+' : '−'}$${Math.abs(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function TypeChip({ d }: { d: Deal }) {
  if (d.type === 'BALANCE') return <span className="x-tag">Balance</span>;
  return <span className={`x-side ${d.type === 'BUY' ? 'x-side--long' : 'x-side--short'}`}>{d.type === 'BUY' ? 'Buy' : 'Sell'}</span>;
}

export default function DealsTable({ deals, loading, error, limit = 200 }: Props) {
  if (error) return <div className="x-banner x-banner--err" data-testid="deals-table-error"><span>{error}</span></div>;
  const rows = deals.slice(0, limit);
  const cell = (d: Deal) => {
    const p = parseFloat(d.profit);
    const show = d.entry !== 'IN' || p !== 0;
    return { p, show, vol: parseFloat(d.volume), comm: parseFloat(d.commission), px: parseFloat(d.price) };
  };
  const empty = <div className="x-empty"><b>No deals on file</b><p>Fills appear here as soon as MT5 reports them.</p></div>;

  return (
    <div data-testid="deals-table">
      <div className="tr-wrap">
        <table className="x-tbl tr-tbl">
          <thead>
            <tr><th>Ticket</th><th>Time</th><th>Type</th><th>Entry</th><th>Symbol</th><th className="n">Volume</th><th className="n tr-col-px">Price</th><th className="n tr-col-size">Commission</th><th className="n">Profit</th></tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="tr-sk">{['', '', '', '', '', '', 'tr-col-px', 'tr-col-size', ''].map((c, j) => <td key={j} className={c}><i className="x-skel x-skel--in" style={{ width: 36 + ((i + j) % 4) * 14 }} /></td>)}</tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={9}>{empty}</td></tr>
            ) : (
              rows.map(d => {
                const c = cell(d);
                return (
                  <tr key={d.dealTicket}>
                    <td className="m x-muted">#{d.dealTicket}</td>
                    <td className="m x-muted">{stamp(d.dealTime)}</td>
                    <td><TypeChip d={d} /></td>
                    <td className="x-muted">{d.type === 'BALANCE' ? '—' : ENTRY[d.entry]}</td>
                    <td>{d.symbol || '—'}</td>
                    <td className="n m x-muted">{c.vol ? c.vol.toFixed(2) : '—'}</td>
                    <td className="n m tr-col-px">{c.px ? fmtPrice(c.px) : '—'}</td>
                    <td className="n m x-muted tr-col-size">{c.comm ? c.comm.toFixed(2) : '—'}</td>
                    <td className={`n m ${c.show ? (c.p > 0 ? 'pos' : c.p < 0 ? 'neg' : '') : 'x-muted'}`}>{c.show ? money(c.p) : '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="tr-cards tr-dl-cards">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="x-skel x-skel--in" style={{ height: 52, margin: '10px 0', borderRadius: 12 }} />)
        ) : rows.length === 0 ? empty : rows.map(d => {
          const c = cell(d);
          return (
            <div key={d.dealTicket} className="tr-card">
              <div className="tr-card-a">
                <span><b>{d.symbol || 'Balance'}</b><TypeChip d={d} /></span>
                <small className="m">#{d.dealTicket} · {stamp(d.dealTime)}</small>
              </div>
              <span className="tr-pl"><b className={`m ${c.show ? (c.p > 0 ? 'pos' : c.p < 0 ? 'neg' : '') : 'x-muted'}`}>{c.show ? money(c.p) : '—'}</b></span>
              <div className="tr-card-j">
                <span className="m tr-px">{d.type === 'BALANCE' ? 'Balance' : ENTRY[d.entry]} · {c.vol ? `${c.vol.toFixed(2)} @ ` : ''}{c.px ? fmtPrice(c.px) : '—'}</span>
                {c.comm ? <span className="m tr-px">comm. {c.comm.toFixed(2)}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
      {deals.length > limit && <p className="tr-dl-note">Showing the latest {limit} of {deals.length} deals. Export CSV for the full ledger.</p>}
    </div>
  );
}
