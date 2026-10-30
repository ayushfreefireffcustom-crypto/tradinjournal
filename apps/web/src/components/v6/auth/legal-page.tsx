// Shared layout for the Terms and Privacy pages: logo header, title block,
// sticky table of contents on wide screens, and a readable single column.
import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/logo';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/auth.css';

export interface LegalSection { id: string; title: string; body: ReactNode }

const num = (i: number) => String(i + 1).padStart(2, '0');

export default function LegalPage({ kicker, title, updated, intro, sections, other }: {
  kicker: string; title: string; updated: string; intro: ReactNode;
  sections: LegalSection[]; other: { href: string; label: string };
}) {
  return (
    <div className="v6 au-root au-lg">
      <header className="au-lghd">
        <Link href="/" className="au-logo" aria-label="TRADElogs home"><Logo height={24} /></Link>
        <nav>
          <Link href={other.href} className="x-btn x-btn--sm x-btn--ghost au-hide-xs">{other.label}</Link>
          <Link href="/login" className="x-btn x-btn--sm x-btn--hi">Sign in</Link>
        </nav>
      </header>
      <div className="au-lghero">
        <p className="au-stk">{kicker}</p>
        <h1>{title}</h1>
        <p className="au-lgupd">Last updated {updated}</p>
        <div className="au-lgintro">{intro}</div>
      </div>
      <div className="au-lgbody">
        <aside className="au-toc" aria-label="On this page">
          <p>On this page</p>
          <ol>{sections.map((s, i) => <li key={s.id}><a href={`#${s.id}`}><span>{num(i)}</span>{s.title}</a></li>)}</ol>
        </aside>
        <article className="au-doc">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2><span>{num(i)}</span>{s.title}</h2>
              {s.body}
            </section>
          ))}
          <div className="au-lgend">
            Questions about this page? Email <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>.
          </div>
        </article>
      </div>
      <footer className="au-lgfoot">
        <span>© {new Date().getFullYear()} TRADElogs</span>
        <nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></nav>
      </footer>
    </div>
  );
}
