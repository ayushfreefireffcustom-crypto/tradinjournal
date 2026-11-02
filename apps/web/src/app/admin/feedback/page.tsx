'use client';

// Admin › Feedback (H10): bug reports, ideas and questions from the help page.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import AdminOnly from '@/components/v6/admin/admin-only';
import { useToast } from '@/components/toast';
import ErrorCard from '@/components/v6/ui/error-card';
import { accountApi, deviceOf, type AdminFeedbackRow } from '@/lib/account-api';
import '@/styles/v6/account.css';
import '@/styles/v6/admin.css';

const VIEWS: Array<[string, string]> = [['new', 'New'], ['read', 'Read'], ['done', 'Resolved'], ['', 'All']];
const KIND: Record<string, string> = { bug: 'Bug', feedback: 'Feedback', question: 'Question' };

export default function AdminFeedbackPage() {
  const toast = useToast();
  const [view, setView] = useState('new');
  const [data, setData] = useState<{ items: AdminFeedbackRow[]; nextCursor: string | null; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { setErr(''); accountApi.adminFeedback(view || undefined).then(setData, (e: Error) => setErr(e.message)); }, [view]);
  useEffect(() => { setData(null); load(); }, [load]);
  async function mark(id: string, status: 'new' | 'read' | 'done') {
    try { await accountApi.setFeedbackStatus(id, status); toast.success(status === 'done' ? 'Marked resolved' : status === 'read' ? 'Marked read' : 'Marked new'); load(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function more() {
    if (!data?.nextCursor) return;
    const r = await accountApi.adminFeedback(view || undefined, data.nextCursor);
    setData({ ...r, items: [...data.items, ...r.items] });
  }
  return (
    <AppShell legacy={false} pageTitle="Feedback" pageSubtitle="Bug reports, ideas and questions from users" actions={<Link href="/admin" className="x-btn">Command center</Link>}>
      <AdminOnly>
        <div className="ac-st1" data-testid="admin-feedback-page">
          <div className="x-seg x-seg--in x-seg--sm" role="tablist" aria-label="Show">{VIEWS.map(([v, l]) => <button key={l} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} data-testid={`afb-${l.toLowerCase()}`}>{l}{data && v ? <span className="x-muted"> {data.counts[v] ?? 0}</span> : null}</button>)}</div>
          {err ? <ErrorCard message={err} onRetry={load} /> : !data ? <div className="x-skel" style={{ height: 300 }} /> : !data.items.length ? <div className="x-card x-empty"><b>Nothing here</b><p>New messages land in the New tab and are emailed to the admins.</p></div> : (
            <>
              {data.items.map((f) => (
                <article key={f.id} className="x-card ac-fb" data-testid="afb-row">
                  <header><span className={`x-tag ${f.kind === 'bug' ? 'x-tag--r' : ''}`}>{KIND[f.kind] ?? f.kind}</span><b>{f.user.name}</b><a className="x-link" href={`mailto:${f.user.email}?subject=${encodeURIComponent(`Re: your ${KIND[f.kind]?.toLowerCase() ?? 'message'} on TRADElogs`)}`}>{f.user.email}</a><span className="x-muted">{new Date(f.createdAt).toLocaleString()}</span></header>
                  <p>{f.message}</p>
                  <footer className="x-muted">{f.page ? <>Page <span className="m">{f.page}</span> · </> : null}{deviceOf(f.userAgent)}</footer>
                  <div className="ac-row-btns">
                    {f.status !== 'read' && <button className="x-btn x-btn--sm" onClick={() => void mark(f.id, 'read')} data-testid="afb-read">Mark read</button>}
                    {f.status !== 'done' && <button className="x-btn x-btn--sm x-btn--hi" onClick={() => void mark(f.id, 'done')} data-testid="afb-done">Resolved</button>}
                    {f.status !== 'new' && <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void mark(f.id, 'new')}>Back to new</button>}
                  </div>
                </article>
              ))}
              {data.nextCursor && <button className="x-btn x-btn--sm" onClick={() => void more()}>Show more</button>}
            </>
          )}
        </div>
      </AdminOnly>
    </AppShell>
  );
}
