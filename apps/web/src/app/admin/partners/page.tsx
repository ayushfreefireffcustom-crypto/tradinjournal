'use client';

// Admin: every partner, ranked by what their link actually produced, with the
// approval queue on top, a "who referred this person?" lookup and blocked names.
import Link from '@/components/v6/ui/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { usePlatformAccess } from '@/lib/use-platform-access';
import { useAccounts } from '@/lib/use-accounts';
import {
  partnerApi, type AdminPartnerRow, type PartnerStatus, type ReferrerLookup, type ReservedCode,
} from '@/lib/partner-api';
import { IClose, IPlus, ISearch } from '@/components/v6/icons';
import { Avatar, PartnerStatusPill, day, n, pct } from '@/components/v6/account/partner-parts';
import { useConfirm, V6Portal } from '@/components/confirm-dialog';
import { useDialog } from '@/components/v6/ui/use-dialog';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/dialogs.css';

type Sort = 'active' | 'signups30d' | 'clicks30d' | 'conv' | 'clients';
type View = 'live' | 'SUSPENDED' | 'REVOKED';
const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);

export default function AdminPartnersPage() {
  const router = useRouter();
  const { accounts, selected, select } = useAccounts();
  const [rows, setRows] = useState<AdminPartnerRow[] | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>('active');
  const [view, setView] = useState<View>('live');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();
  const isAdmin = !!usePlatformAccess().status?.isAdmin;

  const load = useCallback(async () => {
    try { setRows(await partnerApi.adminList(view === 'live' ? undefined : view)); setError(''); }
    catch (e) { setError(msg(e, 'Could not load partners.')); }
  }, [view]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const pending = useMemo(() => (rows ?? []).filter(r => r.status === 'PENDING'), [rows]);
  const live = useMemo(() => (rows ?? []).filter(r => r.status !== 'PENDING'), [rows]);
  const ranked = useMemo(() => [...live].sort((a, b) => sort === 'conv' ? (b.converted30d / (b.clicks30d || 1)) - (a.converted30d / (a.clicks30d || 1)) : b[sort] - a[sort]), [live, sort]);
  const sum = (k: keyof AdminPartnerRow) => live.reduce((a, r) => a + (r[k] as number), 0);
  const th = (k: Sort, l: string) => <th className="n" aria-sort={sort === k ? 'descending' : undefined}><button type="button" className={sort === k ? 'ad-sorted' : ''} onClick={() => setSort(k)}>{l}{sort === k && <span aria-hidden> ↓</span>}</button></th>;

  async function decide(p: AdminPartnerRow, action: 'approve' | 'decline') {
    let reason: string | undefined;
    if (action === 'decline') {
      const r = await ask({ title: `Decline ${p.name}?`, body: 'They can apply again later.', confirmLabel: 'Decline', tone: 'danger', reason: true });
      if (!r) return;
      reason = r.reason;
    }
    setBusy(p.id);
    try { await partnerApi.adminStatus(p.id, action, reason || undefined); setToast(action === 'approve' ? `${p.name} approved — their link is live.` : `${p.name} declined.`); await load(); }
    catch (e) { setToast(msg(e, 'That didn’t work.')); }
    finally { setBusy(null); }
  }

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partners"
      pageSubtitle="Who brings traders in"
      actions={<>
        <div className="x-seg" role="group" aria-label="Show">
          {([['live', 'Active & pending'], ['SUSPENDED', 'Suspended'], ['REVOKED', 'Revoked']] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => { setRows(null); setView(k); }}>{l}</button>
          ))}
        </div>
        <button type="button" className="x-btn" onClick={() => { setRows(null); void load(); }} data-testid="partners-refresh">Refresh</button>
        {isAdmin && <button type="button" className="x-btn x-btn--hi" onClick={() => setAdding(true)} data-testid="partner-add"><IPlus size={15} />Add partner</button>}
      </>}>
      <div className="x-page" data-testid="admin-partners"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>Couldn&rsquo;t load partners. {error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!rows && !error && <><div className="x-skel ad-sk-strip" /><div className="x-skel ad-sk-card" /></>}

          {rows && <>
            {view === 'live' && (
              <div className="x-strip x-strip--card ad-strip5" aria-label="Programme totals">
                <div><span>Partners</span><b className="m">{live.filter(r => r.status === 'ACTIVE').length}</b><small className="ad-small">{pending.length} waiting for approval</small></div>
                <div><span>Clicks, 30d</span><b className="m">{n(sum('clicks30d'))}</b><small className="ad-small">across all partner links</small></div>
                <div><span>Signups, 30d</span><b className="m">{n(sum('signups30d'))}</b><small className="ad-small">{pct(sum('converted30d'), sum('clicks30d'))} of clicks convert</small></div>
                <div><span>Referred clients</span><b className="m">{n(sum('clients'))}</b><small className="ad-small">{n(sum('connected'))} connected MT5</small></div>
                <div><span>Active traders</span><b className="m pos">{n(sum('active'))}</b><small className="ad-small">{pct(sum('active'), sum('clients'))} of referred clients</small></div>
              </div>
            )}

            {pending.length > 0 && (
              <section className="x-card" data-testid="partner-pending">
                <div className="x-ch"><h2>Waiting for approval</h2><span className="x-sub"><span className="m">{pending.length}</span></span></div>
                <ul className="ad-pending">
                  {pending.map(p => (
                    <li key={p.id}>
                      <Avatar name={p.name} size={38} />
                      <span className="ad-pending-who"><Link href={`/admin/partners/${p.id}`} className="x-link">{p.name}</Link><small>{p.email}{p.audience ? ` · ${p.audience}` : ''}</small></span>
                      <span className="ad-pending-meta">Requested code <b className="m">{p.code ?? '—'}</b><small>Applied {day(p.joinedAt)}</small></span>
                      <span className="ad-pending-btns">
                        <button type="button" className="x-btn x-btn--sm" disabled={busy === p.id} onClick={() => decide(p, 'decline')}>Decline</button>
                        <button type="button" className="x-btn x-btn--sm x-btn--hi" disabled={busy === p.id} onClick={() => decide(p, 'approve')}>Approve</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="x-card" data-testid="partner-leaderboard">
              <div className="x-ch"><h2>{view === 'live' ? 'Leaderboard' : view === 'SUSPENDED' ? 'Suspended partners' : 'Revoked partners'}</h2><span className="x-sub">sorted by {({ active: 'active traders', signups30d: 'signups (30d)', clicks30d: 'clicks (30d)', conv: 'conversion', clients: 'total clients' })[sort]}</span></div>
              {ranked.length === 0 ? <div className="x-empty"><b>No partners here yet</b><p>{view === 'live' ? 'Add one, or approve an application.' : 'Nothing in this list.'}</p></div> : (
                <div className="x-tblwrap ad-scroll">
                  <table className="x-tbl ad-tbl ad-lb">
                    <thead><tr><th>#</th><th>Partner</th><th>Code</th><th>Status</th>{th('clicks30d', 'Clicks, 30d')}{th('signups30d', 'Signups, 30d')}{th('conv', 'Conversion')}{th('clients', 'Clients')}<th className="n">MT5 connected</th>{th('active', 'Active')}</tr></thead>
                    <tbody>{ranked.map((r, i) => (
                      <tr key={r.id} className="x-click" tabIndex={0} onClick={() => router.push(`/admin/partners/${r.id}`)} onKeyDown={e => { if (e.key === 'Enter') router.push(`/admin/partners/${r.id}`); }} data-testid={`partner-row-${r.code}`}>
                        <td className="x-dim m">{i + 1}</td>
                        <td><div className="ac-who"><Avatar name={r.name} /><span><b>{r.name}</b><small>{r.audience ?? r.email}</small></span></div></td>
                        <td>{r.code ? <code className="m ad-code">{r.code}</code> : <span className="x-dim">—</span>}</td>
                        <td><PartnerStatusPill s={r.status} /></td>
                        <td className="n m">{n(r.clicks30d)}</td>
                        <td className="n m">{n(r.signups30d)}</td>
                        <td className="n m x-muted">{pct(r.converted30d, r.clicks30d)}</td>
                        <td className="n m">{n(r.clients)}</td>
                        <td className="n m">{n(r.connected)}</td>
                        <td className={`n m ${r.active > 0 ? 'pos' : 'x-dim'}`}>{n(r.active)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="ad-row2">
              <LookupCard />
              <ReservedCard />
            </div>
          </>}
        </div>
      </AdminOnly></div>

      {adding && <AddPartner onClose={() => setAdding(false)} onAdded={p => { setAdding(false); setToast(`${p.name} is now a partner (${p.code}).`); void load(); }} />}
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}

function LookupCard() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ReferrerLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setErr('');
    try { setRes(await partnerApi.adminLookup(q.trim())); } catch (x) { setErr(msg(x, 'Lookup failed.')); } finally { setBusy(false); }
  }
  return (
    <section className="x-card" data-testid="partner-lookup">
      <div className="x-ch"><h2>Who referred this person?</h2></div>
      <form onSubmit={go} className="ac-inline-form">
        <label className="x-search"><ISearch size={15} /><input className="x-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Client email or a partner code" aria-label="Email or code" /></label>
        <button type="submit" className="x-btn x-btn--hi" disabled={busy || q.trim().length < 2}>{busy ? 'Looking…' : 'Look up'}</button>
      </form>
      {err && <div className="x-banner x-banner--err ad-mt"><span>{err}</span></div>}
      {res && (
        <div className="x-inset ad-lookup">
          {!res.user && !res.codeOwner && <p className="x-muted">Nothing found for &ldquo;{res.query}&rdquo;.</p>}
          {res.user && (res.referredBy
            ? <p><b>{res.user.name}</b> was referred by <Link className="x-link" href={`/admin/partners/${res.referredBy.partner.id}`}>{res.referredBy.partner.name}</Link> via {res.referredBy.client.via === 'admin' ? 'an admin assignment' : res.referredBy.client.via} on {day(res.referredBy.client.signedUpAt)}.</p>
            : <p><b>{res.user.name}</b> wasn&rsquo;t referred by anyone.</p>)}
          {res.codeOwner && <p>Code belongs to <Link className="x-link" href={`/admin/partners/${res.codeOwner.id}`}>{res.codeOwner.name}</Link> <PartnerStatusPill s={res.codeOwner.status} /></p>}
        </div>
      )}
    </section>
  );
}

function ReservedCard() {
  const [list, setList] = useState<ReservedCode[] | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => partnerApi.reservedList().then(setList).catch(e => setErr(msg(e, 'Could not load blocked names.'))), []);
  useEffect(() => { void load(); }, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await partnerApi.reserveName(code); setCode(''); await load(); } catch (x) { setErr(msg(x, 'Could not block that name.')); }
  }
  return (
    <section className="x-card" data-testid="partner-reserved">
      <div className="x-ch"><h2>Blocked names</h2><span className="x-sub"><span className="m">{list?.length ?? 0}</span></span></div>
      <p className="ac-p">Codes no partner can take. Route names and anything that passes a link off as ours (TRADElogs, official, support…) are always blocked.</p>
      <form onSubmit={add} className="ac-inline-form">
        <input className="x-input m" value={code} maxLength={20} onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="Name to block" aria-label="Name to block" />
        <button type="submit" className="x-btn x-btn--hi" disabled={code.length < 3}>Block</button>
      </form>
      {err && <div className="x-banner x-banner--err ad-mt"><span>{err}</span></div>}
      {list && list.length > 0 && (
        <ul className="ac-codes">
          {list.map(r => (
            <li key={r.id}><span><b className="m">{r.code}</b><small>{r.reason ?? `by ${r.createdByEmail}`}</small></span>
              <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={async () => { await partnerApi.releaseName(r.id).catch(() => {}); void load(); }}>Release</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddPartner({ onClose, onAdded }: { onClose: () => void; onAdded: (p: AdminPartnerRow) => void }) {
  const [f, setF] = useState({ email: '', code: '', audience: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = /\S+@\S+\.\S+/.test(f.email) && (!f.code || f.code.length >= 3);
  const ref = useDialog<HTMLFormElement>({ onClose, locked: busy });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setErr('');
    try { onAdded(await partnerApi.adminCreate({ email: f.email.trim(), ...(f.code ? { code: f.code } : {}), ...(f.audience.trim() ? { audience: f.audience.trim() } : {}) })); }
    catch (x) { setErr(msg(x, 'Could not add that partner.')); }
    finally { setBusy(false); }
  }
  return (
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={onClose}>
        <form ref={ref} className="x-dialog ac-dlg ac-dlg--form" role="dialog" aria-modal="true" aria-label="Add partner" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
          <div className="ac-dlg-h">
            <div>
              <h2>Add a partner</h2>
              <p className="ac-dlg-msg">They need a TRADElogs account first. Their link starts tracking straight away, and the Partner section appears in their sidebar.</p>
            </div>
            <button type="button" className="x-btn x-btn--ghost x-btn--icon x-btn--sm" onClick={onClose} aria-label="Close"><IClose size={16} /></button>
          </div>
          <div className="ac-form">
            <div className="x-field"><label htmlFor="ad-add-email">Their TRADElogs email</label><input id="ad-add-email" className="x-input" autoFocus type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="rohan@example.com" data-testid="add-email" /></div>
            <div className="x-field"><label htmlFor="ad-add-code">Referral code <span className="x-dim">(optional)</span></label><input id="ad-add-code" className="x-input m" value={f.code} maxLength={20} onChange={e => setF({ ...f, code: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() })} placeholder="ROHANFX" /><span className="x-help">{f.code ? `tradelogs.com/r/${f.code}` : 'Leave blank to generate one from their name.'}</span></div>
            <div className="x-field"><label htmlFor="ad-add-aud">Audience <span className="x-dim">(optional)</span></label><input id="ad-add-aud" className="x-input" value={f.audience} maxLength={120} onChange={e => setF({ ...f, audience: e.target.value })} placeholder="Telegram · 18k members" /></div>
            {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
            <footer className="ac-dlg-ft"><button type="button" className="x-btn" onClick={onClose}>Cancel</button><button type="submit" className="x-btn x-btn--hi" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add partner'}</button></footer>
          </div>
        </form>
      </div>
    </V6Portal>
  );
}
