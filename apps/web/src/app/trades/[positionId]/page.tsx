'use client';

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { LoadingScreen } from '@/components/loader';
import { api, type BrokerAccount, type Deal, type Trade, type JournalEntry } from '@/lib/api';
import { persistSelectedAccountId } from '@/lib/use-accounts';
import { IArrowLeft, IArrowRight } from '@/components/v3/icons';
import { TradeCandles, useTradeCandles } from '@/components/v3/trade-candles';
import { money, price, dur, tone } from '@/components/v3/format';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];
const ENTRY: Record<Deal['entry'], string> = { IN: 'In', OUT: 'Out', INOUT: 'In/out', OUT_BY: 'Out by' };

function when(t: Trade) {
  const o = new Date(t.openTime);
  const date = o.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const tm = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (!t.closeTime) return `${date}, ${tm(o)} → open`;
  const c = new Date(t.closeTime);
  const sameDay = o.toDateString() === c.toDateString();
  return `${date}, ${tm(o)} → ${sameDay ? '' : `${c.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, `}${tm(c)}`;
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
      const [t, allDeals, journal] = await Promise.all([api.trades.list(acc.id), api.trades.deals(acc.id), api.journal.list(acc.id)]);
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
    const list = [...trades].sort((a, b) => +new Date(b.openTime) - +new Date(a.openTime));
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

  const actions = trade ? (
    <div className="v3-seg sm td-nav" role="group" aria-label="Browse trades">
      <button disabled={!newer} onClick={() => newer && router.push(href(newer))} aria-label="Newer trade" title="Newer trade (←)"><IArrowLeft size={14} /></button>
      <button disabled={!older} onClick={() => older && router.push(href(older))} aria-label="Older trade" title="Older trade (→)"><IArrowRight size={14} /></button>
    </div>
  ) : null;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} crumbParent="Trade log" pageTitle={`Position #${positionId}`} actions={actions}>
      <div className="v3-page" data-testid="trade-detail-page">
        <Link href="/trades" className="v3-link td-back" data-testid="back-to-trades"><IArrowLeft size={15} /> Trade log</Link>

        {error && (
          <div className="d-err" role="alert" data-testid="trade-detail-error" style={{ marginTop: 18 }}>
            <span>{error}</span><button className="v3-btn v3-btn--o" onClick={load}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="d-grid" style={{ marginTop: 20 }}>
            <div className="skel d-sk" style={{ height: 70, width: 360 }} />
            <div className="skel d-sk" style={{ height: 420, borderRadius: 20 }} />
            <div className="skel d-sk" style={{ height: 230, borderRadius: 20 }} />
          </div>
        ) : !trade ? (
          <section className="v3-card d-empty d-empty--lg" data-testid="trade-not-found" style={{ marginTop: 20 }}>
            <b>Position #{positionId} isn’t on this account</b>
            It may belong to another broker account, or it hasn’t synced yet.
            <Link href="/trades" className="v3-link" style={{ marginTop: 10 }}>Back to trade log</Link>
          </section>
        ) : (
          <>
            <header className="td-head">
              <div style={{ minWidth: 0 }}>
                <div className="td-pos num">Position #{trade.positionId}</div>
                <h1 className="td-sym">
                  {trade.symbol}
                  <span className={`d-side ${trade.direction === 'LONG' ? 'L' : 'S'}`}>
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>{trade.direction === 'LONG' ? <path d="M2 8L8 2M3.5 2H8v4.5" /> : <path d="M2 2l6 6M8 3.5V8H3.5" />}</svg>
                    {trade.direction === 'LONG' ? 'Long' : 'Short'}
                  </span>
                  <span className={`td-status ${trade.status === 'OPEN' ? 'open' : ''}`}>{trade.status === 'OPEN' ? 'Open' : 'Closed'}</span>
                </h1>
                <p className="v3-sub num">{when(trade)} · held {dur(trade.durationSecs)}</p>
              </div>
              <div className="td-net">
                <span>Net P&amp;L</span>
                <b className={`num ${tone(trade.netPnl)}`}>{money(trade.netPnl)}</b>
              </div>
            </header>

            <section className="v3-card td-chart">
              <TradeCandles trade={trade} real={candles.candles} height={400} />
              <span className={`td-src ${candles.candles ? 'live' : ''}`} title={candles.candles ? 'Market candles for the trade window' : 'Price path reconstructed from your entry and exit fills — not tick data'}>
                {candles.loading ? 'Loading candles…' : candles.candles ? 'Market data' : 'Illustrative path · not tick data'}
              </span>
            </section>

            <section className="v3-card td-metrics" data-testid="trade-metrics">
              {[
                { l: 'Net P&L', v: money(trade.netPnl), c: tone(trade.netPnl) },
                { l: 'Gross P&L', v: money(trade.grossPnl), c: '' },
                { l: 'Volume', v: `${trade.volume.toFixed(2)} lots`, c: '' },
                { l: 'Held', v: dur(trade.durationSecs), c: '' },
                { l: 'Entry', v: price(trade.entryPrice), c: '' },
                { l: 'Exit', v: price(trade.exitPrice), c: '' },
                { l: 'Commission', v: trade.commission ? money(trade.commission) : '$0.00', c: trade.commission < 0 ? 'sh' : '' },
                { l: 'Swap', v: trade.swap ? money(trade.swap) : '$0.00', c: trade.swap < 0 ? 'sh' : '' },
              ].map(m => (
                <div key={m.l}><span>{m.l}</span><b className={`num ${m.c}`}>{m.v}</b></div>
              ))}
            </section>

            <div className="d-grid td-row">
              <section className="v3-card" data-testid="trade-journal" aria-labelledby="td-j">
                <div className="v3-ch"><h3 id="td-j">Journal entry <span className="d-opt">· notes for this trade</span></h3>
                  <Link href={`/journal?trade=${encodeURIComponent(trade.positionId)}`}>{entry ? 'Edit' : 'Write'}<span className="d-opt">&nbsp;in chart replay</span> <IArrowRight size={14} /></Link></div>
                <div className="td-jbd">
                  {entry ? (
                    <>
                      {(entry.emotion || entry.tags?.length) ? (
                        <div className="td-tags">
                          {entry.emotion && <span className={`td-emo ${NEGATIVE_EMOTIONS.includes(entry.emotion) ? 'bad' : ''}`}>{entry.emotion}</span>}
                          {(entry.tags ?? []).map(t => <span key={t} className="t-tag">#{t.trim().toLowerCase().replace(/\s+/g, '-')}</span>)}
                        </div>
                      ) : null}
                      {entry.body ? <p className="td-note">{entry.body}</p> : <p className="td-note mute">No written notes.</p>}
                    </>
                  ) : (
                    <div className="td-none">
                      <p>No notes yet. A line on why you took it — and whether you followed the plan — is what makes this trade useful later.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="v3-card" aria-labelledby="td-x" data-testid="trade-deals">
                <div className="v3-ch"><h3 id="td-x">Executions <span>· {deals.length} deal{deals.length === 1 ? '' : 's'}</span></h3></div>
                {deals.length === 0 ? <div className="d-empty">No fills on file for this position.</div> : (
                  <div className="v3-tbl-wrap">
                    <table className="v3-table td-x">
                      <thead><tr><th>Deal</th><th>Type</th><th>Entry</th><th className="r">Volume</th><th className="r">Price</th><th className="r">Profit</th><th className="r">Comm.</th></tr></thead>
                      <tbody>
                        {deals.map(d => {
                          const p = parseFloat(d.profit), c = parseFloat(d.commission);
                          return (
                            <tr key={d.dealTicket} className="static">
                              <td className="num">#{d.dealTicket}</td>
                              <td>{d.type === 'BUY' ? 'Buy' : d.type === 'SELL' ? 'Sell' : 'Balance'}</td>
                              <td>{ENTRY[d.entry]}</td>
                              <td className="r num">{parseFloat(d.volume).toFixed(2)}</td>
                              <td className="r num">{price(parseFloat(d.price))}</td>
                              <td className={`r num ${d.entry === 'IN' && !p ? 'mute' : tone(p)}`}>{d.entry === 'IN' && !p ? '—' : money(p)}</td>
                              <td className={`r num ${c < 0 ? 'sh' : 'mute'}`}>{c ? money(c) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
