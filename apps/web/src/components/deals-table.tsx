'use client';

import type { Deal } from '@/lib/api';

interface Props {
  deals: Deal[];
  loading: boolean;
  error: string;
}

const TYPE: Record<string, { color: string; bg: string }> = {
  BUY:     { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  SELL:    { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  BALANCE: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
};

const COLS = ['Ticket', 'Time', 'Type', 'Symbol', 'Volume', 'Price', 'Profit', 'Commission'];

function SkeletonRow() {
  return (
    <tr>
      {[70, 90, 55, 65, 45, 80, 55, 50].map((w, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div className="skeleton" style={{ height: 11, width: w }} />
        </td>
      ))}
    </tr>
  );
}

export default function DealsTable({ deals, loading, error }: Props) {
  if (error) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '32px 24px', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Deal History</span>
        <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {loading ? '…' : `${deals.length} deals`}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {COLS.map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text-subtle)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '52px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No deals found for this account
                </td>
              </tr>
            ) : (
              deals.map(deal => {
                const profit = parseFloat(deal.profit);
                const pos = profit >= 0;
                const badge = TYPE[deal.type] ?? { color: '#a1a1aa', bg: 'rgba(161,161,170,0.1)' };
                return (
                  <tr
                    key={deal.dealTicket}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-subtle)' }}>
                      #{deal.dealTicket}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(deal.dealTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600, color: badge.color, background: badge.bg, letterSpacing: '0.03em' }}>
                        {deal.type}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontWeight: 500, color: 'var(--text)' }}>
                      {deal.symbol || <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {parseFloat(deal.volume).toFixed(2)}
                    </td>
                    <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                      {parseFloat(deal.price) > 0 ? parseFloat(deal.price).toFixed(5) : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        fontVariantNumeric: 'tabular-nums',
                        color: pos ? 'var(--green)' : 'var(--red)',
                        background: pos ? 'var(--green-bg)' : 'var(--red-bg)',
                      }}>
                        {pos ? '+' : ''}{profit.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-subtle)', fontSize: 12 }}>
                      {parseFloat(deal.commission).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
