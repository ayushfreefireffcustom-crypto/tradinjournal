'use client';

// Client-side paper blotter — educational only, no real orders.
import { useMemo, useState } from 'react';
import type { MacroSignal } from '@/lib/macro-api';
import { formatMacroNumber } from '@/lib/macro-format';
import { tickerMark } from '@/lib/desk';
import { INote, SideChip } from '@/components/v6/macro/ui';

export interface PaperFill {
  id: string;
  asset: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  qty: number;
  at: string;
}

export default function PaperBlotter({
  fills,
  onClear,
  onOpenSignals,
}: {
  fills: PaperFill[];
  onClear: () => void;
  /** Shown as the empty state's action. */
  onOpenSignals?: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    return fills.map(f => {
      const mark = Number(marks[f.id]);
      const px = marks[f.id] && Number.isFinite(mark) ? mark : f.entry;
      const pnl =
        f.direction === 'LONG' ? (px - f.entry) * f.qty : (f.entry - px) * f.qty;
      return { ...f, mark: px, pnl };
    });
  }, [fills, marks]);

  if (!fills.length) {
    return (
      <section className="x-card x-empty mc-paper-empty" data-testid="macro-paper-empty">
        <span className="x-ic"><INote /></span>
        <b>Paper blotter is empty</b>
        <p>Fill a signal from SignalX signals (approved members) to track a simulated position here. It is a practice ledger only, with no real money at risk.</p>
        {onOpenSignals && <button type="button" className="x-btn x-btn--sm" onClick={onOpenSignals} data-testid="macro-paper-open-signals">Open SignalX signals</button>}
      </section>
    );
  }

  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0);
  const pl = (n: number) => <b className={`m ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}`}>{n > 0 ? '+' : ''}{formatMacroNumber(n)}</b>;
  const markInput = (r: (typeof rows)[number]) => (
    <input className="x-input mc-mark m" inputMode="decimal" aria-label={`Mark price for ${r.asset}`} placeholder={String(r.entry)}
      value={marks[r.id] ?? ''} onChange={e => setMarks(m => ({ ...m, [r.id]: e.target.value }))} />
  );

  return (
    <section className="x-card" data-testid="macro-paper-blotter">
      <div className="x-ch"><h2>Paper blotter</h2><span className="x-sub">simulated fills only</span>
        <span className="x-r"><span>Net P&amp;L {pl(totalPnl)}</span><button type="button" onClick={onClear} className="x-btn x-btn--sm">Clear</button></span></div>
      <p className="x-muted mc-p">Edit the mark to see P&amp;L update.</p>
      <div className="mc-tbl-only">
        <table className="x-tbl">
          <thead><tr><th>Asset</th><th>Side</th><th className="n">Entry</th><th className="n">Qty</th><th>Mark</th><th className="n">P&amp;L</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><span className="x-sym"><span className="x-mk">{tickerMark(r.asset)}</span><b>{r.asset}</b></span></td>
                <td><SideChip dir={r.direction} /></td>
                <td className="n m">{formatMacroNumber(r.entry)}</td>
                <td className="n m">{formatMacroNumber(r.qty)}</td>
                <td>{markInput(r)}</td>
                <td className="n">{pl(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mc-list-only mc-plist x-list">
        {rows.map(r => (
          <li key={r.id}>
            <span className="x-sym"><span className="x-mk">{tickerMark(r.asset)}</span><span><b>{r.asset}</b><small className="m">{formatMacroNumber(r.qty)} @ {formatMacroNumber(r.entry)}</small></span></span>
            <SideChip dir={r.direction} />
            <span className="mc-plist-pl">{pl(r.pnl)}</span>
            <label className="mc-plist-mk"><span>Mark</span>{markInput(r)}</label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function paperFillFromSignal(s: MacroSignal): PaperFill | null {
  if (s.direction === 'WAIT' || s.qty == null) return null;
  const entry = (s.entryLow + s.entryHigh) / 2;
  return {
    id: `${s.asset}-${s.asOf}-${Math.random().toString(36).slice(2, 7)}`,
    asset: s.asset,
    direction: s.direction,
    entry,
    stop: s.stop,
    qty: s.qty,
    at: new Date().toISOString(),
  };
}
