'use client';

import { useEffect, useState } from 'react';
import { BellRinging, Trash, Pause, Play, ArrowUp, ArrowDown, ArrowsClockwise } from '@phosphor-icons/react';
import { alertsApi, type PriceAlert } from '@/lib/alerts-api';

const STATUS_COLOR: Record<string, string> = {
  active: 'text-profit',
  triggered: 'text-warning',
  disabled: 'text-fg-3',
};

// The user's price alerts (active symbol first). Reloads when reloadToken changes.
export default function AlertsPanel({ activeSymbol, reloadToken }: { activeSymbol: string; reloadToken: number }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    alertsApi
      .list()
      .then(r => { if (alive) setAlerts(r.alerts); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [reloadToken]);

  const remove = async (id: string) => {
    setAlerts(a => a.filter(x => x.id !== id));
    await alertsApi.remove(id).catch(() => {});
  };
  const toggle = async (a: PriceAlert) => {
    const next = a.status === 'active' ? 'disabled' : 'active';
    setAlerts(list => list.map(x => (x.id === a.id ? { ...x, status: next } : x)));
    await alertsApi.update(a.id, { status: next }).catch(() => {});
  };

  const sorted = [...alerts].sort((a, b) => Number(b.symbol === activeSymbol) - Number(a.symbol === activeSymbol));

  return (
    <div className="tcard p-0 flex flex-col min-h-0" data-testid="alerts-panel">
      <div className="px-3 py-2.5 border-b border-border-soft flex items-center justify-between shrink-0">
        <span className="text-[10px] tracking-[0.2em] text-fg-3 flex items-center gap-1.5">
          <BellRinging size={11} weight="fill" className="text-profit" /> ALERTS
        </span>
        <span className="text-[10px] text-fg-3 numeric">{alerts.filter(a => a.status === 'active').length}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="p-3 flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-9" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-fg-3">
            No alerts yet.<br />Set one with the ＋ Alert button.
          </div>
        ) : (
          sorted.map(a => {
            const Dir = a.direction === 'above' ? ArrowUp : ArrowDown;
            return (
              <div
                key={a.id}
                className={`group px-3 py-2 border-b border-border-soft ${a.symbol === activeSymbol ? 'bg-surface/40' : ''}`}
                data-testid={`alert-row-${a.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Dir size={11} weight="bold" className={a.direction === 'above' ? 'text-profit' : 'text-loss'} />
                    <span className="text-[12px] font-semibold text-fg truncate">{a.symbol}</span>
                    {a.recurring && (
                      <span title="Recurring" className="shrink-0 flex">
                        <ArrowsClockwise size={10} weight="bold" className="text-fg-3" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggle(a)} title={a.status === 'active' ? 'Pause' : 'Resume'} className="p-0.5 text-fg-3 hover:text-fg">
                      {a.status === 'active' ? <Pause size={11} weight="bold" /> : <Play size={11} weight="bold" />}
                    </button>
                    <button onClick={() => remove(a.id)} title="Delete" className="p-0.5 text-fg-3 hover:text-loss">
                      <Trash size={11} weight="bold" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5 text-[10px] numeric">
                  <span className="text-fg-2">{a.direction} {Number(a.threshold)}</span>
                  <span className={`tracking-[0.12em] uppercase text-[9px] ${STATUS_COLOR[a.status] ?? 'text-fg-3'}`}>{a.status}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
