'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { IArrowRight, IClose } from '@/components/v3/icons';
import { money, dur, tone } from '@/components/v3/format';
import '@/styles/app-v3.css';
import type { Trade } from '@/lib/api';

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
  // Portal to <body> so `position: fixed` is viewport-relative (unaffected by
  // ancestor transforms/animations that would otherwise create a containing block).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!mounted) return null;

  return createPortal(
    <div className="v3 v3-modal" data-testid="day-trades-modal" role="dialog" aria-modal="true" aria-labelledby="dtm-t">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className="v3-modal-card">
        <header className="v3-modal-hd">
          <div style={{ minWidth: 0 }}>
            <small>Daily breakdown</small>
            <h2 id="dtm-t">{dateLabel}</h2>
            <p className="num">{sorted.length} {sorted.length === 1 ? 'trade' : 'trades'} · {wins} won · {sorted.length - wins} lost</p>
          </div>
          <div className="dtm-net">
            <b className={`num ${tone(total)}`}>{money(total)}</b>
            <span>Net P&amp;L</span>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="day-modal-close" className="v3-modal-x"><IClose size={16} /></button>
        </header>
        <div className="v3-modal-bd">
          {sorted.length === 0 ? <div className="d-empty">No closed trades on this day.</div> : sorted.map(t => {
            const inner = (
              <>
                <div className="d-sym"><i>{t.symbol.slice(0, 2)}</i><span>{t.symbol}<small className="num">{t.closeTime ? new Date(t.closeTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'} · {dur(t.durationSecs)} · {t.volume.toFixed(2)} lots</small></span></div>
                <span className={`d-side ${t.direction === 'LONG' ? 'L' : 'S'}`}>{t.direction === 'LONG' ? 'Long' : 'Short'}</span>
                <b className={`num ${tone(t.netPnl)}`}>{money(t.netPnl)}</b>
              </>
            );
            return accountId ? (
              <Link key={t.positionId} href={`/trades/${t.positionId}?account=${encodeURIComponent(accountId)}`} onClick={onClose} data-testid={`day-trade-${t.positionId}`} className="dtm-row">{inner}</Link>
            ) : <div key={t.positionId} data-testid={`day-trade-${t.positionId}`} className="dtm-row">{inner}</div>;
          })}
        </div>
        {accountId && sorted.length > 0 && (
          <footer className="v3-modal-ft"><Link href="/trades" onClick={onClose} className="v3-link">Open trade log <IArrowRight size={14} /></Link></footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
