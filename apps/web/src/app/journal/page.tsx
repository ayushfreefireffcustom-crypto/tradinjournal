'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { pipMove, pipSize } from '@/components/replay/trade-chart';
import { useTradeCandles } from '@/lib/use-trade-candles';
import { ICheck, IClose, IPlus, ISearch, IReplay, IArrowLeft, IArrowRight } from '@/components/v6/icons';
import { SideChip } from '@/components/v6/desk';
import { ReplayChart } from '@/components/v6/journal/replay-chart';
import { EmotionChips, TagEditor } from '@/components/v6/journal/chips';
import { fmtHold, fmtUsd } from '@/lib/dashboard-v6';
import { fmtPrice, marketKind, tickerMark } from '@/lib/desk';
import { api, type BrokerAccount, type Trade, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';
import NotesView from '@/components/v6/journal/notes-view';
import JournalViewSwitch from '@/components/v6/journal/view-switch';
import '@/styles/v6/journal.css';

const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
type FilterKey = 'all' | 'wins' | 'losses' | 'journaled';
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export default function JournalPage() {
  return <Suspense fallback={null}><JournalViews /></Suspense>;
}

/** Journal (A0.D1): trade review with the replay chart, or free-form notes (?view=notes). */
function JournalViews() {
  return useSearchParams().get('view') === 'notes' ? <NotesView /> : <ChartReplay />;
}

function ChartReplay() {
  const params = useSearchParams();
  const wanted = params.get('trade');
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [note, setNote] = useState('');
  const [emotion, setEmotion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  // Phones show the list or the replay, not both; a deep link opens the replay.
  const [view, setView] = useState<'list' | 'detail'>(wanted ? 'detail' : 'list');
  const listRef = useRef<HTMLDivElement>(null);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [t, j] = await Promise.all([api.trades.list(acc.id), api.journal.list(acc.id)]);
      setTrades(t);
      setJournalEntries(j);
      // Deep link (?trade=) from trade detail wins over "most recent".
      setActiveId(wanted && t.some(x => x.positionId === wanted) ? wanted : t[0]?.positionId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, [wanted]);
  useEffect(() => {
    if (selected) loadTrades(selected);
    else if (!accountsLoading) setLoading(false);
  }, [selected, accountsLoading, loadTrades]);

  const active = trades.find(t => t.positionId === activeId) ?? null;
  const candles = useTradeCandles(active, selected?.id);

  const journalByTrade = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const e of journalEntries) if (e.tradeId) map.set(e.tradeId, e);
    return map;
  }, [journalEntries]);
  const activeEntry = activeId ? journalByTrade.get(activeId) ?? null : null;

  useEffect(() => {
    setNote(activeEntry?.body ?? '');
    setEmotion(activeEntry?.emotion ?? '');
    setTags(activeEntry?.tags ?? []);
    setTagDraft(null);
    setSaveError('');
  }, [activeId, activeEntry]);
  useEffect(() => setSaved(false), [activeId]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const dirty = (note !== (activeEntry?.body ?? '')) || (emotion !== (activeEntry?.emotion ?? '')) || (tags.join('|') !== (activeEntry?.tags ?? []).join('|'));

  // Summary over the whole loaded set (not the filtered view).
  const summary = useMemo(() => {
    const net = trades.reduce((a, t) => a + t.netPnl, 0);
    const wins = trades.filter(t => t.netPnl > 0).length;
    const journaled = trades.filter(t => journalByTrade.has(t.positionId)).length;
    return { net, wins, journaled, winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0 };
  }, [trades, journalByTrade]);

  const visible = useMemo(() => {
    let list = trades;
    if (filter === 'wins') list = list.filter(t => t.netPnl > 0);
    else if (filter === 'losses') list = list.filter(t => t.netPnl <= 0);
    else if (filter === 'journaled') list = list.filter(t => journalByTrade.has(t.positionId));
    const q = query.trim().toUpperCase();
    if (q) list = list.filter(t => t.symbol.toUpperCase().includes(q));
    return list;
  }, [trades, filter, query, journalByTrade]);

  // If a filter hides the trade being reviewed, move to the first one still shown.
  useEffect(() => {
    if (visible.length && !visible.some(t => t.positionId === activeId)) setActiveId(visible[0]!.positionId);
  }, [visible, activeId]);

  // ↑/↓ (and the ‹ › buttons) step through the visible list.
  const activeIdx = visible.findIndex(t => t.positionId === activeId);
  const step = (d: 1 | -1) => {
    const next = visible[Math.max(0, Math.min(visible.length - 1, activeIdx + d))];
    if (next && next.positionId !== activeId) { setActiveId(next.positionId); return true; }
    return false;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable=true]') || e.metaKey || e.ctrlKey) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      step(e.key === 'ArrowDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, view]);

  const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  function openTrade(id: string) {
    setActiveId(id);
    setView('detail');
    if (narrow()) window.scrollTo({ top: 0 });
  }

  async function handleSave() {
    if (!active || !selected) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = { body: note, emotion: emotion || undefined, tags, tradeId: active.positionId, brokerAccountId: selected.id };
      const savedEntry = activeEntry ? await api.journal.update(activeEntry.id, body) : await api.journal.create(body);
      setJournalEntries(prev => [...prev.filter(e => e.id !== savedEntry.id), savedEntry]);
      setSaved(true);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Couldn’t save — try again');
    } finally {
      setSaving(false);
    }
  }

  function commitTagDraft() {
    const t = tagDraft?.trim().replace(/^#/, '');
    if (t && !tags.some(x => x.toLowerCase() === t.toLowerCase())) setTags(prev => [...prev, t]);
    setTagDraft(null);
  }
  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a);
    setShowConnect(false);
  }

  const win = active ? active.netPnl > 0 : false;
  const move = active ? pipMove(active) : 0;
  const unit = active && pipSize(active.symbol, active.entryPrice) >= 0.1 ? 'pts' : 'pips';
  const fees = active ? active.commission + active.swap : 0;

  const filters: { key: FilterKey; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: trades.length },
    { key: 'wins', label: 'Wins', n: summary.wins },
    { key: 'losses', label: 'Losses', n: trades.length - summary.wins },
    { key: 'journaled', label: 'Reviewed', n: summary.journaled },
  ];

  const subtitle = selected
    ? (loading ? `${selected.broker} · loading…` : <>{selected.broker} · <span className="m">{summary.journaled}/{trades.length}</span> reviewed</>)
    : 'Replay each closed trade and note what happened';

  const status = saveError
    ? <span className="jn-status is-err" role="alert">{saveError}</span>
    : dirty ? <span className="jn-status is-dirty">Unsaved changes</span>
      : activeEntry ? <span className="jn-status">Saved {shortDate(activeEntry.updatedAt)}</span>
        : <span className="jn-status">Not reviewed yet</span>;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Journal" pageSubtitle={subtitle} actions={<JournalViewSwitch view="trades" />}>
      <div className="jn-page" data-testid="chart-replay-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="journal-error">
            <span>{error}</span><button className="x-btn x-btn--sm" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="jn-replay" aria-busy="true" aria-label="Loading positions">
            <div className="x-skel" style={{ height: 560 }} />
            <div className="jn-detail"><div className="x-skel" style={{ height: 600 }} /><div className="x-skel" style={{ height: 300 }} /></div>
          </div>
        ) : trades.length === 0 ? (
          <section className="x-card x-empty" data-testid="replay-empty">
            <span className="x-ic"><IReplay size={22} /></span>
            <b>{selected ? 'No closed positions yet' : 'Replay every trade'}</b>
            <p>{selected
              ? (error ? `Your ${selected.broker} positions will show here once the connection is back.` : `Closed positions on ${selected.broker} appear here after the next sync, redrawn with your entry and exit.`)
              : 'Connect your MT5 account and each closed position is redrawn with your entry and exit, ready for notes.'}</p>
            {!selected && <button className="x-btn x-btn--hi" onClick={() => setShowConnect(true)}><IPlus size={15} />Connect MT5</button>}
          </section>
        ) : (
          <div className="jn-replay" data-view={view}>
            {/* ── Positions ── */}
            <aside className="x-card jn-list" data-testid="trade-list" aria-label="Positions">
              <div className="jn-list-hd">
                <div className="x-ch"><h2>Positions</h2><span className="x-sub">{trades.length} closed</span></div>
                <div className="x-strip" style={{ ['--n' as string]: 3 }}>
                  <div><span>Net</span><b className={`m ${tone(summary.net)}`}>{fmtUsd(summary.net, 0)}</b></div>
                  <div><span>Win rate</span><b className="m">{summary.winRate}%</b></div>
                  <div><span>Reviewed</span><b className="m">{summary.journaled}/{trades.length}</b></div>
                </div>
                <label className="x-search">
                  <ISearch size={16} />
                  <input className="x-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter by symbol" aria-label="Filter by symbol" data-testid="trade-search" onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} />
                  {query && <button className="jn-clear" aria-label="Clear" onClick={() => setQuery('')}><IClose size={14} /></button>}
                </label>
                <div className="x-seg x-seg--sm" role="group" aria-label="Filter">
                  {filters.map(f => (
                    <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>{f.label} <span className="m">{f.n}</span></button>
                  ))}
                </div>
              </div>
              <div className="jn-rows" ref={listRef}>
                {visible.length === 0 ? (
                  <div className="jn-none"><span>No positions match.</span><button className="x-btn x-btn--sm" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></div>
                ) : visible.map(t => {
                  const on = t.positionId === activeId;
                  return (
                    <button key={t.positionId} aria-current={on} onClick={() => openTrade(t.positionId)} data-testid={`trade-row-${t.positionId}`} className="jn-row">
                      <span className="x-mk">{tickerMark(t.symbol)}</span>
                      <span className="jn-row-m">
                        <span><b>{t.symbol}</b><SideChip dir={t.direction} /></span>
                        <small>{shortDate(t.openTime)} · <span className="m">{t.volume.toFixed(2)}</span> lots</small>
                      </span>
                      <span className="jn-row-r">
                        <b className={`m ${tone(t.netPnl)}`}>{fmtUsd(t.netPnl)}</b>
                        {journalByTrade.has(t.positionId) && <span className="jn-noted">Reviewed</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="jn-detail">
              <button className="x-btn x-btn--sm jn-back" onClick={() => setView('list')} data-testid="replay-back"><IArrowLeft size={15} />All positions</button>

              {/* ── Replay ── */}
              <section className="x-card jn-chartcard" aria-label="Replay">
                {active && (
                  <>
                    <div className="jn-hd">
                      <span className="x-sym">
                        <span className="x-mk">{tickerMark(active.symbol)}</span>
                        <span><b data-testid="candle-chart-symbol">{active.symbol}</b><small>{marketKind(active.symbol) ? `${marketKind(active.symbol)} · ` : ''}<span className="m">{active.volume.toFixed(2)}</span> lots · {shortDate(active.openTime)}</small></span>
                      </span>
                      <SideChip dir={active.direction} />
                      <div className="jn-hd-r">
                        <span className={`x-tag jn-src ${candles.candles ? 'x-tag--g' : ''}`} title={candles.candles ? 'Market candles for the trade window' : 'Price path reconstructed from your entry and exit fills, not tick data'}>
                          {candles.loading ? 'Loading candles' : candles.candles ? 'Market data' : 'Illustrative'}
                        </span>
                        {visible.length > 1 && activeIdx >= 0 && (
                          <div className="jn-step" role="group" aria-label="Browse trades">
                            <button onClick={() => step(-1)} disabled={activeIdx <= 0} aria-label="Previous trade" data-testid="replay-prev"><IArrowLeft size={14} /></button>
                            <span className="m">{activeIdx + 1}/{visible.length}</span>
                            <button onClick={() => step(1)} disabled={activeIdx >= visible.length - 1} aria-label="Next trade" data-testid="replay-next"><IArrowRight size={14} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="jn-pnl">
                      <b className={`m ${tone(active.netPnl)}`}>{fmtUsd(active.netPnl)}</b>
                      <span className={`x-tag ${win ? 'x-tag--g' : 'x-tag--r'}`}>{win ? 'Win' : 'Loss'}</span>
                      <span className="x-sub"><span className="m">{move >= 0 ? '+' : '−'}{Math.abs(move).toFixed(1)}</span> {unit} in {fmtHold(active.durationSecs)}</span>
                    </div>
                    <ReplayChart key={active.positionId} trade={active} real={candles.candles} />
                    <div className="x-strip jn-strip6">
                      <div><span>Entry</span><b className="m">{fmtPrice(active.entryPrice, active.exitPrice)}</b></div>
                      <div><span>Exit</span><b className="m">{fmtPrice(active.exitPrice, active.entryPrice)}</b></div>
                      <div><span>Move</span><b className={`m ${tone(move)}`}>{move >= 0 ? '+' : '−'}{Math.abs(move).toFixed(1)}</b></div>
                      <div><span>Held</span><b className="m">{fmtHold(active.durationSecs)}</b></div>
                      <div><span>Gross</span><b className={`m ${tone(active.grossPnl)}`}>{fmtUsd(active.grossPnl, 0)}</b></div>
                      <div><span>Fees</span><b className="m">{fees ? fmtUsd(fees) : '$0.00'}</b></div>
                    </div>
                  </>
                )}
              </section>

              {/* ── Review ── */}
              <section className="x-card jn-review" data-testid="journal-panel" aria-label="Trade review">
                <div className="x-ch">
                  <h2>Trade review</h2>
                  {activeEntry && <span className="x-tag x-tag--g"><ICheck size={12} />Reviewed</span>}
                  <div className="x-r"><span className="jn-hint">⌘ Enter to save · ↑ ↓ to switch trades</span></div>
                </div>
                {active && (
                  <div className="jn-review-bd">
                    <div>
                      <div className="jn-sec">
                        <h3>How did it feel?</h3>
                        <EmotionChips options={EMOTIONS} value={emotion} onChange={setEmotion} label="How did it feel?" />
                      </div>
                      <div className="jn-sec">
                        <h3>Setup tags</h3>
                        <TagEditor tags={tags} onRemove={t => setTags(p => p.filter(x => x !== t))} draft={tagDraft} setDraft={setTagDraft} onCommit={commitTagDraft} placeholder="breakout" />
                      </div>
                    </div>
                    <div className="jn-notes">
                      <label className="x-label" htmlFor="jn-note">Pre / post notes</label>
                      <textarea id="jn-note" className="x-textarea" value={note} onChange={e => setNote(e.target.value)} data-testid="journal-note"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
                        placeholder="What was the plan? Did you follow it? What would you do differently next time?" />
                    </div>
                  </div>
                )}
                <div className="jn-ft">
                  {status}
                  <button onClick={handleSave} disabled={saving || !active || (!dirty && !!activeEntry)} data-testid="save-journal" className={`x-btn x-btn--hi jn-save ${saved && !dirty ? 'is-saved' : ''}`}>
                    {saving ? 'Saving…' : saved && !dirty ? <><ICheck size={15} />Saved</> : activeEntry ? (dirty ? 'Update entry' : 'Up to date') : 'Save entry'}
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
