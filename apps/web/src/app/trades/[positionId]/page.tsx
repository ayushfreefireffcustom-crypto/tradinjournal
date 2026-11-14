'use client';

// Trade review ("D · AI"): one position, reviewed. Everything comes from real
// data: GET /api/insights/trade-review (trade, fills, neighbours, process grade
// and flags, size vs usual, similar trades, same setup by hour) and market
// candles for the chart (best/worst while open, after the exit, the usual-hold
// exit). Anything that can't be computed is hidden — MT5 history has no stop
// moves and usually no stop, so there are no stop steps and no R unless stored.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CaretRight } from '@phosphor-icons/react';
import Link from '@/components/v6/ui/link';
import AppShell, { timeAgo } from '@/components/app-shell';
import { LoadingScreen } from '@/components/loader';
import { api, type BrokerAccount, type JournalEntry } from '@/lib/api';
import { persistSelectedAccountId } from '@/lib/use-accounts';
import { kmoney, money, pct } from '@/lib/dashboard-v2-format';
import {
  afterTheExit, candleWhatIf, excursion, noteFacts, ReviewError, tradeReviewApi, useReviewBars, type TradeReviewDTO,
} from '@/lib/trade-review-api';
import { AiFoot, Empty, Widget } from '@/components/dashboard-v2/ui';
import TradeChart from '@/components/trade-review/trade-chart';
import JournalNote from '@/components/trade-review/journal-note';
import { Executions, GradeBlock, ReviewKpis, SameSetupChart, SameSetupHead, SimilarBars, WhatIfLadder, type LadderRow } from '@/components/trade-review/parts';
import '@/components/dashboard-v2/dashboard-v2.css';
import '@/components/trade-review/trade-review.css';

const SESSION = { ASIA: 'Asia', LONDON: 'London', NY: 'New York' } as const;
type State = { status: 'loading' } | { status: 'ready'; data: TradeReviewDTO } | { status: 'notfound' } | { status: 'error'; error: string } | { status: 'noaccount' };

/** Decimals the instrument trades in, from the fills themselves, kept within what its price size needs. */
function priceDecimals(r: TradeReviewDTO): number {
  const xs = [r.trade.entry, r.trade.exit, ...r.trade.deals.map(d => d.price)].filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const dec = Math.max(0, ...xs.map(v => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }));
  const a = Math.abs(r.trade.entry);
  const [lo, hi] = a >= 1000 ? [1, 2] : a >= 100 ? [2, 3] : a >= 10 ? [2, 4] : [4, 5];
  return Math.min(hi, Math.max(lo, dec));
}

export default function TradeReviewPage() {
  return (
    <Suspense fallback={<div className="h-dvh"><LoadingScreen label="Loading trade" /></div>}>
      <TradeReview />
    </Suspense>
  );
}

