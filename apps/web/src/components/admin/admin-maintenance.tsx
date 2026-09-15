'use client';

import type { MaintenanceModeDto } from '@/lib/admin-api';
import { fmtRelative } from './admin-utils';
import { Warning, CheckCircle } from '@phosphor-icons/react';

interface Props {
  maintenance: MaintenanceModeDto;
  maintMessage: string;
  maintBusy: boolean;
  onMessageChange: (v: string) => void;
  onToggle: () => void;
}

export function AdminMaintenancePanel({
  maintenance, maintMessage, maintBusy, onMessageChange, onToggle,
}: Props) {
  const live = !maintenance.enabled;

  return (
    <div className="tcard p-4 sm:p-5 min-w-0" data-testid="admin-maintenance">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex gap-3 min-w-0">
          <div className={`w-10 h-10 shrink-0 rounded border flex items-center justify-center ${live ? 'border-profit/40 bg-profit/10 text-profit' : 'border-loss/40 bg-loss/10 text-loss'}`}>
            {live ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.2em] text-fg-3">// MAINTENANCE MODE</div>
            <div className={`text-lg font-display font-black tracking-tight mt-0.5 ${live ? 'text-profit' : 'text-loss'}`}>
              {live ? 'Site is live' : 'Site in maintenance'}
            </div>
            {maintenance.toggledAt && (
              <p className="text-[11px] text-fg-3 mt-1">
                Last toggled {fmtRelative(maintenance.toggledAt)}
                {maintenance.toggledBy ? ` by ${maintenance.toggledBy}` : ''}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={maintBusy}
          className={`btn py-2.5 px-4 text-[11px] shrink-0 w-full sm:w-auto ${maintenance.enabled ? 'btn-primary' : 'btn-ghost border border-loss/40 text-loss'}`}
          data-testid="maintenance-toggle"
        >
          {maintBusy ? 'UPDATING…' : maintenance.enabled ? 'GO LIVE' : 'ENABLE MAINTENANCE'}
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-border-soft">
        <label className="block text-[10px] tracking-[0.14em] text-fg-3 mb-1.5">
          PUBLIC MESSAGE (shown on /maintenance)
        </label>
        <textarea
          value={maintMessage}
          onChange={e => onMessageChange(e.target.value)}
          placeholder="Scheduled maintenance — back soon."
          rows={2}
          className="w-full bg-app border border-border-soft rounded px-3 py-2 text-sm text-fg resize-none min-h-[72px]"
        />
      </div>
    </div>
  );
}
