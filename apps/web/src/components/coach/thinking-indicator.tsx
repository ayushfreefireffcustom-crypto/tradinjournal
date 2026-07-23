'use client';

// The "coach is working" affordance shown in the assistant bubble before the
// first token arrives. Two phases: `searching` (a live web lookup is running) and
// `thinking` (composing the answer). Both use a soft shimmer so the wait feels
// intentional and premium rather than a bare loading dot.
import { MagnifyingGlass, Sparkle } from '@phosphor-icons/react';

export default function ThinkingIndicator({ phase }: { phase: 'searching' | 'thinking' }) {
  const searching = phase === 'searching';
  return (
    <span
      className="inline-flex items-center gap-2 text-[12.5px] text-fg-3"
      data-testid={searching ? 'coach-searching' : 'coach-thinking'}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        {searching ? (
          <MagnifyingGlass size={14} weight="bold" className="text-profit animate-pulse" />
        ) : (
          <Sparkle size={14} weight="fill" className="text-profit animate-pulse" />
        )}
      </span>
      <span className="coach-shimmer font-medium">{searching ? 'Searching the web…' : 'Thinking…'}</span>
    </span>
  );
}
