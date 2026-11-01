'use client';

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { LoadingScreen } from '@/components/loader';
import { api, type BrokerAccount, type Deal, type Trade, type JournalEntry } from '@/lib/api';
import { persistSelectedAccountId } from '@/lib/use-accounts';
import { IArrowLeft, IArrowRight } from '@/components/v3/icons';
import { useTradeCandles } from '@/components/v3/trade-candles';
import { TradeCandles } from '@/components/v6/trades/trade-candles';
import { pctOfBalance } from '@/components/v6/trades/trade-log';
import { SideChip } from '@/components/v6/desk';
import { fmtHold, fmtUsd } from '@/lib/dashboard-v6';
import { fmtPrice, marketKind, tagTone, tickerMark } from '@/lib/desk';
import '@/styles/v6/trades.css';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];
const ENTRY: Record<Deal['entry'], string> = { IN: 'In', OUT: 'Out', INOUT: 'In/out', OUT_BY: 'Out by' };
const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

/** "Oct 19 09:59 → 11:40", with the close day added when it differs. 24h, like the trade log. */
function when(t: Trade) {
  const o = new Date(t.openTime);
  if (!t.closeTime) return `${day(o)} ${hm(o)} → open`;
  const c = new Date(t.closeTime);
  return `${day(o)} ${hm(o)} → ${o.toDateString() === c.toDateString() ? '' : `${day(c)} `}${hm(c)}`;
}

export default function TradeDetailPage() {
  return (
    <Suspense fallback={<div className="h-dvh"><LoadingScreen label="Loading trade" /></div>}>
      <TradeDetail />
    </Suspense>
  );
}

