'use client';

// A reusable "product screenshot" chrome: traffic-light dots + a faux URL bar,
// wrapping arbitrary content. Standardises the framed-mockup motif used on the
// landing hero and the live-trades section. Purely presentational.

import type { ReactNode } from 'react';

interface Props {
  url?: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}

export default function BrowserFrame({ url = 'tradelogs.com/dashboard', status, children, className = '', testId }: Props) {
  return (
    <div className={`tcard p-0 overflow-hidden ${className}`} data-testid={testId}>
      {/* Title bar */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-border bg-app">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-loss/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-profit/80" />
        </div>
        <div className="flex-1 min-w-0 flex justify-center">
          <div className="max-w-[70%] truncate rounded-md border border-border-soft bg-surface px-3 py-1 text-[10px] sm:text-[11px] tracking-wide text-fg-3">
            {url}
          </div>
        </div>
        <div className="shrink-0 text-[10px] tracking-[0.2em] text-fg-3 hidden sm:block">{status}</div>
      </div>
      {children}
    </div>
  );
}
