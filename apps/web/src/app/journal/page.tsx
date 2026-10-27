'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { pipMove, pipSize } from '@/components/replay/trade-chart';
import { TradeCandles, useTradeCandles } from '@/components/v3/trade-candles';
import { ICheck, IClose, IPlus, ISearch, IReplay } from '@/components/v3/icons';
import { money, price, dur, tone } from '@/components/v3/format';
import { api, type BrokerAccount, type Trade, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';

const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const NEG = ['FOMO', 'Revenge', 'Hesitant'];
type FilterKey = 'all' | 'wins' | 'losses' | 'journaled';
const tagLabel = (t: string) => `#${t.trim().toLowerCase().replace(/\s+/g, '-')}`;

export default function ChartReplayPage() {
  return <Suspense fallback={null}><ChartReplay /></Suspense>;
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
  }, [activeId]);

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

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Chart replay">
      <div className="v3-page r-page" data-testid="chart-replay-page">
        {error && (
          <div className="d-err" role="alert" data-testid="journal-error" style={{ marginBottom: 18 }}>
            <span>{error}</span><button className="v3-btn v3-btn--o" onClick={() => selected && loadTrades(selected)}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="r-grid">
            <div className="skel d-sk r-sk" /><div className="skel d-sk r-sk" /><div className="skel d-sk r-sk" />
          </div>
        ) : trades.length === 0 ? (
          <section className="v3-card r-empty" data-testid="replay-empty">
            <span className="r-empty-ic"><IReplay size={22} /></span>
            <h1 className="v3-h1" style={{ fontSize: 28 }}><b>Replay every trade.</b> <em>Learn</em> from each one.</h1>
            <p>Each closed position is redrawn with your entry and exit marked. Log how it felt, tag the setup, and write what you’d do next time.</p>
            {selected ? <p className="mute" style={{ fontSize: 14 }}>{error ? `Your ${selected.broker} positions will show here once the connection is back.` : `No closed positions on ${selected.broker} yet — they appear here after the next sync.`}</p>
              : <button className="v3-btn v3-btn--ink" onClick={() => setShowConnect(true)}><span>Connect MT5</span><span className="ar"><IPlus size={14} /></span></button>}
          </section>
        ) : (
          <div className="r-grid">
            {/* ── Left: positions ── */}
            <aside className="v3-card r-list" data-testid="trade-list" aria-label="Positions">
              <div className="r-list-hd">
                <h3>Positions <span>· {trades.length}</span></h3>
                <div className="r-sum">
                  <div><span>Net</span><b className={`num ${tone(summary.net)}`}>{money(summary.net)}</b></div>
                  <div><span>Win rate</span><b className="num">{summary.winRate}%</b></div>
                  <div><span>Reviewed</span><b className="num">{summary.journaled}/{trades.length}</b></div>
                </div>
                <label className="v3-field r-search">
                  <ISearch size={16} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter symbol…" data-testid="trade-search" onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} />
                  {query && <button aria-label="Clear" onClick={() => setQuery('')}><IClose size={14} /></button>}
                </label>
                <div className="r-chips" role="group" aria-label="Filter">
                  {filters.map(f => (
                    <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>{f.label} <span className="num">{f.n}</span></button>
                  ))}
                </div>
              </div>
              <div className="r-rows" ref={listRef}>
                {visible.length === 0 ? <div className="d-empty">No positions match.</div> : visible.map(t => {
                  const on = t.positionId === activeId;
                  return (
                    <button key={t.positionId} aria-current={on} onClick={() => setActiveId(t.positionId)} data-testid={`trade-row-${t.positionId}`} className="r-row">
                      <i className={t.direction === 'LONG' ? 'L' : 'S'}>{t.direction === 'LONG' ? 'L' : 'S'}</i>
                      <span className="r-row-m">
                        <b>{t.symbol}{journalByTrade.has(t.positionId) && <svg width="12" height="12" viewBox="0 0 24 24" aria-label="Reviewed"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}</b>
                        <small className="num">{t.volume.toFixed(2)} lots · {new Date(t.openTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
                      </span>
                      <b className={`num ${tone(t.netPnl)}`}>{money(t.netPnl)}</b>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ── Center: chart ── */}
            <section className="v3-card r-chart">
              {active && (
                <>
                  <div className="r-chart-hd">
                    <b className="r-sym" data-testid="candle-chart-symbol">{active.symbol}</b>
                    <span className={`d-side ${active.direction === 'LONG' ? 'L' : 'S'}`}>{active.direction === 'LONG' ? '↑ Long' : '↓ Short'} · {active.volume.toFixed(2)}</span>
                    <span className={`v3-pill ${win ? 'g' : 'r'}`}>{win ? 'Win' : 'Loss'}</span>
                    <b className={`num r-pnl ${tone(active.netPnl)}`}>{money(active.netPnl)}</b>
                    <span className={`r-src ${candles.candles ? 'live' : ''}`} title={candles.candles ? 'Market candles for the trade window' : 'Price path reconstructed from your entry and exit fills — not tick data'}>
                      {candles.loading ? 'Loading…' : candles.candles ? 'Live data' : 'Illustrative'}
                    </span>
                    {visible.length > 1 && activeIdx >= 0 && (
                      <div className="v3-seg sm r-step" role="group" aria-label="Browse trades">
                        <button onClick={() => step(-1)} disabled={activeIdx <= 0} aria-label="Previous trade" data-testid="replay-prev">‹</button>
                        <span className="num">{activeIdx + 1}/{visible.length}</span>
                        <button onClick={() => step(1)} disabled={activeIdx >= visible.length - 1} aria-label="Next trade" data-testid="replay-next">›</button>
                      </div>
                    )}
                  </div>
                  <div className="r-chart-bd"><TradeCandles key={active.positionId} trade={active} real={candles.candles} height={460} /></div>
                  <div className="r-stats">
                    <div><span>Entry</span><b className="num">{price(active.entryPrice)}</b></div>
                    <div><span>Exit</span><b className="num">{price(active.exitPrice)}</b></div>
                    <div><span>Move</span><b className={`num ${tone(move)}`}>{move >= 0 ? '+' : '−'}{Math.abs(move).toFixed(1)}</b></div>
                    <div><span>Held</span><b className="num">{dur(active.durationSecs)}</b></div>
                    <div><span>Gross</span><b className="num">{money(active.grossPnl, 0)}</b></div>
                    <div><span>Fees</span><b className={`num ${fees < 0 ? 'sh' : ''}`}>{fees ? money(fees, 0) : '$0'}</b></div>
                  </div>
                </>
              )}
            </section>

            {/* ── Right: review ── */}
            <aside className="v3-card r-review" data-testid="journal-panel" aria-label="Trade review">
              <div className="r-review-hd">
                <h3>Trade review</h3>
                {activeEntry && <span className="v3-pill g r-done"><ICheck size={13} /> Reviewed</span>}
              </div>
              {active && (
                <div className="r-review-bd">
                  <div className={`r-result ${win ? 'w' : 'l'}`}>
                    <b className="num">{money(active.netPnl)}</b>
                    <span className="num">{active.symbol} · {active.direction === 'LONG' ? 'Long' : 'Short'} · {dur(active.durationSecs)} · {move >= 0 ? '+' : '−'}{Math.abs(move).toFixed(1)} {unit}</span>
                  </div>

                  <div className="r-sec">
                    <h4>How did it feel?</h4>
                    <div className="r-emo">
                      {EMOTIONS.map(e => (
                        <button key={e} aria-pressed={emotion === e} className={NEG.includes(e) ? 'neg' : ''} onClick={() => setEmotion(p => (p === e ? '' : e))} data-testid={`emotion-${e.toLowerCase()}`}>{e}</button>
                      ))}
                    </div>
                  </div>

                  <div className="r-sec">
                    <h4>Setup tags</h4>
                    <div className="r-tags">
                      {tags.map(t => (
                        <button key={t} className="r-tag" onClick={() => setTags(p => p.filter(x => x !== t))} data-testid={`tag-${t.toLowerCase()}`} aria-label={`Remove ${tagLabel(t)}`}>{tagLabel(t)} <IClose size={13} /></button>
                      ))}
                      {tagDraft !== null ? (
                        <input autoFocus className="r-tag-in" value={tagDraft} onChange={e => setTagDraft(e.target.value)} placeholder="breakout"
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTagDraft(); } if (e.key === 'Escape') setTagDraft(null); }}
                          onBlur={commitTagDraft} data-testid="tag-draft-input" />
                      ) : (
                        <button className="r-tag add" onClick={() => setTagDraft('')} data-testid="add-tag"><IPlus size={13} /> Add</button>
                      )}
                    </div>
                  </div>

                  <div className="r-sec r-notes">
                    <h4>Pre / post notes</h4>
                    <textarea value={note} onChange={e => setNote(e.target.value)} data-testid="journal-note"
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave(); }}
                      placeholder="What was the plan? Did you follow it? What would you do differently next time?" />
                  </div>
                </div>
              )}
              <div className="r-review-ft">
                {saveError && <p className="r-err" role="alert">{saveError}</p>}
                <button onClick={handleSave} disabled={saving || !active || (!dirty && !!activeEntry)} data-testid="save-journal" className={`r-save ${saved ? 'ok' : ''}`}>
                  {saving ? 'Saving…' : saved ? <><ICheck size={16} /> Saved</> : activeEntry ? (dirty ? 'Update entry' : 'Up to date') : 'Save entry'}
                </button>
                <small className="r-hint">⌘ Enter to save · ↑ ↓ to switch trades</small>
              </div>
            </aside>
          </div>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
