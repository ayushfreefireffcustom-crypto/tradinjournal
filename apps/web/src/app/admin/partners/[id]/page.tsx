'use client';

// Admin view of one partner: the same funnel, trend and channels the partner
// sees, their client list (assign / unlink / move all), codes, status controls
// and the note trail every admin action writes to.
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import {
  partnerApi, type AdminPartnerDetail, type AdminPartnerRow, type ClientsPage, type PartnerClient, type PartnerRange, type StatusAction,
} from '@/lib/partner-api';
import { IArrowLeft } from '@/components/v3/icons';
import {
  ActivityFeed, Avatar, ChannelTable, ClientRows, Funnel, PartnerStatusPill, RangeSeg, TrendCard, day, n,
} from '@/components/v3/partner-parts';
import { timeAgo } from '@/components/app-shell';

const PAGE = 10;
const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const ACTIONS: Record<string, { a: StatusAction; l: string; ink?: boolean; ask: string }[]> = {
  PENDING: [{ a: 'decline', l: 'Decline', ask: 'Decline this application?' }, { a: 'approve', l: 'Approve', ink: true, ask: '' }],
  ACTIVE: [{ a: 'suspend', l: 'Suspend', ask: 'Suspend this partner? Their links stop attributing new signups until you reinstate them.' }, { a: 'revoke', l: 'Revoke', ask: 'Revoke partner status? Their portal closes and links stop attributing. Existing clients stay on record.' }],
  SUSPENDED: [{ a: 'revoke', l: 'Revoke', ask: 'Revoke partner status?' }, { a: 'reinstate', l: 'Reinstate', ink: true, ask: '' }],
  REVOKED: [{ a: 'reinstate', l: 'Reinstate', ink: true, ask: 'Reinstate this partner? Their links start attributing again.' }],
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

  async function status(a: StatusAction, ask: string) {
    if (ask && !confirm(ask)) return;
    const reason = a === 'approve' || a === 'reinstate' ? null : prompt('Reason (optional — kept on the note trail):');
    if (reason === null && a !== 'approve' && a !== 'reinstate') return;
    await act(`st:${a}`, () => partnerApi.adminStatus(id, a, reason?.trim() || undefined), `Partner ${({ approve: 'approved', decline: 'declined', suspend: 'suspended', reinstate: 'reinstated', revoke: 'revoked' } as const)[a]}.`);
  }
  function unlink(c: PartnerClient) {
    const reason = prompt(`Unlink ${c.name} from this partner? Reason (optional):`);
    if (reason === null) return;
    void act(`ul:${c.id}`, () => partnerApi.adminUnlink(id, c.id, reason.trim() || undefined), `${c.name} unlinked.`);
  }

  const p = d?.admin;
  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Admin / Partners" pageTitle={p?.name ?? 'Partner'}>
      <div className="v3-page" data-testid="admin-partner">
        <Link href="/admin/partners" className="v3-link pt-back"><IArrowLeft size={14} /> All partners</Link>
        {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partner</b>{error}</div>}
        {!d && !error && <div className="skel d-sk" style={{ height: 420 }} />}

        {d && p && <>
          <section className="v3-card pt-prof">
            <Avatar name={p.name} size={56} />
            <div className="who">
              <h1>{p.name} <PartnerStatusPill s={p.status} /></h1>
              <p>{p.email}{p.audience ? ` · ${p.audience}` : ''}</p>
            </div>
            <dl>
              <div><dt>Code</dt><dd>{p.code ? <code className="pt-c">{p.code}</code> : '—'}</dd></div>
              <div><dt>Link</dt><dd>tradelogs.com/r/{p.code}</dd></div>
              <div><dt>{p.status === 'PENDING' || !p.approvedAt ? 'Applied' : 'Partner since'}</dt><dd>{day(p.status === 'PENDING' || !p.approvedAt ? p.joinedAt : p.approvedAt)}</dd></div>
            </dl>
            <div className="btns">
              {ACTIONS[p.status]!.map(x => (
                <button key={x.a} className={`v3-btn ${x.ink ? 'v3-btn--ink' : 'v3-btn--o'}`} disabled={!!busy} onClick={() => status(x.a, x.ask)} data-testid={`status-${x.a}`}>{x.l}</button>
              ))}
            </div>
          </section>

          <div className="pt-head">
            <h2 className="pt-h2">Performance</h2>
            <RangeSeg value={range} onChange={setRange} small />
          </div>
          <Funnel f={d.funnel} rule={d.partner.activeRule} title="Funnel" />
          <div className="pt-g3">
            <TrendCard daily={d.daily} />
            <ActivityFeed events={d.activity} limit={7} />
          </div>
          <ChannelTable channels={d.channels} withLinks />

          <section className="v3-card a-flush" data-testid="admin-partner-clients">
            <div className="v3-ch"><h3>Clients<span> · {n(clients?.meta.total ?? d.totalClients)}</span></h3></div>
            {!clients ? <div className="skel d-sk" style={{ height: 200, margin: 16 }} />
              : clients.items.length ? <>
                <ClientRows clients={clients.items} onUnlink={unlink} />
                <div className="pt-pager">
                  <span>{(clients.meta.page - 1) * PAGE + 1}–{Math.min(clients.meta.total, clients.meta.page * PAGE)} of {n(clients.meta.total)}</span>
                  <div><button className="v3-btn v3-btn--o" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Previous</button><button className="v3-btn v3-btn--o" disabled={page >= clients.meta.totalPages} onClick={() => setPage(x => x + 1)}>Next</button></div>
                </div>
              </> : <div className="d-empty"><b>No clients yet</b>Nobody has signed up with this partner&rsquo;s link or code.</div>}
          </section>

          <div className="pt-g2 pt-tools">
            <AssignCard partnerId={id} busy={busy} act={act} />
            <MoveCard from={p} busy={busy} act={act} />
          </div>

          <div className="pt-g2 pt-tools">
            <section className="v3-card pt-tool" data-testid="admin-partner-codes">
              <div className="v3-ch"><h3>Codes<span> · {d.codes.length}</span></h3></div>
              <ul className="pt-codes">
                {d.codes.map(c => (
                  <li key={c.id}><b>{c.code}</b><span className="mute">{c.isPrimary ? 'Primary · ' : ''}{n(c.clicks)} clicks · {n(c.signups)} signups</span>
                    {!c.isPrimary && <button type="button" className="pt-rowbtn" disabled={!!busy} onClick={() => confirm(`Revoke ${c.code}? It stops working and becomes bookable again.`) && act(`rc:${c.id}`, () => partnerApi.adminRevokeCode(id, c.id), `${c.code} revoked.`)}>Revoke</button>}
                  </li>
                ))}
              </ul>
            </section>
            <NotesCard partnerId={id} notes={d.notes} onAdded={load} />
          </div>
        </>}
      </div>
      {toast && <div className="pt-toast" role="status">{toast}</div>}
    </AppShell>
  );
}

