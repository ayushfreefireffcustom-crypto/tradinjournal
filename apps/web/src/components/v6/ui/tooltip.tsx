'use client';

// Tooltip (A2.17): a short dark label over a control on hover (after a beat)
// or keyboard focus (at once). Drawn in a portal so a card's overflow can't
// clip it; flips below when there's no room above and stays inside the window.
// Touch never shows it: a tap should act, and the control already has a name.
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

const DELAY = 350;
const GAP = 8;
const EDGE = 8;

/** Where the label goes for an anchor rect, a label size and the window size. Pure for testing. */
export function placeTip(a: { top: number; bottom: number; left: number; width: number }, tip: { width: number; height: number }, win: { width: number; height: number }) {
  const above = a.top - GAP - tip.height;
  const below = a.bottom + GAP;
  const side = above >= EDGE || below + tip.height > win.height - EDGE ? 'top' : 'bottom';
  const top = side === 'top' ? Math.max(EDGE, above) : below;
  const left = Math.min(Math.max(EDGE, a.left + a.width / 2 - tip.width / 2), Math.max(EDGE, win.width - EDGE - tip.width));
  return { top: Math.round(top), left: Math.round(left), side };
}

type Trigger = ReactElement<Record<string, unknown>>;

export default function Tooltip({ label, children, describe = false }: {
  label: string;
  /** One focusable element (a button or link). */
  children: Trigger;
  /** Also announce the label (aria-describedby). Leave off when the control's name already says it. */
  describe?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; side: string } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const show = useCallback((now: boolean) => {
    clearTimeout(timer.current);
    if (now) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), DELAY);
  }, []);
  const hide = useCallback(() => { clearTimeout(timer.current); setOpen(false); setPos(null); }, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    setPos(placeTip(a, t, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, label]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', hide, true); };
  }, [open, hide]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const p = children.props as Record<string, ((e: never) => void) | undefined>;
  const chain = (name: string, fn: (e: never) => void) => (e: never) => { p[name]?.(e); fn(e); };
  // React 19 passes ref as a prop; keep the child's own ref working.
  const own = (children.props as { ref?: unknown }).ref;
  const trigger = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      anchor.current = el;
      if (typeof own === 'function') own(el);
      else if (own && typeof own === 'object') (own as { current: HTMLElement | null }).current = el;
    },
    onPointerEnter: chain('onPointerEnter', (e: PointerEvent) => { if (e.pointerType !== 'touch') show(false); }),
    onPointerLeave: chain('onPointerLeave', hide),
    onPointerDown: chain('onPointerDown', hide),
    onFocus: chain('onFocus', (e: FocusEvent) => { if ((e.target as HTMLElement).matches?.(':focus-visible')) show(true); }),
    onBlur: chain('onBlur', hide),
    ...(describe && open ? { 'aria-describedby': id } : {}),
  });

  return (
    <>
      {trigger}
      {open && typeof document !== 'undefined' && createPortal(
        <div className="v6 x-tip-layer">
          <div ref={tip} id={id} role="tooltip" className="x-tip" data-side={pos?.side ?? 'top'} aria-hidden={!describe}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }} data-testid="tooltip">
            {label}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
