'use client';

// In-app docs (H13): every part of TRADElogs explained, with search.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { DOCS, SECTIONS, searchDocs } from '@/content/docs';
import '@/styles/v6/docs.css';

export default function DocsPage() {
  const [q, setQ] = useState('');
  const hits = useMemo(() => (q.trim() ? searchDocs(q) : null), [q]);
  return (
    <AppShell legacy={false} pageTitle="Docs" pageSubtitle="How each part of TRADElogs works" actions={<Link className="x-btn" href="/help">Help</Link>}>
      <div className="dc-page" data-testid="docs-page">
        <input className="x-input dc-search" type="search" placeholder="Search the docs, e.g. two-factor, backtest, webhook" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the docs" data-testid="docs-search" />
        {hits ? (
          <section aria-label="Results" data-testid="docs-results">
            {!hits.length ? <p className="x-muted" data-testid="docs-none">Nothing matches. Try other words, or <Link className="x-link" href="/help">ask us</Link>.</p> : (
              <ul className="dc-list">{hits.map((d) => <li key={d.slug}><Link href={`/docs/${d.slug}`} data-testid={`docs-hit-${d.slug}`}><b>{d.title}</b><span>{d.summary}</span><small className="x-muted">{d.section}</small></Link></li>)}</ul>
            )}
          </section>
        ) : SECTIONS.map((s) => (
          <section key={s} aria-label={s} className="dc-sec">
            <h2>{s}</h2>
            <ul className="dc-list">{DOCS.filter((d) => d.section === s).map((d) => <li key={d.slug}><Link href={`/docs/${d.slug}`} data-testid={`docs-link-${d.slug}`}><b>{d.title}</b><span>{d.summary}</span></Link></li>)}</ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
