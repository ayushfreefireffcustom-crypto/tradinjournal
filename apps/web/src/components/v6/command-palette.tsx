'use client';

// ⌘K palette (A3.9): jump to a page, run an action (sync, theme, hide
// balances), open one of the selected account's recent trades, or filter the
// trade log to a symbol. Arrow keys move, Enter opens, Esc closes.
import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { api, type Trade } from '@/lib/api';
import { fmtUsd, pnlClass } from '@/lib/format';
import { paletteSections, symbolEntries, tradeEntries, type PaletteEntry } from '@/lib/palette';
import { tickerMark } from '@/lib/desk';
import { IBrokers, IJournal, ISearch, ISync } from '@/components/v3/icons';
import { IEye, IEyeOff, IMoonIcon, ISunIcon } from './frame';
import { useTheme } from './use-theme';
import { useHideMoney } from './use-hide-money';

type Icon = ComponentType<{ size?: number }>;
export type PalettePage = { href: string; label: string; group: string; icon: Icon };

// Trades per account for a minute, so opening the palette twice doesn't refetch.
const TTL = 60_000;
const tradesCache = new Map<string, { at: number; trades: Trade[] }>();

function useRecentTrades(accountId: string | null | undefined): Trade[] {
  const [trades, setTrades] = useState<Trade[]>(() => (accountId ? tradesCache.get(accountId)?.trades ?? [] : []));
  useEffect(() => {
    if (!accountId) { setTrades([]); return; }
    const hit = tradesCache.get(accountId);
    if (hit && Date.now() - hit.at < TTL) { setTrades(hit.trades); return; }
    let live = true;
    api.trades.list(accountId)
      .then((t) => { tradesCache.set(accountId, { at: Date.now(), trades: t }); if (live) setTrades(t); })
      .catch(() => { /* the palette still works for pages and actions */ });
    return () => { live = false; };
  }, [accountId]);
  return trades;
}

function SignOutIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>;
}

interface Props {
  pages: PalettePage[];
  accountId?: string | null;
  onGo: (href: string) => void;
  onClose: () => void;
  onSync?: () => void;
  onConnect?: () => void;
  onSignOut: () => void;
}

