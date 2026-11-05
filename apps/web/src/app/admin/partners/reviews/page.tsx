'use client';

// Super admin: client accounts the system couldn't verify on its own (an email
// matched but the account number didn't, or the client asked for a review), plus
// suspicious attribution worth a look, and the sync / access event log.
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import { DownloadSimple, Flag, MagnifyingGlass, Toolbox } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useAccounts } from '@/lib/use-accounts';
import { ibApi, PRODUCT_TYPE_LABEL, type AdminProduct, type IbEvent, type ReviewItem } from '@/lib/ib-api';
import { IArrowLeft } from '@/components/v6/icons';
import { EventList, VerifyPill } from '@/components/v6/account/ib-parts';
import { timeAgo } from '@/components/app-shell';
import { useConfirm } from '@/components/confirm-dialog';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const SIGNAL: Record<string, string> = {
  'email-match': 'Email is on the partner’s list, account number isn’t',
  'other-partner': 'Account is listed under another partner',
  'duplicate-ib': 'Same account in two partners’ lists',
  'signup-burst': 'Many signups from one network',
  'listed-unproven': 'On the partner’s list, but it’s an account TRADElogs can’t sign in to (MT4 / other): confirm it belongs to this client',
};
const KINDS: [string, string][] = [['', 'Everything'], ['ib', 'List syncs'], ['verify', 'Verifications'], ['access', 'Access'], ['consent', 'Consent'], ['partner', 'Partner status'], ['product', 'Tools'], ['package', 'Packages']];

