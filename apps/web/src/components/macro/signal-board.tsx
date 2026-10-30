'use client';

import { useCallback, useEffect, useState } from 'react';
import { macroApi, type MacroSignal } from '@/lib/macro-api';
import { formatMacroNumber } from '@/lib/macro-format';
import { tickerMark } from '@/lib/desk';
import { ILock, ISpark, SideChip } from '@/components/v6/macro/ui';

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
    return (
      <div className="mc-sig" data-testid="macro-signals-loading" role="status" aria-label="Loading signals">
        {[0, 1, 2].map(i => <div key={i} className="x-skel mc-sk-sig" />)}
      </div>
    );
  }

  if (error) {
    return (
      <section className="x-card x-empty" data-testid="macro-signals-locked">
        <span className="x-ic"><ILock /></span>
        <b>TradeAI signals are for members</b>
        <p>Entry, stop and target levels are computed on the server and never sent to non-members. Map a verified exchange account to unlock the full board with reasoning and risk sizing.</p>
        <div className="mc-btns">
          {onRequestAccess && (
            <button type="button" onClick={onRequestAccess} className="x-btn x-btn--hi" data-testid="macro-signals-request-access">Request access</button>
          )}
          <button type="button" onClick={() => void load()} className="x-btn">Check again</button>
        </div>
      </section>
    );
  }

  if (!signals?.length) {
    return (
      <div className="x-card x-empty" data-testid="macro-signals-empty">
        <span className="x-ic"><ISpark /></span>
        <b>No signals this print</b>
        <p>The engine holds when confluence is inconclusive. Check back after the next ingest.</p>
      </div>
    );
  }

  return (
    <div className="mc-sig" data-testid="macro-signals">
      {signals.map(s => {
        const conf = Math.max(0, Math.min(100, s.confidence));
        return (
          <article key={`${s.asset}-${s.asOf}`} className="x-card mc-sig-c" data-testid={`macro-signal-${s.asset}`}>
            <div className="mc-sig-h">
              <span className="x-sym"><span className="x-mk">{tickerMark(s.asset)}</span><b>{s.asset}</b></span>
              {s.direction === 'WAIT' ? <span className="x-tag">Wait</span> : <SideChip dir={s.direction} />}
            </div>
            <div className="mc-sig-conf">
              <span>Confidence <b className="m">{s.confidence}%</b></span>
              <div className="x-bar"><i style={{ width: `${conf}%` }} /></div>
            </div>
            <div className="mc-rows mc-rows--sm">
              <div className="mc-row"><span>Entry</span><b className="m">{formatMacroNumber(s.entryLow)} – {formatMacroNumber(s.entryHigh)}</b></div>
              <div className="mc-row"><span>Stop</span><b className="m neg">{formatMacroNumber(s.stop)}</b></div>
              <div className="mc-row"><span>Targets</span><b className="m"><span className="pos">{formatMacroNumber(s.t1)}</span> / {formatMacroNumber(s.t2)} / <span className="x-muted">{formatMacroNumber(s.t3)}</span></b></div>
              <div className="mc-row"><span>1% risk size</span><b className="m">{s.qty == null ? '—' : formatMacroNumber(s.qty)}</b></div>
            </div>
            <p className="mc-sig-r">{s.rationale}</p>
            <p className="mc-sig-i"><span>Invalidation</span> {s.invalidation}</p>
            <div className="mc-sig-f">
              <span className="m x-dim">{s.engineVer}</span>
              {onPaperFill && s.direction !== 'WAIT' && (
                <button type="button" onClick={() => onPaperFill(s)} className="x-btn x-btn--sm" data-testid={`macro-paper-${s.asset}`}>Paper fill at mid</button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