function TradeReview() {
  const params = useParams<{ positionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const positionId = params.positionId;
  const accountId = searchParams.get('account');

  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [entry, setEntry] = useState<JournalEntry | null>(null);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      const acc = accs.find(a => a.id === accountId) ?? accs[0] ?? null;
      setSelected(acc);
      persistSelectedAccountId(acc?.id ?? null);
      if (!acc) { setState({ status: 'noaccount' }); return; }
      // The note is optional: the review still shows when the journal can't load.
      const [data, journal] = await Promise.all([tradeReviewApi.get(acc.id, positionId), api.journal.list(acc.id).catch(() => [] as JournalEntry[])]);
      setEntry(journal.filter(e => e.tradeId === positionId).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0] ?? null);
      setState({ status: 'ready', data });
    } catch (err) {
      if (err instanceof ReviewError && (err.code === 'TRADE_NOT_FOUND' || err.status === 404)) { setState({ status: 'notfound' }); return; }
      setState({ status: 'error', error: err instanceof Error ? err.message : 'Failed to load the trade' });
    }
  }, [accountId, positionId]);
  useEffect(() => { void load(); }, [load]);

  const r = state.status === 'ready' ? state.data : null;
  const t = r?.trade ?? null;
  const href = useCallback((id: string) => `/trades/${encodeURIComponent(id)}${selected ? `?account=${encodeURIComponent(selected.id)}` : ''}`, [selected]);
  const newer = r?.nav.newer ?? null, older = r?.nav.older ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input,textarea,select,[contenteditable=true]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' && newer) router.push(href(newer.positionId));
      if (e.key === 'ArrowRight' && older) router.push(href(older.positionId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newer, older, href, router]);

  // ── candle maths ──
  const bars = useReviewBars(t, selected?.id);
  const dec = r ? priceDecimals(r) : 2;
  const price = useCallback((v: number) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }), [dec]);
  const pv = r?.pointValue?.value ?? null;
  const ex = useMemo(() => {
    if (!t || bars.status !== 'ready') return null;
    const open = new Date(t.openTime).getTime();
    const end = t.closeTime ? new Date(t.closeTime).getTime() : bars.bars.at(-1)!.openTime + bars.win.tfMs;
    return excursion({ side: t.side, entry: t.entry, volume: t.volume }, open, end, bars.bars, bars.win.tfMs, pv);
  }, [t, bars, pv]);
  const after = useMemo(() => (t && bars.status === 'ready' ? afterTheExit(t, bars.bars, bars.win.to, pv) : null), [t, bars, pv]);
  const ladder = useMemo<LadderRow[]>(() => {
    if (!r || r.trade.status !== 'CLOSED') return [];
    const base: LadderRow[] = r.whatIf.length ? [...r.whatIf] : [{ key: 'actual', label: 'You', net: r.trade.net, delta: 0, note: 'What you took' }];
    const candle = bars.status === 'ready' ? candleWhatIf(r, bars.bars, bars.win.tfMs).map(c => ({ ...c, candle: true })) : [];
    const [me, ...rest] = base;
    return [me!, ...candle, ...rest];
  }, [r, bars]);
  const facts = useMemo(() => (r ? noteFacts(r, { excursion: ex, after, price }) : null), [r, ex, after, price]);

  // ── header ──
  const subtitle = selected
    ? <><i className="d2-live" aria-hidden />{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span>{selected.lastSyncAt ? <span className="trv-hide-s"> · synced {timeAgo(selected.lastSyncAt)}</span> : null}</>
    : undefined;
  const actions = (
    <div className="x-seg trv-nav" role="group" aria-label="Browse trades">
      <button type="button" disabled={!newer} onClick={() => newer && router.push(href(newer.positionId))} title="Newer trade (←)" aria-label="Newer trade" data-testid="nav-newer"><ArrowLeft size={14} /><span>Prev</span></button>
      <button type="button" disabled={!older} onClick={() => older && router.push(href(older.positionId))} title="Older trade (→)" aria-label="Older trade" data-testid="nav-older"><span>Next</span><ArrowRight size={14} /></button>
    </div>
  );

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} pageTitle="Trade review" pageSubtitle={subtitle} actions={r ? actions : null}>
      <div className="d2 trv" data-testid="trade-detail-page">
        {state.status === 'error' && (
          <div className="d2-banner" role="alert" data-testid="trade-detail-error">
            <span>{state.error}</span>
            <button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {state.status === 'loading' && <Skeleton />}
        {state.status === 'notfound' && (
          <section className="d2-card d2-connect" data-testid="trade-not-found">
            <h2>Position #{positionId} isn&rsquo;t on this account</h2>
            <p>It may belong to another broker account, or it hasn&rsquo;t synced yet.</p>
            <Link href="/trades" className="x-btn x-btn--hi">Back to trade log</Link>
          </section>
        )}
        {state.status === 'noaccount' && (
          <section className="d2-card d2-connect" data-testid="trade-no-account">
            <h2>No broker account connected</h2>
            <p>Connect your MT5 account to review your trades.</p>
            <Link href="/dashboard" className="x-btn x-btn--hi">Go to dashboard</Link>
          </section>
        )}
        {r && t && selected && (
          <>
            <div className="trv-hd">
              <nav className="trv-crumb" aria-label="Breadcrumb">
                <Link href="/trades" data-testid="back-to-trades">Trade log</Link><CaretRight size={12} aria-hidden />
                <h2 data-testid="trade-title"><span className="trv-sym">{t.symbol}</span> {t.side === 'LONG' ? 'long' : 'short'} · {new Date(t.openTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</h2>
              </nav>
              <span className="trv-meta">#{t.positionId} · trade {r.day.index} of {r.day.count} that day · {SESSION[r.session]} session{t.status === 'OPEN' ? ' · open' : ''}</span>
            </div>

            <ReviewKpis r={r} price={price} ex={ex} />

            <div className="d2-grid">
              <div className="d2-slot d2-s8 trv-s8">
                <Widget id="trade-chart" span={8} title={`${t.symbol} · ${bars.status === 'ready' ? tfName(bars.win.tf) : 'price'}`}
                  sub={bars.status === 'ready' ? `· entry${r.stop != null ? ', stop' : ''}${t.status === 'CLOSED' ? ', exit, after exit' : ', now'}` : undefined}
                  foot={chartFoot(r, after, ex)}>
                  {bars.status === 'loading' ? <div className="trv-sk" style={{ height: 340 }} aria-busy="true" />
                    : bars.status === 'none' ? <Empty title={`No ${t.symbol} candles for this trade`} note="The market data we use doesn't cover this symbol at that time, so there's no chart. Entry, exit and the numbers above are from your broker." />
                      : <TradeChart trade={t} bars={bars.bars} tfMs={bars.win.tfMs} stop={r.stop} exitReason={r.exitReason} excursion={ex} after={after} price={price} />}
                </Widget>
              </div>
              <div className="d2-slot d2-s4 trv-s4">
                <Widget id="grade" span={4} title="Process grade" sub="· against your rules" foot={gradeFoot(r, ladder)}>
                  <GradeBlock r={r} />
                  <WhatIfLadder rows={ladder} />
                </Widget>
              </div>
              <div className="d2-slot d2-s6">
                <Widget id="similar" span={6} title="Similar trades" sub={r.similar ? `· ${r.similar.criteria.join(', ')}` : undefined} foot={similarFoot(r)}>
                  {r.similar ? (
                    <>
                      <p className={`trv-sh1 ${r.similar.net < 0 ? 'dn' : r.similar.net > 0 ? 'up' : ''}`} data-testid="similar-head">{r.similar.wins} of {r.similar.n} won · {money(r.similar.net)}</p>
                      <SimilarBars s={r.similar} me={{ net: t.net, closed: t.status === 'CLOSED' }} href={href} />
                    </>
                  ) : <Empty title="No similar trades yet" note={`Nothing else on ${t.symbol} ${t.side === 'LONG' ? 'longs' : 'shorts'} to compare with. This fills in as you trade it.`} />}
                </Widget>
              </div>
              <div className="d2-slot d2-s6">
                <Widget id="same-setup" span={6} title="Same setup, your history" sub={`· ${t.symbol} ${t.side === 'LONG' ? 'longs' : 'shorts'} by UTC hour`} foot={setupFoot(r)}>
                  {r.sameSetup ? (
                    <>
                      <SameSetupHead s={r.sameSetup} />
                      <SameSetupChart s={r.sameSetup} me={{ net: t.net, closed: t.status === 'CLOSED' }} />
                    </>
                  ) : <Empty title="Not enough history" note={`Needs 3 or more closed ${t.symbol} ${t.side === 'LONG' ? 'longs' : 'shorts'}.`} />}
                </Widget>
              </div>
              <div className="d2-slot d2-s12">
                <JournalNote accountId={selected.id} positionId={t.positionId} entry={entry} onSaved={setEntry} facts={facts} entryDate={t.closeTime ?? t.openTime} />
              </div>
              <div className="d2-slot d2-s12">
                <Widget id="executions" span={12} title="Executions & P&L" sub={`· ${t.deals.length} deal${t.deals.length === 1 ? '' : 's'}`}>
                  <Executions r={r} price={price} />
                </Widget>
              </div>
            </div>

            <details className="d2-how" id="trv-how">
              <summary>How this review is computed</summary>
              <ul>
                <li>Everything comes from your broker&rsquo;s fills for this account. Hours and sessions are UTC by the trade&rsquo;s open (Asia 22–07, London 07–13, New York 13–22).</li>
                <li>Process grade ({r.minTrades}+ closed trades, your whole history as the baseline): one step down per flag — after 2 losses in a row that day, within 15 min of a loss, more than 1.5× your usual size on this symbol, a UTC hour that is net negative for you, a loss past −1.25R (needs R). None A, one B, two C, three D, four or more F. It grades process, not the result.</li>
                <li>What I would have done: your usual size scales the P&amp;L by volume; skipped is $0 and only shows when a rule was broken before entry; the usual-hold exit uses the close of the bar where your median hold on this symbol ended. Exits at +1R and break-even need the stop at entry, which MT5 history doesn&rsquo;t keep, so they show only when an R-multiple is stored.</li>
                <li>Chart: market candles from our data provider around your fills. Best point while open and &ldquo;ran further&rdquo; are read from those bars (bar precision). Stop changes aren&rsquo;t recorded, so stop moves aren&rsquo;t shown.</li>
                <li>Similar trades: closed trades with the same symbol, side, session and the same pre-entry flags, relaxed step by step until there are at least 3.</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </AppShell>
  );
}

const tfName = (tf: string) => ({ '5m': '5 min', '15m': '15 min', '30m': '30 min', '1h': '1 hour', '4h': '4 hour', '1d': 'daily' } as Record<string, string>)[tf] ?? tf;

function chartFoot(r: TradeReviewDTO, after: ReturnType<typeof afterTheExit>, ex: ReturnType<typeof excursion>) {
  const t = r.trade;
  if (t.status === 'CLOSED' && after) {
    if (after.leftMoney != null && after.leftMoney >= Math.max(1, Math.abs(t.net) * 0.1) && after.extra > 0) return <AiFoot line={{ text: 'After your exit it ran further:', value: after.leftMoney, fmt: 'money', tone: 'flat', trades: 1 }} />;
    if (after.savedMoney != null && after.savedMoney >= Math.max(1, Math.abs(t.net) * 0.1)) return <AiFoot line={{ text: 'Your exit saved', value: after.savedMoney, fmt: 'money', tone: 'up', trades: 1 }} />;
    return <AiFoot line={{ text: 'Clean exit: price didn’t run much either way after it', value: null, fmt: 'text', tone: 'flat', trades: 1 }} />;
  }
  if (t.status === 'OPEN' && ex?.worstMoney != null) return <AiFoot line={{ text: 'Worst point so far:', value: ex.worstMoney, fmt: 'money', tone: 'dn', trades: 1 }} />;
  return null;
}

function gradeFoot(r: TradeReviewDTO, ladder: LadderRow[]) {
  const best = ladder.slice(1).filter(x => x.delta > 0.5).sort((a, b) => b.delta - a.delta)[0];
  if (best) return <AiFoot line={{ text: `${best.key === 'skip' ? 'Skip it' : best.label}: saves`, value: best.delta, fmt: 'money', tone: 'up', trades: 1 }} link="How graded" href="#trv-how" />;
  if (r.grade) return <AiFoot line={{ text: r.grade.flags.length ? `${r.grade.flags.length} flag${r.grade.flags.length === 1 ? '' : 's'} · ${r.grade.basis} trades` : `Rules kept · ${r.grade.basis} trades`, value: null, fmt: 'text', tone: 'flat', trades: r.grade.basis }} link="How graded" href="#trv-how" />;
  return null;
}

function similarFoot(r: TradeReviewDTO) {
  const s = r.similar;
  if (!s || s.n < 3) return null;
  const flagged = r.grade?.flags.some(f => f.key !== 'past-r') && s.criteria.some(c => /After|Within|Oversized|Losing/.test(c));
  if (flagged && s.net < 0) return <AiFoot line={{ text: `Skipping all ${s.n} would have kept`, value: -s.net, fmt: 'money', tone: 'up', trades: s.n }} />;
  return <AiFoot line={{ text: `${s.n} trades · ${pct(s.wins / s.n)} won · net`, value: s.net, fmt: 'money', tone: s.net > 0 ? 'up' : s.net < 0 ? 'dn' : 'flat', trades: s.n }} />;
}

function setupFoot(r: TradeReviewDTO) {
  const s = r.sameSetup;
  if (!s) return null;
  const n = s.inHour.n + s.other.n;
  const h = String(Math.floor(s.hour)).padStart(2, '0');
  const what = `${s.symbol} ${s.side === 'LONG' ? 'longs' : 'shorts'}`;
  const tn = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : 'flat') as 'up' | 'dn' | 'flat';
  if (!s.inHour.n) return <AiFoot line={{ text: `First of your ${what} at ${h}:00 UTC · other hours:`, value: s.other.net, fmt: 'money', tone: tn(s.other.net), trades: n }} />;
  return <AiFoot line={{ text: `${what} at ${h}:00 UTC: ${s.inHour.wins}/${s.inHour.n} won ·`, value: s.inHour.net, fmt: 'money', tone: tn(s.inHour.net), trades: n, suffix: `· ${kmoney(s.inHour.net + s.other.net)} all hours` }} />;
}

function Skeleton() {
  return (
    <div className="d2-skel" aria-busy="true" data-testid="trade-review-loading">
      <div className="d2-sk" style={{ height: 44, borderRadius: 10, width: '50%' }} />
      <div className="d2-sk" style={{ height: 92, borderRadius: 10 }} />
      <div className="d2-grid">
        <div className="d2-slot d2-s8"><div className="d2-sk" style={{ height: 420, borderRadius: 10 }} /></div>
        <div className="d2-slot d2-s4"><div className="d2-sk" style={{ height: 420, borderRadius: 10 }} /></div>
      </div>
    </div>
  );
}