export default function AdminPartnerReviewsPage() {
  const { accounts, selected, select } = useAccounts();
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [events, setEvents] = useState<IbEvent[] | null>(null);
  const [kind, setKind] = useState('');
  const [tools, setTools] = useState<AdminProduct[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    try { setItems(await ibApi.reviews()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reviews.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const loadTools = useCallback(() => ibApi.productQueue().then(setTools).catch(() => setTools([])), []);
  useEffect(() => { void loadTools(); }, [loadTools]);
  useEffect(() => {
    setPreview(null);
    if (open) ibApi.adminProduct(open).then(p => setPreview(p.content ?? '')).catch(() => setPreview(''));
  }, [open]);
  async function decideTool(t: AdminProduct, action: 'approve' | 'reject') {
    const r = await ask(action === 'approve'
      ? { title: `Approve ${t.name}?`, body: `Version ${t.version} becomes available to clients holding a package with it.`, confirmLabel: 'Approve', reason: true }
      : { title: `Send ${t.name} back?`, body: 'The partner sees your note and can fix it.', confirmLabel: 'Send back', tone: 'danger', reason: true });
    if (!r) return;
    if (action === 'reject' && !r.reason?.trim()) { setToast('Say what needs fixing.'); return; }
    setBusy(t.id);
    try { await ibApi.reviewProduct(t.id, action, r.reason); setToast(action === 'approve' ? 'Approved.' : 'Sent back to the partner.'); setOpen(null); await loadTools(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'That didn’t work.'); } finally { setBusy(null); }
  }
  useEffect(() => { ibApi.events({ kind: kind || undefined, limit: 150 }).then(setEvents).catch(() => setEvents([])); }, [kind, items]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);

  async function decide(v: ReviewItem, action: 'approve' | 'reject') {
    const r = await ask(action === 'approve'
      ? { title: `Verify ${v.client?.name ?? 'this client'}?`, body: `Account ${v.account?.login} counts as opened under ${v.partner.name}. Their packages unlock.`, confirmLabel: 'Verify', reason: true }
      : { title: `Reject ${v.account?.login}?`, body: 'The client sees your reason. Later list syncs won’t override this.', confirmLabel: 'Reject', tone: 'danger', reason: true });
    if (!r) return;
    setBusy(v.id);
    try { await ibApi.decide(v.id, action, r.reason); setToast(action === 'approve' ? 'Verified.' : 'Rejected.'); await load(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'That didn’t work.'); } finally { setBusy(null); }
  }

  const queue = items?.filter(i => i.kind === 'verification') ?? [];
  const flags = items?.filter(i => i.kind === 'flag') ?? [];
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner reviews"
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}
      actions={<button type="button" className="x-btn" onClick={() => { setItems(null); void load(); }}>Refresh</button>}>
      <div className="x-page" data-testid="admin-reviews"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
          {!items && !error && <div className="x-skel ad-sk-card" />}
          {items && <>
            <section className="x-card" data-testid="review-queue">
              <div className="x-ch"><h2>Manual verification</h2><span className="x-sub"><span className="m">{queue.length}</span> waiting</span></div>
              {queue.length === 0 ? <EmptyState compact icon="shield" title="Nothing to review">Accounts that need a human check appear here, oldest first.</EmptyState> : queue.map(v => (
                <div key={v.id} className="ib-review" data-testid={`review-${v.account?.login}`}>
                  <div className="ib-review-m">
                    <b>{v.client?.name} <span className="x-dim">· {v.client?.email}</span></b>
                    <small>{v.account?.platform ?? 'MT5'} account <span className="m">{v.account?.login}</span> on {v.account?.server} · referred by <Link className="x-link" href={`/admin/partners/${v.partner.id}`}>{v.partner.name}</Link> · {timeAgo(v.at)}</small>
                    <p><MagnifyingGlass size={13} weight="bold" aria-hidden /> {v.signal ? SIGNAL[v.signal] ?? v.signal : 'The client asked for a review'}{v.brokerEmail ? <> · broker email <span className="m">{v.brokerEmail}</span></> : null}</p>
                  </div>
                  <div className="ib-review-btns">
                    <button type="button" className="x-btn x-btn--sm" disabled={busy === v.id} onClick={() => void decide(v, 'reject')}>Reject</button>
                    <button type="button" className="x-btn x-btn--sm x-btn--hi" disabled={busy === v.id} onClick={() => void decide(v, 'approve')}>Verify</button>
                  </div>
                </div>
              ))}
            </section>

            <section className="x-card" data-testid="review-tools">
              <div className="x-ch"><h2>Partner tools</h2><span className="x-sub"><span className="m">{tools?.length ?? 0}</span> waiting</span></div>
              {!tools ? <div className="x-skel x-skel--in" /> : tools.length === 0 ? <EmptyState compact icon="shield" title="No tools to review">Indicators, templates, EAs and guides partners submit appear here before any client sees them.</EmptyState> : tools.map(t => (
                <div key={t.id} className="ib-review" data-testid={`review-tool-${t.name}`}>
                  <div className="ib-review-m">
                    <b><Toolbox size={14} weight="duotone" aria-hidden /> {t.name} <span className="x-dim">· v{t.version}</span></b>
                    <small>{PRODUCT_TYPE_LABEL[t.type]}{t.platform ? ` · ${t.platform}` : ''} · by <Link className="x-link" href={`/admin/partners/${t.partner.id}`}>{t.partner.name}</Link> · {timeAgo(t.updatedAt)}</small>
                    {t.description && <p>{t.description}</p>}
                    <div className="ib-acct-f">
                      <button type="button" className="x-btn x-btn--sm" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? 'Hide' : 'Inspect'}</button>
                      {t.fileName && <a className="x-btn x-btn--sm" href={ibApi.adminProductFileUrl(t.id)} download><DownloadSimple size={14} weight="bold" />{t.fileName}</a>}
                      {t.url && <a className="x-link" href={t.url} target="_blank" rel="noopener noreferrer nofollow">{t.url}</a>}
                    </div>
                    {open === t.id && (preview == null ? <div className="x-skel x-skel--in" /> : preview ? <pre className="ib-pre">{preview}</pre> : <p className="x-muted">No code or text, only {t.fileName ? 'a file' : 'a link'}.</p>)}
                  </div>
                  <div className="ib-review-btns">
                    <button type="button" className="x-btn x-btn--sm" disabled={busy === t.id} onClick={() => void decideTool(t, 'reject')}>Send back</button>
                    <button type="button" className="x-btn x-btn--sm x-btn--hi" disabled={busy === t.id} onClick={() => void decideTool(t, 'approve')}>Approve</button>
                  </div>
                </div>
              ))}
            </section>

            <section className="x-card" data-testid="review-flags">
              <div className="x-ch"><h2>Flags</h2><span className="x-sub"><span className="m">{flags.length}</span></span></div>
              {flags.length === 0 ? <EmptyState compact icon="shield" title="No suspicious attribution">Accounts claimed by two partners, signups bunched on one network and other-IB accounts show up here.</EmptyState> : flags.map(f => (
                <div key={f.id} className="ib-review">
                  <div className="ib-review-m">
                    <b><Flag size={14} weight="duotone" aria-hidden /> {f.flag}</b>
                    <small><Link className="x-link" href={`/admin/partners/${f.partner.id}`}>{f.partner.name}</Link>{f.client ? ` · ${f.client.name} (${f.client.email})` : ''}{f.account ? ` · ${f.account.login}` : ''} · {timeAgo(f.at)}</small>
                  </div>
                  {f.status && <VerifyPill s={f.status} />}
                </div>
              ))}
            </section>

            <section className="x-card" data-testid="review-events">
              <div className="x-ch"><h2>Event log</h2>
                <div className="x-r"><select className="x-select" value={kind} onChange={e => setKind(e.target.value)} aria-label="Event type">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
              {events ? <EventList events={events} /> : <div className="x-skel x-skel--in" />}
            </section>
          </>}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}
