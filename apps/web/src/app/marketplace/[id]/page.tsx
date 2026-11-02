'use client';

// A marketplace strategy (H1): what it trades, the performance we computed,
// the creator's own run, the settings you may tune, and subscribing to run
// it on paper or live. The rules themselves stay with the creator.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import EquityChart from '@/components/v6/strategy/equity-chart';
import { ApiError, exchangesApi, type ExchangeConnection } from '@/lib/copy-api';
import { TRADING_ENABLED } from '@/lib/features';
import { catLabel, marketApi, pctS, riskLabel, type Detail } from '@/lib/marketplace-api';
import { usd } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/marketplace.css';

const VENUE: Record<string, string> = { delta_india: 'Delta Exchange India', binance: 'Binance', bybit: 'Bybit' };
const SIZING: Record<string, string> = { risk_pct: 'risk a % of equity per trade', equity_pct: 'a % of equity per trade', qty: 'a fixed quantity', notional: 'a fixed USDT size', atr: 'size from ATR', kelly: 'Kelly sizing' };

function Subscribe({ d, onClose }: { d: Detail; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [capital, setCapital] = useState('1000');
  const [conns, setConns] = useState<ExchangeConnection[] | null>(null);
  const [connId, setConnId] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(d.params.map((p) => [p.key, p.value])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const liveOk = TRADING_ENABLED && d.exchanges.includes('delta_india');
  useEffect(() => {
    if (!liveOk) return;
    exchangesApi.list().then((cs) => { const ok = cs.filter((c) => c.exchange === 'DELTA_INDIA' && c.status === 'ACTIVE' && c.canTrade); setConns(ok); setConnId(ok[0]?.id ?? ''); }, () => setConns([]));
  }, [liveOk]);
  const conn = conns?.find((c) => c.id === connId);
  const isReal = conn?.environment === 'LIVE';
  async function go() {
    setBusy(true); setErr('');
    try {
      const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => d.params.find((p) => p.key === k)?.value !== v));
      const r = await marketApi.subscribe(d.id, { mode, ...(mode === 'paper' ? { capital: Number(capital) } : { connectionId: connId, confirmLive: isReal ? confirmLive : undefined }), ...(Object.keys(changed).length ? { params: changed } : {}) });
      toast.success(`Running ${d.name} on ${mode}`);
      router.push(`/strategies/deployments/${r.deploymentId}`);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t start it'); setBusy(false); }
  }
  const capOk = mode === 'live' || (Number(capital) >= 100 && Number(capital) <= 100_000_000);
  return (
    <Modal title={`Run ${d.name}`} sub="You get the results; the rules stay with the creator. Stop or change size any time from Subscriptions." onClose={onClose} busy={busy} wide testId="mk-sub-dialog"
      footer={<><button className="x-btn" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void go()} disabled={busy || !capOk || (mode === 'live' && (!connId || (isReal && !confirmLive)))} data-testid="mk-sub-go">{busy ? 'Starting…' : mode === 'paper' ? 'Start on paper' : 'Start live'}</button></>}>
      <div className="mk-sub">
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Mode">
          <button type="button" role="radio" aria-checked={mode === 'paper'} onClick={() => setMode('paper')} data-testid="mk-sub-paper">Paper</button>
          <button type="button" role="radio" aria-checked={mode === 'live'} onClick={() => setMode('live')} disabled={!liveOk} title={liveOk ? undefined : 'The creator allows paper runs only'} data-testid="mk-sub-live">Live</button>
        </div>
        {mode === 'paper' ? (
          <label className="x-field"><span>Paper capital (USDT)</span><input className="x-input m" type="number" min={100} value={capital} onChange={(e) => setCapital(e.target.value)} data-testid="mk-sub-capital" /></label>
        ) : !conns ? <div className="x-skel" style={{ height: 40 }} /> : !conns.length ? (
          <p className="x-muted">Connect a Delta account that can trade on the <Link className="x-link" href="/exchanges">Exchanges</Link> page first.</p>
        ) : (
          <>
            <label className="x-field"><span>Exchange account</span><select className="x-input" value={connId} onChange={(e) => setConnId(e.target.value)} data-testid="mk-sub-conn">{conns.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.environment === 'TESTNET' ? 'testnet' : 'live money'}</option>)}</select></label>
            {isReal && <label className="mk-check"><input type="checkbox" checked={confirmLive} onChange={(e) => setConfirmLive(e.target.checked)} data-testid="mk-sub-confirm" /> I understand this places real orders with real money, and can lose it.</label>}
          </>
        )}
        {d.params.length > 0 && (
          <div className="mk-params">
            <b>Settings you can change</b>
            {d.params.map((p) => (
              <label key={p.key} className="mk-param">
                <span>{p.label}</span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={vals[p.key] ?? p.value} onChange={(e) => setVals((v) => ({ ...v, [p.key]: Number(e.target.value) }))} data-testid={`mk-param-${p.key}`} />
                <b className="m">{vals[p.key] ?? p.value}</b>
                {vals[p.key] !== p.value && <button type="button" className="mk-reset" onClick={() => setVals((v) => ({ ...v, [p.key]: p.value }))}>creator’s {p.value}</button>}
              </label>
            ))}
            <p className="x-muted mk-fine">The results above use the creator’s settings; changing them changes the strategy.</p>
          </div>
        )}
        {err && <p className="cp-err" data-testid="mk-sub-error">{err}</p>}
      </div>
    </Modal>
  );
}

