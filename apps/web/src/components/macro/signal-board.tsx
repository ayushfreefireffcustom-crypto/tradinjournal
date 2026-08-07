'use client';

import { useCallback, useEffect, useState } from 'react';
import { macroApi, type MacroSignal } from '@/lib/macro-api';
import { formatMacroNumber } from '@/lib/macro-format';

function dirClass(d: string): string {
  if (d === 'LONG') return 'text-profit border-profit/30 bg-profit/10';
  if (d === 'SHORT') return 'text-loss border-loss/30 bg-loss/10';
  return 'text-fg-3 border-border bg-surface-hover';
}

export default function SignalBoard({
  onPaperFill,
}: {
  onPaperFill?: (s: MacroSignal) => void;
}) {
  const [signals, setSignals] = useState<MacroSignal[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      setSignals(await macroApi.signals());
    } catch (e) {
      setSignals(null);
      setError(e instanceof Error ? e.message : 'Signals locked');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-signals-loading">Loading signals…</div>;
  }

  if (error) {
    return (
      <div className="tcard p-4 space-y-2" data-testid="macro-signals-locked">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// TRADEAI SIGNALS</div>
        <p className="text-sm text-fg-3">{error}</p>
        <p className="text-[12px] text-fg-3">
          Apply under TradeAI Access. Levels are computed server-side and never sent to non-members.
        </p>
      </div>
    );
  }

  if (!signals?.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-signals-empty">
        No signals yet — wait for the next macro ingest after membership is approved.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid="macro-signals">
      {signals.map(s => (
        <article key={`${s.asset}-${s.asOf}`} className="tcard p-4" data-testid={`macro-signal-${s.asset}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-black text-lg">{s.asset}</span>
            <span className={`text-[10px] tracking-[0.14em] px-2 py-0.5 rounded border ${dirClass(s.direction)}`}>
              {s.direction}
            </span>
          </div>
          <div className="numeric text-[11px] text-fg-3 mt-1">
            confidence {s.confidence}% · engine {s.engineVer}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <div><dt className="text-fg-3">Entry</dt><dd className="numeric">{formatMacroNumber(s.entryLow)} – {formatMacroNumber(s.entryHigh)}</dd></div>
            <div><dt className="text-fg-3">Stop</dt><dd className="numeric text-loss">{formatMacroNumber(s.stop)}</dd></div>
            <div><dt className="text-fg-3">T1 / T2 / T3</dt><dd className="numeric">{formatMacroNumber(s.t1)} / {formatMacroNumber(s.t2)} / {formatMacroNumber(s.t3)}</dd></div>
            <div><dt className="text-fg-3">1% size</dt><dd className="numeric">{s.qty == null ? '—' : formatMacroNumber(s.qty)}</dd></div>
          </dl>
          <p className="text-[12px] text-fg-2 mt-3 leading-relaxed">{s.rationale}</p>
          <p className="text-[11px] text-fg-3 mt-2"><span className="text-fg-2">Invalidation:</span> {s.invalidation}</p>
          {onPaperFill && s.direction !== 'WAIT' && (
            <button
              type="button"
              onClick={() => onPaperFill(s)}
              className="mt-3 text-[11px] tracking-[0.12em] uppercase text-profit hover:underline"
              data-testid={`macro-paper-${s.asset}`}
            >
              Paper fill @ mid
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
