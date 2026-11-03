'use client';

import CoinMark from '@/components/v6/ui/coin-mark';
import { useCallback, useRef, useState } from 'react';
import { MARKET_SYMBOL_NAMES } from '@/lib/market-api';
import { tickerMark } from '@/lib/desk';
import { useWatchlists, watchlists } from '@/lib/use-watchlists';
import { csvFileName, parseWatchlistCsv, toWatchlistCsv, WATCHLIST_MAX_LISTS, WATCHLIST_MAX_SYMBOLS, type CsvImport } from '@/lib/watchlist-csv';
import { IClose, IDownload, IEdit, IMore, IPlus, IUpload } from '@/components/v6/icons';
import { useConfirm } from '@/components/confirm-dialog';
import Modal from '@/components/v6/ui/modal';
import WatchlistNameDialog from '@/components/v6/ui/watchlist-name-dialog';
import { useMenu } from '@/components/v6/ui/use-menu';
import { useOnScreen } from '@/components/v6/ui/use-on-screen';
import { useQuotes, fmtQuote, fmtChg } from './quote';

type Naming = { mode: 'new' } | { mode: 'rename'; id: string; name: string } | null;

// The user's named watchlists (QW.12–13): pick a list, pin the open symbol,
// click a row to load it into the active chart. The ⋯ menu adds, renames,
// imports into, exports and deletes lists.
export default function Watchlist({ activeSymbol, onPick }: { activeSymbol: string; onPick: (symbol: string) => void }) {
  const { lists, activeId, error } = useWatchlists();
  const list = lists?.find((l) => l.id === activeId) ?? null;
  const symbols = list?.symbols ?? [];
  const quotes = useQuotes(symbols);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useMenu(menu, closeMenu);
  const popRef = useOnScreen(menu);
  const [naming, setNaming] = useState<Naming>(null);
  const [imported, setImported] = useState<(CsvImport & { list: string; failed?: string }) | null>(null);
  const [confirmUi, confirm] = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  // The import result opens after the file picker, so nothing on the page opened it; focus goes back to ⋯.
  const closeImport = () => { setImported(null); menuBtn.current?.focus({ preventScroll: true }); };

  const loading = lists === null;
  const pinned = symbols.includes(activeSymbol);
  const full = symbols.length >= WATCHLIST_MAX_SYMBOLS;
  const save = (next: string[]) => { if (list) void watchlists.setSymbols(list.id, next).catch(() => {}); };

  const onFile = async (f: File | undefined) => {
    if (!f || !list) return;
    const res = parseWatchlistCsv(await f.text(), list.symbols);
    let failed: string | undefined;
    if (res.symbols.length) {
      try { await watchlists.setSymbols(list.id, [...list.symbols, ...res.symbols]); } catch (e) { failed = (e as Error).message; }
    }
    setImported({ ...res, list: list.name, failed });
  };
  const exportCsv = () => {
    if (!list) return;
    const url = URL.createObjectURL(new Blob([toWatchlistCsv(list.symbols)], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: csvFileName(list.name) });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const remove = async () => {
    if (!list) return;
    const ok = await confirm({ title: `Delete “${list.name}”?`, body: `Its ${symbols.length} ${symbols.length === 1 ? 'symbol goes' : 'symbols go'} with it. Your other lists aren’t touched.`, confirmLabel: 'Delete list', tone: 'danger' });
    if (ok) await watchlists.remove(list.id).catch(() => {});
  };
  const item = (label: string, icon: React.ReactNode, run: () => void, opts: { disabled?: boolean; note?: string; testId: string }) => (
    <button type="button" role="menuitem" disabled={opts.disabled} aria-disabled={opts.disabled || undefined} onClick={() => { closeMenu(); run(); }} data-testid={opts.testId}>
      {icon}<span className="f-pop-main"><b>{label}</b>{opts.note && <small>{opts.note}</small>}</span>
    </button>
  );

  return (
    <section className="x-card mk-side" data-testid="watchlist" aria-labelledby="mk-wl-t">
      <div className="x-ch mk-wl-h">
        <h3 id="mk-wl-t" className={lists && lists.length > 1 ? 'sr-only' : 'mk-ell'}>{list?.name ?? 'Watchlist'}</h3>
        {lists && lists.length > 1 && (
          <select className="x-select mk-wl-pick" value={list?.id ?? ''} onChange={(e) => watchlists.select(e.target.value)} aria-label="Watchlist" data-testid="watchlist-pick">
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {!loading && symbols.length > 0 && !(lists && lists.length > 1) && <span className="x-sub m">{symbols.length}</span>}
        <div className="x-r">
          <button className="x-btn x-btn--sm" onClick={() => !pinned && save([...symbols, activeSymbol])} disabled={pinned || full || !list}
            title={pinned ? `${activeSymbol} is in this list` : full ? `This list is full (${WATCHLIST_MAX_SYMBOLS} symbols)` : `Pin ${activeSymbol} to ${list?.name ?? 'this list'}`}
            aria-label={pinned ? `${activeSymbol} is pinned` : `Pin ${activeSymbol}`} data-testid="watchlist-add">
            {pinned ? 'Pinned' : lists && lists.length > 1 ? 'Pin' : <>Pin <span className="mk-ell">{activeSymbol}</span></>}
          </button>
          <div className="f-popwrap" ref={menuRef}>
            <button ref={menuBtn} type="button" className="x-btn x-btn--ghost x-btn--icon x-btn--sm" aria-haspopup="menu" aria-expanded={menu} aria-label="Watchlist options" disabled={!list} onClick={() => setMenu((o) => !o)} data-testid="watchlist-menu">
              <IMore size={16} />
            </button>
            {menu && list && lists && (
              <div ref={popRef} className="x-pop f-pop" role="menu" aria-label="Watchlist options">
                {item('New list', <IPlus size={15} />, () => setNaming({ mode: 'new' }), { disabled: lists.length >= WATCHLIST_MAX_LISTS, note: lists.length >= WATCHLIST_MAX_LISTS ? `You have ${WATCHLIST_MAX_LISTS}, the most allowed` : undefined, testId: 'watchlist-new' })}
                {item('Rename', <IEdit size={15} />, () => setNaming({ mode: 'rename', id: list.id, name: list.name }), { testId: 'watchlist-rename' })}
                <hr />
                {item('Import CSV', <IUpload size={15} />, () => file.current?.click(), { disabled: full, note: full ? 'This list is full' : 'Adds to this list', testId: 'watchlist-import' })}
                {item('Export CSV', <IDownload size={15} />, exportCsv, { disabled: !symbols.length, testId: 'watchlist-export' })}
                <hr />
                {item('Delete list', <IClose size={15} />, () => void remove(), { disabled: lists.length <= 1, note: lists.length <= 1 ? 'Your only list can’t be deleted' : undefined, testId: 'watchlist-delete' })}
              </div>
            )}
          </div>
        </div>
      </div>
      <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="watchlist-file" />
      {error && <p className="mk-none mk-wl-err" role="alert">{error}</p>}
      <div className="mk-side-bd">
        {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="x-skel x-skel--in mk-sk-row" />)
          : symbols.length === 0 ? <p className="mk-none">Nothing in this list yet. Open a symbol and press Pin, or import a CSV.</p>
          : symbols.map(s => {
            const q = quotes[s];
            const tone = q?.chg == null ? 'x-muted' : q.chg >= 0 ? 'pos' : 'neg';
            return (
              <div key={s} role="button" tabIndex={0} className={`mk-wl ${s === activeSymbol ? 'on' : ''}`} onClick={() => onPick(s)} onKeyDown={e => { if (e.key === 'Enter') onPick(s); }} data-testid={`watchlist-item-${s}`} aria-current={s === activeSymbol || undefined}>
                {/USDT$|USDC$/.test(s) ? <CoinMark symbol={s} size="lg" /> : <span className="x-mk">{tickerMark(s)}</span>}
                <span className="mk-wl-n"><b>{s}</b><small>{MARKET_SYMBOL_NAMES[s] ?? ' '}</small></span>
                <span className="mk-wl-px m">{q ? fmtQuote(q.last) : '—'}<small className={tone}>{q ? fmtChg(q.chg) : ' '}</small></span>
                <button className="mk-wl-x" onClick={e => { e.stopPropagation(); save(symbols.filter(x => x !== s)); }} onKeyDown={e => e.stopPropagation()} aria-label={`Unpin ${s}`} title={`Unpin ${s}`}><IClose size={12} /></button>
              </div>
            );
          })}
      </div>

      {naming?.mode === 'new' && <WatchlistNameDialog title="New watchlist" submitLabel="Create list" onSubmit={(n) => watchlists.create(n)} onClose={() => setNaming(null)} />}
      {naming?.mode === 'rename' && <WatchlistNameDialog title="Rename watchlist" initial={naming.name} submitLabel="Save" onSubmit={(n) => watchlists.rename(naming.id, n)} onClose={() => setNaming(null)} />}
      {imported && (
        <Modal title={imported.failed ? 'Import didn’t save' : `Imported into “${imported.list}”`} onClose={closeImport} testId="watchlist-import-result"
          footer={<button type="button" className="x-btn x-btn--hi" onClick={closeImport} data-autofocus>Done</button>}>
          {imported.failed ? <p className="mk-wl-err">{imported.failed}</p>
            : <p>{imported.symbols.length ? `Added ${imported.symbols.length} ${imported.symbols.length === 1 ? 'symbol' : 'symbols'}.` : 'Nothing new to add.'}{imported.skipped.length ? ` Skipped ${imported.skipped.length}:` : ''}</p>}
          {imported.skipped.length > 0 && (
            <ul className="mk-wl-skips" data-testid="watchlist-skipped">
              {imported.skipped.slice(0, 50).map((r, i) => <li key={i}><span className="m">Line {r.line}</span> <b>{r.value}</b> <span className="x-muted">{r.why}</span></li>)}
              {imported.skipped.length > 50 && <li className="x-muted">…and {imported.skipped.length - 50} more</li>}
            </ul>
          )}
        </Modal>
      )}
      {confirmUi}
    </section>
  );
}
