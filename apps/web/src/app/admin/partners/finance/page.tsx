'use client';

// Super admin: package sales and the money owed to partners. Payout drafts are made
// automatically once a partner's payable balance passes the minimum; an admin pays
// them outside TRADElogs and records the reference here.
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useAccounts } from '@/lib/use-accounts';
import { cash, ibApi, type AdminPackageRow, type Finance } from '@/lib/ib-api';
import { IArrowLeft } from '@/components/v6/icons';
import { day } from '@/components/v6/account/partner-parts';
import { useConfirm } from '@/components/confirm-dialog';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);

export default function AdminFinancePage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<Finance | null>(null);
  const [pkgs, setPkgs] = useState<AdminPackageRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [dialog, ask] = useConfirm();

  const load = useCallback(async () => {
    try { setD(await ibApi.finance()); setError(''); } catch (e) { setError(msg(e, 'Could not load finance.')); }
  }, []);
  useEffect(() => { void load(); ibApi.adminPackages().then(setPkgs).catch(() => {}); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try { await fn(); setToast(done); await load(); } catch (e) { setToast(msg(e, 'That didn’t work.')); } finally { setBusy(null); }
  }

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner finance"
      pageSubtitle={<Link href="/admin/partners" className="ad-back"><IArrowLeft size={13} />All partners</Link>}>
      <div className="x-page" data-testid="admin-finance"><AdminOnly>
        <div className="x-page">
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
          {!d && !error && <div className="x-skel ad-sk-card" />}
          {d && <>
            {!d.paymentsEnabled && <div className="x-banner" role="note"><span>Online payment is off: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET on the API to sell packages. Until then, grant access by hand below.</span></div>}
            <div className="x-strip x-strip--card ib-adm-strip" aria-label="Totals">
              <div><span>Package sales</span><b className="m">{cash(d.totals.grossCents, d.currency)}</b></div>
              <div><span>TRADElogs share</span><b className="m">{cash(d.totals.platformCents, d.currency)}</b></div>
              <div><span>Partners&rsquo; share</span><b className="m">{cash(d.totals.partnerCents, d.currency)}</b></div>
              <div><span>Payable now</span><b className="m pos">{cash(d.totals.payableCents, d.currency)}</b></div>
              <div><span>Paid out</span><b className="m">{cash(d.totals.paidOutCents, d.currency)}</b></div>
              <div><span>IB commission reported</span><b className="m">{d.totals.ibReported.toFixed(2)}</b><small className="ad-small">brokers pay this to partners</small></div>
            </div>

            <section className="x-card" data-testid="finance-payouts">
              <div className="x-ch"><h2>Payouts</h2><span className="x-sub"><span className="m">{d.payouts.filter(p => p.status === 'DRAFT').length}</span> to pay</span></div>
              {d.payouts.length === 0 ? <EmptyState compact icon="report" title="Nothing to pay yet">A draft appears when a partner&rsquo;s payable balance reaches the minimum (Settings).</EmptyState> : (
                <div className="x-tblwrap ad-scroll"><table className="x-tbl ad-tbl"><thead><tr><th>Partner</th><th>Prepared</th><th>Pay to</th><th>Status</th><th className="n">Amount</th><th className="n"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{d.payouts.map(p => (
                    <tr key={p.id}>
                      <td><Link className="x-link" href={`/admin/partners/${p.partnerId}`}>{p.partner}</Link></td>
                      <td className="x-muted">{day(p.createdAt)}</td>
                      <td className="m">{p.status === 'DRAFT' ? (p.payoutDetails ?? <span className="neg">No payout details yet</span>) : <span className="x-dim">—</span>}</td>
                      <td>{p.status === 'PAID' ? <span className="x-tag x-tag--g">Paid {p.paidAt ? day(p.paidAt) : ''} · {p.reference}</span> : <span className="x-tag ac-tag-c">To pay</span>}</td>
                      <td className="n m">{cash(p.amountCents, p.currency)}</td>
                      <td className="n">{p.status === 'DRAFT' && <span className="ib-br-btns">
                        <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={!!busy} onClick={() => void act(p.id, () => ibApi.payoutCancel(p.id), 'Draft cancelled.')}>Cancel</button>
                        <button type="button" className="x-btn x-btn--sm x-btn--hi" disabled={!!busy} data-testid={`payout-paid-${p.partner}`} onClick={async () => {
                          const r = await ask({ title: `Mark ${cash(p.amountCents, p.currency)} to ${p.partner} as paid?`, body: 'Pay it first (bank / UPI / crypto), then enter the transfer reference.', confirmLabel: 'Mark paid', reason: true });
                          if (!r) return;
                          if (!r.reason || r.reason.trim().length < 2) { setToast('Enter the transfer reference.'); return; }
                          void act(p.id, () => ibApi.payoutPaid(p.id, r.reason!.trim()), 'Payout recorded.');
                        }}>Mark paid</button>
                      </span>}</td>
                    </tr>
                  ))}</tbody></table></div>
              )}
            </section>

            <div className="ib-grid2">
              <section className="x-card" data-testid="finance-balances">
                <div className="x-ch"><h2>Balances</h2></div>
                {d.balances.length === 0 ? <p className="x-muted ib-pad">No open balances.</p> : (
                  <div className="x-tblwrap"><table className="x-tbl ad-tbl"><thead><tr><th>Partner</th><th className="n">In refund window</th><th className="n">Payable</th></tr></thead>
                    <tbody>{d.balances.map(b => <tr key={b.partnerId}><td><Link className="x-link" href={`/admin/partners/${b.partnerId}`}>{b.partner}</Link></td><td className="n m">{cash(b.pendingCents, d.currency)}</td><td className="n m">{cash(b.payableCents, d.currency)}</td></tr>)}</tbody></table></div>
                )}
              </section>
              <GrantCard pkgs={pkgs} onDone={async t => { setToast(t); await load(); }} />
            </div>

            <section className="x-card" data-testid="finance-payments">
              <div className="x-ch"><h2>Payments</h2><span className="x-sub">latest <span className="m">{d.payments.length}</span></span></div>
              {d.payments.length === 0 ? <p className="x-muted ib-pad">No payments yet.</p> : (
                <div className="x-tblwrap ad-scroll"><table className="x-tbl ad-tbl"><thead><tr><th>Date</th><th>Client</th><th>Package</th><th>Partner</th><th>Status</th><th className="n">Amount</th><th className="n"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{d.payments.map(p => (
                    <tr key={p.id}>
                      <td className="x-muted">{day(p.at)}</td><td>{p.client}</td><td>{p.packageName}</td><td>{p.partner}</td>
                      <td><span className={`x-tag ${p.status === 'PAID' ? 'x-tag--g' : p.status === 'REFUNDED' || p.status === 'FAILED' ? 'x-tag--r' : ''}`}>{p.status.toLowerCase()}</span></td>
                      <td className="n m">{cash(p.amountCents, p.currency)}</td>
                      <td className="n">{p.status === 'PAID' && <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={!!busy} onClick={async () => {
                        if (await ask({ title: 'Record a refund?', body: 'Refund the client in Razorpay first. This ends their access now and takes the partner’s share back.', confirmLabel: 'Record refund', tone: 'danger' })) void act(p.id, () => ibApi.refund(p.id), 'Refund recorded.');
                      }}>Refund</button>}</td>
                    </tr>
                  ))}</tbody></table></div>
              )}
            </section>
          </>}
        </div>
      </AdminOnly></div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
      {dialog}
    </AppShell>
  );
}

