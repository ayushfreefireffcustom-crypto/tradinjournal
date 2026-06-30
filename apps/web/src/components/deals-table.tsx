'use client';

import type { Deal } from '@/lib/api';

interface Props {
  deals: Deal[];
  loading: boolean;
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  BUY: 'text-profit',
  SELL: 'text-loss',
  BALANCE: 'text-fg-2',
};

const COLS = ['Ticket', 'Time', 'Type', 'Symbol', 'Volume', 'Price', 'P&L', 'Comm'];

export default function DealsTable({ deals, loading, error }: Props) {
  if (error) {
    return (
      <div className="tcard p-8 text-center text-loss text-[13px]" data-testid="deals-table-error">{error}</div>
    );
  }

  return (
    <div className="tcard overflow-hidden" data-testid="deals-table">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-[0.25em] text-fg-3">DEAL_LOG</span>
          <span className="font-display font-bold text-[13px] tracking-tight">Recent fills</span>
        </div>
        <span className="text-[10px] tracking-[0.22em] text-fg-3 border border-border-soft px-2 py-1">
          {loading ? '...' : `${deals.length} DEALS`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              {COLS.map(c => (
                <th key={c} className="px-3 py-2.5 text-left text-[10px] tracking-[0.22em] text-fg-3 uppercase font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft">
                  {COLS.map((c, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-2.5 bg-surface-hover" style={{ width: 40 + j * 10 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : deals.length === 0 ? (
              <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-fg-3 text-[12px]">No deals on file for this account.</td></tr>
            ) : (
              deals.slice(0, 25).map(d => {
                const profit = parseFloat(d.profit);
                const pos = profit >= 0;
                return (
                  <tr key={d.dealTicket} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                    <td className="px-3 py-3 text-fg-3 numeric">#{d.dealTicket}</td>
                    <td className="px-3 py-3 text-fg-2 numeric whitespace-nowrap">
                      {new Date(d.dealTime).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] tracking-[0.22em] font-medium ${TYPE_COLORS[d.type] ?? ''}`}>{d.type}</span>
                    </td>
                    <td className="px-3 py-3 font-display font-bold tracking-tight">{d.symbol}</td>
                    <td className="px-3 py-3 numeric text-fg-2">{parseFloat(d.volume).toFixed(2)}</td>
                    <td className="px-3 py-3 numeric text-fg-2">{parseFloat(d.price) > 0 ? parseFloat(d.price).toFixed(5) : '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>
                        {pos ? '+' : ''}{profit.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-3 numeric text-fg-3">{parseFloat(d.commission).toFixed(2)}</td>
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
