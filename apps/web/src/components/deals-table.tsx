'use client';

import type { Deal } from '@/lib/api';

interface Props {
  deals: Deal[];
  loading: boolean;
  error: string;
}

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  BUY:     { label: 'BUY',     color: '#86efac', bg: '#14532d33' },
  SELL:    { label: 'SELL',    color: '#fca5a5', bg: '#7f1d1d33' },
  BALANCE: { label: 'BALANCE', color: '#93c5fd', bg: '#1e3a5f33' },
};

function SkeletonRow() {
  return (
    <tr>
      {[80, 100, 60, 70, 50, 80, 60, 50].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-3 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export default function DealsTable({ deals, loading, error }: Props) {
  if (error) {
    return (
      <div className="rounded-2xl border px-6 py-10 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Table header bar */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Deal History</h2>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          {loading ? '…' : `${deals.length} deals`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid var(--border)` }}>
              {['Ticket', 'Time', 'Type', 'Symbol', 'Volume', 'Price', 'Profit', 'Commission'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-subtle)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : deals.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No deals found for this account</p>
                </td>
              </tr>
            ) : (
              deals.map((deal) => {
                const profit = parseFloat(deal.profit);
                const profitPositive = profit >= 0;
                const badge = TYPE_BADGE[deal.type] ?? { label: deal.type, color: '#d4d4d8', bg: '#3f3f4633' };
                return (
                  <tr
                    key={deal.dealTicket}
                    className="transition-colors duration-100"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-subtle)' }}>
                      #{deal.dealTicket}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {new Date(deal.dealTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: badge.color, background: badge.bg }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>
                      {deal.symbol || <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text)' }}>
                      {parseFloat(deal.volume).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums" style={{ color: 'var(--text)' }}>
                      {deal.price !== '0' && deal.price !== '0.0' ? parseFloat(deal.price).toFixed(5) : <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      <span
                        className="px-2 py-0.5 rounded-lg text-xs"
                        style={{
                          color: profitPositive ? 'var(--green)' : 'var(--red)',
                          background: profitPositive ? 'var(--green-subtle)' : 'var(--red-subtle)',
                        }}
                      >
                        {profitPositive ? '+' : ''}{profit.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
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
