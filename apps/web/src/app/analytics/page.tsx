'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { closedInSpan, isCustom, statsForRange, RANGES, type RangeKey, type Span } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import { SortableCard } from '@/components/v6/analytics/kit';
import YearHeatmap from '@/components/v6/analytics/year-heatmap';
import {
  KpiStrip, Strike, Dist, Equity, Sessions, Rolling, SymbolTable, Allocation, GroupBars, Hours, Scatter, DayBars, Direction, type Group,
} from '@/components/v6/analytics/cards';
import DateRangePicker from '@/components/v6/ui/date-range';
import { rangeText } from '@/lib/date-presets';

// Rearrangeable analytics blocks. Order is persisted per-account in localStorage.
// Spans tile the 12-col grid in the default order; on reorder CSS grid
// auto-flow keeps rows filled left-to-right.
const BLOCK_IDS = ['donut', 'pnldist', 'heatmap', 'timeofday', 'equity', 'rolling', 'scatter', 'yearheat', 'bysymbol', 'allocation', 'tag', 'emotion', 'byday', 'direction'] as const;
type BlockId = (typeof BLOCK_IDS)[number];
const DEFAULT_ORDER: BlockId[] = ['equity', 'donut', 'pnldist', 'rolling', 'heatmap', 'allocation', 'bysymbol', 'timeofday', 'direction', 'byday', 'emotion', 'tag', 'scatter', 'yearheat'];
const SPANS: Record<BlockId, string> = {
  equity: 'an-s12', donut: 'an-s5', pnldist: 'an-s7', rolling: 'an-s7', heatmap: 'an-s5',
  allocation: 'an-s5', bysymbol: 'an-s7', timeofday: 'an-s12', direction: 'an-s6', byday: 'an-s6', emotion: 'an-s6', tag: 'an-s6', scatter: 'an-s12', yearheat: 'an-s12',
};
const orderKey = (accountId: string) => `tradelogs.analytics.order.${accountId}`;
function sameOrder(a: BlockId[], b: BlockId[]) { return a.length === b.length && a.every((x, i) => x === b[i]); }
function normalizeOrder(saved: string[]): BlockId[] {
  const known = saved.filter((id): id is BlockId => (BLOCK_IDS as readonly string[]).includes(id));
  return [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))];
}
const EMOTION_ORDER = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const RANGE_LABEL: Record<RangeKey, string> = { '1W': 'Last 7 days', '1M': 'Last 30 days', '3M': 'Last 3 months', '1Y': 'Last 12 months', ALL: 'All time' };
const RANGE_SHORT: Record<RangeKey, string> = { '1W': '7D', '1M': '30D', '3M': '90D', '1Y': '1Y', ALL: 'All' };

