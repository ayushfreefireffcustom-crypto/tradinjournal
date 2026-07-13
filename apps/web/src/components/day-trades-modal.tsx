'use client';

import { useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, X } from '@phosphor-icons/react';
import type { Trade } from '@/lib/api';

function fmtDur(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

// Day-detail modal opened from a heatmap/calendar cell: lists the closed trades
// for that calendar day. Each row deep-links to the full trade detail when an
// account id is supplied.
export default function DayTradesModal({
  date, trades, accountId, onClose,
}: {
  date: Date;
  trades: Trade[];
  accountId?: string;
  onClose: () => void;
}) {
  // Esc to close + lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const sorted = [...trades].sort((a, b) => +new Date(a.closeTime!) - +new Date(b.closeTime!));
  const total = sorted.reduce((s, t) => s + t.netPnl, 0);
  const wins = sorted.filter(t => t.netPnl > 0).length;
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="day-trades-modal" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg tcard p-0 fade-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.25em] text-fg-3 uppercase">Daily breakdown</div>
            <h2 className="font-display font-bold text-[17px] tracking-tight mt-1 truncate">{dateLabel}</h2>
            <div className="text-[11px] text-fg-3 tracking-wide mt-0.5 numeric">
              {sorted.length} {sorted.length === 1 ? 'trade' : 'trades'} · {wins}W / {sorted.length - wins}L
            </div>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <div className="text-right">
              <div className={`font-display font-black text-2xl tracking-tight numeric ${total >= 0 ? 'text-profit' : 'text-loss'}`}>
                {total >= 0 ? '+' : '-'}${Math.abs(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] tracking-widest text-fg-3 uppercase">Net P&L</div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              data-testid="day-modal-close"
              className="w-7 h-7 rounded-md border border-border text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring shrink-0"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </div>

        {/* Trade list */}
        <div className="overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="px-5 py-10 text-center text-fg-3 text-[12px]">No closed trades on this day.</div>
          ) : (
            sorted.map(t => {
              const pos = t.netPnl >= 0;
              const rowClass = `row-interactive flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 border-b border-border-soft last:border-0 ${accountId ? 'cursor-pointer' : ''}`;
              const rowStyle: CSSProperties = { ['--row-accent' as string]: pos ? 'var(--color-profit)' : 'var(--color-loss)' };
              const inner = (
                <>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] tracking-[0.2em] ${t.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>
                    {t.direction === 'LONG' ? <ArrowUpRight size={12} weight="bold" /> : <ArrowDownRight size={12} weight="bold" />}{t.direction === 'LONG' ? 'L' : 'S'}
                  </span>
                  <span className="font-semibold tracking-tight">{t.symbol}</span>
                  <span className="text-[11px] text-fg-2 numeric">{t.volume.toFixed(2)} lots</span>
                  <span className="text-[10px] sm:text-[11px] text-fg-3 numeric">
                    {t.closeTime ? new Date(t.closeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'} · {fmtDur(t.durationSecs ?? 0)}
                  </span>
                  <div className="ml-auto text-right">
                    <div className={`font-display font-bold text-[14px] tracking-tight numeric ${pos ? 'text-profit' : 'text-loss'}`}>{pos ? '+' : ''}${t.netPnl.toFixed(2)}</div>
                    <div className="text-[9px] text-fg-3 tracking-widest numeric">{t.entryPrice.toFixed(4)} → {t.exitPrice?.toFixed(4)}</div>
                  </div>
                </>
              );
              return accountId ? (
                <Link key={t.positionId} href={`/trades/${t.positionId}?account=${encodeURIComponent(accountId)}`} onClick={onClose} data-testid={`day-trade-${t.positionId}`} className={rowClass} style={rowStyle}>
                  {inner}
                </Link>
              ) : (
                <div key={t.positionId} data-testid={`day-trade-${t.positionId}`} className={rowClass} style={rowStyle}>
                  {inner}
                </div>
              );
            })
          )}
        </div>

        {accountId && sorted.length > 0 && (
          <div className="px-5 py-3 border-t border-border-soft text-right">
            <Link href="/trades" onClick={onClose} className="text-[10px] tracking-[0.2em] text-fg-3 hover:text-fg focus-ring rounded px-1 uppercase">
              Open trade log →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
