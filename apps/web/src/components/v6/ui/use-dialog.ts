'use client';

// Keyboard behaviour for every modal dialog, sheet and drawer (A7.3). Put the
// ref on the element with role="dialog": opening moves focus inside (the
// element marked data-autofocus or autoFocus, else the first field or button),
// Tab and Shift+Tab stay inside, Esc closes the topmost dialog only, the page
// behind stops scrolling, and closing gives focus back to whatever opened it
// (or, when that was a menu item that has since gone, to the menu's button).
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable=true]';

/** The dialog's elements that Tab can reach, in order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[inert]')) return false;
    // Skip what isn't drawn (display none, collapsed sections); jsdom-free check.
    const r = el.getBoundingClientRect?.();
    return !r || r.width > 0 || r.height > 0 || el === document.activeElement;
  });
}

/**
 * Where Tab should go from `cur` (an index into the focusable list, -1 when
 * focus is outside), or null to let the browser move it. Wraps at both ends.
 */
/**
 * Where focus goes back to when the dialog closes: the element that opened it,
 * or the button of the menu it was opened from (menu items unmount when the
 * menu closes, so they can't take focus back).
 */
export function returnTarget(opener: HTMLElement | null): HTMLElement | null {
  if (!opener || opener === document.body) return null;
  const menu = opener.closest('[role=menu]');
  const trigger = menu?.parentElement?.querySelector<HTMLElement>(':scope > [aria-haspopup]') ?? null;
  return menu ? trigger : opener;
}

export function trapIndex(cur: number, count: number, back: boolean): number | null {
  if (!count) return null;
  if (cur < 0) return back ? count - 1 : 0;
  if (back && cur === 0) return count - 1;
  if (!back && cur === count - 1) return 0;
  return null;
}

// Open dialogs, newest last, so Esc and Tab only act on the top one.
const stack: object[] = [];

export interface DialogOptions {
  /** Called on Esc. Omit for a dialog Esc must not close (a blocking gate). */
  onClose?: () => void;
  /** Ignore Esc while a request is in flight. */
  locked?: boolean;
  /** Stop the page behind from scrolling (default true). */
  lockScroll?: boolean;
  /** Set false while the dialog isn't rendered (default true). */
  open?: boolean;
}

export function useDialog<T extends HTMLElement = HTMLDivElement>({ onClose, locked = false, lockScroll = true, open = true }: DialogOptions = {}) {
  const ref = useRef<T>(null);
  // The latest callbacks without re-running the open/close effect.
  const live = useRef({ onClose, locked });
  live.current = { onClose, locked };
  // Who had focus before opening. Read during render: an autoFocus field inside
  // the dialog takes focus at commit, before any effect could look.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const backTo = useRef<HTMLElement | null>(null);
  // Read during render: by the time effects run, a menu item that opened this has already unmounted.
  if (open && !wasOpen.current && typeof document !== 'undefined') {
    opener.current = document.activeElement as HTMLElement | null;
    backTo.current = returnTarget(opener.current);
  }
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    const from = opener.current;
    const back = backTo.current;
    let raf = 0;
    // Portalled dialogs mount a frame later; wait for the node.
    const focusIn = (tries = 0) => {
      const root = ref.current;
      if (!root) { if (tries < 10) raf = requestAnimationFrame(() => focusIn(tries + 1)); return; }
      if (root.contains(document.activeElement)) return;
      const pick = root.querySelector<HTMLElement>('[data-autofocus],[autofocus]') ?? focusables(root).find((el) => el.matches('input,select,textarea')) ?? focusables(root)[0];
      if (pick) pick.focus({ preventScroll: true });
      else { if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); }
    };
    focusIn();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      const root = ref.current;
      if (!root) return;
      if (e.key === 'Escape') {
        if (!live.current.onClose || live.current.locked) return;
        e.stopPropagation();
        live.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables(root);
      const to = trapIndex(list.indexOf(document.activeElement as HTMLElement), list.length, e.shiftKey);
      if (!list.length) { e.preventDefault(); return; }
      if (to === null && root.contains(document.activeElement)) return;
      e.preventDefault();
      list[to ?? 0]!.focus();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (lockScroll) document.body.style.overflow = prev;
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      // Back to the opener, unless focus already went somewhere on purpose.
      const active = document.activeElement;
      const to = from?.isConnected && from !== document.body ? from : back;
      if (to?.isConnected && (!active || active === document.body || ref.current?.contains(active) || !active.isConnected)) to.focus({ preventScroll: true });
    };
  }, [open, lockScroll]);

  return ref;
}
