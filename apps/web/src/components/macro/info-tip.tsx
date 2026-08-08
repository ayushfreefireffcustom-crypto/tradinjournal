'use client';

import { useState } from 'react';

/**
 * Small "ⓘ" affordance that reveals an education blurb on hover (desktop) or
 * tap (touch). Injection-safe: renders plain text only.
 */
export default function InfoTip({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label ? `About ${label}` : 'More info'}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="w-3.5 h-3.5 rounded-full border border-border-strong text-fg-3 hover:text-fg hover:border-fg-3 flex items-center justify-center text-[8px] leading-none transition-colors focus-ring"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-30 w-52 rounded-[var(--radius-btn)] border border-border-strong bg-surface px-2.5 py-2 text-[11px] leading-snug text-fg-2 shadow-[var(--shadow-md)] pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
