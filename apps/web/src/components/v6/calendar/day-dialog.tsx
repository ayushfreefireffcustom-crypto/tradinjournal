'use client';

// Day detail: the closed trades for one calendar day. Opened from a calendar or
// heatmap cell. A centred dialog on desktop, a bottom sheet on phones.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from '@/components/v6/ui/link';
import type { Trade } from '@/lib/api';
import { fmtHold, fmtUsd } from '@/lib/dashboard-v6';
import { tickerMark } from '@/lib/desk';
import { SideChip } from '@/components/v6/desk';
import { useDialog } from '@/components/v6/ui/use-dialog';
import '@/styles/v6/calendar.css';

export default function DayDialog({ date, trades, accountId, onClose }: { date: Date; trades: Trade[]; accountId?: string; onClose: () => void }) {
  // Portal to <body> (inside its own .v6 scope) so `position: fixed` is viewport-relative.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ref = useDialog({ onClose });

  const sorted = [...trades].sort((a, b) => +new Date(a.closeTime!) - +new Date(b.closeTime!));
  const total = sorted.reduce((s, t) => s + t.netPnl, 0);
  const wins = sorted.filter(t => t.netPnl > 0).length;
  // One line even on a phone: "Fri 23 Oct" (with the year only when it isn't this year).
  const dateLabel = `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}${date.getFullYear() !== new Date().getFullYear() ? ` ${date.getFullYear()}` : ''}`;

  if (!mounted) return null;
  return createPortal(
    <div className="v6 cl-layer">
      <div className="x-dialog-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} className="x-dialog cl-dlg" data-testid="day-trades-modal" role="dialog" aria-modal="true" aria-labelledby="cl-dlg-t">
          <header className="cl-dlg-hd">
            <div className="x-min0">
              <small>Day breakdown</small>
              <h2 id="cl-dlg-t">{dateLabel}</h2>
              <p>{sorted.length} {sorted.length === 1 ? 'trade' : 'trades'} · {wins} won · {sorted.length - wins} lost</p>
            </div>
            <button data-autofocus onClick={onClose} aria-label="Close" data-testid="day-modal-close" className="x-btn x-btn--icon x-btn--sm">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div className="cl-dlg-net">
            <span>Net P&amp;L</span>
            <b className={`m ${total > 0 ? 'pos' : total < 0 ? 'neg' : ''}`}>{sorted.length ? fmtUsd(total) : '—'}</b>
          </div>
          <div className="cl-dlg-bd">
            {sorted.length === 0 ? <div className="x-empty"><p>No closed trades on this day.</p></div> : sorted.map(t => {
              const inner = (
                <>
                  <span className="x-mk">{tickerMark(t.symbol)}</span>
                  <span className="cl-dlg-sym">
                    <b>{t.symbol}</b>
                    <small className="m">{t.closeTime ? new Date(t.closeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'} · {fmtHold(t.durationSecs)} · {t.volume.toFixed(2)} lots</small>
                  </span>
                  <SideChip dir={t.direction} />
                  <b className={`m cl-dlg-pl ${t.netPnl > 0 ? 'pos' : t.netPnl < 0 ? 'neg' : ''}`}>{fmtUsd(t.netPnl)}</b>
                </>
              );
              return accountId ? (
                <Link key={t.positionId} href={`/trades/${t.positionId}?account=${encodeURIComponent(accountId)}`} onClick={onClose} data-testid={`day-trade-${t.positionId}`} className="cl-dlg-row">{inner}</Link>
              ) : <div key={t.positionId} data-testid={`day-trade-${t.positionId}`} className="cl-dlg-row">{inner}</div>;
            })}
          </div>
          {accountId && sorted.length > 0 && (
            <footer className="cl-dlg-ft"><Link href="/trades" onClick={onClose} className="x-btn x-btn--sm">Open trade log</Link></footer>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
