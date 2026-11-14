'use client';

// Side-by-side view of 2–4 selected trades (same place as the trade panel).
import { useEffect } from 'react';
import { X } from '@phosphor-icons/react';
import { fmtPrice } from '@/lib/desk';
import { clock, dayTitle, fmtHold, money2, rStr, type TlRow } from '@/lib/tradelog-v2-api';
import { MiniPath } from './mini-path';
import { GradeBox } from './verdict';

export function ComparePanel({ accountId, rows, onClose, onOpen, mode }: { accountId: string; rows: TlRow[]; onClose: () => void; onOpen: (r: TlRow) => void; mode: 'inline' | 'drawer' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const closed = rows.filter(r => r.status === 'CLOSED');
  const net = closed.reduce((a, r) => a + r.net, 0);
  const line = (label: string, f: (r: TlRow) => React.ReactNode) => (
    <tr><th scope="row">{label}</th>{rows.map(r => <td key={r.id}>{f(r)}</td>)}</tr>
  );
  return (
    <aside className={`tl-panel d2-card ${mode}`} aria-label="Compare trades" data-testid="compare-panel" tabIndex={-1}>
      <header className="tl-ph">
        <div className="tl-ph-l"><h2>Compare {rows.length} trades</h2><small>{closed.length ? `Together ${money2(net)}${closed.length < rows.length ? ` (${closed.length} closed)` : ''}` : 'All still open'}</small></div>
        <button type="button" className="tl-x" onClick={onClose} aria-label="Close compare"><X size={16} /></button>
      </header>
      <div className="tl-pb tl-cmp-w">
        <table className="tl-cmp">
          <thead><tr><th />{rows.map(r => <th key={r.id} scope="col"><button type="button" className="tl-link" onClick={() => onOpen(r)}>{r.symbol}</button><small>{r.side === 'LONG' ? 'Long' : 'Short'}</small></th>)}</tr></thead>
          <tbody>
            {line('Path', r => <MiniPath accountId={accountId} row={r} w={72} h={24} />)}
            {line('Closed', r => (r.closeTime ? `${dayTitle(r.day)} ${clock(r.closeTime)}` : 'Open'))}
            {line('Hold', r => fmtHold(r.holdSecs))}
            {line('Lots', r => r.volume)}
            {line('Entry', r => fmtPrice(r.entry, r.exit))}
            {line('Exit', r => (r.exit != null ? fmtPrice(r.exit, r.entry) : '—'))}
            {rows.some(r => r.r != null) && line('R', r => (r.r != null ? <b className={r.r > 0 ? 'up' : r.r < 0 ? 'dn' : ''}>{rStr(r.r)}</b> : '—'))}
            {line('P&L', r => <b className={r.net > 0 ? 'up' : r.net < 0 ? 'dn' : ''}>{money2(r.net)}</b>)}
            {line('Grade', r => <GradeBox grade={r.grade} />)}
            {line('Rules', r => (r.flags.length ? r.flags.map(f => f.short).join(', ') : r.grade ? 'Kept' : '—'))}
            {line('Tags', r => [...(r.emotion ? [r.emotion] : []), ...r.tags].join(', ') || '—')}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
