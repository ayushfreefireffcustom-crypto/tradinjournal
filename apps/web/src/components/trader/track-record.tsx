'use client';

import { useEffect, useState } from 'react';
import { traderApi, type TraderTrackRecord } from '@/lib/trader-api';
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
  return (
    <section className="v3-card sx-tr" data-testid="trader-track-record" aria-labelledby="sx-tr-t">
      <div className="sx-tr-hd">
        <h3 id="sx-tr-t">Track record{record && record.graded > 0 && <span> · {record.graded} graded</span>}</h3>
        <p>Targets, stops, and whether the confidence matched.</p>
      </div>
      {loading && <div style={{ padding: '0 22px 22px', display: 'grid', gap: 8 }}>{[0, 1, 2].map(i => <div key={i} className="skel d-sk" style={{ height: 34 }} />)}</div>}
      {error && <p className="r-err" style={{ padding: '0 22px 20px' }}>{error}</p>}
      {!loading && !error && record && (
        <>
          <div className="sx-stats">
            <div><span>Hit rate</span><b className={`num ${record.hitRate != null && record.hitRate >= 0.5 ? 'lg' : ''}`}>{pct(record.hitRate, 0)}</b></div>
            <div><span>Expectancy</span><b className={`num ${record.expectancyR != null && record.expectancyR < 0 ? 'sh' : ''}`}>{signedR(record.expectancyR).replace('-', '−')}</b></div>
            <div><span>Open</span><b className="num">{record.pending}</b></div>
            <div><span>Expired</span><b className="num">{record.expired}</b></div>
          </div>
          {early && <p className="sx-note">{record.graded === 0 ? 'Nothing graded yet. Calls show up here after the horizon closes.' : `${record.graded} graded so far — too few to trust a hit rate.`}</p>}
          {record.graded > 0 && (
            <div className="sx-cal" data-testid="trader-calibration">
              <h4>Calibration <span>· said vs hit</span></h4>
              {record.calibration.map((b, i) => {
                const realized = b.hitRate != null ? b.hitRate * 100 : null;
                return (
                  <div key={b.bucket} className="row" title={`${b.count} calls · said ${b.predicted}% · hit ${realized == null ? '—' : realized.toFixed(0) + '%'}`}>
                    <span className="num">{b.bucket.replace('-100', '+').replace('-', '–')}%</span>
                    <span className="trk"><i style={{ width: `${realized ?? 0}%`, animationDelay: `${i * 80}ms` }} /><em style={{ left: `${b.predicted}%` }} /></span>
                    <b className="num">{realized == null ? '—' : `${realized.toFixed(0)}%`}</b>
                  </div>
                );
              })}
              <p className="sx-legend"><i /> hit rate <em /> confidence it said</p>
            </div>
          )}
          <details className="sx-how"><summary>How grading works</summary><p>{record.disclaimer}</p></details>
        </>
      )}
    </section>
  );
}
