// Shared layout for the Terms and Privacy pages: wordmark header, title block,
// sticky table of contents on wide screens, and a readable single column.
import Link from 'next/link';
import type { ReactNode } from 'react';
import '@/styles/app-v3.css';

export interface LegalSection { id: string; title: string; body: ReactNode }

export default function LegalPage({ kicker, title, accent, updated, intro, sections, other }: {
  kicker: string; title: string; accent: string; updated: string; intro: ReactNode;
  sections: LegalSection[]; other: { href: string; label: string };
}) {
  return (
    <div className="v3 lg-page">
      <header className="lg-top">
        <Link href="/" className="au-wm sm" style={{ display: 'block' }}>TRADE<span>logs</span></Link>
        <nav><Link href={other.href}>{other.label}</Link><Link href="/login" className="lg-cta">Sign in</Link></nav>
      </header>
      <div className="lg-hero">
        <p className="lg-k">{kicker}</p>
        <h1><b>{title}</b> <em>{accent}</em></h1>
        <p className="lg-upd">Last updated {updated}</p>
        <div className="lg-intro">{intro}</div>
      </div>
      <div className="lg-body">
        <aside className="lg-toc" aria-label="On this page">
          <p>On this page</p>
          <ol>{sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
        </aside>
        <article className="lg-doc">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2><span className="num">{String(i + 1).padStart(2, '0')}</span>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <div className="lg-end">
            Questions about this page? Email <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>.
          </div>
        </article>
      </div>
      <footer className="lg-foot">
        <span>© {new Date().getFullYear()} TRADElogs</span>
        <span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></span>
      </footer>
    </div>
  );
}
