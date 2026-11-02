'use client';

// "—" for a value we can't work out yet, with the reason on hover or keyboard
// focus, and in its accessible name (QW.9). Unknown is never shown as 0.
import Tooltip from './tooltip';

export default function Unknown({ why }: { why: string }) {
  return (
    <Tooltip label={why}>
      <span className="x-unk" tabIndex={0} role="img" aria-label={`Not available: ${why}`}>—</span>
    </Tooltip>
  );
}
