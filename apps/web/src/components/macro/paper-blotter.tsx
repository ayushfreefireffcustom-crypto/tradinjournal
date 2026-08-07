'use client';

// Client-side paper blotter — educational only, no real orders.
import { useMemo, useState } from 'react';
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
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-paper-empty">
        Paper blotter is empty. Fill a signal from the Signals tab (approved members).
      </div>
    );
  }

  return (
    <div className="tcard p-4" data-testid="macro-paper-blotter">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// PAPER BLOTTER</div>
        <button type="button" onClick={onClear} className="text-[11px] text-fg-3 hover:text-fg underline">
          Clear
        </button>
      </div>
      <p className="text-[11px] text-fg-3 mt-1">Simulated fills only — zero real-money risk.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-fg-3 text-left">
            <tr>
              <th className="py-1 pr-2">Asset</th>
              <th className="py-1 pr-2">Side</th>
              <th className="py-1 pr-2">Entry</th>
              <th className="py-1 pr-2">Qty</th>
              <th className="py-1 pr-2">Mark</th>
              <th className="py-1">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border-soft">
                <td className="py-2 pr-2">{r.asset}</td>
                <td className={`py-2 pr-2 ${r.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>{r.direction}</td>
                <td className="py-2 pr-2 numeric">{formatMacroNumber(r.entry)}</td>
                <td className="py-2 pr-2 numeric">{formatMacroNumber(r.qty)}</td>
                <td className="py-2 pr-2">
                  <input
                    className="w-24 bg-surface border border-border rounded px-1 py-0.5 numeric"
                    placeholder={String(r.entry)}
                    value={marks[r.id] ?? ''}
                    onChange={e => setMarks(m => ({ ...m, [r.id]: e.target.value }))}
                  />
                </td>
                <td className={`py-2 numeric ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
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