export default function TemplatePage() {
  const { id } = useParams<{ id: string }>();
  const d = useLoad(() => marketApi.detail(id), [id]);
  const [open, setOpen] = useState(false);
  const t = d.data;
  const b = t?.backtest;
  return (
    <AppShell legacy={false} pageTitle={t?.name ?? 'Strategy'} pageSubtitle={t ? `by ${t.creator} · ${catLabel(t.category)} · ${riskLabel(t.risk)}` : ''}
      actions={<Link className="x-btn" href="/marketplace">Marketplace</Link>}>
      <div className="x-page mk-page" data-testid="mk-detail">
        {d.error ? <ErrorCard message={d.error} onRetry={d.reload} /> : !t ? <div className="x-skel" style={{ height: 520 }} /> : (
          <div className="mk-cols">
            <div className="mk-main">
              {t.status !== 'published' && <p className="cp-err" data-testid="mk-not-live">Only you can see this: it’s {t.status === 'pending' ? 'in review' : t.status}.</p>}
              <section className="x-card" aria-label="About"><p className="mk-desc">{t.description}</p></section>
              <section className="x-card" aria-label="Verified backtest" data-testid="mk-perf">
                <div className="x-ch"><h2>Backtest by TRADElogs</h2><span className="x-sub">{t.backtestWindow ? `${new Date(t.backtestWindow.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(t.backtestWindow.to).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, 10,000 USDT, fees and slippage` : ''}</span></div>
                {!b ? <p className="x-muted">No backtest yet.</p> : (
                  <>
                    <div className="mk-stats mk-stats--big">
                      <div><span>Return</span><b className={`m ${(b.totalReturnPct ?? 0) >= 0 ? 'pos' : 'neg'}`}>{pctS(b.totalReturnPct)}</b></div>
                      <div><span>Max drawdown</span><b className="m neg">{pctS(b.maxDrawdownPct)}</b></div>
                      <div><span>Win rate</span><b className="m">{b.winRatePct == null ? '—' : `${b.winRatePct.toFixed(1)}%`}</b></div>
                      <div><span>Profit factor</span><b className="m">{b.profitFactor == null ? '—' : b.profitFactor.toFixed(2)}</b></div>
                      <div><span>Trades</span><b className="m">{b.trades ?? '—'}</b></div>
                      <div><span>Sharpe</span><b className="m">{b.sharpe == null ? '—' : b.sharpe.toFixed(2)}</b></div>
                    </div>
                    <EquityChart equity={t.equity} drawdown height={220} testId="mk-equity" />
                  </>
                )}
              </section>
              <section className="x-card" aria-label="Track record" data-testid="mk-track">
                <div className="x-ch"><h2>Creator’s own run</h2></div>
                {!t.track ? <p className="x-muted">The creator hasn’t linked a run yet, so there’s only the backtest.</p> : (
                  <div className="mk-stats">
                    <div><span>{t.track.mode === 'live' ? 'Live' : 'Paper'} since</span><b>{new Date(t.track.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
                    <div><span>P&amp;L</span><b className={`m ${t.track.pnl >= 0 ? 'pos' : 'neg'}`}>{usd(t.track.pnl)}</b></div>
                    <div><span>Return</span><b className="m">{pctS(t.track.returnPct, 2)}</b></div>
                    <div><span>Trades</span><b className="m">{t.track.trades}</b></div>
                    <div><span>Win rate</span><b className="m">{t.track.winRatePct == null ? '—' : `${t.track.winRatePct.toFixed(0)}%`}</b></div>
                  </div>
                )}
              </section>
            </div>
            <aside className="mk-side">
              <section className="x-card" aria-label="Run it" data-testid="mk-run">
                {t.isCreator ? <p className="x-muted">This is yours. Run it from <Link className="x-link" href="/strategies">your strategies</Link>.</p>
                  : t.subscription ? <><p>You’re running this.</p><Link className="x-btn x-btn--hi" href="/marketplace/subscriptions" data-testid="mk-manage">Manage</Link></>
                  : <><button className="x-btn x-btn--hi mk-run-btn" onClick={() => setOpen(true)} data-testid="mk-subscribe">Run this strategy</button><p className="x-muted mk-fine">{t.subscribers} {t.subscribers === 1 ? 'person runs' : 'people run'} it. Free.</p></>}
              </section>
              <section className="x-card" aria-label="How it trades" data-testid="mk-facts">
                <div className="x-ch"><h2>How it trades</h2></div>
                <ul className="mk-facts">
                  <li><span>Markets</span><b className="m">{t.symbols.join(', ')}</b></li>
                  <li><span>Bar size</span><b className="m">{t.interval}</b></li>
                  <li><span>Direction</span><b>{t.facts.direction === 'both' ? 'Long and short' : t.facts.direction === 'long' ? 'Long only' : 'Short only'}</b></li>
                  <li><span>Leverage</span><b className="m">{t.facts.leverage}×</b></li>
                  <li><span>Protection</span><b>{[t.facts.hasStop && 'stop loss', t.facts.hasTarget && 'target', t.facts.trailing && 'trailing stop'].filter(Boolean).join(', ') || 'none'}</b></li>
                  <li><span>Sizing</span><b>{SIZING[t.facts.sizing] ?? t.facts.sizing}</b></li>
                  <li><span>Live on</span><b>{t.exchanges.length ? t.exchanges.map((e) => VENUE[e] ?? e).join(', ') : 'paper only'}</b></li>
                </ul>
              </section>
              {t.creatorProfile && (
                <section className="x-card" aria-label="Creator">
                  <div className="x-ch"><h2>{t.creatorProfile.displayName}</h2></div>
                  <p className="mk-desc">{t.creatorProfile.bio}</p>
                  {t.creatorProfile.links.map((l) => <a key={l} className="x-link mk-link" href={l} target="_blank" rel="noopener noreferrer nofollow">{l.replace(/^https?:\/\//, '')}</a>)}
                </section>
              )}
              <p className="x-muted mk-fine">TRADElogs reviews each strategy before it’s listed but doesn’t advise on it. Past results don’t predict future ones.</p>
            </aside>
          </div>
        )}
      </div>
      {open && t && <Subscribe d={t} onClose={() => setOpen(false)} />}
    </AppShell>
  );
}
