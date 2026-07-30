'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { CheckCircle, NotePencil, MagnifyingGlass, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import ReplayEmpty from '@/components/replay/replay-empty';
import { TradeChart, fmtPrice, pipMove } from '@/components/replay/trade-chart';
import { api, type BrokerAccount, type Trade, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';

const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const NEG = ['FOMO', 'Revenge', 'Hesitant'];
type FilterKey = 'all' | 'wins' | 'losses' | 'journaled';

function fmtDur(s: number | null) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}
const money = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

export default function ChartReplayPage() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [t, j] = await Promise.all([api.trades.list(acc.id), api.journal.list(acc.id)]);
      setTrades(t);
      setJournalEntries(j);
      setActiveId(t[0]?.positionId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (selected) loadTrades(selected);
    else if (!accountsLoading) setLoading(false);
  }, [selected, accountsLoading, loadTrades]);

  const active = trades.find(t => t.positionId === activeId) ?? null;

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
  }, [activeId, activeEntry]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // Summary over the whole loaded set (not the filtered view).
  const summary = useMemo(() => {
    const net = trades.reduce((a, t) => a + t.netPnl, 0);
    const wins = trades.filter(t => t.netPnl >= 0).length;
    const journaled = trades.filter(t => journalByTrade.has(t.positionId)).length;
    return { net, wins, journaled, winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0 };
  }, [trades, journalByTrade]);

  const visible = useMemo(() => {
    let list = trades;
    if (filter === 'wins') list = list.filter(t => t.netPnl >= 0);
    else if (filter === 'losses') list = list.filter(t => t.netPnl < 0);
    else if (filter === 'journaled') list = list.filter(t => journalByTrade.has(t.positionId));
    const q = query.trim().toUpperCase();
    if (q) list = list.filter(t => t.symbol.toUpperCase().includes(q));
    return list;
  }, [trades, filter, query, journalByTrade]);

  async function handleSave() {
    if (!active || !selected) return;
    setSaving(true);
    try {
      const body = { body: note, emotion: emotion || undefined, tags, tradeId: active.positionId, brokerAccountId: selected.id };
      const savedEntry = activeEntry ? await api.journal.update(activeEntry.id, body) : await api.journal.create(body);
      setJournalEntries(prev => [...prev.filter(e => e.id !== savedEntry.id), savedEntry]);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  function commitTagDraft() {
    const t = tagDraft?.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagDraft(null);
  }
  function onConnected(a: BrokerAccount) {
    setAccounts(prev => (prev.find(x => x.id === a.id) ? prev.map(x => (x.id === a.id ? a : x)) : [a, ...prev]));
    select(a);
    setShowConnect(false);
  }

  const win = active ? active.netPnl >= 0 : false;
  const move = active ? pipMove(active) : 0;
  const feesTotal = active ? active.commission + active.swap : 0;

  const filters: { key: FilterKey; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: trades.length },
    { key: 'wins', label: 'Wins', n: summary.wins },
    { key: 'losses', label: 'Losses', n: trades.length - summary.wins },
    { key: 'journaled', label: 'Reviewed', n: summary.journaled },
  ];

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Chart Replay"
      pageSubtitle="// FORENSIC AUDIT"
    >
      {error && (
        <div className="border border-loss/30 bg-loss/10 mx-2 sm:mx-3 lg:mx-4 mt-2 sm:mt-3 lg:mt-4 px-4 py-3 flex items-center justify-between gap-3 text-[12px]" data-testid="journal-error">
          <span className="text-loss">{error}</span>
          <button onClick={() => selected && loadTrades(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-12 gap-2 sm:gap-3 p-2 sm:p-3 lg:p-4">
          <div className="col-span-12 lg:col-span-3 tcard p-0 h-[420px] lg:h-[calc(100dvh-120px)]">
            <div className="p-4 border-b border-border-soft"><div className="shimmer h-4 w-24" /></div>
            <div className="p-3 flex flex-col gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-14" />)}</div>
          </div>
          <div className="col-span-12 lg:col-span-6 tcard p-0 h-[420px] lg:h-[calc(100dvh-120px)]"><div className="shimmer w-full h-full" /></div>
          <div className="col-span-12 lg:col-span-3 tcard p-0 h-[420px] lg:h-[calc(100dvh-120px)]">
            <div className="p-4 border-b border-border-soft"><div className="shimmer h-4 w-28" /></div>
            <div className="p-4 flex flex-col gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-16" />)}</div>
          </div>
        </div>
      ) : trades.length === 0 ? (
        <div className="p-2 sm:p-3 lg:p-4">
          <ReplayEmpty hasBroker={!!selected} onConnect={() => setShowConnect(true)} />
        </div>
      ) : (
        <div className="lg:h-[calc(100dvh-104px)] lg:flex lg:flex-col p-2 sm:p-3 lg:p-4 fade-up" data-testid="chart-replay-page">
          <div className="grid grid-cols-12 gap-2 sm:gap-3 lg:flex-1 lg:min-h-0">
            {/* ── Left: position log ── */}
            <aside className="order-2 lg:order-1 tcard col-span-12 lg:col-span-3 p-0 flex flex-col min-h-0 max-h-[440px] lg:max-h-none" data-testid="trade-list">
              <div className="px-4 pt-3 pb-3 border-b border-border-soft shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] tracking-[0.25em] text-fg-3">POSITION_LOG</span>
                  <span className="text-[10px] text-fg-3 numeric">{trades.length}</span>
                </div>
                {/* loaded-set summary */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div>
                    <div className="text-[8px] tracking-[0.16em] text-fg-3">NET</div>
                    <div className={`numeric text-[13px] font-semibold mt-0.5 ${summary.net >= 0 ? 'text-profit' : 'text-loss'}`}>{money(summary.net)}</div>
                  </div>
                  <div>
                    <div className="text-[8px] tracking-[0.16em] text-fg-3">WIN RATE</div>
                    <div className="numeric text-[13px] font-semibold mt-0.5">{summary.winRate}%</div>
                  </div>
                  <div>
                    <div className="text-[8px] tracking-[0.16em] text-fg-3">REVIEWED</div>
                    <div className="numeric text-[13px] font-semibold mt-0.5">{summary.journaled}<span className="text-fg-3 text-[10px]">/{trades.length}</span></div>
                  </div>
                </div>
                {/* search */}
                <div className="relative mt-3">
                  <MagnifyingGlass size={12} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Filter symbol…"
                    data-testid="trade-search"
                    className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded bg-surface border border-border-soft text-fg placeholder:text-fg-3 focus:outline-none focus:border-border-strong"
                  />
                </div>
                {/* filter chips */}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {filters.map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      data-testid={`filter-${f.key}`}
                      className={`px-2 py-1 rounded text-[9px] tracking-[0.12em] uppercase border transition-colors ${
                        filter === f.key ? 'bg-surface-active border-border-strong text-fg' : 'border-border-soft text-fg-3 hover:text-fg'
                      }`}
                    >
                      {f.label} <span className="numeric opacity-60">{f.n}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0">
                {visible.length === 0 ? (
                  <div className="text-center text-[11px] text-fg-3 py-10 px-4">No positions match this filter.</div>
                ) : (
                  visible.map(t => {
                    const rowActive = t.positionId === activeId;
                    const pos = t.netPnl >= 0;
                    const reviewed = journalByTrade.has(t.positionId);
                    return (
                      <button
                        key={t.positionId}
                        onClick={() => setActiveId(t.positionId)}
                        data-testid={`trade-row-${t.positionId}`}
                        className={`w-full text-left px-4 py-3 border-b border-border-soft transition-colors ${
                          rowActive ? 'bg-surface border-l-2 border-l-profit pl-[14px]' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`shrink-0 inline-flex items-center justify-center h-4 w-4 rounded text-[8px] font-bold ${t.direction === 'LONG' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                              {t.direction === 'LONG' ? 'L' : 'S'}
                            </span>
                            <span className="font-display font-bold tracking-tight text-[14px] truncate">{t.symbol}</span>
                            {reviewed && <NotePencil size={11} weight="fill" className="text-fg-3 shrink-0" />}
                          </div>
                          <span className={`text-[11px] numeric font-medium shrink-0 ${pos ? 'text-profit' : 'text-loss'}`}>{money(t.netPnl)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-fg-3 tracking-wider numeric">
                          <span>{t.volume.toFixed(2)} LOTS</span>
                          <span>{new Date(t.openTime).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* ── Center: chart hero ── */}
            <section className="order-1 lg:order-2 col-span-12 lg:col-span-6 flex flex-col min-h-0">
              <div className="tcard p-0 flex-1 flex flex-col min-h-0">
                <div className="px-3 sm:px-5 py-3 border-b border-border-soft flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                    <span className="font-display font-black text-[17px] sm:text-[20px] tracking-tighter" data-testid="candle-chart-symbol">{active?.symbol ?? '—'}</span>
                    {active && (
                      <span className={`inline-flex items-center gap-1 text-[10px] tracking-widest px-2 py-0.5 rounded border ${active.direction === 'LONG' ? 'text-profit border-profit/30 bg-profit/10' : 'text-loss border-loss/30 bg-loss/10'}`}>
                        {active.direction === 'LONG' ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />}
                        {active.direction} · {active.volume.toFixed(2)}
                      </span>
                    )}
                    {active && (
                      <span className={`text-[10px] font-bold tracking-[0.18em] px-2 py-0.5 rounded ${win ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'}`}>
                        {win ? 'WIN' : 'LOSS'}
                      </span>
                    )}
                    {active && <span className={`numeric font-display font-bold text-[16px] sm:text-[18px] ${win ? 'text-profit' : 'text-loss'}`}>{money(active.netPnl)}</span>}
                  </div>
                  <span className="text-[9px] tracking-[0.2em] text-fg-3 border border-border-soft px-2 py-1 rounded" title="Illustrative price path reconstructed from entry/exit fills — not tick data">
                    SCHEMATIC · NOT TICK DATA
                  </span>
                </div>

                <div className="flex-1 min-h-[260px]"><TradeChart trade={active} /></div>

                <div className="px-3 sm:px-5 py-3 border-t border-border-soft grid grid-cols-3 sm:grid-cols-6 gap-3 text-[11px] shrink-0">
                  {[
                    { k: 'ENTRY', v: fmtPrice(active?.symbol ?? '', active?.entryPrice) },
                    { k: 'EXIT', v: fmtPrice(active?.symbol ?? '', active?.exitPrice) },
                    { k: 'MOVE', v: active ? `${move >= 0 ? '+' : ''}${move.toFixed(1)}p` : '—', accent: active ? (move >= 0 ? 'text-profit' : 'text-loss') : '' },
                    { k: 'HELD', v: fmtDur(active?.durationSecs ?? null) },
                    { k: 'GROSS', v: active ? money(active.grossPnl) : '—' },
                    { k: 'FEES', v: active ? `−$${Math.abs(feesTotal).toFixed(2)}` : '—', accent: 'text-fg-2' },
                  ].map(m => (
                    <div key={m.k}>
                      <div className="text-[9px] tracking-[0.16em] text-fg-3">{m.k}</div>
                      <div className={`numeric mt-0.5 ${m.accent ?? ''}`}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Right: review panel ── */}
            <aside className="order-3 tcard col-span-12 lg:col-span-3 p-0 flex flex-col min-h-0 max-h-[560px] lg:max-h-none" data-testid="journal-panel">
              <div className="px-4 py-3 border-b border-border-soft shrink-0 flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-fg-3">TRADE_REVIEW</div>
                  <div className="font-display font-bold text-[15px] tracking-tight mt-1">Journal entry</div>
                </div>
                {activeEntry && (
                  <span className="inline-flex items-center gap-1 text-[9px] tracking-[0.14em] text-profit border border-profit/30 bg-profit/10 px-2 py-1 rounded">
                    <CheckCircle size={11} weight="fill" /> REVIEWED
                  </span>
                )}
              </div>

              <div className="p-4 flex flex-col gap-5 flex-1 overflow-y-auto min-h-0">
                {/* result recap */}
                {active && (
                  <div className={`rounded-[var(--radius-card)] border p-3 ${win ? 'border-profit/25 bg-profit/[0.06]' : 'border-loss/25 bg-loss/[0.06]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] tracking-[0.16em] text-fg-3">RESULT</span>
                      <span className={`numeric font-display font-bold text-[16px] ${win ? 'text-profit' : 'text-loss'}`}>{money(active.netPnl)}</span>
                    </div>
                    <div className="text-[10px] text-fg-3 mt-1 numeric">
                      {active.symbol} · {active.direction} · {fmtDur(active.durationSecs)} · {move >= 0 ? '+' : ''}{move.toFixed(1)} pips
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[10px] tracking-widest text-fg-3 mb-2">HOW DID IT FEEL?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOTIONS.map(e => (
                      <button
                        key={e}
                        onClick={() => setEmotion(prev => (prev === e ? '' : e))}
                        data-testid={`emotion-${e.toLowerCase()}`}
                        className={`px-2.5 py-1 rounded text-[10px] tracking-widest border transition-colors press focus-ring ${
                          emotion === e
                            ? NEG.includes(e) ? 'bg-loss/15 border-loss text-loss' : 'bg-profit/15 border-profit text-profit'
                            : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'
                        }`}
                      >
                        {e.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-widest text-fg-3 mb-2">SETUP TAGS</div>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => (
                      <button
                        key={t}
                        onClick={() => setTags(prev => prev.filter(x => x !== t))}
                        data-testid={`tag-${t.toLowerCase()}`}
                        title="Remove tag"
                        className="px-2 py-1 rounded text-[10px] tracking-widest border border-border-soft text-fg-2 hover:border-loss hover:text-loss transition-colors press focus-ring"
                      >
                        {t.toUpperCase()} ✕
                      </button>
                    ))}
                    {tagDraft !== null ? (
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={e => setTagDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitTagDraft();
                          if (e.key === 'Escape') setTagDraft(null);
                        }}
                        onBlur={commitTagDraft}
                        data-testid="tag-draft-input"
                        placeholder="e.g. breakout…"
                        className="px-2 py-1 text-[10px] tracking-widest border border-border-strong bg-transparent text-fg w-28 focus:outline-none rounded"
                      />
                    ) : (
                      <button onClick={() => setTagDraft('')} data-testid="add-tag" className="px-2 py-1 text-[10px] tracking-widest rounded border border-dashed border-border-strong text-fg-3 hover:text-fg">+ ADD</button>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-h-[120px]">
                  <div className="text-[10px] tracking-widest text-fg-3 mb-2">PRE / POST NOTES</div>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    data-testid="journal-note"
                    placeholder="What was the plan? Did you follow it? What would you do differently next time?"
                    className="tinput flex-1 min-h-[120px] resize-none leading-relaxed placeholder:text-fg-3/70"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-border-soft shrink-0">
                <button
                  onClick={handleSave}
                  disabled={saving || !active}
                  data-testid="save-journal"
                  className={`btn w-full justify-center py-2.5 text-[10px] tracking-[0.22em] ${saved ? 'btn-ghost text-profit border-profit/40' : 'btn-primary'} ${saving || !active ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {saving ? 'SAVING…' : saved ? '✓ SAVED' : activeEntry ? 'UPDATE ENTRY' : 'SAVE ENTRY'}
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
