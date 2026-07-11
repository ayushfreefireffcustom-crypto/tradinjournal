'use client';

import type { ElementType, ReactNode } from 'react';

// A polished empty state: duotone phosphor icon, title, hint and optional CTA.
export default function EmptyState({
  icon: Icon, title, hint, action, testId, className = '',
}: {
  icon: ElementType;
  title: string;
  hint?: string;
  action?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 fade-up ${className}`} data-testid={testId}>
      <div className="w-12 h-12 rounded-full border border-border-soft bg-surface flex items-center justify-center mb-3">
        <Icon size={22} weight="duotone" className="text-fg-3" />
      </div>
      <div className="font-display font-bold text-[15px] tracking-tight">{title}</div>
      {hint && <div className="text-[12px] text-fg-3 mt-1 max-w-xs leading-relaxed">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
