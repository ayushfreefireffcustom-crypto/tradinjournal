'use client';

import { useEffect, useState } from 'react';
import { traderApi, type TraderTrackRecord } from '@/lib/trader-api';
import { IChevR } from '@/components/v6/ai/bits';
import { pct, signedR } from './outcome-badge';

export default function TrackRecordPanel({ scope = 'all' }: { scope?: 'all' | 'me' }) {
  const [record, setRecord] = useState<TraderTrackRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    traderApi.trackRecord(scope)
      .then(d => { if (!cancelled) setRecord(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Unavailable'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  const early = (record?.graded ?? 0) < 30;
  const exp = record?.expectancyR;
  return (
    <section className="x-card ai-tr" data-testid="trader-track-record" aria-labelledby="ai-tr-t">
      <div className="x-ch">
        <h2 id="ai-tr-t">Track record</h2>
        {record && record.graded > 0 && <span className="x-sub">{record.graded} graded</span>}
      </div>
      {loading && <div className="ai-skrows">{[0, 1, 2].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>}
      {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
      {!loading && !error && record && (
        <>
          <div className="x-strip">
            <div><span>Hit rate</span><b className={record.hitRate != null && record.hitRate >= 0.5 ? 'pos' : ''}>{pct(record.hitRate, 0)}</b></div>
            <div><span>Expectancy</span><b className={exp != null && exp < 0 ? 'neg' : exp != null && exp > 0 ? 'pos' : ''}>{signedR(exp).replace('-', '−')}</b></div>
            <div><span>Open</span><b>{record.pending}</b></div>
            <div><span>Expired</span><b>{record.expired}</b></div>
          </div>
          {early && <p className="ai-note">{record.graded === 0 ? 'Nothing graded yet. Calls show up here after their horizon closes.' : `${record.graded} graded so far, too few to trust a hit rate.`}</p>}
          {record.graded > 0 && (
            <div className="ai-cal" data-testid="trader-calibration">
              <h4>Calibration <span>· confidence said vs hit</span></h4>
              {record.calibration.map(b => {
                const realized = b.hitRate != null ? b.hitRate * 100 : null;
                return (
                  <div key={b.bucket} className="ai-cal-row" title={`${b.count} calls · said ${b.predicted}% · hit ${realized == null ? '—' : realized.toFixed(0) + '%'}`}>
                    <span className="m">{b.bucket.replace('-100', '+').replace('-', '–')}%</span>
                    <span className="ai-trk"><i style={{ width: `${realized ?? 0}%` }} /><em style={{ left: `${b.predicted}%` }} /></span>
                    <b className="m">{realized == null ? '—' : `${realized.toFixed(0)}%`}</b>
                  </div>
                );
              })}
              <p className="ai-legend"><span><i /> hit rate</span><span><em /> confidence it said</span></p>
            </div>
          )}
          <details className="ai-how"><summary><IChevR size={13} />How grading works</summary><p>{record.disclaimer}</p></details>
        </>
      )}
    </section>
  );
}
