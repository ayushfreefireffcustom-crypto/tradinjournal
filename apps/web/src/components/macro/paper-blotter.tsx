'use client';

// Client-side paper blotter — educational only, no real orders.
import { useMemo, useState } from 'react';
import { Rows } from '@phosphor-icons/react';
import type { MacroSignal } from '@/lib/macro-api';
import { formatMacroNumber } from '@/lib/macro-format';

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
}: {
  fills: PaperFill[];
  onClear: () => void;
}) {
  const [marks, setMarks] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    return fills.map(f => {
      const mark = Number(marks[f.id]);
      const px = Number.isFinite(mark) ? mark : f.entry;
      const pnl =
        f.direction === 'LONG' ? (px - f.entry) * f.qty : (f.entry - px) * f.qty;
      return { ...f, mark: px, pnl };
    });
  }, [fills, marks]);

  if (!fills.length) {
    return (
      <section className="tcard p-6 sm:p-8 text-center max-w-xl mx-auto" data-testid="macro-paper-empty">
        <div className="w-11 h-11 mx-auto rounded-full border border-border-strong flex items-center justify-center text-fg-3">
          <Rows size={20} />
        </div>
        <h3 className="mt-3 font-display font-black text-lg tracking-tight">Paper blotter is empty</h3>
        <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">
          Fill a signal from the <span className="text-fg-2">Signals</span> tab (approved members) to track a simulated
          position here. Zero real-money risk — this is a practice ledger only.
        </p>
      </section>
    );
  }

  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0);

  return (
    <div className="tcard p-4" data-testid="macro-paper-blotter">
      <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// PAPER BLOTTER</div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-[0.14em] text-fg-3">
            NET P&amp;L{' '}
            <span className={`numeric ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatMacroNumber(totalPnl)}</span>
          </span>
          <button type="button" onClick={onClear} className="text-[11px] text-fg-3 hover:text-fg underline">
            Clear
          </button>
        </div>
      </div>
      <p className="text-[11px] text-fg-3 mt-2">Simulated fills only — edit the mark to see P&amp;L update.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-fg-3 text-left text-[10px] tracking-[0.12em] uppercase">
            <tr className="border-b border-border-soft">
              <th className="py-1.5 pr-2 font-medium">Asset</th>
              <th className="py-1.5 pr-2 font-medium">Side</th>
              <th className="py-1.5 pr-2 font-medium text-right">Entry</th>
              <th className="py-1.5 pr-2 font-medium text-right">Qty</th>
              <th className="py-1.5 pr-2 font-medium">Mark</th>
              <th className="py-1.5 font-medium text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border-soft last:border-b-0">
                <td className="py-2 pr-2 font-medium">{r.asset}</td>
                <td className={`py-2 pr-2 ${r.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>{r.direction}</td>
                <td className="py-2 pr-2 numeric text-right">{formatMacroNumber(r.entry)}</td>
                <td className="py-2 pr-2 numeric text-right">{formatMacroNumber(r.qty)}</td>
                <td className="py-2 pr-2">
                  <input
                    className="w-24 bg-surface border border-border rounded px-2 py-1 numeric focus-ring"
                    placeholder={String(r.entry)}
                    value={marks[r.id] ?? ''}
                    onChange={e => setMarks(m => ({ ...m, [r.id]: e.target.value }))}
                  />
                </td>
                <td className={`py-2 numeric text-right ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {formatMacroNumber(r.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
