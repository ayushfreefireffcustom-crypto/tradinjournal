'use client';

// Super admin: the programme rules — what counts as an active trader, how long
// access survives a lapse, and which TRADElogs features only package holders may open.
import Link from '@/components/v6/ui/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useAccounts } from '@/lib/use-accounts';
import { ibApi, type ProgramSettings } from '@/lib/ib-api';
import { invalidatePerks, PERK_PAGES } from '@/lib/use-perks';
import { IArrowLeft } from '@/components/v6/icons';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/ib.css';

export default function AdminPartnerSettingsPage() {
  const { accounts, selected, select } = useAccounts();
  const [s, setS] = useState<ProgramSettings | null>(null);
  const [saved, setSaved] = useState<ProgramSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [hosts, setHosts] = useState('');

  useEffect(() => { ibApi.settings().then(x => { setS(x); setSaved(x); setHosts(x.ibApiHosts.join('\n')); }).catch(e => setError(e instanceof Error ? e.message : 'Could not load settings.')); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);

  const dirty = !!s && JSON.stringify(s) !== JSON.stringify(saved);
  const num = (k: keyof ProgramSettings, v: string) => setS(x => x && { ...x, [k]: v === '' ? 0 : Number(v) });

  async function save() {
    if (!s) return;
    setBusy(true);
    try { const x = await ibApi.saveSettings(s); setS(x); setSaved(x); invalidatePerks(); setToast('Saved. Access is recalculated on the next pass (within 15 minutes).'); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  }

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner settings"
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}
      actions={s ? <button type="button" className="x-btn x-btn--hi" disabled={!dirty || busy} onClick={() => void save()} data-testid="settings-save">{busy ? 'Saving…' : 'Save'}</button> : null}>
      <div className="x-page" data-testid="admin-partner-settings"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
          {!s && !error && <div className="x-skel ad-sk-card" />}
          {s && <>
            <section className="x-card">
              <div className="x-ch"><h2>Active trader</h2></div>
              <p className="ac-p">A client counts as active when their synced MT5 history meets all of these. Packages that require active trading use it.</p>
              <div className="ib-settings">
                <div className="x-field"><label htmlFor="st-trades">Closed trades at least</label><input id="st-trades" className="x-input m" type="number" min={0} max={1000} value={s.activeMinTrades} onChange={e => num('activeMinTrades', e.target.value)} /></div>
                <div className="x-field"><label htmlFor="st-days">Within the last (days)</label><input id="st-days" className="x-input m" type="number" min={1} max={365} value={s.activeWindowDays} onChange={e => num('activeWindowDays', e.target.value)} /></div>
                <div className="x-field"><label htmlFor="st-lots">And at least (lots)</label><input id="st-lots" className="x-input m" type="number" min={0} step={0.01} value={s.activeMinLots} onChange={e => num('activeMinLots', e.target.value)} /><span className="x-help">0 = no volume requirement</span></div>
              </div>
            </section>

            <section className="x-card">
              <div className="x-ch"><h2>Grace periods</h2></div>
              <p className="ac-p">When a client stops qualifying, their package keeps working for this long before it pauses. It comes back by itself when they qualify again.</p>
              <div className="ib-settings">
                <div className="x-field"><label htmlFor="st-grace">Client lapses (days)</label><input id="st-grace" className="x-input m" type="number" min={0} max={90} value={s.graceDays} onChange={e => num('graceDays', e.target.value)} /><span className="x-help">Not verified any more, stopped trading, disconnected</span></div>
                <div className="x-field"><label htmlFor="st-pgrace">Partner suspended (days)</label><input id="st-pgrace" className="x-input m" type="number" min={0} max={90} value={s.partnerGraceDays} onChange={e => num('partnerGraceDays', e.target.value)} /><span className="x-help">How long their clients keep access</span></div>
              </div>
            </section>

            <section className="x-card" data-testid="settings-money">
              <div className="x-ch"><h2>Package sales and payouts</h2></div>
              <p className="ac-p">TRADElogs keeps its share of each package sale; the partner keeps the rest (unless their terms say otherwise). Their share becomes payable after the refund window, and a payout is drafted once it reaches the minimum.</p>
              <div className="ib-settings">
                <div className="x-field"><label htmlFor="st-share">TRADElogs share (%)</label><input id="st-share" className="x-input m" type="number" min={0} max={100} value={s.platformSharePct} onChange={e => num('platformSharePct', e.target.value)} /></div>
                <div className="x-field"><label htmlFor="st-refund">Refund window (days)</label><input id="st-refund" className="x-input m" type="number" min={0} max={90} value={s.refundDays} onChange={e => num('refundDays', e.target.value)} /></div>
                <div className="x-field"><label htmlFor="st-min">Minimum payout</label><input id="st-min" className="x-input m" type="number" min={0} step={1} value={s.payoutMinimumCents / 100} onChange={e => setS(x => x && { ...x, payoutMinimumCents: Math.round(Number(e.target.value || 0) * 100) })} /></div>
                <div className="x-field"><label htmlFor="st-cur">Currency</label><select id="st-cur" className="x-select" value={s.currency} onChange={e => setS(x => x && { ...x, currency: e.target.value })}>{['USD', 'INR', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}</select><span className="x-help">For new packages and payouts</span></div>
              </div>
            </section>

            <section className="x-card" data-testid="settings-api-hosts">
              <div className="x-ch"><h2>Approved broker API addresses</h2></div>
              <p className="ac-p">Partners can only point the broker API connection at these hosts (and their subdomains), so nobody can make TRADElogs call an arbitrary server. One per line, e.g. my.exnessaffiliates.com.</p>
              <textarea className="x-textarea m" rows={4} value={hosts} onChange={e => { setHosts(e.target.value); setS(x => x && { ...x, ibApiHosts: e.target.value.split(/\s+/).map(h => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(h => h.length >= 3) }); }} aria-label="Approved API hosts" data-testid="settings-hosts" />
            </section>

            <section className="x-card" data-testid="settings-locks">
              <div className="x-ch"><h2>Features locked to package holders</h2><span className="x-sub"><span className="m">{s.lockedPerks.length}</span> locked</span></div>
              <p className="ac-p">Nothing is locked by default, so every user keeps everything. A locked feature opens only for clients holding a partner package that includes it, for active partners and for admins. Everyone else sees how to unlock it.</p>
              <div className="ib-checks">
                {PERK_PAGES.map(p => (
                  <label key={p.key} className="ib-check">
                    <input type="checkbox" className="x-check" checked={s.lockedPerks.includes(p.key)} data-testid={`lock-${p.key}`}
                      onChange={() => setS(x => x && { ...x, lockedPerks: x.lockedPerks.includes(p.key) ? x.lockedPerks.filter(k => k !== p.key) : [...x.lockedPerks, p.key] })} />
                    <span><b>{p.label}</b><small>{p.pages.join(', ')}</small></span>
                  </label>
                ))}
              </div>
              {s.lockedPerks.length > 0 && <div className="x-banner ad-mt" role="note"><span>Locking a feature takes it away from current users who don&rsquo;t hold a package with it. Check with the boss before saving.</span></div>}
            </section>
          </>}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}
