'use client';

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import DealsTable from '@/components/deals-table';
import { api, type BrokerAccount, type Deal, type Trade, type JournalEntry } from '@/lib/api';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];

function fmtDur(s: number | null) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function price(v: number | null | undefined, symbol: string) {
  if (v == null) return '—';
  const dp = symbol === 'USDJPY' ? 3 : symbol === 'BTCUSD' || symbol.includes('100') || symbol.includes('30') ? 1 : 5;
  return v.toFixed(dp);
}

export default function TradeDetailPage() {
  return (
    <Suspense fallback={null}>
      <TradeDetail />
    </Suspense>
  );
}

function TradeDetail() {
  const params = useParams<{ positionId: string }>();
  const searchParams = useSearchParams();
  const positionId = params.positionId;
  const accountId = searchParams.get('account');

  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      const acc = accs.find(a => a.id === accountId) ?? accs[0] ?? null;
      setSelected(acc);
      if (!acc) { setLoading(false); return; }

      const [trades, allDeals, journal] = await Promise.all([
        api.trades.list(acc.id),
        api.trades.deals(acc.id),
        api.journal.list(acc.id),
      ]);
      setTrade(trades.find(t => t.positionId === positionId) ?? null);
      setDeals(allDeals.filter(d => d.positionId === positionId));
      setEntry(journal.find(e => e.tradeId === positionId) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trade');
    } finally {
      setLoading(false);
    }
  }, [accountId, positionId]);
  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => {
    if (!trade) return [];
    const sym = trade.symbol;
    const pos = trade.netPnl >= 0;
    return [
      { l: 'Net P&L', v: `${pos ? '+' : ''}$${trade.netPnl.toFixed(2)}`, c: pos ? 'text-profit' : 'text-loss' },
      { l: 'Gross P&L', v: `${trade.grossPnl >= 0 ? '+' : ''}$${trade.grossPnl.toFixed(2)}`, c: trade.grossPnl >= 0 ? 'text-profit' : 'text-loss' },
      { l: 'Volume', v: `${trade.volume.toFixed(2)} lots`, c: 'text-fg' },
      { l: 'Held', v: fmtDur(trade.durationSecs), c: 'text-fg' },
      { l: 'Entry', v: price(trade.entryPrice, sym), c: 'text-fg' },
      { l: 'Exit', v: price(trade.exitPrice, sym), c: 'text-fg' },
      { l: 'Commission', v: `$${trade.commission.toFixed(2)}`, c: 'text-fg-2' },
      { l: 'Swap', v: `$${trade.swap.toFixed(2)}`, c: 'text-fg-2' },
    ];
  }, [trade]);

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      pageTitle="Trade"
      pageSubtitle="// POSITION DETAIL"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto fade-up" data-testid="trade-detail-page">
        <Link href="/trades" className="text-[10px] tracking-[0.22em] text-fg-3 hover:text-fg" data-testid="back-to-trades">← TRADE LOG</Link>

        {error && (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 my-4 flex items-center justify-between gap-3 text-[12px]" data-testid="trade-detail-error">
            <span className="text-loss">{error}</span>
            <button onClick={load} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        {loading ? (
          <div className="tcard p-6 h-40 mt-4 animate-pulse bg-surface" />
        ) : !trade ? (
          <div className="tcard p-10 text-center text-fg-3 text-[12px] mt-4" data-testid="trade-not-found">
            Trade #{positionId} was not found on this account.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-end justify-between gap-4 flex-wrap mt-3 mb-6">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-fg-3">POSITION #{trade.positionId}</div>
                <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2 flex items-center gap-3 flex-wrap">
                  {trade.symbol}
                  <span className={`text-sm tracking-[0.15em] ${trade.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>
                    {trade.direction === 'LONG' ? '↗ LONG' : '↘ SHORT'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 border tracking-widest ${trade.status === 'OPEN' ? 'border-warning/40 text-warning' : 'border-border-soft text-fg-3'}`}>
                    {trade.status}
                  </span>
                </h1>
                <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest mt-2 numeric">
                  {fmtTime(trade.openTime)} → {fmtTime(trade.closeTime)}
                </div>
              </div>
              <div className={`font-display font-black text-4xl sm:text-5xl tracking-tighter numeric ${trade.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(2)}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" data-testid="trade-metrics">
              {metrics.map(m => (
                <div key={m.l} className="tcard p-4">
                  <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{m.l}</div>
                  <div className={`font-display font-bold text-xl tracking-tight mt-2 numeric ${m.c}`}>{m.v}</div>
                </div>
              ))}
            </div>

            {/* Journal entry */}
            <div className="tcard p-5 mb-3" data-testid="trade-journal">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-fg-3">JOURNAL_ENTRY</div>
                  <div className="font-display font-bold text-[16px] tracking-tight mt-1">Notes for this trade</div>
                </div>
                <Link href="/journal" className="text-[10px] tracking-[0.22em] text-fg-3 hover:text-fg shrink-0">EDIT IN CHART REPLAY →</Link>
              </div>
              {entry ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {entry.emotion && (
                      <span className={`px-2 py-1 text-[10px] tracking-widest border ${NEGATIVE_EMOTIONS.includes(entry.emotion) ? 'border-loss/50 text-loss' : 'border-profit/50 text-profit'}`}>
                        {entry.emotion.toUpperCase()}
                      </span>
                    )}
                    {(entry.tags ?? []).map(t => (
                      <span key={t} className="px-2 py-1 text-[10px] tracking-widest border border-border-soft text-fg-3">{t.toUpperCase()}</span>
                    ))}
                  </div>
                  {entry.body && <p className="text-[13px] text-fg-2 leading-relaxed whitespace-pre-wrap break-words">{entry.body}</p>}
                </div>
              ) : (
                <div className="text-fg-3 text-[12px] py-4">No journal entry for this trade yet.</div>
              )}
            </div>

            {/* Deals */}
            <div>
              <div className="text-[10px] tracking-[0.25em] text-fg-3 mb-2">EXECUTIONS · {deals.length} DEALS</div>
              <DealsTable deals={deals} loading={false} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