function TradeDetail() {
  const params = useParams<{ positionId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const positionId = params.positionId;
  const accountId = searchParams.get('account');

  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
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
      // Remember this account so navigating back to the main sections keeps it.
      persistSelectedAccountId(acc?.id ?? null);
      if (!acc) { setLoading(false); return; }
      // Stats only supply the balance for "% of balance"; the page works without them.
      const [t, allDeals, journal, stats] = await Promise.all([api.trades.list(acc.id), api.trades.deals(acc.id), api.journal.list(acc.id), api.trades.stats(acc.id).catch(() => null)]);
      setBalance(stats?.currentEquity ?? null);
      setTrades(t);
      setDeals(allDeals.filter(d => d.positionId === positionId).sort((a, b) => +new Date(a.dealTime) - +new Date(b.dealTime)));
      setEntry(journal.find(e => e.tradeId === positionId) ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trade');
    } finally {
      setLoading(false);
    }
  }, [accountId, positionId]);
  useEffect(() => { load(); }, [load]);

  const trade = useMemo(() => trades.find(t => t.positionId === positionId) ?? null, [trades, positionId]);
  // Neighbours in trade-log order (newest first): ← newer, → older.
  const { newer, older } = useMemo(() => {
    const at = (t: Trade) => (t.closeTime ? +new Date(t.closeTime) : 8e15 + +new Date(t.openTime));
    const list = [...trades].sort((a, b) => at(b) - at(a));
    const i = list.findIndex(t => t.positionId === positionId);
    return { newer: i > 0 ? list[i - 1] : undefined, older: i >= 0 ? list[i + 1] : undefined };
  }, [trades, positionId]);
  const href = (t: Trade) => `/trades/${t.positionId}${selected ? `?account=${encodeURIComponent(selected.id)}` : ''}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input,textarea,select,[contenteditable=true]') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft' && newer) router.push(href(newer));
      if (e.key === 'ArrowRight' && older) router.push(href(older));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const candles = useTradeCandles(trade, selected?.id);

  const actions = (
    <>
      <Link href="/trades" className="x-btn tr-back" data-testid="back-to-trades" aria-label="Back to trade log"><IArrowLeft size={15} /><span>Trade log</span></Link>
      {trade && (
        <div className="x-seg tr-nav" role="group" aria-label="Browse trades">
          <button disabled={!newer} onClick={() => newer && router.push(href(newer))} aria-label="Newer trade" title="Newer trade (←)"><IArrowLeft size={14} /></button>
          <button disabled={!older} onClick={() => older && router.push(href(older))} aria-label="Older trade" title="Older trade (→)"><IArrowRight size={14} /></button>
        </div>
      )}
    </>
  );
  const subtitle = trade
    ? <>{trade.symbol} · {trade.direction === 'LONG' ? 'Long' : 'Short'}{selected ? ` · ${selected.broker}` : ''}</>
    : selected?.broker;
  const pct = trade ? pctOfBalance(trade.netPnl, balance) : '';
  const kind = trade ? marketKind(trade.symbol) : '';
  const journalHref = trade ? `/journal?trade=${encodeURIComponent(trade.positionId)}` : '/journal';
  const dealRow = (d: Deal) => {
    const p = parseFloat(d.profit), c = parseFloat(d.commission);
    const noPnl = d.entry === 'IN' && !p;
    return { p, c, noPnl, type: d.type === 'BUY' ? 'Buy' : d.type === 'SELL' ? 'Sell' : 'Balance' };
  };

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} pageTitle={`Position #${positionId}`} pageSubtitle={subtitle} actions={actions}>
      <div className="tr-page" data-testid="trade-detail-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="trade-detail-error">
            <span>{error}</span><button className="x-btn x-btn--sm" onClick={load}>Retry</button>
          </div>
        )}

        {loading ? (
          <>
            <div className="x-skel" style={{ height: 210 }} />
            <div className="x-skel" style={{ height: 480 }} />
            <div className="x-skel" style={{ height: 230 }} />
          </>
        ) : !trade ? (
          error ? null : (
            <section className="x-card x-empty" data-testid="trade-not-found">
              <b>Position #{positionId} isn’t on this account</b>
              <p>It may belong to another broker account, or it hasn’t synced yet.</p>
              <Link href="/trades" className="x-btn x-btn--hi">Back to trade log</Link>
            </section>
          )
        ) : (
          <>
            <section className="x-card tr-hero">
              <div className="tr-id">
                <span className="x-mk">{tickerMark(trade.symbol)}</span>
                <div style={{ minWidth: 0 }}>
                  <h2>{trade.symbol}<SideChip dir={trade.direction} /><span className={`x-tag ${trade.status === 'OPEN' ? 'x-tag--g' : ''}`}>{trade.status === 'OPEN' ? 'Open' : 'Closed'}</span></h2>
                  <p>{kind ? `${kind} · ` : ''}<span className="tr-nw">{when(trade)}</span> · <span className="tr-nw">held <span className="m">{fmtHold(trade.durationSecs)}</span></span></p>
                </div>
              </div>
              <div className="tr-net">
                <span>Net P&amp;L</span>
                <b className={`m ${tone(trade.netPnl)}`}>{fmtUsd(trade.netPnl)}</b>
                <small>{pct ? <><span className="m">{pct}</span> of balance</> : <>Gross <span className="m">{fmtUsd(trade.grossPnl)}</span></>}</small>
              </div>
              <dl className="x-strip tr-metrics" data-testid="trade-metrics">
                {[
                  { l: 'Gross P&L', v: fmtUsd(trade.grossPnl), c: '' },
                  { l: 'Size', v: `${trade.volume.toFixed(2)} lots`, c: '' },
                  { l: 'Entry', v: fmtPrice(trade.entryPrice, trade.exitPrice), c: '' },
                  { l: 'Exit', v: trade.exitPrice == null ? '—' : fmtPrice(trade.exitPrice, trade.entryPrice), c: '' },
                  { l: 'Held', v: fmtHold(trade.durationSecs), c: '' },
                  { l: 'Commission', v: trade.commission ? fmtUsd(trade.commission) : '$0.00', c: '' }, // fees, not losses: neutral (A4.3)
                  { l: 'Swap', v: trade.swap ? fmtUsd(trade.swap) : '$0.00', c: '' },
                ].map(m => (
                  <div key={m.l}><dt><span>{m.l}</span></dt><dd><b className={`m ${m.c}`}>{m.v}</b></dd></div>
                ))}
              </dl>
            </section>

            <section className="x-card" aria-labelledby="tr-chart-h">
              <div className="x-ch">
                <h2 id="tr-chart-h">Price</h2>
                <span className="x-sub">{candles.loading ? 'Loading candles…' : candles.candles ? 'Market data' : 'Illustrative path, not tick data'}</span>
                <div className="x-r">
                  <span className="tr-legend"><span><i />Entry</span>{trade.status !== 'OPEN' && <span><i className={trade.netPnl >= 0 ? 'g' : 'r'} />Exit</span>}</span>
                </div>
              </div>
              <TradeCandles trade={trade} real={candles.candles} />
            </section>

            <div className="tr-row">
              <section className="x-card" data-testid="trade-journal" aria-labelledby="tr-j">
                <div className="x-ch">
                  <h2 id="tr-j">Journal</h2>
                  <span className="x-sub">Notes for this trade</span>
                  {entry && <div className="x-r"><Link href={journalHref} className="x-btn x-btn--sm">Edit note</Link></div>}
                </div>
                {entry ? (
                  <>
                    {(entry.emotion || entry.tags?.length) ? (
                      <div className="tr-jtags">
                        {entry.emotion && <span className={`x-tag ${NEGATIVE_EMOTIONS.includes(entry.emotion) || tagTone(entry.emotion) === 'r' ? 'x-tag--r' : tagTone(entry.emotion) === 'g' ? 'x-tag--g' : ''}`}>{entry.emotion}</span>}
                        {(entry.tags ?? []).map(t => <span key={t} className={`x-tag ${tagTone(t) === 'g' ? 'x-tag--g' : tagTone(t) === 'r' ? 'x-tag--r' : ''}`}>{t}</span>)}
                      </div>
                    ) : null}
                    {entry.body ? <p className="tr-note">{entry.body}</p> : <p className="tr-note x-muted">No written notes.</p>}
                  </>
                ) : (
                  <div className="tr-jnone">
                    <p>No notes yet. A line on why you took it, and whether you followed the plan, is what makes this trade useful later.</p>
                    <Link href={journalHref} className="x-btn x-btn--hi x-btn--sm">Write a note</Link>
                  </div>
                )}
              </section>

              <section className="x-card" aria-labelledby="tr-x" data-testid="trade-deals">
                <div className="x-ch"><h2 id="tr-x">Executions</h2><span className="x-sub">{deals.length} deal{deals.length === 1 ? '' : 's'}</span></div>
                {deals.length === 0 ? <div className="x-empty"><p>No fills on file for this position.</p></div> : (
                  <>
                    <div className="x-tblwrap tr-xtbl">
                      <table className="x-tbl">
                        <thead><tr><th>Deal</th><th>Type</th><th>Entry</th><th className="n">Volume</th><th className="n">Price</th><th className="n">Profit</th><th className="n">Comm.</th></tr></thead>
                        <tbody>
                          {deals.map(d => {
                            const r = dealRow(d);
                            return (
                              <tr key={d.dealTicket}>
                                <td className="m x-muted">#{d.dealTicket}</td>
                                <td>{r.type}</td>
                                <td className="x-muted">{ENTRY[d.entry]}</td>
                                <td className="n m">{parseFloat(d.volume).toFixed(2)}</td>
                                <td className="n m">{fmtPrice(parseFloat(d.price))}</td>
                                <td className={`n m ${r.noPnl ? 'x-muted' : tone(r.p)}`}>{r.noPnl ? '—' : fmtUsd(r.p)}</td>
                                <td className="n m x-muted">{r.c ? fmtUsd(r.c) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="tr-xcards x-list">
                      {deals.map(d => {
                        const r = dealRow(d);
                        return (
                          <div key={d.dealTicket} className="tr-xcard">
                            <div><b>{r.type} · {ENTRY[d.entry].toLowerCase()}</b><small className="m">#{d.dealTicket} · {parseFloat(d.volume).toFixed(2)} @ {fmtPrice(parseFloat(d.price))}</small></div>
                            <div className="tr-pl"><b className={`m ${r.noPnl ? 'x-muted' : tone(r.p)}`}>{r.noPnl ? '—' : fmtUsd(r.p)}</b>{r.c ? <small className="m">comm. {fmtUsd(r.c)}</small> : null}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
