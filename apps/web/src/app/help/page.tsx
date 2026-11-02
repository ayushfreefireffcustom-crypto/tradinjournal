'use client';

// Help (H10): how to reach us, the docs, and a box for bugs, ideas and
// questions. Every message is emailed to a person on the team.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { accountApi, type FeedbackRow } from '@/lib/account-api';
import { ApiError } from '@/lib/copy-api';
import '@/styles/v6/account.css';
import '@/styles/v6/kit.css';

const SUPPORT_EMAIL = 'hello@tradelogs.com';
/** Digits only, with country code (e.g. 919876543210). Unset: no WhatsApp option. */
const WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
const KINDS: Array<['bug' | 'feedback' | 'question', string, string]> = [
  ['bug', 'Report a bug', 'What happened, and what did you expect? The page you were on is attached.'],
  ['feedback', 'Feedback', 'What would make TRADElogs better for you?'],
  ['question', 'Ask a question', 'Ask anything about your account, the journal or trading features.'],
];
const STATUS: Record<FeedbackRow['status'], [string, string]> = { new: ['Sent', ''], read: ['Read', 'x-tag--g'], done: ['Resolved', 'x-tag--g'] };

export default function HelpPage() {
  const toast = useToast();
  const [kind, setKind] = useState<'bug' | 'feedback' | 'question'>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [mine, setMine] = useState<FeedbackRow[] | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  useEffect(() => {
    accountApi.myFeedback().then(setMine, () => setMine([]));
    // The page they came from, when it's ours (for bug reports).
    try { const r = document.referrer ? new URL(document.referrer) : null; if (r && r.origin === window.location.origin && r.pathname !== '/help') setFrom(r.pathname + r.search); } catch { /* ignore */ }
  }, []);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 5) { setErr('Tell us a little more.'); return; }
    setBusy(true); setErr('');
    try {
      await accountApi.feedback({ kind, message: message.trim(), ...(kind === 'bug' && from ? { page: from } : {}) });
      setSent(true); setMessage('');
      toast.success('Sent. Thank you.');
      accountApi.myFeedback().then(setMine, () => {});
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'Couldn’t send it. Email us instead.'); }
    finally { setBusy(false); }
  }
  const k = KINDS.find((x) => x[0] === kind)!;
  return (
    <AppShell legacy={false} pageTitle="Help" pageSubtitle="Reach a person, read the docs, report a bug">
      <div className="ac-help" data-testid="help-page">
        <section className="ac-help-ways" aria-label="Ways to reach us">
          <a className="x-card ac-help-way" href={`mailto:${SUPPORT_EMAIL}`} data-testid="help-email"><b>Email</b><span>{SUPPORT_EMAIL}</span><small className="x-muted">We reply within a working day.</small></a>
          {WHATSAPP && <a className="x-card ac-help-way" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" data-testid="help-whatsapp"><b>WhatsApp</b><span>+{WHATSAPP}</span><small className="x-muted">Quick questions, India hours.</small></a>}
          <Link className="x-card ac-help-way" href="/docs" data-testid="help-docs"><b>Docs</b><span>How each part works</span><small className="x-muted">Journal, strategies, copy trading, options.</small></Link>
        </section>
        <section className="x-card ac-st-card" aria-labelledby="help-form-h" data-testid="help-form-card">
          <div className="x-ch"><h2 id="help-form-h">Write to us</h2></div>
          <p className="x-muted ac-fine ac-fine--flush">A person reads every one.</p>
          {sent ? (
            <div className="ac-help-sent" data-testid="help-sent"><b>Thanks, it’s with the team.</b><p className="x-muted">We’ll reply to your account email if we need more, or when it’s fixed.</p><button className="x-btn x-btn--sm" onClick={() => setSent(false)}>Write another</button></div>
          ) : (
            <form className="ac-form ac-form--wide" onSubmit={send}>
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="What is it">{KINDS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)} data-testid={`help-kind-${id}`}>{label}</button>)}</div>
              <label className="x-field"><span>{k[2]}</span><textarea className="x-input" rows={6} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="help-message" /></label>
              {kind === 'bug' && from && <small className="x-muted">Page attached: <span className="m">{from}</span></small>}
              {err && <p className="cp-err" data-testid="help-error">{err}</p>}
              <div><button className="x-btn x-btn--hi" disabled={busy || message.trim().length < 5} data-testid="help-send">{busy ? 'Sending…' : 'Send'}</button></div>
            </form>
          )}
        </section>
        {mine && mine.length > 0 && (
          <section className="x-card ac-st-card" aria-label="Your messages" data-testid="help-mine">
            <div className="x-ch"><h2>Your messages</h2></div>
            <ul className="ac-act">{mine.map((m) => <li key={m.id}><div><b>{m.message.length > 140 ? `${m.message.slice(0, 140)}…` : m.message}</b><span className="x-muted">{KINDS.find((x) => x[0] === m.kind)?.[1]} · {new Date(m.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · <span className={`x-tag ${STATUS[m.status][1]}`}>{STATUS[m.status][0]}</span></span></div></li>)}</ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
