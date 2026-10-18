'use client';

// Raw MT5 deal ledger (v3). Every fill as the broker reported it — the
// position view is reconstructed from these.
import type { Deal } from '@/lib/api';
import { price, stamp, tone } from '@/components/v3/format';

interface Props {
  deals: Deal[];
  loading: boolean;
  error?: string;
  /** Cap rendered rows (the ledger can be long). */
  limit?: number;
}

const ENTRY: Record<Deal['entry'], string> = { IN: 'Open', OUT: 'Close', INOUT: 'Reverse', OUT_BY: 'Close by' };

export default function DealsTable({ deals, loading, error, limit = 200 }: Props) {
  if (error) return <div className="v3-card d-empty" data-testid="deals-table-error" style={{ color: 'var(--short)' }}>{error}</div>;
  const rows = deals.slice(0, limit);
  return (
    <div className="v3-tbl-wrap" data-testid="deals-table">
      <table className="v3-table">
        <thead>
          <tr><th>Ticket</th><th>Time</th><th>Type</th><th>Entry</th><th>Symbol</th><th className="r">Volume</th><th className="r">Price</th><th className="r">Commission</th><th className="r">Profit</th></tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="sk">{Array.from({ length: 9 }).map((_, j) => <td key={j}><div className="skel d-sk" style={{ height: 12, width: 36 + ((i + j) % 4) * 14 }} /></td>)}</tr>
            ))
          ) : rows.length === 0 ? (
            <tr className="sk"><td colSpan={9}><div className="d-empty"><b>No deals on file</b>Fills appear here as soon as MT5 reports them.</div></td></tr>
          ) : (
            rows.map(d => {
              const p = parseFloat(d.profit);
              const showPnl = d.entry !== 'IN' || p !== 0;
              return (
                <tr key={d.dealTicket} className="static">
                  <td className="num mute">#{d.dealTicket}</td>
                  <td className="num mute">{stamp(d.dealTime)}</td>
                  <td>{d.type === 'BALANCE' ? <span className="v3-pill n">Balance</span> : <span className={`d-side ${d.type === 'BUY' ? 'L' : 'S'}`}>{d.type === 'BUY' ? 'Buy' : 'Sell'}</span>}</td>
                  <td className="mute">{d.type === 'BALANCE' ? '—' : ENTRY[d.entry]}</td>
                  <td style={{ fontWeight: 500 }}>{d.symbol || '—'}</td>
                  <td className="r num mute">{parseFloat(d.volume) ? parseFloat(d.volume).toFixed(2) : '—'}</td>
                  <td className="r num">{price(parseFloat(d.price))}</td>
                  <td className="r num mute">{parseFloat(d.commission) ? parseFloat(d.commission).toFixed(2) : '—'}</td>
                  <td className={`r num ${showPnl ? tone(p) : 'mute'}`} style={{ fontWeight: 700 }}>{showPnl ? `${p >= 0 ? '+' : '−'}$${Math.abs(p).toFixed(2)}` : '—'}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {deals.length > limit && <div className="v3-tbl-foot">Showing the latest {limit} of {deals.length} deals · export CSV for the full ledger</div>}
    </div>
  );
}
