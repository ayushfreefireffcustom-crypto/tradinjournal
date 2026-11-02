'use client';

// Admin › Marketplace (H2): creator applications and strategies waiting for
// review. Admins see the rules in plain English to judge them.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useToast } from '@/components/toast';
import ErrorCard from '@/components/v6/ui/error-card';
import { ApiError } from '@/lib/copy-api';
import { catLabel, marketApi, pctS, riskLabel, type AdminQueue } from '@/lib/marketplace-api';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';
import '@/styles/v6/marketplace.css';

const VIEWS: Array<[string, string]> = [['pending', 'Waiting for review'], ['published', 'Listed'], ['approved', 'Approved creators'], ['all', 'All']];

export default function AdminMarketplacePage() {
  const toast = useToast();
  const [view, setView] = useState('pending');
  const [q, setQ] = useState<AdminQueue | null>(null);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(() => { setErr(''); marketApi.adminQueue(view).then(setQ, (e: Error) => setErr(e.message)); }, [view]);
  useEffect(() => { setQ(null); load(); }, [load]);
  async function creator(id: string, d: 'approve' | 'reject' | 'suspend') {
    try { await marketApi.reviewCreator(id, d, notes[id]); toast.success(d === 'approve' ? 'Creator approved' : d === 'reject' ? 'Application declined' : 'Creator suspended; their strategies are unlisted'); load(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'That didn’t work'); }
  }
  async function template(id: string, d: 'publish' | 'reject' | 'unlist') {
    try { await marketApi.reviewTemplate(id, d, notes[id]); toast.success(d === 'publish' ? 'Listed in the marketplace' : d === 'reject' ? 'Sent back to the creator' : 'Unlisted'); load(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'That didn’t work'); }
  }
  const note = (id: string) => <input className="x-input" placeholder="Note to the creator (optional)" value={notes[id] ?? ''} maxLength={500} onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))} />;
  return (
    <AppShell legacy={false} pageTitle="Marketplace review" pageSubtitle="Creators and strategies waiting to be listed" actions={<Link href="/admin" className="x-btn">Command center</Link>}>
      <AdminOnly>
        <div className="ac-st1 mk-admin" data-testid="admin-mk-page">
          <div className="x-seg x-seg--in x-seg--sm" role="tablist" aria-label="Show">{VIEWS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} data-testid={`amk-${v}`}>{l}</button>)}</div>
          {err ? <ErrorCard message={err} onRetry={load} /> : !q ? <div className="x-skel" style={{ height: 300 }} /> : (
            <>
              <h2 className="mk-h2">Creators</h2>
              {!q.creators.length ? <p className="x-muted">None.</p> : q.creators.map((c) => (
                <article key={c.id} className="x-card mk-subrow" data-testid="amk-creator">
                  <header><div><b>{c.displayName}</b><span className="x-muted">{c.name} · {c.email} · applied {new Date(c.createdAt).toLocaleDateString()}</span></div><span className="x-tag">{c.status}</span></header>
                  <p className="mk-desc">{c.bio}</p>
                  {c.experience && <p className="x-muted mk-fine">Experience: {c.experience}</p>}
                  {c.links.map((l) => <a key={l} className="x-link mk-link" href={l} target="_blank" rel="noopener noreferrer nofollow">{l}</a>)}
                  {note(c.id)}
                  <div className="mk-subact">
                    {c.status !== 'approved' && <button className="x-btn x-btn--sm x-btn--hi" onClick={() => void creator(c.id, 'approve')} data-testid="amk-approve">Approve</button>}
                    {c.status === 'pending' && <button className="x-btn x-btn--sm" onClick={() => void creator(c.id, 'reject')}>Decline</button>}
                    {c.status === 'approved' && <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void creator(c.id, 'suspend')}>Suspend</button>}
                  </div>
                </article>
              ))}
              <h2 className="mk-h2">Strategies</h2>
              {!q.templates.length ? <p className="x-muted">None.</p> : q.templates.map((t) => (
                <article key={t.id} className="x-card mk-subrow" data-testid="amk-template">
                  <header><div><b>{t.name}</b><span className="x-muted">by {t.creator} · {catLabel(t.category)} · {riskLabel(t.risk)} · {t.symbols.join(', ')} {t.interval}</span></div><span className="x-tag">{t.status}</span></header>
                  <p>{t.summary}</p>
                  <p className="mk-desc x-muted">{t.description}</p>
                  <div className="mk-rules"><b>Rules (admins only)</b>{t.readback.map((l, i) => <p key={i}>{l}</p>)}</div>
                  <p className="x-muted mk-fine">Backtest: {t.performance?.backtest ? `${pctS(t.performance.backtest.metrics.totalReturnPct ?? null)} over ${t.performance.backtest.days} days, max drawdown ${pctS(t.performance.backtest.metrics.maxDrawdownPct ?? null)}, ${t.performance.backtest.metrics.trades ?? 0} trades` : t.performance?.note ?? 'none'} · tunable: {t.params.map((p) => `${p.label} ${p.min}–${p.max}`).join(', ') || 'none'} · live on: {t.exchanges.join(', ') || 'paper only'}</p>
                  {note(t.id)}
                  <div className="mk-subact">
                    {t.status !== 'published' && <button className="x-btn x-btn--sm x-btn--hi" onClick={() => void template(t.id, 'publish')} data-testid="amk-publish">List it</button>}
                    {t.status === 'pending' && <button className="x-btn x-btn--sm" onClick={() => void template(t.id, 'reject')}>Send back</button>}
                    {t.status === 'published' && <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void template(t.id, 'unlist')}>Unlist</button>}
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </AdminOnly>
    </AppShell>
  );
}
