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

export default function DealsTable({ deals, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border flex justify-center py-16" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border px-6 py-10 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Table header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Deal History</h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          {deals.length} deals
        </span>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No deals found for this account</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid var(--border)` }}>
                {['Ticket', 'Time', 'Type', 'Symbol', 'Volume', 'Price', 'Profit', 'Commission'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((deal, i) => {
                const profit = parseFloat(deal.profit);
                const badge = TYPE_BADGE[deal.type] ?? { label: deal.type, color: '#d4d4d8', bg: '#3f3f4633' };
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={deal.dealTicket}
                    style={{ background: isEven ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border)' }}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      #{deal.dealTicket}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {new Date(deal.dealTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: badge.color, background: badge.bg }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text)' }}>
                      {deal.symbol || '—'}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>
                      {parseFloat(deal.volume).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text)' }}>
                      {deal.price !== '0' ? parseFloat(deal.price).toFixed(5) : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {parseFloat(deal.commission).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
