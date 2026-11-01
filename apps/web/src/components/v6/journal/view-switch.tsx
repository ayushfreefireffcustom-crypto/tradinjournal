'use client';

// Journal has two views on one page (A0.D1): reviewing trades on their chart,
// and free-form notes for the day. The switch keeps the account and the URL.
import Link from 'next/link';

export default function JournalViewSwitch({ view }: { view: 'trades' | 'notes' }) {
  return (
    <nav className="x-seg" aria-label="Journal view" data-testid="journal-view">
      <Link href="/journal" aria-current={view === 'trades' ? 'page' : undefined} className={view === 'trades' ? 'on' : ''} data-testid="journal-view-trades">Trade review</Link>
      <Link href="/journal?view=notes" aria-current={view === 'notes' ? 'page' : undefined} className={view === 'notes' ? 'on' : ''} data-testid="journal-view-notes">Notes</Link>
    </nav>
  );
}