export default function AnalyticsPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<Span>('ALL');
  // Drag handles only show while arranging (A4.4), so the cards stay calm the rest of the time.
  const [arranging, setArranging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [order, setOrder] = useState<BlockId[]>(DEFAULT_ORDER);
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load persisted card order whenever the active account changes.
  useEffect(() => {
    if (!selected) return;
    try {
      const raw = localStorage.getItem(orderKey(selected.id));
      setOrder(raw ? normalizeOrder(JSON.parse(raw)) : DEFAULT_ORDER);
    } catch { setOrder(DEFAULT_ORDER); }
  }, [selected]);

  const persistOrder = useCallback((next: BlockId[]) => {
    setOrder(next);
    if (selected) { try { localStorage.setItem(orderKey(selected.id), JSON.stringify(next)); } catch {} }
  }, [selected]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIndex = prev.indexOf(active.id as BlockId);
      const newIndex = prev.indexOf(over.id as BlockId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      if (selected) { try { localStorage.setItem(orderKey(selected.id), JSON.stringify(next)); } catch {} }
      return next;
    });
  }, [selected]);

  const isDefaultOrder = sameOrder(order, DEFAULT_ORDER);

  const loadStats = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [s, t, j] = await Promise.all([
        api.trades.stats(acc.id),
        api.trades.list(acc.id),
        api.journal.list(acc.id),
      ]);
      setStats(s);
      setTrades(t);
      setJournal(j);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account data');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (selected) loadStats(selected);
    else if (!accountsLoading) setLoading(false); // zero brokers: don’t load forever
  }, [selected, accountsLoading, loadStats]);

  // Range-filtered view: recompute every widget's stats from the selected range.
  const view = useMemo(
    () => (stats ? statsForRange(trades, stats.startingBalance, range) : null),
    [stats, trades, range],
  );

  // Closed trades within the selected range (for distribution / heatmap / tags).
  const rangedTrades = useMemo(() => closedInSpan(trades, range), [trades, range]);

  // Group closed-trade P&L by the tags / emotion logged for each trade's
  // journal entry (joined by tradeId → positionId), within the selected range.
  const { tagStats, emotionStats } = useMemo(() => {
    const closedById = new Map<string, Trade>();
    for (const t of rangedTrades) closedById.set(t.positionId, t);

    const tagMap = new Map<string, Group>();
    const emoMap = new Map<string, Group>();
    const bump = (map: Map<string, Group>, key: string, netPnl: number) => {
      const g = map.get(key) ?? { label: key, trades: 0, wins: 0, netPnl: 0 };
      g.trades += 1;
      if (netPnl > 0) g.wins += 1;
      g.netPnl += netPnl;
      map.set(key, g);
    };

    for (const e of journal) {
      if (!e.tradeId) continue;
      const t = closedById.get(e.tradeId);
      if (!t) continue;
      if (e.emotion) bump(emoMap, e.emotion, t.netPnl);
      for (const tag of e.tags ?? []) bump(tagMap, tag, t.netPnl);
    }

    const finalize = (map: Map<string, Group>): Group[] => Array.from(map.values()).sort((a, b) => b.netPnl - a.netPnl);

    return { tagStats: finalize(tagMap), emotionStats: finalize(emoMap) };
  }, [rangedTrades, journal]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => prev.find(a => a.id === account.id) ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]);
    select(account);
    setShowConnect(false);
  }

  // Inner content for each rearrangeable block. The outer col-span + drag handle
  // are supplied by <SortableCard>; here we render just the card body.
  function renderBlock(id: BlockId) {
    if (!view) return null;
    switch (id) {
      case 'donut': return <Strike view={view} />;
      case 'pnldist': return <Dist trades={rangedTrades} />;
      case 'equity': return <Equity view={view} />;
      case 'heatmap': return <Sessions trades={rangedTrades} />;
      case 'rolling': return <Rolling trades={rangedTrades} />;
      case 'bysymbol': return <SymbolTable rows={view.bySymbol} />;
      case 'allocation': return <Allocation rows={view.bySymbol} />;
      case 'emotion': return <GroupBars testId="perf-by-emotion" title="Psychology edge" sub="net P&L by emotion" rows={emotionStats} order={EMOTION_ORDER} empty="Log how you felt on a trade in Journal › Trade review to see which states pay." />;
      case 'tag': return <GroupBars testId="perf-by-tag" title="Setup edge" sub="net P&L by tag" rows={tagStats.slice(0, 8)} empty="Tag your setups in the Journal to see which ones carry your edge." />;
      case 'timeofday': return <Hours trades={rangedTrades} />;
      case 'scatter': return <Scatter trades={rangedTrades} />;
      case 'byday': return <DayBars data={view.byDay} />;
      case 'yearheat': return <YearHeatmap trades={trades} accountId={selected?.id} />;
      case 'direction': return <Direction view={view} />;
    }
  }

  const rangeName = isCustom(range) ? rangeText(range) : RANGE_LABEL[range].toLowerCase();
  const subtitle = selected
    ? <>{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · {rangeName}</>
    : rangeName;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Analytics" pageSubtitle={subtitle}
      actions={(
        <>
          <div className="x-seg" role="group" aria-label="Date range" data-testid="range-selector">
            {RANGES.map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} title={RANGE_LABEL[r]} data-testid={`range-${r}`}>{RANGE_SHORT[r]}</button>)}
          </div>
          <DateRangePicker value={isCustom(range) ? range : null} onChange={setRange} />
        </>
      )}>
      <div className="x-page an-page" data-testid="analytics-page">
        {error && !loading ? (
          <div className="x-banner x-banner--err" role="alert" data-testid="analytics-error">
            <span>{error}</span><button className="x-btn x-btn--sm" onClick={() => selected && loadStats(selected)}>Retry</button>
          </div>
        ) : !selected && !accountsLoading ? (
          <section className="x-card x-empty">
            <span className="x-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16V4" /></svg></span>
            <b>Connect your MT5 account</b>
            <p>Analytics fill in once your first trades sync.</p>
            <button className="x-btn x-btn--hi" onClick={() => setShowConnect(true)}>Connect MT5</button>
          </section>
        ) : loading || !view ? (
          <div className="x-page" aria-busy="true" aria-label="Loading analytics">
            <div className="x-skel" style={{ height: 96 }} />
            <div className="an-grid">{[12, 5, 7].map((n, i) => <div key={i} className={`x-skel an-s${n}`} style={{ height: n === 12 ? 380 : 340 }} />)}</div>
          </div>
        ) : (
          <>
            <KpiStrip view={view} />
            <div className="an-bar" data-testid="analytics-arrange-bar">
              {arranging ? (
                <>
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden><circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" /><circle cx="2" cy="7" r="1.3" /><circle cx="8" cy="7" r="1.3" /><circle cx="2" cy="12" r="1.3" /><circle cx="8" cy="12" r="1.3" /></svg>
                  <span>Drag a card by its handle to move it</span>
                  {!isDefaultOrder && <button className="x-btn x-btn--sm" onClick={() => { persistOrder(DEFAULT_ORDER); toast.info('Layout reset'); }} data-testid="analytics-reset-layout">Reset layout</button>}
                  <button className="x-btn x-btn--sm x-btn--hi" onClick={() => setArranging(false)} data-testid="analytics-arrange-done">Done</button>
                </>
              ) : (
                <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => setArranging(true)} data-testid="analytics-arrange">Customise layout</button>
              )}
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className={`an-grid ${arranging ? 'is-arranging' : ''}`} data-testid="analytics-grid">
                  {order.map(id => (
                    <SortableCard key={id} id={id} className={SPANS[id]}>
                      {renderBlock(id)}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
