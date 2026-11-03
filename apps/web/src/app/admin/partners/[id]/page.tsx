'use client';

// Admin view of one partner: the same funnel, trend and channels the partner
// sees, their client list (assign / unlink / move all), codes, status controls
// and the note trail every admin action writes to.
import Link from '@/components/v6/ui/link';
import { use, useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useAccounts } from '@/lib/use-accounts';
import {
  partnerApi, type AdminPartnerDetail, type AdminPartnerRow, type ClientsPage, type PartnerClient, type PartnerRange, type StatusAction,
} from '@/lib/partner-api';
import { IArrowLeft } from '@/components/v6/icons';
import {
  ActivityFeed, Avatar, ChannelTable, ClientRows, Funnel, PartnerStatusPill, RangeSeg, TrendCard, day, n,
} from '@/components/v6/account/partner-parts';
import { timeAgo } from '@/components/app-shell';
import { AttentionCard, BrokerHealthRow, EventList, IbClientRows, IbFunnelCard, TradingCard } from '@/components/v6/account/ib-parts';
import { ibApi } from '@/lib/ib-api';
import type { PartnerApplication } from '@/lib/partner-api';
import { useConfirm, type ConfirmOptions, type ConfirmResult } from '@/components/confirm-dialog';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';

const PAGE = 10;
const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const ACTIONS: Record<string, { a: StatusAction; l: string; ink?: boolean; ask: string }[]> = {
  PENDING: [{ a: 'reject', l: 'Reject', ask: 'They see your reason and can apply again.' }, { a: 'request_info', l: 'Ask for info', ask: 'Tell them what to add. They see this message and can update their application.' }, { a: 'approve', l: 'Approve', ink: true, ask: '' }],
  NEEDS_INFO: [{ a: 'reject', l: 'Reject', ask: 'They see your reason and can apply again.' }, { a: 'approve', l: 'Approve', ink: true, ask: '' }],
  REJECTED: [{ a: 'approve', l: 'Approve', ink: true, ask: 'Approve this partner after all?' }],
  ACTIVE: [{ a: 'suspend', l: 'Suspend', ask: 'Their links stop crediting new signups and their partner pages close until you reinstate them.' }, { a: 'revoke', l: 'Revoke', ask: 'Their partner pages close and links stop crediting signups. Existing clients stay on record.' }],
  SUSPENDED: [{ a: 'revoke', l: 'Revoke', ask: 'Their partner pages stay closed for good unless reinstated. Existing clients stay on record.' }, { a: 'reinstate', l: 'Reinstate', ink: true, ask: '' }],
  REVOKED: [{ a: 'reinstate', l: 'Reinstate', ink: true, ask: 'Their links start crediting signups again and their partner pages reopen.' }],
};

