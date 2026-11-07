'use client';

// One tab bar across the admin partner pages, with what's waiting on Reviews.
import Link from '@/components/v6/ui/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ibApi } from '@/lib/ib-api';
import '@/styles/v6/access.css';

const TABS = [
  { href: '/admin/partners', label: 'Partners' },
  { href: '/admin/partners/program', label: 'Programme' },
  { href: '/admin/partners/reviews', label: 'Reviews' },
  { href: '/admin/partners/settings', label: 'Settings' },
];

export default function PartnerAdminTabs() {
  const path = usePathname();
  const [waiting, setWaiting] = useState(0);
  useEffect(() => { ibApi.programSummary().then(s => setWaiting(s.todo.tools + s.todo.reviews + s.todo.flags)).catch(() => {}); }, [path]);
  const on = (h: string) => (h === '/admin/partners' ? path === h || /^\/admin\/partners\/c[a-z0-9]{6,}/.test(path) : path.startsWith(h));
  return (
    <nav className="x-seg ax-admtabs" aria-label="Partner admin" data-testid="partner-admin-tabs">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} aria-current={on(t.href) ? 'page' : undefined} className={on(t.href) ? 'on' : ''}>
          {t.label}{t.href.endsWith('/reviews') && waiting > 0 && <em className="axnum">{waiting}</em>}
        </Link>
      ))}
    </nav>
  );
}