export default function CommandPalette({ pages, accountId, onGo, onClose, onSync, onConnect, onSignOut }: Props) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [theme, toggleTheme] = useTheme();
  const [moneyHidden, toggleMoney] = useHideMoney();
  const trades = useRecentTrades(accountId);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // Icons and handlers live here; lib/palette only knows ids, labels and links.
  const icons = useMemo(() => new Map<string, Icon>(pages.map((p) => [`page:${p.href}`, p.icon])), [pages]);
  const runs = useMemo(() => {
    const m = new Map<string, () => void>();
    if (onSync) m.set('act:sync', onSync);
    m.set('act:theme', toggleTheme);
    m.set('act:money', toggleMoney);
    if (onConnect) m.set('act:connect', onConnect);
    m.set('act:signout', onSignOut);
    return m;
  }, [onSync, onConnect, onSignOut, toggleTheme, toggleMoney]);

  const sections = useMemo(() => {
    const pageEntries: PaletteEntry[] = pages.map((p) => ({ id: `page:${p.href}`, group: 'Pages', label: p.label, hint: p.group, href: p.href }));
    const actions: PaletteEntry[] = [
      ...(onSync ? [{ id: 'act:sync', group: 'Actions' as const, label: 'Sync trades now', keywords: 'refresh update broker mt5' }] : []),
      { id: 'act:theme', group: 'Actions', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', keywords: 'appearance mode colour color' },
      { id: 'act:money', group: 'Actions', label: moneyHidden ? 'Show balances' : 'Hide balances', keywords: 'privacy blur money screen share' },
      { id: 'act:note', group: 'Actions', label: 'Write a day note', keywords: 'journal notebook new entry', href: '/journal?view=notes' },
      onConnect
        ? { id: 'act:connect', group: 'Actions', label: 'Connect a broker', keywords: 'add account mt5' }
        : { id: 'act:connect', group: 'Actions', label: 'Connect a broker', keywords: 'add account mt5', href: '/brokers' },
      { id: 'act:signout', group: 'Actions', label: 'Sign out', keywords: 'log out logout' },
    ];
    return paletteSections(q, pageEntries, actions, tradeEntries(trades), symbolEntries(trades));
  }, [q, pages, trades, theme, moneyHidden, onSync, onConnect]);

  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  useEffect(() => { setAt(0); }, [q]);
  useEffect(() => {
    // The first row goes right to the top so its section heading shows too.
    if (at === 0) list.current?.scrollTo({ top: 0 });
    else list.current?.querySelector('[data-on=true]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const choose = (e: PaletteEntry | undefined) => {
    if (!e) return;
    const run = runs.get(e.id);
    if (run && !e.href) { onClose(); run(); return; }
    if (e.href) onGo(e.href);
  };

  const iconFor = (e: PaletteEntry) => {
    if (e.group === 'Trades' || e.group === 'Recent trades' || e.group === 'Symbols') {
      const sym = e.group === 'Symbols' ? e.label : e.label.split(' ')[0]!;
      return <span className="f-cmdk-ic f-cmdk-mk">{tickerMark(sym)}</span>;
    }
    const known = icons.get(e.id);
    const Ic = known
      ?? (e.id === 'act:sync' ? ISync
        : e.id === 'act:theme' ? (theme === 'light' ? IMoonIcon : ISunIcon)
          : e.id === 'act:money' ? (moneyHidden ? IEye : IEyeOff)
            : e.id === 'act:note' ? IJournal
              : e.id === 'act:connect' ? IBrokers
                : SignOutIcon);
    return <span className="f-cmdk-ic"><Ic size={16} /></span>;
  };

  let n = -1;
  return (
    // The tokens and dialog styles are scoped under .v6, so the scrim needs a .v6 parent.
    <div className="v6">
      <div className="x-dialog-scrim f-cmdk-scrim" onMouseDown={onClose}>
        <div className="f-cmdk" role="dialog" aria-modal="true" aria-label="Search pages, trades and actions" onMouseDown={(e) => e.stopPropagation()} data-testid="cmdk">
          <div className="f-cmdk-in">
            <ISearch size={17} />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={accountId ? 'Search pages, trades, symbols…' : 'Search pages and actions…'}
              role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={flat[at] ? `${id}-${at}` : undefined}
              aria-label="Search pages, trades and actions" data-testid="cmdk-input"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAt((v) => (flat.length ? (v + 1) % flat.length : 0)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((v) => (flat.length ? (v - 1 + flat.length) % flat.length : 0)); }
                else if (e.key === 'Home') { e.preventDefault(); setAt(0); }
                else if (e.key === 'End') { e.preventDefault(); setAt(Math.max(0, flat.length - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); choose(flat[at]); }
              }}
            />
            <kbd>Esc</kbd>
          </div>
          {flat.length === 0 ? (
            <div className="f-cmdk-empty" data-testid="cmdk-empty">Nothing matches &ldquo;{q.trim()}&rdquo;.</div>
          ) : (
            <div className="f-cmdk-list" ref={list} id={`${id}-list`} role="listbox" aria-label="Results">
              {sections.map((s) => (
                <div key={s.group} role="group" aria-labelledby={`${id}-${s.group}`} data-testid={`cmdk-group-${s.group}`}>
                  <div className="f-cmdk-h" id={`${id}-${s.group}`}>{s.group}</div>
                  {s.entries.map((e) => {
                    n += 1;
                    const k = n;
                    return (
                      <a
                        key={e.id} id={`${id}-${k}`} role="option" aria-selected={k === at} data-on={k === at}
                        href={e.href ?? '#'} onMouseMove={() => { if (k !== at) setAt(k); }}
                        onClick={(ev) => { ev.preventDefault(); choose(e); }} data-testid={`cmdk-item-${e.id}`}
                      >
                        {iconFor(e)}
                        <span className="f-cmdk-l">{e.label}</span>
                        {e.pnl !== undefined && <span className={`f-cmdk-pnl m mny ${pnlClass(e.pnl)}`}>{fmtUsd(e.pnl, { signed: true })}</span>}
                        {e.hint && <small>{e.hint}</small>}
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