function GrantCard({ pkgs, onDone }: { pkgs: AdminPackageRow[]; onDone: (t: string) => Promise<void> }) {
  const [f, setF] = useState({ email: '', packageId: '', days: '30', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const priced = pkgs.filter(p => p.status === 'LIVE');
  return (
    <section className="x-card" data-testid="finance-grant">
      <div className="x-ch"><h2>Grant access by hand</h2></div>
      <p className="ac-p">For offline payments or a goodwill extension. Gives the client the package for the days you set, without a payment.</p>
      <form className="ad-tool-form" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await ibApi.grant({ email: f.email.trim(), packageId: f.packageId, days: Number(f.days), ...(f.note.trim() ? { note: f.note.trim() } : {}) }); setF({ email: '', packageId: '', days: '30', note: '' }); await onDone('Access granted.'); }
        catch (x) { setErr(msg(x, 'Could not grant access.')); } finally { setBusy(false); }
      }}>
        <input className="x-input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="client@example.com" aria-label="Client email" />
        <select className="x-select" required value={f.packageId} onChange={e => setF({ ...f, packageId: e.target.value })} aria-label="Package">
          <option value="">Pick a package…</option>
          {priced.map(p => <option key={p.id} value={p.id}>{p.partner} · {p.name}{p.priceCents ? ` (${cash(p.priceCents, p.currency)})` : ' (free)'}</option>)}
        </select>
        <input className="x-input m" type="number" min={1} max={3650} value={f.days} onChange={e => setF({ ...f, days: e.target.value })} aria-label="Days" />
        <input className="x-input" value={f.note} maxLength={300} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" />
        {err && <div className="x-banner x-banner--err"><span>{err}</span></div>}
        <button type="submit" className="x-btn x-btn--hi" disabled={busy || !f.email || !f.packageId}>Grant</button>
      </form>
    </section>
  );
}
