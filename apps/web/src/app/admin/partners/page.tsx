'use client';

// Admin: every partner, ranked by what their link actually produced, with the
// approval queue on top. Row → per-partner detail.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, type AdminPartnerRow, type PartnerStatus } from '@/lib/partner-api';
import { IClose, IPlus } from '@/components/v3/icons';
import { Avatar, day, n, pct } from '@/components/v3/partner-parts';

type Sort = 'active' | 'signups30d' | 'clicks30d' | 'conv' | 'clients';
const ST: Record<PartnerStatus, [string, string]> = { ACTIVE: ['g', 'Active'], PENDING: ['a', 'Pending'], PAUSED: ['n', 'Paused'] };

export default function AdminPartnersPage() {
  const router = useRouter();
  const { accounts, selected, select } = useAccounts();
  const [rows, setRows] = useState<AdminPartnerRow[] | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>('active');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    partnerApi.adminList().then(d => alive && setRows(d)).catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load partners.'));
    return () => { alive = false; };
  }, []);

  const live = useMemo(() => (rows ?? []).filter(r => r.status !== 'PENDING'), [rows]);
  const pending = useMemo(() => (rows ?? []).filter(r => r.status === 'PENDING'), [rows]);
  const ranked = useMemo(() => [...live].sort((a, b) => sort === 'conv' ? (b.signups30d / (b.clicks30d || 1)) - (a.signups30d / (a.clicks30d || 1)) : b[sort] - a[sort]), [live, sort]);
  const sum = (k: keyof AdminPartnerRow) => live.reduce((a, r) => a + (r[k] as number), 0);
  const setStatus = (id: string, status: PartnerStatus) => setRows(rs => rs?.map(r => (r.id === id ? { ...r, status } : r)) ?? null);
  const th = (k: Sort, l: string) => <th className="r"><button className={`v3-sort ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}</button></th>;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Admin" pageTitle="Partners"
      actions={<button className="v3-btn v3-btn--acc" onClick={() => setAdding(true)} data-testid="partner-add"><IPlus size={15} />Add partner</button>}>
      <div className="v3-page" data-testid="admin-partners">
        <div>
          <h1 className="v3-h1"><b>Partners.</b></h1>
          <p className="v3-sub">Who&rsquo;s bringing traders in, and how many of them stick.</p>
        </div>
        {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partners</b>{error}</div>}
        {!rows && !error && <div className="skel d-sk" style={{ height: 420 }} />}

        {rows && <>
          <section className="v3-card d-kpis pt-akpis" aria-label="Programme totals">
            <div className="d-kpi"><div className="l">Partners</div><b className="num">{live.filter(r => r.status === 'ACTIVE').length}</b><div className="s">{pending.length} pending · {live.filter(r => r.status === 'PAUSED').length} paused</div></div>
            <div className="d-kpi"><div className="l">Clicks · 30d</div><b className="num">{n(sum('clicks30d'))}</b><div className="s">Across all partner links</div></div>
            <div className="d-kpi"><div className="l">Signups · 30d</div><b className="num">{n(sum('signups30d'))}</b><div className="s">{pct(sum('signups30d'), sum('clicks30d'))} of clicks</div></div>
            <div className="d-kpi"><div className="l">Referred clients</div><b className="num">{n(sum('clients'))}</b><div className="s">{n(sum('connected'))} connected MT5</div></div>
            <div className="d-kpi"><div className="l">Active traders</div><b className="num lg">{n(sum('active'))}</b><div className="s">{pct(sum('active'), sum('clients'))} of referred clients</div></div>
          </section>

          {pending.length > 0 && (
            <section className="v3-card pt-pending" data-testid="partner-pending">
              <div className="v3-ch"><h3>Waiting for approval<span> · {pending.length}</span></h3></div>
              <ul>
                {pending.map(p => (
                  <li key={p.id}>
                    <Avatar name={p.name} size={38} />
                    <span className="who"><b>{p.name}</b><small>{p.email} · {p.audience}</small></span>
                    <span className="code">Requested code <b>{p.code}</b></span>
                    <span className="mute">Applied {day(p.joinedAt)}</span>
                    <span className="btns">
                      <button className="v3-btn v3-btn--o" onClick={() => setRows(rs => rs?.filter(r => r.id !== p.id) ?? null)}>Decline</button>
                      <button className="v3-btn v3-btn--ink" onClick={() => setStatus(p.id, 'ACTIVE')}>Approve</button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="v3-card a-flush" data-testid="partner-leaderboard">
            <div className="v3-ch"><h3>Leaderboard<span> · sorted by {({ active: 'active traders', signups30d: 'signups (30d)', clicks30d: 'clicks (30d)', conv: 'conversion', clients: 'total clients' })[sort]}</span></h3></div>
            <div className="v3-tbl-wrap">
              <table className="v3-table pt-lb">
                <thead><tr><th>#</th><th>Partner</th><th>Code</th><th>Status</th>{th('clicks30d', 'Clicks · 30d')}{th('signups30d', 'Signups · 30d')}{th('conv', 'Conv.')}{th('clients', 'Clients')}<th className="r">MT5 connected</th>{th('active', 'Active')}</tr></thead>
                <tbody>{ranked.map((r, i) => (
                  <tr key={r.id} onClick={() => router.push(`/admin/partners/${r.id}`)} data-testid={`partner-row-${r.code}`}>
                    <td className="mute num">{i + 1}</td>
                    <td><Link href={`/admin/partners/${r.id}`} className="pt-who" onClick={e => e.stopPropagation()}><Avatar name={r.name} /><span><b>{r.name}</b><small>{r.audience}</small></span></Link></td>
                    <td><code className="pt-c">{r.code}</code></td>
                    <td><span className={`v3-pill ${ST[r.status][0]} pt-st`}><i />{ST[r.status][1]}</span></td>
                    <td className="r num">{n(r.clicks30d)}</td>
                    <td className="r num">{n(r.signups30d)}</td>
                    <td className="r"><span className="v3-pill v num">{pct(r.signups30d, r.clicks30d)}</span></td>
                    <td className="r num">{n(r.clients)}</td>
                    <td className="r num">{n(r.connected)}</td>
                    <td className="r num lg" style={{ fontWeight: 700 }}>{n(r.active)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        </>}
      </div>

      {adding && <AddPartner onClose={() => setAdding(false)} onAdd={p => { setRows(rs => [...(rs ?? []), p]); setAdding(false); }} />}
    </AppShell>
  );
}

function AddPartner({ onClose, onAdd }: { onClose: () => void; onAdd: (p: AdminPartnerRow) => void }) {
  const [f, setF] = useState({ name: '', email: '', code: '', audience: '' });
  const code = f.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  const valid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email) && code.length >= 3;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="v3 v3-modal-scrim pt-scrim" onMouseDown={onClose}>
      <form className="pt-modal" role="dialog" aria-label="Add partner" onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (valid) onAdd({ id: `p_${Date.now()}`, name: f.name.trim(), email: f.email.trim(), code, status: 'ACTIVE', joinedAt: new Date().toISOString(), audience: f.audience.trim() || '—', clicks30d: 0, signups30d: 0, clients: 0, connected: 0, active: 0 }); }}>
        <div className="pt-modal-h"><h2>Add a partner</h2><button type="button" onClick={onClose} aria-label="Close"><IClose size={16} /></button></div>
        <p>They&rsquo;ll get an email to sign in and see their partner dashboard. Their link starts tracking straight away.</p>
        <label>Name<input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Rohan Mehta" /></label>
        <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="rohan@example.com" /></label>
        <label>Referral code<input value={code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="ROHANFX" /><small>{code ? `tradelogs.com/r/${code}` : 'Letters and numbers, 3–16 characters.'}</small></label>
        <label><span className="pt-lbl">Audience <span>(optional)</span></span><input value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} placeholder="Telegram · 18k members" /></label>
        <div className="pt-modal-f"><button type="button" className="v3-btn v3-btn--o" onClick={onClose}>Cancel</button><button type="submit" className="v3-btn v3-btn--acc" disabled={!valid}>Add partner</button></div>
      </form>
    </div>
  );
}
