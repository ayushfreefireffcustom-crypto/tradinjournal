'use client';

import { useEffect, useState } from 'react';
import { alertsApi, type PriceAlert } from '@/lib/alerts-api';

// The user's price alerts (active symbol first). Reloads when reloadToken changes.
export default function AlertsPanel({ activeSymbol, reloadToken, onNew }: { activeSymbol: string; reloadToken: number; onNew?: () => void }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    alertsApi.list().then(r => { if (alive) setAlerts(r.alerts); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadToken]);

  const remove = async (id: string) => { setAlerts(a => a.filter(x => x.id !== id)); await alertsApi.remove(id).catch(() => {}); };
  const toggle = async (a: PriceAlert) => {
    const next = a.status === 'active' ? 'disabled' : 'active';
    setAlerts(list => list.map(x => (x.id === a.id ? { ...x, status: next } : x)));
    await alertsApi.update(a.id, { status: next }).catch(() => {});
  };
  const sorted = [...alerts].sort((a, b) => Number(b.symbol === activeSymbol) - Number(a.symbol === activeSymbol));
  const activeN = alerts.filter(a => a.status === 'active').length;

  return (
    <section className="v3-card ch-side" data-testid="alerts-panel" aria-labelledby="ch-al-t">
      <div className="ch-side-hd">
        <h3 id="ch-al-t">Alerts</h3>
        {activeN > 0 ? <span className="v3-pill v num">{activeN} active</span> : onNew ? <button className="v3-link" onClick={onNew}>+ New</button> : null}
      </div>
      <div className="ch-side-bd">
        {loading ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 58, margin: '4px 0' }} />)
          : sorted.length === 0 ? <p className="ch-none">No alerts yet. Use the Alert button to get pinged at a price.</p>
          : sorted.map(a => (
            <div key={a.id} className={`ch-al ${a.status}`} data-testid={`alert-row-${a.id}`}>
              <div className="t">
                <b className="num">{a.symbol} {a.direction === 'above' ? '≥' : '≤'} {Number(a.threshold).toLocaleString('en-US', { maximumFractionDigits: 5 })}</b>
                <span className="acts">
                  <button onClick={() => toggle(a)} aria-label={a.status === 'active' ? 'Pause alert' : 'Resume alert'} title={a.status === 'active' ? 'Pause' : 'Resume'}>
                    {a.status === 'active'
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>}
                  </button>
                  <button onClick={() => remove(a.id)} aria-label="Delete alert" title="Delete" className="del">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </span>
              </div>
              <small>{a.status === 'triggered' ? 'Triggered' : a.status === 'disabled' ? 'Paused' : a.recurring ? 'Recurring' : 'Once'}{a.note ? ` · ${a.note}` : ''}</small>
            </div>
          ))}
      </div>
    </section>
  );
}
