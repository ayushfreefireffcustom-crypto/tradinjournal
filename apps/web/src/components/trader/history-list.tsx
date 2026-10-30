'use client';

import { useCallback, useEffect, useState } from 'react';
import { traderApi, type TraderAnalysis } from '@/lib/trader-api';
import { tickerMark } from '@/lib/desk';
import { DirChip, IRefresh } from '@/components/v6/ai/bits';
import { OutcomeBadge } from './outcome-badge';

export default function AnalysisHistory({
  refreshKey,
  onSelect,
}: {
  refreshKey?: number;
  onSelect?: (a: TraderAnalysis) => void;
}) {
  const [rows, setRows] = useState<TraderAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await traderApi.history());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section className="x-card" data-testid="trader-history" aria-labelledby="ai-h-t">
      <div className="x-ch">
        <h2 id="ai-h-t">Recent calls</h2>
        {rows.length > 0 && <span className="x-sub">{rows.length}</span>}
        <div className="x-r">
          <button type="button" onClick={() => void load()} className="x-btn x-btn--ghost x-btn--icon x-btn--sm" aria-label="Refresh" disabled={loading}><IRefresh size={15} spin={loading} /></button>
        </div>
      </div>
      {loading && rows.length === 0 && <div className="ai-skrows">{[0, 1, 2].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>}
      {error && (
        <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>
      )}
      {!loading && !error && rows.length === 0 && <div className="x-empty"><p>No calls yet. Analyse a symbol above and it lands here.</p></div>}
      {rows.length > 0 && (
        <ul className="ai-calls">
          {rows.map(a => (
            <li key={a.id ?? `${a.symbol}-${a.asOf}`}>
              <button type="button" className="ai-call" onClick={() => onSelect?.(a)}>
                <span className="x-mk">{tickerMark(a.symbol)}</span>
                <span className="x-sym"><span className="ai-ell"><b>{a.symbol}</b><small>{a.timeframes.join('/')} · {new Date(a.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {a.confidence}%</small></span></span>
                <DirChip dir={a.direction} />
                <OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome} className="ai-call-o" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
