'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IInfo } from '@/components/v6/macro/ui';

/**
 * Small info button that reveals an education blurb on hover, focus or tap.
 * The popover is fixed-positioned and clamped to the viewport so it never widens
 * the page; Esc, blur, outside tap or scroll close it. Plain text only.
 */
export default function InfoTip({ text, label }: { text: string; label?: string }) {
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const shownAt = useRef(0);
  const id = useId();

  const show = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(248, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const below = r.top < 130;
    if (!pos) shownAt.current = Date.now();
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8, below });
  }, [pos]);
  const hide = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    const onDown = (e: Event) => { if (!btn.current?.contains(e.target as Node)) hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [pos, hide]);

  return (
    <span className="mc-info">
      <button ref={btn} type="button" className="mc-info-b" aria-label={label ? `About ${label}` : 'More info'}
        aria-expanded={!!pos} aria-describedby={pos ? id : undefined}
        // A tap also fires hover/focus first, so only a later click closes it.
        onClick={() => (pos && Date.now() - shownAt.current > 400 ? hide() : show())} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        <IInfo size={14} />
      </button>
      {pos && (
        <span id={id} role="tooltip" className={`mc-info-pop ${pos.below ? 'below' : ''}`}
          style={{ left: pos.left, top: pos.top, width: Math.min(248, window.innerWidth - 24) }}>
          {text}
        </span>
      )}
    </span>
  );
}
