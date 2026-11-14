// Long / short chip shared by the journal, calendar, AI and strategy pages.
// (The old "desk" dashboard cards that used to live here were replaced by
// components/dashboard-v2.) desk.css stays imported: pages that use the chip
// also rely on its .dk-* helpers (tooltips, rows).
import type { Trade } from '@/lib/api';
import '@/styles/v6/desk.css';

export function SideChip({ dir }: { dir: Trade['direction'] }) {
  const long = dir === 'LONG';
  return (
    <span className={`x-side ${long ? 'x-side--long' : 'x-side--short'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {long ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M7 7l10 10M17 9v8H9" />}
      </svg>
      {long ? 'Long' : 'Short'}
    </span>
  );
}
