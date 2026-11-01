'use client';

// Keyboard and dismiss behaviour for every popover menu (A2.16). Put the ref on
// a wrapper holding the trigger (`aria-haspopup`) and the `[role=menu]` panel:
// opening focuses the checked item (or the first), arrows move and wrap,
// Home/End jump, typing a letter finds the next item starting with it, Tab or
// a click outside closes, and Esc closes and gives focus back to the trigger.
import { useEffect, useRef } from 'react';

const ITEM = '[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]';

/** The menu's items that can take focus, in order. */
export function menuItems(menu: ParentNode): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(ITEM)].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true');
}

/**
 * Where focus goes for a key, given the current index and the item labels, or
 * null when the key isn't one a menu handles. `typed` is the type-ahead buffer
 * including this key.
 */
export function nextIndex(key: string, cur: number, labels: string[], typed = ''): number | null {
  const n = labels.length;
  if (!n) return null;
  if (key === 'ArrowDown') return cur < 0 ? 0 : (cur + 1) % n;
  if (key === 'ArrowUp') return cur <= 0 ? n - 1 : cur - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  if (key.length === 1 && /\S/.test(key) && typed) {
    const want = typed.toLowerCase();
    // A repeated letter steps through the items starting with it; otherwise search from the current one.
    const repeat = want.length > 1 && [...want].every((c) => c === want[0]);
    const q = repeat ? want[0]! : want;
    const start = repeat || want.length === 1 ? cur + 1 : Math.max(cur, 0);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (labels[i]!.trim().toLowerCase().startsWith(q)) return i;
    }
    return null;
  }
  return null;
}

export function useMenu<T extends HTMLElement = HTMLDivElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const trigger = root.querySelector<HTMLElement>('[aria-haspopup]');
    const menu = root.querySelector<HTMLElement>('[role=menu]');
    const first = menu ? menuItems(menu) : [];
    (first.find((el) => el.getAttribute('aria-checked') === 'true') ?? first[0])?.focus({ preventScroll: true });

    let typed = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onDown = (e: MouseEvent) => { if (!root.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); trigger?.focus({ preventScroll: true }); return; }
      if (!menu || !menu.contains(document.activeElement)) return;
      if (e.key === 'Tab') { close(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const items = menuItems(menu);
      if (e.key.length === 1) {
        typed += e.key;
        clearTimeout(timer);
        timer = setTimeout(() => { typed = ''; }, 600);
      }
      const to = nextIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.map((el) => el.innerText || el.textContent || ''), typed);
      if (to === null) return;
      e.preventDefault();
      items[to]?.focus({ preventScroll: false });
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}