export default function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<AdminPartnerDetail | null>(null);
  const [clients, setClients] = useState<ClientsPage | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<PartnerRange>('ALL');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    try { setD(await partnerApi.adminDetail(id, range)); setError(''); } catch (e) { setError(msg(e, 'Could not load this partner.')); }
  }, [id, range]);
  const loadClients = useCallback(async () => {
    try { setClients(await partnerApi.adminClients(id, { page, pageSize: PAGE })); } catch { /* shown via detail error */ }
  }, [id, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try { await fn(); setToast(done); await Promise.all([load(), loadClients()]); return true; }
    catch (e) { setToast(msg(e, 'That didn’t work.')); return false; }
    finally { setBusy(null); }
  }

  async function status(a: StatusAction, label: string, body: string) {
    const destructive = a === 'decline' || a === 'reject' || a === 'suspend' || a === 'revoke';
    let reason: string | undefined;
    if (body || destructive) {
      const r = await ask({ title: `${label} ${d?.admin.name ?? 'this partner'}?`, body: body || undefined, confirmLabel: label, tone: destructive ? 'danger' : 'default', reason: destructive || a === 'request_info' });
      if (!r) return;
      reason = r.reason;
    }
    await act(`st:${a}`, () => partnerApi.adminStatus(id, a, reason), ({ approve: 'Partner approved.', decline: 'Application declined.', reject: 'Application declined.', request_info: 'Asked for more information.', suspend: 'Partner suspended. Their clients’ packages are on the grace period.', reinstate: 'Partner reinstated.', revoke: 'Partner revoked.' } as const)[a]);
  }
  async function unlink(c: PartnerClient) {
    const r = await ask({ title: `Unlink ${c.name}?`, body: 'They stop counting as this partner’s client. Their account and trades are untouched.', confirmLabel: 'Unlink', tone: 'danger', reason: true });
    if (!r) return;
    void act(`ul:${c.id}`, () => partnerApi.adminUnlink(id, c.id, r.reason), `${c.name} unlinked.`);
  }

  const p = d?.admin;
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle={p?.name ?? 'Partner'}
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}
      actions={d ? <RangeSeg value={range} onChange={setRange} /> : null}>
      <div className="x-page" data-testid="admin-partner"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>Couldn&rsquo;t load partner. {error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <><div className="x-skel ad-sk-status" /><div className="x-skel ad-sk-card" /></>}

          {d && p && <>
            <section className="x-card ad-prof">
              <Avatar name={p.name} size={52} />
              <div className="ad-prof-who">
                <h1>{p.name} <PartnerStatusPill s={p.status} /></h1>
                <p>{p.email}{p.audience ? ` · ${p.audience}` : ''}</p>
              </div>
              <dl className="ad-prof-dl">
                <div><dt>Code</dt><dd>{p.code ? <code className="m ad-code">{p.code}</code> : '—'}</dd></div>
                <div><dt>Link</dt><dd className="m ad-ell">{(d.channels.find(c => c.slug === null)?.url ?? `tradelogs.com/r/${p.code}`).replace(/^https?:\/\//, '')}</dd></div>
                <div><dt>{p.status === 'PENDING' || !p.approvedAt ? 'Applied' : 'Partner since'}</dt><dd>{day(p.status === 'PENDING' || !p.approvedAt ? p.joinedAt : p.approvedAt)}</dd></div>
              </dl>
              <div className="ad-prof-btns">
                {ACTIONS[p.status]!.map(x => {
                  const danger = x.a === 'suspend' || x.a === 'revoke' || x.a === 'decline' || x.a === 'reject';
                  return <button key={x.a} type="button" className={`x-btn ${x.ink ? 'x-btn--hi' : danger ? 'x-btn--danger' : ''}`} disabled={!!busy} onClick={() => status(x.a, x.l, x.ask)} data-testid={`status-${x.a}`}>{x.l}</button>;
                })}
              </div>
            </section>

            {d.application && <ApplicationCard app={d.application} />}

            {d.ib ? <IbFunnelCard f={d.ib.funnel} rule={d.partner.activeRule} title="Funnel" /> : <Funnel f={d.funnel} rule={d.partner.activeRule} title="Funnel" />}
            {d.ib && (
              <div className="ib-grid3">
                <TradingCard t={d.ib.trading} note="Admins see per-client P&L in the table below whatever the client chose; partners only see it for clients who share it." />
                <AttentionCard a={d.ib.needsAttention} />
              </div>
            )}
            {d.ib && (
              <section className="x-card" data-testid="admin-partner-brokers">
                <div className="x-ch"><h2>Broker connections</h2><span className="x-sub"><span className="m">{d.ib.brokers.length}</span></span>
                  <div className="x-r"><button type="button" className="x-btn x-btn--sm" disabled={!!busy} onClick={() => void act('recheck', () => ibApi.recheck(id), 'Every client account re-checked.')}>Re-check clients</button></div></div>
                {d.ib.brokers.length ? <ul className="ib-brs">{d.ib.brokers.map(b => <BrokerHealthRow key={b.id} b={b} />)}</ul> : <p className="x-muted ib-pad">No broker connected yet, so no client can be verified.</p>}
              </section>
            )}
            {d.packages && d.packages.length > 0 && (
              <section className="x-card" data-testid="admin-partner-packages">
                <div className="x-ch"><h2>Packages</h2><span className="x-sub"><span className="m">{d.packages.length}</span></span></div>
                <ul className="ac-codes">{d.packages.map(pk => <li key={pk.id}><span><b>{pk.name}</b><small>{pk.status.toLowerCase()} · {pk.perks.length} features · {pk.templateIds.length} strategies · {pk.requireActive ? 'active trading · ' : ''}{pk.accessDays ? `${pk.accessDays} days` : 'while they qualify'}</small></span><span className="m">{n(pk.holders)} unlocked</span></li>)}</ul>
              </section>
            )}
            <div className="ac-g3">
              <TrendCard daily={d.daily} />
              <ActivityFeed events={d.activity} limit={7} empty="Signups and MT5 connections from this partner show up here." />
            </div>
            <ChannelTable channels={d.channels} withLinks />

            <section className="x-card" data-testid="admin-partner-clients">
              <div className="x-ch"><h2>Clients</h2><span className="x-sub"><span className="m">{n(clients?.meta.total ?? d.totalClients)}</span></span></div>
              {!clients ? <div className="ad-tbl-sk">{[0, 1, 2, 3].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
                : clients.items.length ? <>
                  {clients.items.some(c => c.ib) ? <IbClientRows clients={clients.items} onUnlink={unlink} admin /> : <ClientRows clients={clients.items} onUnlink={unlink} />}
                  <div className="ac-pager">
                    <span><span className="m">{(clients.meta.page - 1) * PAGE + 1}–{Math.min(clients.meta.total, clients.meta.page * PAGE)}</span> of <span className="m">{n(clients.meta.total)}</span></span>
                    <div><button type="button" className="x-btn x-btn--sm" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Previous</button><button type="button" className="x-btn x-btn--sm" disabled={page >= clients.meta.totalPages} onClick={() => setPage(x => x + 1)}>Next</button></div>
                  </div>
                </> : <div className="x-empty"><b>No clients right now</b><p>New signups through their link or code will appear here.</p></div>}
            </section>

            <div className="ad-row2">
              <AssignCard partnerId={id} busy={busy} act={act} />
              <MoveCard from={p} busy={busy} act={act} ask={ask} />
            </div>

            <div className="ad-row2">
              <section className="x-card" data-testid="admin-partner-codes">
                <div className="x-ch"><h2>Codes</h2><span className="x-sub"><span className="m">{d.codes.length}</span></span></div>
                <ul className="ac-codes">
                  {d.codes.map(c => (
                    <li key={c.id}><span><b className="m">{c.code}</b><small>{c.isPrimary ? 'Primary · ' : ''}<span className="m">{n(c.clicks)}</span> clicks · <span className="m">{n(c.signups)}</span> signups</small></span>
                      {!c.isPrimary && <button type="button" className="x-btn x-btn--sm x-btn--ghost ad-revoke" disabled={!!busy} onClick={async () => { if (await ask({ title: `Revoke ${c.code}?`, body: 'The code stops working straight away and becomes bookable by anyone again. Clients who already joined with it stay.', confirmLabel: 'Revoke code', tone: 'danger' })) void act(`rc:${c.id}`, () => partnerApi.adminRevokeCode(id, c.id), `${c.code} revoked.`); }} data-testid={`revoke-${c.code}`}>Revoke</button>}
                    </li>
                  ))}
                </ul>
              </section>
              <NotesCard partnerId={id} notes={d.notes} onAdded={load} />
            </div>
            {d.events && (
              <section className="x-card" data-testid="admin-partner-events">
                <div className="x-ch"><h2>Sync and access log</h2><span className="x-sub">latest <span className="m">{d.events.length}</span></span></div>
                <EventList events={d.events} empty="List syncs, verifications and access changes for this partner show up here." />
              </section>
            )}
          </>}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function AssignCard({ partnerId, busy, act }: { partnerId: string; busy: string | null; act: Act }) {
  const [email, setEmail] = useState('');
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <section className="x-card">
      <div className="x-ch"><h2>Assign a client</h2></div>
      <p className="ac-p">Attach an existing TRADElogs user to this partner, for someone who forgot to use the link or code.</p>
      <form className="ad-tool-form" onSubmit={async e => { e.preventDefault(); if (await act('assign', () => partnerApi.adminAssign(partnerId, { email: email.trim(), force, ...(reason.trim() ? { reason: reason.trim() } : {}) }), 'Client assigned.')) { setEmail(''); setReason(''); setForce(false); } }}>
        <input className="x-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" aria-label="Client email" />
        <input className="x-input" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
        <label className="ad-check"><input type="checkbox" className="x-check" checked={force} onChange={e => setForce(e.target.checked)} /> Move them if another partner already has them</label>
        <button type="submit" className="x-btn x-btn--hi" disabled={!email || busy === 'assign'}>{busy === 'assign' ? 'Assigning…' : 'Assign'}</button>
      </form>
    </section>
  );
}

function MoveCard({ from, busy, act, ask }: { from: AdminPartnerRow; busy: string | null; act: Act; ask: (o: ConfirmOptions) => Promise<ConfirmResult> }) {
  const [targets, setTargets] = useState<AdminPartnerRow[]>([]);
  const [to, setTo] = useState('');
  useEffect(() => { partnerApi.adminList('ACTIVE').then(r => setTargets(r.filter(x => x.id !== from.id))).catch(() => {}); }, [from.id]);
  const target = targets.find(t => t.id === to);
  return (
    <section className="x-card">
      <div className="x-ch"><h2>Move all clients</h2></div>
      <p className="ac-p">Hands every client of {from.name.split(' ')[0]} to another active partner. Use when a partner merges accounts or leaves.</p>
      <form className="ad-tool-form" onSubmit={async e => {
        e.preventDefault();
        if (!target) return;
        const r = await ask({ title: `Move ${from.clients} client${from.clients === 1 ? '' : 's'} to ${target.name}?`, body: `Every client of ${from.name} will count for ${target.name} from now on.`, confirmLabel: 'Move clients', reason: true });
        if (!r) return;
        await act('move', () => partnerApi.adminMove(from.id, target.id, r.reason), `Clients moved to ${target.name}.`);
      }}>
        <select className="x-select" value={to} onChange={e => setTo(e.target.value)} aria-label="Move to partner">
          <option value="">Pick a partner…</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}
        </select>
        <button type="submit" className="x-btn x-btn--hi" disabled={!to || from.clients === 0 || busy === 'move'}>{busy === 'move' ? 'Moving…' : `Move ${from.clients} client${from.clients === 1 ? '' : 's'}`}</button>
      </form>
    </section>
  );
}

function NotesCard({ partnerId, notes, onAdded }: { partnerId: string; notes: AdminPartnerDetail['notes']; onAdded: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="x-card" data-testid="admin-partner-notes">
      <div className="x-ch"><h2>Notes</h2><span className="x-sub"><span className="m">{notes.length}</span></span></div>
      <form className="ad-tool-form" onSubmit={async e => {
        e.preventDefault(); if (!body.trim()) return;
        setBusy(true);
        try { await partnerApi.adminNote(partnerId, body.trim()); setBody(''); await onAdded(); } finally { setBusy(false); }
      }}>
        <textarea className="x-textarea ad-note-ta" value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={2} placeholder="Context for whoever picks this up next…" aria-label="New note" />
        <button type="submit" className="x-btn x-btn--hi" disabled={!body.trim() || busy}>Add note</button>
      </form>
      {notes.length > 0 && (
        <ul className="ad-notes">
          {notes.map(x => <li key={x.id}><p>{x.body}</p><small>{x.authorEmail} · {timeAgo(x.createdAt)}</small></li>)}
        </ul>
      )}
    </section>
  );
}

const BROKER_NAME: Record<string, string> = { xellion: 'Xellion', elefin: 'Elefin', exness: 'Exness', xm: 'XM', vantage: 'Vantage', icmarkets: 'IC Markets', pepperstone: 'Pepperstone', other: 'Other broker' };

function ApplicationCard({ app }: { app: PartnerApplication }) {
  const empty = !app.brokers.length && !app.socials.length && !app.audienceSize && !app.pitch;
  if (empty && !app.reviewNote) return null;
  return (
    <section className="x-card ib-app" data-testid="admin-partner-application">
      <div className="x-ch"><h2>Application</h2>{app.reviewedAt && <span className="x-sub">reviewed {timeAgo(app.reviewedAt)}</span>}</div>
      <dl>
        <dt>Broker IB with</dt><dd>{app.brokers.length ? app.brokers.map(b => BROKER_NAME[b] ?? b).join(', ') : '—'}</dd>
        <dt>Audience size</dt><dd>{app.audienceSize ?? '—'}</dd>
        <dt>Links</dt><dd>{app.socials.length ? app.socials.map(s => <span key={s.url}><a className="x-link" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.platform}</a>{' '}</span>) : '—'}</dd>
        <dt>About</dt><dd>{app.pitch ?? '—'}</dd>
      </dl>
      {app.reviewNote && <p className="ib-app-note">Last message to the applicant: {app.reviewNote}</p>}
    </section>
  );
}
