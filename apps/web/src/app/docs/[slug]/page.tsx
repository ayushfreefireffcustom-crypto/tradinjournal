'use client';

// One docs article (H13).
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppShell from '@/components/app-shell';
import { DOCS, docBySlug } from '@/content/docs';
import '@/styles/v6/docs.css';

export default function DocArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const d = docBySlug(slug);
  const i = d ? DOCS.indexOf(d) : -1;
  const prev = i > 0 ? DOCS[i - 1] : null;
  const next = i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : null;
  return (
    <AppShell legacy={false} pageTitle={d?.title ?? 'Not found'} pageSubtitle={d?.section ?? 'Docs'} actions={<Link className="x-btn" href="/docs">All docs</Link>}>
      <div className="dc-page" data-testid="doc-page">
        {!d ? <div className="x-card x-empty"><b>That page doesn’t exist</b><p><Link className="x-link" href="/docs">Back to the docs</Link></p></div> : (
          <>
            <article className="x-card dc-art" data-testid="doc-article">
              <p className="dc-lead">{d.summary}</p>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => (href?.startsWith('/') ? <Link className="x-link" href={href}>{children}</Link> : <a className="x-link" href={href} target="_blank" rel="noopener noreferrer">{children}</a>) }}>{d.body.en}</ReactMarkdown>
            </article>
            {!!d.related?.length && (
              <section className="dc-rel" aria-label="Related"><h2>Related</h2><ul className="dc-list">{d.related.map((r) => docBySlug(r)).filter(Boolean).map((r) => <li key={r!.slug}><Link href={`/docs/${r!.slug}`}><b>{r!.title}</b><span>{r!.summary}</span></Link></li>)}</ul></section>
            )}
            <nav className="dc-nav" aria-label="More docs">{prev ? <Link className="x-btn" href={`/docs/${prev.slug}`}>← {prev.title}</Link> : <span />}{next ? <Link className="x-btn" href={`/docs/${next.slug}`} data-testid="doc-next">{next.title} →</Link> : <span />}</nav>
            <p className="x-muted dc-fine">Still stuck? <Link className="x-link" href="/help">Write to us</Link>; a person reads every message.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
