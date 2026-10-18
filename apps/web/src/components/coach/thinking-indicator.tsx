'use client';

// The "coach is working" affordance shown in the assistant bubble before the
// first token arrives. Two phases: `searching` (a live web lookup is running) and
// `thinking` (composing the answer). Both use a soft shimmer so the wait feels
// intentional and premium rather than a bare loading dot.

export default function ThinkingIndicator({ phase }: { phase: 'searching' | 'thinking' }) {
  const searching = phase === 'searching';
  return (
    <span className="ct" data-testid={searching ? 'coach-searching' : 'coach-thinking'}>
      <i /><i /><i /><span>{searching ? 'Searching the web' : 'Reading your trades'}</span>
    </span>
  );
}
