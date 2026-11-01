'use client';

// ⓘ button that explains a number (A2.11): what it is and why it matters, on
// hover, focus or tap. The popover is fixed-positioned and clamped to the
// viewport so it never widens the page; Esc, blur, an outside tap or a scroll
// close it. Plain text only.
import { useCallback, useEffect, useId, useRef, useState } from 'react';

const IInfo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 7.6v.2" strokeWidth="2.2" />
  </svg>
);

export interface InfoTipProps {
  /** Name of the thing explained, for the button's accessible label ("About Profit factor"). */
  label?: string;
  /** One-paragraph explanation (older call sites). */
  text?: string;
  /** What the number is. */
  what?: string;
  /** Why it matters / how to read it. */
  why?: string;
}

export default function InfoTip({ text, what, why, label }: InfoTipProps) {
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const shownAt = useRef(0);
  const id = useId();

  const show = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(260, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const below = r.top < 140;
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
    <span className="x-info">
      <button ref={btn} type="button" className="x-info-b" aria-label={label ? `About ${label}` : 'More info'}
        aria-expanded={!!pos} aria-describedby={pos ? id : undefined}
        // A tap also fires hover/focus first, so only a later click closes it.
        onClick={(e) => { e.stopPropagation(); if (pos && Date.now() - shownAt.current > 400) hide(); else show(); }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        <IInfo size={14} />
      </button>
      {pos && (
        <span id={id} role="tooltip" className={`x-info-pop ${pos.below ? 'below' : ''}`} style={{ left: pos.left, top: pos.top, width: Math.min(260, window.innerWidth - 24) }}>
          {text}
          {what && <span className="x-info-what">{what}</span>}
          {why && <span className="x-info-why">{why}</span>}
        </span>
      )}
    </span>
  );
}
