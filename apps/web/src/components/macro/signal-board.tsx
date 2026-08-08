'use client';

import { useCallback, useEffect, useState } from 'react';
import { LockKey } from '@phosphor-icons/react';
import { macroApi, type MacroSignal } from '@/lib/macro-api';
import { formatMacroNumber } from '@/lib/macro-format';

function dirClass(d: string): string {
  if (d === 'LONG') return 'text-profit border-profit/30 bg-profit/10';
  if (d === 'SHORT') return 'text-loss border-loss/30 bg-loss/10';
  return 'text-fg-3 border-border bg-surface-hover';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-soft last:border-b-0">
      <span className="text-[10px] tracking-[0.14em] text-fg-3 uppercase">{label}</span>
      <span className="numeric text-[12px] text-fg">{children}</span>
    </div>
  );
}

export default function SignalBoard({
  onPaperFill,
  onRequestAccess,
}: {
  onPaperFill?: (s: MacroSignal) => void;
  onRequestAccess?: () => void;
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
      <section className="tcard p-6 sm:p-8 text-center max-w-xl mx-auto" data-testid="macro-signals-locked">
        <div className="w-11 h-11 mx-auto rounded-full border border-border-strong flex items-center justify-center text-fg-3">
          <LockKey size={20} />
        </div>
        <h3 className="mt-3 font-display font-black text-lg tracking-tight">TradeAI Signals — Members Only</h3>
        <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">
          Entry / stop / target levels are computed <span className="text-fg-2">server-side</span> and never sent to
          non-members. Map a verified exchange account to unlock the full signal board with reasoning and risk sizing.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRequestAccess && (
            <button
              type="button"
              onClick={onRequestAccess}
              className="btn px-4 py-2 text-[11px] tracking-[0.12em] uppercase bg-profit/15 text-profit border border-profit/30"
              data-testid="macro-signals-request-access"
            >
              Request access
            </button>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="px-4 py-2 text-[11px] tracking-[0.12em] uppercase text-fg-3 border border-border hover:text-fg rounded-[var(--radius-btn)]"
          >
            Re-check
          </button>
        </div>
      </section>
    );
  }

  if (!signals?.length) {
    return (
      <div className="tcard p-6 text-sm text-fg-3 text-center" data-testid="macro-signals-empty">
        No signals this print — the engine holds when confluence is inconclusive. Check back after the next ingest.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="macro-signals">
      {signals.map(s => {
        const conf = Math.max(0, Math.min(100, s.confidence));
        return (
          <article key={`${s.asset}-${s.asOf}`} className="tcard p-4 flex flex-col" data-testid={`macro-signal-${s.asset}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display font-black text-xl tracking-tight">{s.asset}</span>
              <span className={`text-[10px] tracking-[0.16em] px-2.5 py-1 rounded border ${dirClass(s.direction)}`}>
                {s.direction}
              </span>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between text-[9px] tracking-[0.14em] text-fg-3">
                <span>CONFIDENCE</span>
                <span className="numeric text-fg">{s.confidence}%</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-border-soft overflow-hidden">
                <div className="h-full bg-fg-2" style={{ width: `${conf}%` }} />
              </div>
            </div>

            <div className="mt-3">
              <Row label="Entry">{formatMacroNumber(s.entryLow)} – {formatMacroNumber(s.entryHigh)}</Row>
              <Row label="Stop"><span className="text-loss">{formatMacroNumber(s.stop)}</span></Row>
              <Row label="Targets">
                <span className="text-profit">{formatMacroNumber(s.t1)}</span> / {formatMacroNumber(s.t2)} /{' '}
                <span className="text-fg-2">{formatMacroNumber(s.t3)}</span>
              </Row>
              <Row label="1% Risk Size">{s.qty == null ? '—' : formatMacroNumber(s.qty)}</Row>
            </div>

            <p className="text-[12px] text-fg-2 mt-3 leading-relaxed">{s.rationale}</p>
            <p className="text-[11px] text-fg-3 mt-2">
              <span className="text-fg-2">Invalidation:</span> {s.invalidation}
            </p>

            <div className="mt-3 pt-3 border-t border-border-soft flex items-center justify-between">
              <span className="text-[9px] tracking-[0.14em] text-fg-3">{s.engineVer}</span>
              {onPaperFill && s.direction !== 'WAIT' && (
                <button
                  type="button"
                  onClick={() => onPaperFill(s)}
                  className="text-[11px] tracking-[0.12em] uppercase text-profit hover:underline"
                  data-testid={`macro-paper-${s.asset}`}
                >
                  Paper fill @ mid →
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
