'use client';

// Hover actions under an assistant reply: copy the text, or regenerate it by
// re-sending the user message that produced it. Regenerate is only offered on the
// last reply, where re-running the turn is unambiguous.
import { useEffect, useState } from 'react';
import { Copy, Check, ArrowsClockwise } from '@phosphor-icons/react';

interface Props {
  content: string;
  /** Omitted when regeneration doesn't apply (older messages, or nothing to resend). */
  onRegenerate?: () => void;
  disabled?: boolean;
}

const BTN =
  'inline-flex items-center gap-1 rounded-[var(--radius-btn)] px-1.5 py-1 text-[10px] tracking-[0.1em] uppercase text-fg-3 hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:hover:bg-transparent';

export default function MessageActions({ content, onRegenerate, disabled }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset the "Copied" confirmation after a beat.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure origin / denied permission) — fail quietly
      // rather than throwing an error banner over a non-critical action.
    }
  };

  return (
    <div className="flex items-center gap-0.5 mt-2 -ml-1.5" data-testid="coach-msg-actions">
      <button onClick={copy} className={BTN} data-testid="coach-copy" aria-label="Copy reply">
        {copied ? <Check size={12} weight="bold" className="text-profit" /> : <Copy size={12} weight="bold" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={disabled}
          className={BTN}
          data-testid="coach-regenerate"
          aria-label="Regenerate reply"
        >
          <ArrowsClockwise size={12} weight="bold" />
          Retry
        </button>
      )}
    </div>
  );
}
