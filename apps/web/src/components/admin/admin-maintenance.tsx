'use client';

import type { MaintenanceModeDto } from '@/lib/admin-api';
import { fmtRelative } from './admin-utils';

interface Props {
  maintenance: MaintenanceModeDto;
  maintMessage: string;
  maintBusy: boolean;
  onMessageChange: (v: string) => void;
  onToggle: () => void;
}

export function AdminMaintenancePanel({ maintenance, maintMessage, maintBusy, onMessageChange, onToggle }: Props) {
  const live = !maintenance.enabled;
  return (
    <section className="x-card" data-testid="admin-maintenance">
      <div className="x-ch"><h2>Maintenance mode</h2></div>
      <div className="ad-maint">
        <div className="ad-maint-t">
          <b><i className={`x-dot ${live ? '' : 'x-dot--r'}`} />{live ? 'Site is live' : 'Site is in maintenance'}</b>
          {maintenance.toggledAt && (
            <span>Last changed {fmtRelative(maintenance.toggledAt).toLowerCase()}{maintenance.toggledBy ? ` by ${maintenance.toggledBy}` : ''}</span>
          )}
        </div>
        <button type="button" onClick={onToggle} disabled={maintBusy} className={`x-btn ${maintenance.enabled ? 'x-btn--hi' : 'x-btn--danger'}`} data-testid="maintenance-toggle">
          {maintBusy ? 'Updating…' : maintenance.enabled ? 'Go live' : 'Enable maintenance'}
        </button>
      </div>
      <div className="x-field ad-maint-msg">
        <label htmlFor="ad-maint-msg">Public message</label>
        <textarea id="ad-maint-msg" className="x-textarea" value={maintMessage} onChange={e => onMessageChange(e.target.value)} placeholder="Scheduled maintenance, back soon." rows={2} />
        <span className="x-help">Shown on the /maintenance page. Saved when you switch the mode.</span>
      </div>
    </section>
  );
}
