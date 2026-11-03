'use client';

import EmptyState from '@/components/v6/ui/empty-state';
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
    <section className="x-card mk-side" data-testid="alerts-panel" aria-labelledby="mk-al-t">
      <div className="x-ch">
        <h3 id="mk-al-t">Price alerts</h3>
        {activeN > 0 && <span className="x-muted">{activeN} active</span>}
        {onNew && <div className="x-r"><button className="x-btn x-btn--sm" onClick={onNew}>New alert</button></div>}
      </div>
      <div className="mk-side-bd">
        {loading ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="x-skel x-skel--in mk-sk-row" />)
          : sorted.length === 0 ? <EmptyState compact icon="bell" title="No price alerts" actions={onNew ? <button className="x-btn x-btn--sm" onClick={onNew}>Alert me on {activeSymbol}</button> : undefined}>Get pinged when {activeSymbol} crosses a price.</EmptyState>
          : sorted.map(a => {
            const state = a.status === 'triggered' ? 'Triggered' : a.status === 'disabled' ? 'Paused' : a.recurring ? 'Recurring' : 'Once';
            return (
              <div key={a.id} className={`mk-al ${a.status}`} data-testid={`alert-row-${a.id}`}>
                <span className={`x-dot ${a.status === 'active' ? '' : 'x-dot--off'}`} aria-hidden />
                <div className="mk-al-m">
                  <b><span>{a.symbol}</span> <span className="m">{a.direction === 'above' ? '≥' : '≤'} {Number(a.threshold).toLocaleString('en-US', { maximumFractionDigits: 5 })}</span></b>
                  <small>{state}{a.note ? ` · ${a.note}` : ''}</small>
                </div>
                <span className="mk-al-acts">
                  <button className="x-btn x-btn--ghost x-btn--icon x-btn--sm" onClick={() => toggle(a)} aria-label={a.status === 'active' ? 'Pause alert' : 'Resume alert'} title={a.status === 'active' ? 'Pause' : 'Resume'}>
                    {a.status === 'active'
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>}
                  </button>
                  <button className="x-btn x-btn--ghost x-btn--icon x-btn--sm mk-del" onClick={() => remove(a.id)} aria-label="Delete alert" title="Delete">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </span>
              </div>
            );
          })}
      </div>
    </section>
  );
}
