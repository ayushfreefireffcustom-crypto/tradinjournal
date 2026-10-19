'use client';

// Admin: every partner, ranked by what their link actually produced, with the
// approval queue on top, a "who referred this person?" lookup and blocked names.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v3/admin-only';
import { usePlatformAccess } from '@/lib/use-platform-access';
import { useAccounts } from '@/lib/use-accounts';
import {
  partnerApi, type AdminPartnerRow, type PartnerStatus, type ReferrerLookup, type ReservedCode,
} from '@/lib/partner-api';
import { IClose, IPlus, ISearch } from '@/components/v3/icons';
import { Avatar, PartnerStatusPill, day, n, pct } from '@/components/v3/partner-parts';
import { useConfirm } from '@/components/v3/confirm-dialog';

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
  const th = (k: Sort, l: string) => <th className="r"><button className={`v3-sort ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}</button></th>;

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
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Admin" pageTitle="Partners"
      actions={isAdmin && <button className="v3-btn v3-btn--acc" onClick={() => setAdding(true)} data-testid="partner-add"><IPlus size={15} />Add partner</button>}>
      <div className="v3-page" data-testid="admin-partners"><AdminOnly>
        <div className="pt-head">
          <div>
            <h1 className="v3-h1"><b>Partners.</b></h1>
            <p className="v3-sub">Who&rsquo;s bringing traders in, and how many of them stick.</p>
          </div>
          <div className="v3-seg" role="group" aria-label="Show">
            {([['live', 'Active & pending'], ['SUSPENDED', 'Suspended'], ['REVOKED', 'Revoked']] as const).map(([k, l]) => (
              <button key={k} aria-pressed={view === k} onClick={() => { setRows(null); setView(k); }}>{l}</button>
            ))}
          </div>
        </div>
        {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partners</b>{error}</div>}
        {!rows && !error && <div className="skel d-sk" style={{ height: 420 }} />}

        {rows && <>
          {view === 'live' && (
            <section className="v3-card d-kpis pt-akpis" aria-label="Programme totals">
              <div className="d-kpi"><div className="l">Partners</div><b className="num">{live.filter(r => r.status === 'ACTIVE').length}</b><div className="s">{pending.length} waiting for approval</div></div>
              <div className="d-kpi"><div className="l">Clicks · 30d</div><b className="num">{n(sum('clicks30d'))}</b><div className="s">Across all partner links</div></div>
              <div className="d-kpi"><div className="l">Signups · 30d</div><b className="num">{n(sum('signups30d'))}</b><div className="s">{pct(sum('converted30d'), sum('clicks30d'))} of clicks convert</div></div>
              <div className="d-kpi"><div className="l">Referred clients</div><b className="num">{n(sum('clients'))}</b><div className="s">{n(sum('connected'))} connected MT5</div></div>
              <div className="d-kpi"><div className="l">Active traders</div><b className="num lg">{n(sum('active'))}</b><div className="s">{pct(sum('active'), sum('clients'))} of referred clients</div></div>
            </section>
          )}

          {pending.length > 0 && (
            <section className="v3-card pt-pending" data-testid="partner-pending">
              <div className="v3-ch"><h3>Waiting for approval<span> · {pending.length}</span></h3></div>
              <ul>
                {pending.map(p => (
                  <li key={p.id}>
                    <Avatar name={p.name} size={38} />
                    <span className="who"><Link href={`/admin/partners/${p.id}`}><b>{p.name}</b></Link><small>{p.email}{p.audience ? ` · ${p.audience}` : ''}</small></span>
                    <span className="code">Requested code <b>{p.code ?? '—'}</b></span>
                    <span className="mute">Applied {day(p.joinedAt)}</span>
                    <span className="btns">
                      <button className="v3-btn v3-btn--o" disabled={busy === p.id} onClick={() => decide(p, 'decline')}>Decline</button>
                      <button className="v3-btn v3-btn--ink" disabled={busy === p.id} onClick={() => decide(p, 'approve')}>Approve</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="v3-card a-flush" data-testid="partner-leaderboard">
            <div className="v3-ch"><h3>{view === 'live' ? 'Leaderboard' : view === 'SUSPENDED' ? 'Suspended partners' : 'Revoked partners'}<span> · sorted by {({ active: 'active traders', signups30d: 'signups (30d)', clicks30d: 'clicks (30d)', conv: 'conversion', clients: 'total clients' })[sort]}</span></h3></div>
            {ranked.length === 0 ? <div className="d-empty"><b>No partners here yet</b>{view === 'live' ? 'Add one, or approve an application.' : 'Nothing in this list.'}</div> : (
              <div className="v3-tbl-wrap">
                <table className="v3-table pt-lb">
                  <thead><tr><th>#</th><th>Partner</th><th>Code</th><th>Status</th>{th('clicks30d', 'Clicks · 30d')}{th('signups30d', 'Signups · 30d')}{th('conv', 'Conv.')}{th('clients', 'Clients')}<th className="r">MT5 connected</th>{th('active', 'Active')}</tr></thead>
                  <tbody>{ranked.map((r, i) => (
                    <tr key={r.id} tabIndex={0} onClick={() => router.push(`/admin/partners/${r.id}`)} onKeyDown={e => { if (e.key === 'Enter') router.push(`/admin/partners/${r.id}`); }} data-testid={`partner-row-${r.code}`}>
                      <td className="mute num">{i + 1}</td>
                      <td><div className="pt-who"><Avatar name={r.name} /><span><b>{r.name}</b><small>{r.audience ?? r.email}</small></span></div></td>
                      <td>{r.code ? <code className="pt-c">{r.code}</code> : <span className="mute">—</span>}</td>
                      <td><PartnerStatusPill s={r.status} /></td>
                      <td className="r num">{n(r.clicks30d)}</td>
                      <td className="r num">{n(r.signups30d)}</td>
                      <td className="r"><span className="v3-pill v num">{pct(r.converted30d, r.clicks30d)}</span></td>
                      <td className="r num">{n(r.clients)}</td>
                      <td className="r num">{n(r.connected)}</td>
                      <td className="r num lg" style={{ fontWeight: 700 }}>{n(r.active)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <div className="pt-g2 pt-tools">
            <LookupCard />
            <ReservedCard />
          </div>
        </>}
      </AdminOnly></div>

      {adding && <AddPartner onClose={() => setAdding(false)} onAdded={p => { setAdding(false); setToast(`${p.name} is now a partner (${p.code}).`); void load(); }} />}
      {toast && <div className="pt-toast" role="status">{toast}</div>}
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
    <section className="v3-card pt-tool" data-testid="partner-lookup">
      <div className="v3-ch"><h3>Who referred this person?</h3></div>
      <form onSubmit={go} className="pt-reserve">
        <label className="pt-search" style={{ maxWidth: 'none' }}><ISearch size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Client email or a partner code" aria-label="Email or code" /></label>
        <button type="submit" className="v3-btn v3-btn--ink pt-copy-ink" disabled={busy || q.trim().length < 2}>{busy ? 'Looking…' : 'Look up'}</button>
      </form>
      {err && <p className="pt-err">{err}</p>}
      {res && (
        <div className="pt-lookup">
          {!res.user && !res.codeOwner && <p className="mute">Nothing found for &ldquo;{res.query}&rdquo;.</p>}
          {res.user && (res.referredBy
            ? <p><b>{res.user.name}</b> was referred by <Link href={`/admin/partners/${res.referredBy.partner.id}`}>{res.referredBy.partner.name}</Link> via {res.referredBy.client.via === 'admin' ? 'an admin assignment' : res.referredBy.client.via} on {day(res.referredBy.client.signedUpAt)}.</p>
            : <p><b>{res.user.name}</b> wasn&rsquo;t referred by anyone.</p>)}
          {res.codeOwner && <p>Code belongs to <Link href={`/admin/partners/${res.codeOwner.id}`}>{res.codeOwner.name}</Link> <PartnerStatusPill s={res.codeOwner.status} />.</p>}
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
    <section className="v3-card pt-tool" data-testid="partner-reserved">
      <div className="v3-ch"><h3>Blocked names<span> · {list?.length ?? 0}</span></h3></div>
      <p className="pt-tool-sub">Codes no partner can take. Route names and anything that passes a link off as ours (TRADElogs, official, support…) are always blocked.</p>
      <form onSubmit={add} className="pt-reserve">
        <input value={code} maxLength={20} onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="NAME TO BLOCK" aria-label="Name to block" />
        <button type="submit" className="v3-btn v3-btn--ink pt-copy-ink" disabled={code.length < 3}>Block</button>
      </form>
      {err && <p className="pt-err">{err}</p>}
      {list && list.length > 0 && (
        <ul className="pt-codes">
          {list.map(r => (
            <li key={r.id}><b>{r.code}</b><span className="mute">{r.reason ?? `by ${r.createdByEmail}`}</span>
              <button type="button" className="pt-rowbtn" onClick={async () => { await partnerApi.releaseName(r.id).catch(() => {}); void load(); }}>Release</button></li>
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
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setErr('');
    try { onAdded(await partnerApi.adminCreate({ email: f.email.trim(), ...(f.code ? { code: f.code } : {}), ...(f.audience.trim() ? { audience: f.audience.trim() } : {}) })); }
    catch (x) { setErr(msg(x, 'Could not add that partner.')); }
    finally { setBusy(false); }
  }
  return (
    <div className="v3 v3-modal-scrim pt-scrim" onMouseDown={onClose}>
      <form className="pt-modal" role="dialog" aria-label="Add partner" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="pt-modal-h"><h2>Add a partner</h2><button type="button" onClick={onClose} aria-label="Close"><IClose size={16} /></button></div>
        <p>They need a TRADElogs account first. Their link starts tracking straight away, and the Partner section appears in their sidebar.</p>
        <label>Their TRADElogs email<input autoFocus type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="rohan@example.com" data-testid="add-email" /></label>
        <label><span className="pt-lbl">Referral code <span>(optional)</span></span><input value={f.code} maxLength={20} onChange={e => setF({ ...f, code: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() })} placeholder="ROHANFX" /><small>{f.code ? `tradelogs.com/r/${f.code}` : 'Leave blank to generate one from their name.'}</small></label>
        <label><span className="pt-lbl">Audience <span>(optional)</span></span><input value={f.audience} maxLength={120} onChange={e => setF({ ...f, audience: e.target.value })} placeholder="Telegram · 18k members" /></label>
        {err && <p className="pt-err" role="alert">{err}</p>}
        <div className="pt-modal-f"><button type="button" className="v3-btn v3-btn--o" onClick={onClose}>Cancel</button><button type="submit" className="v3-btn v3-btn--acc" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add partner'}</button></div>
      </form>
    </div>
  );
}
