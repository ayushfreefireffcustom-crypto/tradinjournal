'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/admin-api';

type Ops = Awaited<ReturnType<typeof adminApi.traderOps>>;

const VENDOR_LABEL: Record<string, string> = {
  unusual_whales: 'Unusual Whales',
  deribit: 'Deribit',
  benzinga: 'Benzinga',
  santiment: 'Santiment',
};

export function TraderOpsStrip() {
  const [ops, setOps] = useState<Ops | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi.traderOps().then(d => { if (!cancelled) setOps(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!ops) return null;

  const champ = ops.champion === 'lgbm' ? 'LightGBM serving' : ops.champion === 'logistic' ? 'Logistic champion' : 'Heuristic';

  return (
    <section className="x-card" data-testid="admin-trader-ops">
      <div className="x-ch"><h2>SignalX model</h2><span className="x-sub">{champ}</span></div>
      <div className="x-strip ad-strip4">
        <div><span>Graded samples</span><b className="m">{ops.sampleSize.toLocaleString('en-US')}</b></div>
        <div><span>Open paper trades</span><b className="m">{ops.openPaperPositions}</b></div>
        <div><span>Challenger</span><b>{ops.lgbm.serving ? 'Serving' : ops.lgbm.trained ? 'Not serving' : 'Untrained'}</b></div>
        <div><span>Last train</span><b>{ops.lastTrain ? new Date(ops.lastTrain).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
      </div>
      {ops.lgbm.reason && <p className="ad-note">{ops.lgbm.reason}</p>}
      <div className="ad-vendors">
        {ops.vendors.map(v => (
          <span key={v.id} className={v.ok ? 'x-tag x-tag--g' : v.ok === false ? 'x-tag x-tag--r' : 'x-tag'}>
            <i className={`x-dot ${v.ok ? '' : v.ok === false ? 'x-dot--r' : 'x-dot--off'}`} />
            {VENDOR_LABEL[v.id] ?? v.id}{v.ok == null ? '' : v.ok ? ' · live' : ' · down'}
          </span>
        ))}
      </div>
    </section>
  );
}
