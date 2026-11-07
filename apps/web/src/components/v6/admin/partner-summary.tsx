'use client';

// Admin home: the partner programme as a to-do window — what's waiting, each row
// linking to where it's handled — and a strip of headline totals. Drawn in the same
// language as the Partner access page (components/v6/account/access-art).
import Link from '@/components/v6/ui/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check } from '@phosphor-icons/react';
import { ibApi, type ProgramSummary } from '@/lib/ib-api';
import { Win } from '@/components/v6/account/access-art';
import '@/styles/v6/access.css';

const n = (v: number) => v.toLocaleString('en-US');

export default function PartnerSummary() {
  const [s, setS] = useState<ProgramSummary | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { ibApi.programSummary().then(setS).catch(() => setErr(true)); }, []);
  if (err) return null;
  if (!s) return <div className="x-skel ac-sk-168" />;
  const rows = [
    { key: 'applications', label: 'Partner applications', note: 'Approve, reject or ask for more', n: s.todo.applications, href: '/admin/partners' },
    { key: 'tools', label: 'Tools to review', note: 'Indicators, EAs and guides waiting', n: s.todo.tools, href: '/admin/partners/reviews' },
    { key: 'reviews', label: 'Accounts to check by hand', note: 'Brokers that couldn’t verify on their own', n: s.todo.reviews, href: '/admin/partners/reviews' },
    { key: 'flags', label: 'Flags', note: 'Duplicates and suspicious attribution', n: s.todo.flags, href: '/admin/partners/reviews' },
    { key: 'sync', label: 'Broker sync errors', note: 'Partner lists or APIs failing', n: s.todo.syncErrors, href: '/admin/partners/program' },
  ];
  return (
    <section data-testid="admin-partner-summary">
      <Win title="Partner programme" right={<Link href="/admin/partners/program" className="x-link">Open programme</Link>} className="axwin--path">
        <ul className="axpath axpath--todo">
          {rows.map(r => (
            <li key={r.key} className={r.n ? '' : 'done is-done'} data-testid={`admin-todo-${r.key}`}>
              <span className={`axdot ${r.n ? 'on' : ''}`} aria-hidden />
              <span className="axpath-t"><b>{r.label}</b><small>{r.note}</small></span>
              <span className="axpath-v">
                {r.n ? <Link href={r.href} className="x-btn x-btn--sm"><b className="axnum">{n(r.n)}</b> waiting<ArrowRight size={13} weight="bold" aria-hidden /></Link> : <span className="axmute">None</span>}
              </span>
            </li>
          ))}
        </ul>
        <div className="axsum">
          <span><b className="axnum">{n(s.totals.activePartners)}</b> active partner{s.totals.activePartners === 1 ? '' : 's'}{s.totals.suspendedPartners ? <> · <b className="axnum">{n(s.totals.suspendedPartners)}</b> suspended</> : null}</span>
          <span><b className="axnum">{n(s.totals.clients)}</b> referred client{s.totals.clients === 1 ? '' : 's'}</span>
          <span><b className="axnum">{n(s.totals.verified)}</b> verified at the broker</span>
          <span><b className="axnum">{n(s.totals.unlocked)}</b> with a package unlocked</span>
        </div>
        <div className={`axpath-f ${s.todo.total ? '' : 'is-done'}`}>
          <span>{s.todo.total ? <><b>{n(s.todo.total)}</b> thing{s.todo.total === 1 ? '' : 's'} waiting for you</> : <><Check size={13} weight="bold" /> Nothing waiting in the partner programme</>}</span>
          <Link href="/admin/partners" className="x-btn x-btn--sm">All partners</Link>
        </div>
      </Win>
    </section>
  );
}
