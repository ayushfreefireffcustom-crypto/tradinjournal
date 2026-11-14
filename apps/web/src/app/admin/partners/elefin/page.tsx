'use client';

// Admin: every partner's Elefin Partner API connection — who has connected a key, how
// fresh their client list is, what failed — with a per-partner "Sync now".
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import AppShell, { timeAgo } from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import PartnerAdminTabs from '@/components/v6/admin/partner-tabs';
import { useAccounts } from '@/lib/use-accounts';
import { elefinApi, type AdminElefinRow } from '@/lib/elefin-api';
import { StatePill } from '@/components/v6/account/elefin-connect';
import { IArrowLeft } from '@/components/v6/icons';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/ib.css';
import '@/styles/v6/elefin.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const n = (v: number) => v.toLocaleString('en-US');

export default function AdminElefinPage() {
  const { accounts, selected, select } = useAccounts();
  const [rows, setRows] = useState<AdminElefinRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    try { setRows(await elefinApi.adminList()); setError(''); } catch (e) { setError(msg(e, 'Couldn’t load Elefin connections.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); }, [toast]);

  async function sync(r: AdminElefinRow) {
    setBusy(r.partnerId);
    try {
      const out = await elefinApi.adminSync(r.partnerId);
      setToast(out.result?.ok ? `${r.partnerName}: ${out.result.accounts} accounts synced.` : out.result?.error ?? 'Sync started.');
      await load();
    } catch (e) { setToast(msg(e, 'Sync failed.')); } finally { setBusy(null); }
  }

  const connected = rows?.filter(r => r.state !== 'NOT_CONNECTED') ?? [];
  const trouble = connected.filter(r => r.state === 'ERROR' || r.state === 'PAUSED').length;
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Elefin API"
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}
      actions={<button type="button" className="x-btn" onClick={() => { setRows(null); void load(); }}>Refresh</button>}>
      <div className="x-page" data-testid="admin-elefin-page"><AdminOnly>
        <div className="x-page">
          <PartnerAdminTabs />
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!rows && !error && <div className="x-skel ad-sk-card" data-testid="admin-elefin-loading" />}
          {rows && (
            <section className="x-card" data-testid="admin-elefin-list">
              <div className="x-ch"><h2>Partner connections</h2>
                <span className="x-sub"><span className="m">{connected.length}</span> of <span className="m">{rows.length}</span> connected{trouble ? <> · <span className="m neg">{trouble}</span> need attention</> : null}</span></div>
              {rows.length === 0 ? (
                <EmptyState compact icon="plug" title="No active partners yet">Approved partners show here with their Elefin key status.</EmptyState>
              ) : (
                <ul className="ef-adm">
                  {rows.map(r => (
                    <li key={r.partnerId} data-testid={`admin-elefin-row-${r.partnerId}`}>
                      <span className="ef-adm-who"><Link href={`/admin/partners/${r.partnerId}`}><b>{r.partnerName}</b></Link><small>{r.partnerEmail}{r.keyHint ? <> · key <span className="axnum">{r.keyHint}</span></> : ''}</small></span>
                      <span className="ef-adm-st"><StatePill s={r.state} />{r.lastError && <small className="ef-adm-err">{r.lastError}</small>}</span>
                      <span className="ib-br-n"><b className="m">{n(r.accounts)}</b><small>accounts</small></span>
                      <span className="ib-br-n"><b className="m">{n(r.verified)}<span className="x-dim">/{n(r.clientAccounts)}</span></b><small>verified</small></span>
                      <span className="ib-br-n"><b>{r.state === 'NOT_CONNECTED' ? '—' : timeAgo(r.lastSyncAt)}</b><small>last sync</small></span>
                      <span className="ib-br-btns">{r.state !== 'NOT_CONNECTED' && (
                        <button type="button" className="x-btn x-btn--sm" disabled={busy === r.partnerId || r.state === 'SYNCING'} onClick={() => void sync(r)}>
                          <ArrowsClockwise size={14} weight="bold" aria-hidden />{busy === r.partnerId ? 'Syncing…' : 'Sync now'}</button>
                      )}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}
