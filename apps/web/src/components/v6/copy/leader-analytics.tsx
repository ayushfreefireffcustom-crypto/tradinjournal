'use client';

// Leader analytics (C4.3b): the dashboard's own analytics cards, fed with the
// leader's closed round trips instead of MT5 trades. Same maths (computeStats),
// same charts, so a leader reads exactly like your own journal.
import { useMemo } from 'react';
import type { Trade } from '@/lib/api';
import { computeStats } from '@/lib/stats';
import { Direction, Dist, Equity, Hours, KpiStrip, Strike, SymbolTable, DayBars } from '@/components/v6/analytics/cards';
import YearHeatmap from '@/components/v6/analytics/year-heatmap';
import { leadersApi, type LeaderRange, type LeaderRoundTrips } from '@/lib/copy-api';
import { useLoad } from './parts';

const DAY = 24 * 3600_000;
const RANGE_MS: Record<LeaderRange, number> = { '7d': 7 * DAY, '30d': 30 * DAY, all: 0 };

/** Round trips in the journal's Trade shape. Fees and funding aren't in the fills, so net = gross. */
export function tripsToTrades(r: LeaderRoundTrips): Trade[] {
  return r.trades.map((t, i) => ({
    positionId: `${t.symbol}-${t.closedAt}-${i}`,
    symbol: t.symbol,
    direction: t.side,
    status: 'CLOSED',
    openTime: t.openedAt,
    closeTime: t.closedAt,
    entryPrice: t.avgEntry,
    exitPrice: t.avgExit,
    volume: t.qty,
    grossPnl: t.pnlUsd,
    commission: 0,
    swap: 0,
    netPnl: t.pnlUsd,
    durationSecs: Math.max(0, Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 1000)),
    deals: [],
  }));
}

export default function LeaderAnalytics({ leaderId, range }: { leaderId: string; range: LeaderRange }) {
  const trips = useLoad(() => leadersApi.roundTrips(leaderId), [leaderId]);
  return (
    <section aria-label="Performance" data-testid="leader-analytics" className="cp-an">
      <div className="x-ch"><h2>Performance</h2><span className="x-sub">closed trades rebuilt from the leader&rsquo;s fills · price P&amp;L before fees and funding</span></div>
      {trips.error ? <p className="x-muted">{trips.error}</p> : (
        <TripAnalytics trips={trips.data} range={range} testId="leader-analytics-empty"
          empty="Charts appear once the leader closes a trade they opened after we started tracking their account." />
      )}
    </section>
  );
}

/**
 * The dashboard's analytics cards over round trips (a leader's, or your own
 * exchange account's). Same maths and charts as the journal.
 */
export function TripAnalytics({ trips, range, empty, testId }: { trips: LeaderRoundTrips | null; range: LeaderRange; empty: string; testId: string }) {
  const all = useMemo(() => (trips ? tripsToTrades(trips) : null), [trips]);
  const ranged = useMemo(() => {
    if (!all) return null;
    const since = RANGE_MS[range] ? Date.now() - RANGE_MS[range] : 0;
    return all.filter(t => new Date(t.closeTime!).getTime() >= since);
  }, [all, range]);
  // Starting point for the curve: the first equity we recorded. Without one the curve starts at $0 and shows P&L only.
  const view = useMemo(() => (ranged ? computeStats(ranged, trips?.startingEquityUsd ?? 0) : null), [ranged, trips]);
  if (!view || !ranged || !all) return <div className="an-grid">{[12, 7, 5].map((n, i) => <div key={i} className={`x-skel an-s${n}`} style={{ height: n === 12 ? 110 : 300 }} />)}</div>;
  if (!all.length) return <div className="x-card x-empty" data-testid={testId}><b>No closed trades yet</b><p>{empty}</p></div>;
  return (
    <>
      <KpiStrip view={view} />
      {ranged.length === 0 && <p className="x-muted cp-pad">No trades closed in this range. Try All time.</p>}
      <div className="an-grid">
        <div className="an-s7"><Equity view={view} /></div>
        <div className="an-s5"><Strike view={view} /></div>
        <div className="an-s6"><Dist trades={ranged} /></div>
        <div className="an-s6"><Hours trades={ranged} /></div>
        <div className="an-s6"><SymbolTable rows={view.bySymbol} /></div>
        <div className="an-s6"><Direction view={view} /></div>
        <div className="an-s12"><DayBars data={view.byDay} /></div>
        <div className="an-s12"><YearHeatmap trades={all} /></div>
      </div>
    </>
  );
}