type Act = (key: string, fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function AssignCard({ partnerId, busy, act }: { partnerId: string; busy: string | null; act: Act }) {
  const [email, setEmail] = useState('');
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <section className="v3-card pt-tool">
      <div className="v3-ch"><h3>Assign a client</h3></div>
      <p className="pt-tool-sub">Attach an existing TRADElogs user to this partner — for someone who forgot to use the link or code.</p>
      <form className="pt-tool-form" onSubmit={async e => { e.preventDefault(); if (await act('assign', () => partnerApi.adminAssign(partnerId, { email: email.trim(), force, ...(reason.trim() ? { reason: reason.trim() } : {}) }), 'Client assigned.')) { setEmail(''); setReason(''); setForce(false); } }}>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" aria-label="Client email" />
        <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
        <label className="pt-check"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /> Move them if another partner already has them</label>
        <button type="submit" className="v3-btn v3-btn--ink pt-copy-ink" disabled={!email || busy === 'assign'}>{busy === 'assign' ? 'Assigning…' : 'Assign'}</button>
      </form>
    </section>
  );
}

function MoveCard({ from, busy, act }: { from: AdminPartnerRow; busy: string | null; act: Act }) {
  const [targets, setTargets] = useState<AdminPartnerRow[]>([]);
  const [to, setTo] = useState('');
  useEffect(() => { partnerApi.adminList('ACTIVE').then(r => setTargets(r.filter(x => x.id !== from.id))).catch(() => {}); }, [from.id]);
  const target = targets.find(t => t.id === to);
  return (
    <section className="v3-card pt-tool">
      <div className="v3-ch"><h3>Move all clients</h3></div>
      <p className="pt-tool-sub">Hands every client of {from.name.split(' ')[0]} to another active partner. Use when a partner merges accounts or leaves.</p>
      <form className="pt-tool-form" onSubmit={async e => {
        e.preventDefault();
        if (!target || !confirm(`Move all ${from.clients} clients from ${from.name} to ${target.name}?`)) return;
        const reason = prompt('Reason (optional):');
        if (reason === null) return;
        await act('move', () => partnerApi.adminMove(from.id, target.id, reason.trim() || undefined), `Clients moved to ${target.name}.`);
      }}>
        <select className="pt-select" value={to} onChange={e => setTo(e.target.value)} aria-label="Move to partner">
          <option value="">Pick a partner…</option>
          {targets.map(t => <option key={t.id} value={t.id}>{t.name} · {t.code}</option>)}
        </select>
        <button type="submit" className="v3-btn v3-btn--o" disabled={!to || from.clients === 0 || busy === 'move'}>{busy === 'move' ? 'Moving…' : `Move ${from.clients} client${from.clients === 1 ? '' : 's'}`}</button>
      </form>
    </section>
  );
}

function NotesCard({ partnerId, notes, onAdded }: { partnerId: string; notes: AdminPartnerDetail['notes']; onAdded: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="v3-card pt-tool" data-testid="admin-partner-notes">
      <div className="v3-ch"><h3>Notes<span> · {notes.length}</span></h3></div>
      <form className="pt-note-form" onSubmit={async e => {
        e.preventDefault(); if (!body.trim()) return;
        setBusy(true);
        try { await partnerApi.adminNote(partnerId, body.trim()); setBody(''); await onAdded(); } finally { setBusy(false); }
      }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={2} placeholder="Context for whoever picks this up next…" aria-label="New note" />
        <button type="submit" className="v3-btn v3-btn--ink pt-copy-ink" disabled={!body.trim() || busy}>Add note</button>
      </form>
      <ul className="pt-notes">
        {notes.map(x => <li key={x.id}><p>{x.body}</p><small>{x.authorEmail} · {timeAgo(x.createdAt)}</small></li>)}
      </ul>
    </section>
  );
}
