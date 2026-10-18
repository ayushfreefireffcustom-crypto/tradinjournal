'use client';

import { useCallback, useEffect, useState } from 'react';
import { traderApi, type TraderAnalysis } from '@/lib/trader-api';
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
    <section className="v3-card sx-hist" data-testid="trader-history" aria-labelledby="sx-h-t">
      <div className="v3-ch"><h3 id="sx-h-t">Recent</h3>
        <button type="button" onClick={() => void load()} className="cr-ref" aria-label="Refresh"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={loading ? 'spin' : undefined}><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg></button>
      </div>
      {loading && rows.length === 0 && <div style={{ padding: '4px 22px 18px', display: 'grid', gap: 8 }}>{[0, 1, 2].map(i => <div key={i} className="skel d-sk" style={{ height: 24 }} />)}</div>}
      {error && <p className="r-err" style={{ padding: '0 22px 18px' }}>{error}</p>}
      {!loading && !error && rows.length === 0 && <div className="d-empty">No calls yet — analyse a symbol above.</div>}
      {rows.length > 0 && (
        <ul>
          {rows.map(a => (
            <li key={a.id ?? `${a.symbol}-${a.asOf}`}>
              <button type="button" onClick={() => onSelect?.(a)}>
                <b>{a.symbol}</b>
                <span className={`v3-pill ${a.direction === 'LONG' ? 'g' : a.direction === 'SHORT' ? 'r' : 'n'}`}>{a.direction === 'LONG' ? 'Long' : a.direction === 'SHORT' ? 'Short' : 'Wait'}</span>
                <span className="mute num">· {a.timeframes.join('/')} · {new Date(a.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {a.confidence}%</span>
                <span className="end"><OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
