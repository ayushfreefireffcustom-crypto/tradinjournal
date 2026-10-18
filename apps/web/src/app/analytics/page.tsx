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
import { statsForRange, rangeStart, RANGES, type RangeKey } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import SortableCard from '@/components/sortable-card';
import YearHeatmap from '@/components/year-heatmap';
import { useToast } from '@/components/toast';
import { AKpis, Strike, Dist, Equity, Sessions, Rolling, SymbolTable, GroupBars, Hours, Scatter, type Group } from '@/components/v3/analytics-parts';
import { DayBars } from '@/components/v3/dashboard-parts';

// Rearrangeable analytics blocks. Order is persisted per-account in localStorage.
// Spans tile the 12-col grid in the default order; on reorder CSS grid
// auto-flow keeps rows filled left-to-right.
const BLOCK_IDS = ['donut', 'pnldist', 'heatmap', 'timeofday', 'equity', 'rolling', 'scatter', 'yearheat', 'bysymbol', 'tag', 'emotion', 'byday'] as const;
type BlockId = (typeof BLOCK_IDS)[number];
const DEFAULT_ORDER: BlockId[] = ['donut', 'pnldist', 'equity', 'heatmap', 'rolling', 'bysymbol', 'emotion', 'tag', 'timeofday', 'byday', 'yearheat', 'scatter'];
const SPANS: Record<BlockId, string> = {
  donut: 'a-s5', pnldist: 'a-s7', equity: 'a-s12', heatmap: 'a-s6', rolling: 'a-s6',
  bysymbol: 'a-s6', emotion: 'a-s6', tag: 'a-s6', timeofday: 'a-s6', scatter: 'a-s12', byday: 'a-s5', yearheat: 'a-s7',
};
const orderKey = (accountId: string) => `tradelogs.analytics.order.${accountId}`;
function sameOrder(a: BlockId[], b: BlockId[]) { return a.length === b.length && a.every((x, i) => x === b[i]); }
function normalizeOrder(saved: string[]): BlockId[] {
  const known = saved.filter((id): id is BlockId => (BLOCK_IDS as readonly string[]).includes(id));
  return [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))];
}
const EMOTION_ORDER = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const RANGE_LABEL: Record<RangeKey, string> = { '1W': 'last 7 days', '1M': 'last 30 days', '3M': 'last 3 months', '1Y': 'last 12 months', ALL: 'all time' };

export default function AnalyticsPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<RangeKey>('ALL');
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
  const rangedTrades = useMemo(() => {
    const start = rangeStart(range);
    return trades.filter(t => t.status === 'CLOSED' && t.closeTime && (start === null || new Date(t.closeTime).getTime() >= start));
  }, [trades, range]);

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
      case 'emotion': return <GroupBars testId="perf-by-emotion" title="Psychology edge" sub="P&L by emotion" rows={emotionStats} order={EMOTION_ORDER} empty="Log how you felt on a trade in Chart replay to see which states pay." />;
      case 'tag': return <GroupBars testId="perf-by-tag" title="Setup edge" sub="P&L by tag" rows={tagStats.slice(0, 8)} empty="Tag your setups in Chart replay or the journal to see which ones carry your edge." />;
      case 'timeofday': return <Hours trades={rangedTrades} />;
      case 'scatter': return <Scatter trades={rangedTrades} />;
      case 'byday': return <DayBars data={view.byDay} />;
      case 'yearheat': return <YearHeatmap trades={trades} accountId={selected?.id} />;
    }
  }

  const rangeSeg = (where: 'top' | 'page') => (
    <div className={`v3-seg d-range d-range--${where}`} role="group" aria-label="Date range" data-testid={where === 'top' ? 'range-selector' : undefined}>
      {RANGES.map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} data-testid={where === 'top' ? `range-${r}` : undefined}>{r === 'ALL' ? 'All' : r}</button>)}
    </div>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Analytics" actions={rangeSeg('top')}>
      <div className="v3-page" data-testid="analytics-page">
        <header className="a-head">
          <div>
            <p className="v3-sub" style={{ marginTop: 0 }}>Analytics · {RANGE_LABEL[range]}</p>
            <h1 className="v3-h1 a-h1"><b>Dissect your</b> <em>edge.</em></h1>
            {rangeSeg('page')}
          </div>
          {view && (
            <div className="a-arrange" data-testid="analytics-arrange-bar">
              <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden><circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" /><circle cx="2" cy="7" r="1.3" /><circle cx="8" cy="7" r="1.3" /><circle cx="2" cy="12" r="1.3" /><circle cx="8" cy="12" r="1.3" /></svg>
              <span>Drag cards to rearrange</span>
              {!isDefaultOrder && <>· <button className="v3-link" onClick={() => { persistOrder(DEFAULT_ORDER); toast.info('Layout reset'); }} data-testid="analytics-reset-layout">Reset layout</button></>}
            </div>
          )}
        </header>

        {error && !loading ? (
          <div className="d-err" role="alert" data-testid="analytics-error">
            <span>{error}</span><button className="v3-btn v3-btn--o" onClick={() => selected && loadStats(selected)}>Retry</button>
          </div>
        ) : !selected && !accountsLoading ? (
          <section className="v3-card d-empty d-empty--lg"><b>Connect your MT5 account</b>Analytics fill in once your first trades sync.</section>
        ) : loading || !view ? (
          <div className="d-grid">
            <div className="skel d-sk" style={{ height: 120, borderRadius: 20 }} />
            <div className="a-grid">{[5, 7, 12].map((n, i) => <div key={i} className={`skel d-sk a-s${n}`} style={{ height: 380, borderRadius: 20 }} />)}</div>
          </div>
        ) : (
          <>
            <AKpis view={view} />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="a-grid" data-testid="analytics-grid">
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
