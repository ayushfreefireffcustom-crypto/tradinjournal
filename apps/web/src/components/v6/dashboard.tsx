'use client';

// v6 dashboard cards, modelled on the clean reference layout: one greeting card
// with the weekly review, a week strip, three "edge" screens and a performance
// summary. Every figure comes from the trader's own trades.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, type AccountStats, type AiReport, type BrokerAccount, type JournalEntry, type Trade } from '@/lib/api';
import type { Insight } from '@/lib/insights';
import {
  fmtHold, fmtPct, fmtUsd, holdStudy, sessionStudy, symbolBars, weekSummary, weeklyReview,
} from '@/lib/dashboard-v6';
import MarkdownMessage from '@/components/coach/markdown-message';
import { IChevronDown, IPlus, ISync } from '@/components/v3/icons';
import { EquityScreen, HoldScreen, Screen, SessionScreen, SymbolScreen } from './screens';
import '@/styles/v6/dashboard.css';

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>;
}

// ─── greeting + weekly review ────────────────────────────────────────────────

export function HelloCard({
  wide, greeting, name, account, view, trades, journal, rangeLabel, onConnect,
}: {
  wide?: boolean; greeting: string; name: string; account: BrokerAccount | null; view: AccountStats | null; trades: Trade[]; journal: JournalEntry[];
  rangeLabel: string; onConnect: () => void;
}) {
  const review = account && view ? weeklyReview(trades, journal) : null;
  const segs = review ? Math.min(review.total, 12) : 0;
  const on = review ? Math.round((review.journaled / review.total) * segs) : 0;
  const done = review != null && review.nextTradeId == null;

  return (
    <section className={`x-box x-hello ${wide ? 'x-wide' : ''}`} data-testid="dash-hello">
      <div className="x-bh">
        <div>
          <h1 className="x-h1">{greeting}, {name}</h1>
          <p className="x-sub">{account ? <>Here&rsquo;s where your trading stands on <b>{account.broker}</b>.</> : 'Connect a broker and your dashboard fills itself in.'}</p>
        </div>
        {account && <Link className="x-btn x-hide-m" href="/notebook">Open journal</Link>}
      </div>

      <div className="x-inner">
        {!account ? (
          <div>
            <div className="x-eyebrow">Get started</div>
            <h2 className="x-h3">Connect your MT5 account</h2>
            <p className="x-sub x-sub--tight">Read-only, with your investor password. Your history imports in about a minute.</p>
            <div className="x-actions"><button className="x-btn x-btn--hi" onClick={onConnect} data-testid="dashboard-connect"><IPlus size={15} />Connect MT5</button></div>
          </div>
        ) : review ? (
          <div>
            <div className="x-eyebrow">Up next · Weekly review</div>
            <h2 className="x-h3">Week {review.week} review{review.which === 'last' ? ' (last week)' : ''}</h2>
            <p className="x-sub x-sub--tight">{review.line}</p>
            <div className="x-segs" style={{ gridTemplateColumns: `repeat(${segs}, minmax(0, 1fr))` }} aria-hidden>
              {Array.from({ length: segs }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}
            </div>
            <div className="x-meta num">{review.journaled} of {review.total} trade{review.total === 1 ? '' : 's'} journaled</div>
            <div className="x-actions">
              {done
                ? <Link className="x-btn x-btn--hi" href="/coach">Ask the coach</Link>
                : <Link className="x-btn x-btn--hi" href={`/journal?trade=${encodeURIComponent(review.nextTradeId!)}`} data-testid="review-continue">{review.journaled ? 'Continue' : 'Start'}</Link>}
              <Link className="x-btn" href="/trades">Trades</Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="x-eyebrow">Up next</div>
            <h2 className="x-h3">{view && view.totalTrades > 0 ? 'No trades in the last two weeks' : 'Waiting for your first closed trade'}</h2>
            <p className="x-sub x-sub--tight">Your weekly review fills in after your next closed trade.</p>
            <div className="x-actions"><Link className="x-btn x-btn--hi" href="/trades">Trades</Link><Link className="x-btn" href="/brokers">Brokers</Link></div>
          </div>
        )}
        {account && view
          ? <EquityScreen curve={view.equityCurve} caption={`Equity · ${account.broker} · ${rangeLabel.toLowerCase()} · USD`} />
          : <Screen caption="Equity · USD" className="s-eq" empty="Your equity curve appears here." />}
      </div>
    </section>
  );
}

// ─── this week ───────────────────────────────────────────────────────────────

export function WeekCard({ trades, insight }: { trades: Trade[]; insight: Insight | null }) {
  const wk = weekSummary(trades);
  const today = wk.days.find(d => d.isToday);
  const left = wk.days.filter(d => d.isFuture && !d.isWeekend).length;
  const openLine = today && !today.isWeekend
    ? left > 0 ? `${left + 1} trading days left, counting today.` : `${today.name} is still open.`
    : left > 0 ? `${left} trading day${left === 1 ? '' : 's'} left.` : 'The trading week is done.';
  const has = wk.trades.length > 0;
  return (
    <section className="x-box x-week" data-testid="dash-week">
      <div className="x-bh"><h2 className="x-h2">This week</h2><span className="x-aside">{wk.month}</span></div>
      <div className="x-big">
        <span className={`x-n num ${has ? (wk.net > 0 ? '' : wk.net < 0 ? 'neg' : '') : 'x-muted'}`}>{has ? fmtUsd(wk.net, 0) : '—'}</span>
        <span>{has ? 'net this week' : 'no closed trades yet'}</span>
      </div>
      <p className="x-small">
        {has ? `${wk.greenDays} green day${wk.greenDays === 1 ? '' : 's'}, ${wk.redDays} red. ` : ''}
        {openLine}
      </p>
      <div className="x-days" role="list" aria-label="Days this week">
        {wk.days.map((d, i) => {
          const tone = d.trades === 0 ? '' : d.net > 0 ? 'gd' : d.net < 0 ? 'rd' : 'fl';
          const label = `${d.name} ${d.date}: ${d.trades ? `${fmtUsd(d.net)} on ${d.trades} trade${d.trades === 1 ? '' : 's'}` : 'no trades'}`;
          return (
            <div key={i} role="listitem" className={`${tone} ${d.isToday ? 'today' : ''} ${d.isWeekend ? 'off' : ''}`} title={label} aria-label={label}>
              <span>{d.letter}</span><b>{d.date}</b>
            </div>
          );
        })}
      </div>
      {insight && <p className="x-note">{insight.text}</p>}
      <Link className="x-btn x-btn--full" href="/calendar">Open calendar</Link>
    </section>
  );
}

// ─── your edge ───────────────────────────────────────────────────────────────

function Prog({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="x-prog">
      <span className="x-track"><i style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></span>
      <span className="num">{value == null ? '—' : label}</span>
    </div>
  );
}

export function EdgeCard({ trades, rangeLabel }: { trades: Trade[]; rangeLabel: string }) {
  const bars = symbolBars(trades);
  const hold = holdStudy(trades);
  const sess = sessionStudy(trades);
  const lead = [...bars].sort((a, b) => b.net - a.net)[0];
  const ratio = hold.winnerToLoser;
  const holdLine = ratio == null ? 'Needs winners and losers'
    : ratio >= 1 ? `Winners held ${ratio.toFixed(1)}× longer` : `Losers held ${(1 / ratio).toFixed(1)}× longer`;
  return (
    <section className="x-box x-edge" data-testid="dash-edge">
      <div className="x-bh">
        <div>
          <div className="x-eyebrow">Analytics · what&rsquo;s working</div>
          <h2 className="x-h2 x-h2--lg">Your edge</h2>
          <p className="x-small">{trades.length} closed trade{trades.length === 1 ? '' : 's'} · {rangeLabel.toLowerCase()}</p>
        </div>
        <Link className="x-btn x-hide-m" href="/analytics">View analytics</Link>
      </div>
      <div className="x-cards">
        <article className="x-card">
          <SymbolScreen bars={bars} />
          <h3>By symbol</h3>
          <p>{bars.length ? `${bars.length} symbol${bars.length === 1 ? '' : 's'} · ${lead!.symbol} leads ${fmtUsd(lead!.net, 0)}` : 'No symbols yet'}</p>
          <Prog value={lead ? lead.winRate : null} label={lead ? `${fmtPct(lead.winRate, 0)} won` : ''} />
        </article>
        <article className="x-card">
          <HoldScreen study={hold} />
          <h3>Hold time</h3>
          <p>{holdLine}</p>
          <Prog value={hold.longWinRate} label={hold.longWinRate == null ? '' : `${fmtPct(hold.longWinRate, 0)} won past ${fmtHold(hold.medianSecs)}`} />
        </article>
        <article className="x-card">
          <SessionScreen study={sess} />
          <h3>By session</h3>
          <p>{sess.best ? `${sess.best.key} · ${sess.best.trades} trade${sess.best.trades === 1 ? '' : 's'} · ${fmtUsd(sess.best.net, 0)}` : 'No sessions yet'}</p>
          <Prog value={sess.best ? sess.best.wins / sess.best.trades : null} label={sess.best ? `${fmtPct(sess.best.wins / sess.best.trades, 0)} won` : ''} />
        </article>
      </div>
      <Link className="x-btn x-btn--full x-show-m" href="/analytics">View analytics</Link>
    </section>
  );
}

// ─── performance ─────────────────────────────────────────────────────────────

export function PerformanceCard({ view, trades, broker, rangeLabel }: { view: AccountStats; trades: Trade[]; broker: string; rangeLabel: string }) {
  const n = view.totalTrades;
  const pf = view.profitFactor >= 999 ? '∞' : n ? view.profitFactor.toFixed(2) : '—';
  const exp = n ? fmtUsd(view.netPnl / n, 0) : '—';
  return (
    <section className="x-box x-perf" data-testid="dash-performance">
      <div className="x-bh"><h2 className="x-h2">Performance</h2><span className="x-aside">{rangeLabel}</span></div>
      <div className="x-big"><span className="x-n num">{n ? fmtPct(view.winRate) : '—'}</span><span>win rate</span></div>
      <p className="x-small">Across {n} closed trade{n === 1 ? '' : 's'} on {broker}.</p>
      <div className="x-strip">
        <div><b className="num">{pf}</b><span>Profit factor</span></div>
        <div><b className={`num ${n && view.netPnl < 0 ? 'neg' : ''}`}>{exp}</b><span>Expectancy</span></div>
        <div><b className="num">{n ? fmtPct(view.maxDrawdownPct) : '—'}</b><span>Max drawdown</span></div>
      </div>
      <ul className="x-rows" aria-label="Latest trades">
        {trades.slice(0, 3).map(t => (
          <li key={t.positionId}>
            <Link href={`/trades/${encodeURIComponent(t.positionId)}`} data-testid="recent-trade">
              <span className="x-sym">{t.symbol}</span>
              <span className="x-side">{t.direction === 'LONG' ? 'Long' : 'Short'} · {fmtHold(t.durationSecs)}</span>
              <span className={`x-v num ${t.netPnl > 0 ? 'pos' : t.netPnl < 0 ? 'neg' : ''}`}>{fmtUsd(t.netPnl)}</span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      <Link className="x-btn x-btn--full" href="/trades">View all {n} trade{n === 1 ? '' : 's'}</Link>
    </section>
  );
}

// ─── coach review (AI) ───────────────────────────────────────────────────────

function writtenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = (Date.now() - d.getTime()) / 3600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `on ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

/** The written review, cached server-side. Hides itself if AI is off or fails. */
export function CoachReview({ accountId }: { accountId: string | null }) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true); setFailed(false); setReport(null); setOpen(false);
    api.ai.report(accountId)
      .then(r => { if (alive) setReport(r); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId]);

  const refresh = useCallback(async () => {
    if (!accountId || refreshing) return;
    setRefreshing(true);
    try { setReport(await api.ai.report(accountId, true)); } catch { /* keep the current review */ } finally { setRefreshing(false); }
  }, [accountId, refreshing]);

  if (!accountId || failed) return null;
  return (
    <section className="x-box x-coach x-wide" data-testid="ai-report-card">
      <div className="x-bh">
        <div>
          <div className="x-eyebrow">AI coach</div>
          <h2 className="x-h2 x-h2--lg">Coach review</h2>
          <p className="x-small">{report ? (report.generated ? `Written ${writtenLabel(report.updatedAt)}` : 'Rule-based summary') : 'Writing your review…'} · not financial advice</p>
        </div>
        <button className="x-btn" onClick={refresh} disabled={loading || refreshing} data-testid="ai-report-refresh">
          <ISync size={15} className={refreshing ? 'spin' : undefined} />{refreshing ? 'Rewriting' : 'Rewrite'}
        </button>
      </div>
      {loading ? (
        <div className="x-coach-sk" data-testid="ai-report-loading">{[92, 76, 60].map(w => <i key={w} className="x-skel" style={{ width: `${w}%` }} />)}</div>
      ) : report && (
        <>
          <div className={`x-coach-bd ${open ? 'open' : ''}`}><MarkdownMessage content={report.content} /></div>
          {report.stale && <p className="x-small">Couldn&rsquo;t refresh, so this is the last review.</p>}
          <button className="x-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? 'Show less' : 'Read the full review'}<IChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </button>
        </>
      )}
    </section>
  );
}

export function DashSkeleton() {
  return (
    <div className="x-grid" aria-busy="true" aria-label="Loading your dashboard">
      {[380, 380, 420, 420].map((h, i) => <div key={i} className="x-box x-skel" style={{ height: h }} />)}
    </div>
  );
}

/** Top-bar date range menu (styled with the frame's popover). */
export function RangeMenu<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string; short?: string }[]; onChange: (k: K) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest?.('[data-range-menu]')) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const current = options.find(o => o.key === value)!;
  return (
    <div className="f-pop-wrap" data-range-menu>
      <button className="f-acct x-range" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="range-selector">
        <b className="x-range-l">{current.label}</b><b className="x-range-s">{current.short ?? current.label}</b><IChevronDown size={14} />
      </button>
      {open && (
        <div className="f-pop x-range-pop" role="menu">
          {options.map(o => (
            <button key={o.key} role="menuitemradio" aria-checked={o.key === value} onClick={() => { onChange(o.key); setOpen(false); }} data-testid={`range-${o.key}`}>
              <span className="f-pop-main"><b>{o.label}</b></span>
              {o.key === value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
