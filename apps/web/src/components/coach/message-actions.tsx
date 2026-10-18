'use client';

// Hover actions under an assistant reply: copy the text, or regenerate it by
// re-sending the user message that produced it. Regenerate is only offered on the
// last reply, where re-running the turn is unambiguous.
import { useEffect, useState } from 'react';

interface Props {
  content: string;
  /** Omitted when regeneration doesn't apply (older messages, or nothing to resend). */
  onRegenerate?: () => void;
  disabled?: boolean;
}


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
    <div className="ca" data-testid="coach-msg-actions">
      <button onClick={copy} data-testid="coach-copy" aria-label="Copy reply" className={copied ? 'ok' : ''}>{copied ? 'Copied ✓' : 'Copy'}</button>
      {onRegenerate && <button onClick={onRegenerate} disabled={disabled} data-testid="coach-regenerate" aria-label="Regenerate reply">Regenerate</button>}
    </div>
  );
}
