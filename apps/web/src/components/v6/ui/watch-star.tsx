'use client';

// ☆ next to a symbol (QW.14): opens a menu of the user's watchlists with a
// tick on each one holding the symbol; picking a list adds or removes it.
// "New list" makes a list that starts with this symbol. Filled when the symbol
// is in any list. The menu is placed against the screen (fixed), so it isn't
// clipped inside scrolling tables; it closes when the page scrolls.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { IPlus, IStar } from '@/components/v6/icons';
import { useWatchlists, watchlists } from '@/lib/use-watchlists';
import { WATCHLIST_MAX_LISTS } from '@/lib/watchlist-csv';
import { useMenu } from './use-menu';
import WatchlistNameDialog from './watchlist-name-dialog';

export default function WatchStar({ symbol, label, size = 'sm' }: { symbol: string; label?: string; size?: 'sm' | 'md' }) {
  const { lists, error } = useWatchlists();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useMenu(open, close);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = btn.current?.getBoundingClientRect();
    const el = pop.current;
    if (!open || !b || !el) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.round(Math.min(Math.max(8, b.right - width), vw - width - 8))}px`;
    el.style.top = `${Math.round(b.bottom + 8 + height > vh - 8 && b.top - 8 - height > 8 ? b.top - 8 - height : b.bottom + 8)}px`;
    const onScroll = (e: Event) => { if (!el.contains(e.target as Node)) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
  }, [open, close, lists?.length]);
  const holding = lists?.filter((l) => l.symbols.includes(symbol)) ?? [];
  const on = holding.length > 0;
  const name = label ?? symbol;
  const full = (lists?.length ?? 0) >= WATCHLIST_MAX_LISTS;

  return (
    <div className="f-popwrap x-star-wrap" ref={wrap}>
      <button ref={btn} type="button" className={`x-btn x-btn--ghost x-btn--icon ${size === 'sm' ? 'x-btn--sm' : ''} x-star ${on ? 'on' : ''}`}
        aria-haspopup="menu" aria-expanded={open} disabled={!lists}
        aria-label={on ? `${name} is in ${holding.map((l) => l.name).join(', ')}. Change watchlists` : `Add ${name} to a watchlist`}
        title={on ? `In ${holding.map((l) => l.name).join(', ')}` : 'Add to a watchlist'}
        onClick={() => setOpen((o) => !o)} data-testid="watch-star">
        <IStar size={size === 'sm' ? 16 : 18} fill={on ? 'currentColor' : 'none'} />
      </button>
      {open && lists && (
        <div ref={pop} className="x-pop x-star-pop" role="menu" aria-label={`Watchlists for ${name}`}>
          <div className="f-pop-lbl">Add {name} to</div>
          {lists.map((l) => {
            const has = l.symbols.includes(symbol);
            return (
              <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={has} onClick={() => { void watchlists.toggle(l.id, symbol).catch(() => {}); }} data-testid={`watch-star-list-${l.name}`}>
                <span className={`x-tick ${has ? 'on' : ''}`} aria-hidden="true" />
                <span className="f-pop-main"><b>{l.name}</b><small>{l.symbols.length} {l.symbols.length === 1 ? 'symbol' : 'symbols'}</small></span>
              </button>
            );
          })}
          <hr />
          <button type="button" role="menuitem" disabled={full} aria-disabled={full || undefined} onClick={() => { close(); setNaming(true); }} data-testid="watch-star-new">
            <IPlus size={15} /><span className="f-pop-main"><b>New list</b>{full && <small>You have {WATCHLIST_MAX_LISTS}, the most allowed</small>}</span>
          </button>
          {error && <p className="f-pop-note x-star-err" role="alert">{error}</p>}
        </div>
      )}
      {naming && (
        <WatchlistNameDialog title="New watchlist" sub={`It starts with ${name}.`} submitLabel="Create list"
          onSubmit={(n) => watchlists.create(n, [symbol])} onClose={() => setNaming(false)} />
      )}
    </div>
  );
}
