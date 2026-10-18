'use client';

/** v3 switch: violet when on, knob slides with a little squash on press. */
export default function Toggle({ on, onClick, disabled, label, testId }: { on: boolean; onClick: () => void; disabled?: boolean; label: string; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled} data-testid={testId} className="v3-tg">
      <i />
    </button>
  );
}
