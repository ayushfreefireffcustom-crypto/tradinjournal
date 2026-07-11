'use client';

import type { ReactNode } from 'react';

// Crisp HTML tooltip positioned by percentage across a chart container. Flips to
// the left of the cursor when near the right edge so it stays on-screen.
export default function ChartTooltip({
  leftPct, topPx = 8, children, testId,
}: {
  leftPct: number;
  topPx?: number;
  children: ReactNode;
  testId?: string;
}) {
  const nearRight = leftPct > 62;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-border-soft bg-surface/95 backdrop-blur px-2.5 py-1.5 shadow-[var(--shadow-card)] whitespace-nowrap"
      style={{ left: `${leftPct}%`, top: topPx, transform: `translateX(${nearRight ? 'calc(-100% - 8px)' : '8px'})` }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
