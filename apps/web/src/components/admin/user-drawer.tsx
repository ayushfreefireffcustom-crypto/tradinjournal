'use client';

import { useEffect, useState } from 'react';
import { adminApi, type AdminUserDossierDto } from '@/lib/admin-api';
import { fmtDate, fmtRelative, sentence, statusTone, tagClass } from './admin-utils';
import { V6Portal } from '@/components/confirm-dialog';
import { IClose, ISync } from '@/components/v6/icons';
import { useDialog } from '@/components/v6/ui/use-dialog';
import AdminUserCopySection from '@/components/v6/copy/admin-user-copy';
import { TRADING_ENABLED } from '@/lib/features';
import '@/styles/v6/admin.css';

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

  const ref = useDialog<HTMLElement>({ onClose });

  return (
    <V6Portal>
      <div className="ad-drawer-scrim" onClick={onClose} aria-hidden />
      <aside ref={ref} className="ad-drawer" role="dialog" aria-modal="true" aria-label="User details" data-testid="admin-user-drawer">
        <header className="ad-drawer-h">
          <span className="x-label">User details</span>
          <button type="button" onClick={onClose} className="x-btn x-btn--ghost x-btn--icon x-btn--sm" aria-label="Close"><IClose size={16} /></button>
        </header>

        <div className="ad-drawer-bd">
          {loading && <div className="ad-tbl-sk">{[0, 1, 2, 3].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>}
          {error && <div className="x-banner x-banner--err"><span>{error}</span></div>}
          {data && (
            <>
              <div className="ad-dos-id">
                <b>{data.name || 'Unnamed'}</b>
                <span>{data.email}</span>
                <div className="ad-tags">
                  <span className={tagClass[statusTone('elefin', data.elefinStatus)]}>Elefin · {sentence(data.elefinStatus)}</span>
                  <span className={tagClass[statusTone('activity', data.activityStatus)]}>{sentence(data.activityStatus)}</span>
                  {data.source && <span className="x-tag">{sentence(data.source)}</span>}
                </div>
              </div>

              <dl className="ad-facts">
                {([
                  ['Usage today', `${data.usageMinToday}m`, true],
                  ['Usage, 7 days', `${data.avgSessionMin7d}m`, true],
                  ['Trades, 7 days', data.tradeCount7d, true],
                  ['Total trades', data.totalTrades, true],
                  ['Open trades', data.openTrades, true],
                  ['Brokers', data.brokerCount, true],
                  ['Sessions', data.sessionCount, true],
                  ['Joined', fmtDate(data.createdAt), false],
                  ['Last sign-in', fmtRelative(data.lastActiveAt), false],
                  ['Last in product', fmtRelative(data.lastProductAt), false],
                  ['Top feature', data.topFeature ?? '—', false],
                  ['Sign-in', data.authProviders.join(', ') || 'email', false],
                ] as const).map(([k, v, num]) => (
                  <div key={k}><dt>{k}</dt><dd className={num ? 'm' : ''}>{v}</dd></div>
                ))}
              </dl>

              {data.lastIp && <p className="ad-note">Last IP <span className="m">{data.lastIp}</span></p>}
              {(data.city || data.country || data.postalCode) && (
                <div className="x-inset ad-dos-box">
                  <span className="x-label">Location</span>
                  <p>{[data.city, data.country, data.postalCode].filter(Boolean).join(' · ')}</p>
                  {data.lat != null && data.lng != null && <small className="m">{data.lat.toFixed(3)}, {data.lng.toFixed(3)}</small>}
                </div>
              )}
              {data.lastDeniedReason && <div className="x-banner x-banner--err"><span>{data.lastDeniedReason}</span></div>}

              <div className="ad-dos-sec">
                <span className="x-label">Brokers</span>
                {data.brokerDetails.length === 0 ? <p className="ad-none">None connected</p> : data.brokerDetails.map(b => (
                  <div key={`${b.mt5Login}-${b.server}`} className="x-inset ad-dos-box">
                    <div className="ad-dos-row"><b>{b.broker}</b><span className="m x-muted">#{b.mt5Login}</span></div>
                    <small>{b.server}</small>
                    <small>Synced {fmtRelative(b.lastSyncAt).toLowerCase()} · {sentence(b.status)}</small>
                  </div>
                ))}
              </div>

              {TRADING_ENABLED && <AdminUserCopySection userId={data.id} />}

              <div className="ad-dos-sec">
                <span className="x-label">Product sessions, 7 days</span>
                {data.usageSessions7d.length === 0 ? <p className="ad-none">No product sessions yet</p> : (
                  <ul className="ad-feed">
                    {data.usageSessions7d.map(s => (
                      <li key={s.id}><span className="m">{s.pagePath || '—'}</span><small><span className="m">{Math.round(s.durationSec / 60)}m</span> · {fmtRelative(s.startedAt)}</small></li>
                    ))}
                  </ul>
                )}
              </div>

              {data.recentFeatures.length > 0 && (
                <div className="ad-dos-sec">
                  <span className="x-label">Features</span>
                  <div className="ad-tags">{data.recentFeatures.map(f => <span key={f.feature} className="x-tag">{f.feature} · <span className="m">{f.count}</span></span>)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {data && (
          <footer className="ad-drawer-f">
            <button type="button" onClick={() => onRecheck(data.id)} disabled={recheckBusy} className="x-btn x-btn--hi x-btn--full">
              <ISync size={15} className={recheckBusy ? 'x-spin' : ''} />Recheck access
            </button>
          </footer>
        )}
      </aside>
    </V6Portal>
  );
}
