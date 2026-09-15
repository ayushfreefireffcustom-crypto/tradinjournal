'use client';

import { useEffect, useState } from 'react';
import { adminApi, type AdminUserDossierDto } from '@/lib/admin-api';
import { fmtDate, fmtRelative, statusTone, toneClass } from './admin-utils';
import { X, ArrowsClockwise } from '@phosphor-icons/react';

export function UserDrawer({
  userId,
  onClose,
  onRecheck,
  recheckBusy,
}: {
  userId: string;
  onClose: () => void;
  onRecheck: (id: string) => void;
  recheckBusy: boolean;
}) {
  const [data, setData] = useState<AdminUserDossierDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi.user(userId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-app/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-surface border-l border-border flex flex-col shadow-2xl"
        data-testid="admin-user-drawer"
      >
        <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// USER DOSSIER</div>
          <button type="button" onClick={onClose} className="p-2 text-fg-3 hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
          {loading && <p className="text-sm text-fg-3">Loading…</p>}
          {error && <p className="text-sm text-loss">{error}</p>}
          {data && (
            <>
              <div>
                <div className="font-display font-black text-xl tracking-tight">{data.name || 'Unnamed'}</div>
                <div className="text-sm text-fg-2 truncate">{data.email}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[9px] tracking-widest px-2 py-0.5 border rounded ${toneClass[statusTone('elefin', data.elefinStatus)]}`}>
                    {data.elefinStatus}
                  </span>
                  <span className={`text-[9px] tracking-widest px-2 py-0.5 border rounded ${toneClass[statusTone('activity', data.activityStatus)]}`}>
                    {data.activityStatus}
                  </span>
                  {data.source && (
                    <span className="text-[9px] tracking-widest px-2 py-0.5 border rounded border-border-soft text-fg-2">
                      {data.source}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ['Usage today', `${data.usageMinToday}m`],
                  ['Usage 7d', `${data.avgSessionMin7d}m`],
                  ['Trades 7d', data.tradeCount7d],
                  ['Total trades', data.totalTrades],
                  ['Open trades', data.openTrades],
                  ['Brokers', data.brokerCount],
                  ['Sessions', data.sessionCount],
                  ['Joined', fmtDate(data.createdAt)],
                  ['Last auth', fmtRelative(data.lastActiveAt)],
                  ['Last product', fmtRelative(data.lastProductAt)],
                  ['Top feature', data.topFeature ?? '—'],
                  ['Auth', data.authProviders.join(', ') || 'email'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="border border-border-soft rounded p-2 bg-app/40">
                    <div className="text-[9px] tracking-widest text-fg-3">{k}</div>
                    <div className="text-fg mt-0.5 truncate numeric">{v}</div>
                  </div>
                ))}
              </div>

              {data.lastIp && (
                <div className="text-[10px] text-fg-3">Last IP · {data.lastIp}</div>
              )}
              {(data.city || data.country || data.postalCode) && (
                <div className="text-[11px] text-fg-2 border border-border-soft rounded p-2 bg-app/40">
                  <div className="text-[9px] tracking-widest text-fg-3 mb-0.5">LOCATION</div>
                  {[data.city, data.country, data.postalCode].filter(Boolean).join(' · ')}
                  {data.lat != null && data.lng != null && (
                    <div className="text-[10px] text-fg-3 numeric mt-0.5">{data.lat.toFixed(3)}, {data.lng.toFixed(3)}</div>
                  )}
                </div>
              )}
              {data.lastDeniedReason && (
                <div className="text-[11px] text-loss border border-loss/20 bg-loss/5 rounded p-2">
                  {data.lastDeniedReason}
                </div>
              )}

              <div>
                <div className="text-[9px] tracking-widest text-fg-3 mb-2">BROKERS</div>
                {data.brokerDetails.length === 0 ? (
                  <p className="text-sm text-fg-3">None connected</p>
                ) : (
                  <div className="space-y-2">
                    {data.brokerDetails.map(b => (
                      <div key={`${b.mt5Login}-${b.server}`} className="border border-border-soft rounded p-2">
                        <div className="flex justify-between gap-2">
                          <span className="text-fg text-sm">{b.broker}</span>
                          <span className="text-fg-3 text-[10px]">#{b.mt5Login}</span>
                        </div>
                        <div className="text-[10px] text-fg-3 truncate">{b.server}</div>
                        <div className="text-[10px] text-fg-3 mt-1">Sync {fmtRelative(b.lastSyncAt)} · {b.status}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[9px] tracking-widest text-fg-3 mb-2">USAGE SESSIONS 7D</div>
                {data.usageSessions7d.length === 0 ? (
                  <p className="text-sm text-fg-3">No product sessions yet</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {data.usageSessions7d.map(s => (
                      <div key={s.id} className="flex justify-between text-[11px] py-1 border-b border-border-soft/40 gap-2">
                        <span className="truncate text-fg-2">{s.pagePath || '—'}</span>
                        <span className="numeric text-fg-3 shrink-0">{Math.round(s.durationSec / 60)}m · {fmtRelative(s.startedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {data.recentFeatures.length > 0 && (
                <div>
                  <div className="text-[9px] tracking-widest text-fg-3 mb-2">FEATURES</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.recentFeatures.map(f => (
                      <span key={f.feature} className="text-[10px] px-2 py-1 border border-border-soft rounded">
                        {f.feature} · {f.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {data && (
          <div className="p-4 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => onRecheck(data.id)}
              disabled={recheckBusy}
              className="btn btn-ghost border border-border-soft w-full py-2.5 text-[11px] tracking-widest flex items-center justify-center gap-2"
            >
              <ArrowsClockwise size={14} className={recheckBusy ? 'animate-spin' : ''} />
              RECHECK ACCESS
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
