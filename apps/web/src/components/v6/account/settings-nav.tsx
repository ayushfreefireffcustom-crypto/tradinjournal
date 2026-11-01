'use client';

// The settings sections (Part H): profile, security, activity, your data.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: Array<[string, string]> = [['/settings', 'Profile'], ['/settings/security', 'Security'], ['/settings/activity', 'Activity'], ['/settings/data', 'Your data']];

export default function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="x-seg x-seg--in x-seg--sm ac-st-nav" aria-label="Settings sections" data-testid="settings-nav">
      {TABS.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={path === href ? 'is-on' : ''} data-testid={`settings-nav-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</Link>)}
    </nav>
  );
}
