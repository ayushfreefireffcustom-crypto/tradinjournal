'use client';

// One deployment (F16, F18): honest status, controls, positions, trades and
// the activity feed explaining every check.
import Link from '@/components/v6/ui/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ago, useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import EquityChart from '@/components/v6/strategy/equity-chart';
import { ApiError } from '@/lib/copy-api';
import { fmtPrice } from '@/lib/hub-api';
import { STATUS_TEXT, deploymentsApi, pct, tone, usd, type DeployAction, type DeploymentDetail } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/strategy.css';
import '@/styles/v6/markets.css';
import { ICheck, IClose } from '@/components/v6/icons';

type Feed = 'all' | 'actions' | 'checks';
const ACTIONS = new Set(['started', 'filled', 'closed', 'stop_moved', 'paused', 'resumed', 'stopping', 'stopped', 'settled', 'emergency', 'size', 'error', 'killed', 'skipped']);
const KIND_LABEL: Record<string, string> = { started: 'Started', filled: 'Entered', closed: 'Exited', stop_moved: 'Stop moved', paused: 'Paused', resumed: 'Resumed', stopping: 'Stopping', stopped: 'Stopped', settled: 'Settled', emergency: 'Emergency close', size: 'Size', error: 'Problem', killed: 'Streak stop', skipped: 'Skipped', signal: 'Signal', no_signal: 'No signal', blocked: 'Waiting', holding: 'Holding', exit_signal: 'Exit signal' };

function statusLine(d: DeploymentDetail): string {
  switch (d.status) {
    case 'running': return d.mode === 'live' ? `Live on your exchange account. It checks each ${d.interval} bar close and acts on its own.` : `Running on paper with live prices. It checks each ${d.interval} bar close.`;
    case 'paused': return 'Paused: no new trades. Open trades keep their stops, targets and exit rules.';
    case 'stopping': return 'Stopping: no new trades. It stops for good once the open trades have closed.';
    case 'stopped': return `Stopped${d.stopReason ? ` (${d.stopReason.toLowerCase()})` : ''}${d.stoppedAt ? ` ${ago(d.stoppedAt)}` : ''}.`;
    case 'errored': return `Needs attention: ${d.error ?? 'it hit a problem'}. It won’t act until you resume it.`;
    case 'archived': return 'Archived.';
  }
}

export default function DeploymentPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const d = useLoad(() => deploymentsApi.get(id), [id]);
  usePoll(() => void d.reload(), 30_000);
  const [feed, setFeed] = useState<Feed>('all');
  const [confirm, setConfirm] = useState<DeployAction | null>(null);
  const [busy, setBusy] = useState(false);
  const events = useMemo(() => (d.data?.events ?? []).filter(e => feed === 'all' || (feed === 'actions' ? ACTIONS.has(e.kind) : !ACTIONS.has(e.kind))), [d.data, feed]);
  const lastCheck = d.data?.events.find(e => e.data?.conditions?.length);

  async function act(a: DeployAction) {
    setBusy(true);
    try { d.setData(await deploymentsApi.act(id, a)); toast.success({ pause: 'Paused', resume: 'Resumed', stop: 'Stopping', settle: 'Settled', emergency_close: 'Closed everything', archive: 'Archived' }[a]); setConfirm(null); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not do that'); }
    finally { setBusy(false); }
  }
  if (d.error) return <AppShell legacy={false} pageTitle="Deployment"><div className="x-page"><ErrorCard message={d.error} /></div></AppShell>;
  if (!d.data) return <AppShell legacy={false} pageTitle="Deployment"><div className="x-page"><div className="x-skel" style={{ height: 420 }} /></div></AppShell>;
  const x = d.data;
  const active = ['running', 'paused', 'stopping', 'errored'].includes(x.status);
  const total = x.closedPnl + x.openPnl;
  const CONFIRM: Partial<Record<DeployAction, { title: string; body: string; cta: string }>> = {
    stop: { title: 'Stop this deployment?', body: 'No new trades. Open trades run until their stop, target or exit rule closes them, then it stops.', cta: 'Stop' },
    settle: { title: 'Settle now?', body: x.mode === 'live' ? 'Closes every open position at market on your exchange account, cancels its stop and target orders, and stops.' : 'Closes every open paper position at the latest price and stops.', cta: 'Close positions and stop' },
    emergency_close: { title: 'Emergency close?', body: 'Closes every open position at market right away and stops. Use it if something looks wrong.', cta: 'Close everything now' },
  };
  return (
    <AppShell legacy={false} pageTitle={x.name} pageSubtitle={`${x.mode === 'live' ? 'Live' : 'Paper'} · version ${x.version} · started ${ago(x.startedAt)}`}
      actions={<>
        <Link className="x-btn" href="/strategies/deployments">All deployments</Link>
        {x.private ? <Link className="x-btn" href="/marketplace/subscriptions">Subscriptions</Link> : <Link className="x-btn" href={`/strategies/${x.strategyId}`}>Strategy</Link>}
      </>}>
      <div className="x-page" data-testid="dp-page">
        <section className={`x-card dp-status dp-${x.status}`} aria-label="Status" data-testid="dp-status">
          <div className="dp-status-h"><span className={`x-tag ${x.status === 'running' ? 'x-tag--g' : x.status === 'errored' ? 'x-tag--r' : ''}`}>{STATUS_TEXT[x.status]}</span><span className={`x-tag ${x.mode === 'live' ? 'x-tag--r' : ''}`}>{x.mode === 'live' ? 'Live' : 'Paper'}</span>{x.killed && <span className="x-tag x-tag--r">Losing-streak stop</span>}</div>
          <p data-testid="dp-status-line">{statusLine(x)}</p>
          {x.strategyVersion !== x.version && <p className="x-muted">The strategy is now at version {x.strategyVersion}; this run keeps version {x.version}. Start a new run to use the changes.</p>}
          <p className="x-muted">{x.lastEvaluatedAt ? `Last check ${ago(x.lastEvaluatedAt)}${x.lastBarTime ? ` (bar from ${new Date(x.lastBarTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })})` : ''}.` : 'Waiting for the first bar close.'}</p>
          {active && (
            <div className="dp-controls" data-testid="dp-controls">
              {x.status === 'running' && <button className="x-btn" onClick={() => void act('pause')} disabled={busy} data-testid="dp-pause">Pause</button>}
              {(x.status === 'paused' || x.status === 'errored') && <button className="x-btn x-btn--hi" onClick={() => void act('resume')} disabled={busy} data-testid="dp-resume">Resume</button>}
              {x.status !== 'stopping' && <button className="x-btn" onClick={() => setConfirm('stop')} disabled={busy} data-testid="dp-stop">Stop</button>}
              <button className="x-btn" onClick={() => setConfirm('settle')} disabled={busy} data-testid="dp-settle">Settle</button>
              <button className="x-btn cp-del" onClick={() => setConfirm('emergency_close')} disabled={busy} data-testid="dp-emergency">Emergency close</button>
            </div>
          )}
          {x.status === 'stopped' && <div className="dp-controls"><button className="x-btn" onClick={() => void act('archive')} data-testid="dp-archive">Archive</button></div>}
        </section>

        <section className="st-strip" aria-label="Results">
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Total P&amp;L</div><div className="ov-kpi-v"><b className={`m ${tone(total)}`}>{usd(total)}</b></div><div className="ov-kpi-s">{x.mode === 'paper' ? `${pct((total / x.capital) * 100, 2)} on ${usd(x.capital)}` : `Account equity at start ${usd(x.capital)}`}</div></div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Closed</div><div className="ov-kpi-v"><b className={`m ${tone(x.closedPnl)}`}>{usd(x.closedPnl)}</b></div><div className="ov-kpi-s">{x.trades.length} trade{x.trades.length === 1 ? '' : 's'}{x.trades.length ? ` · ${Math.round((x.trades.filter(t => t.pnl > 0).length / x.trades.length) * 100)}% won` : ''}</div></div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Open</div><div className="ov-kpi-v"><b className={`m ${tone(x.openPnl)}`}>{x.open.length ? usd(x.openPnl) : '—'}</b></div><div className="ov-kpi-s">{x.open.length} position{x.open.length === 1 ? '' : 's'}{x.pending.length ? ` · ${x.pending.length} order waiting` : ''}</div></div>
          <div className="x-card ov-kpi"><div className="ov-kpi-h">Size</div><div className="ov-kpi-v"><b className="m">{x.multiplier}×</b></div><div className="ov-kpi-s">{x.sizeSchedule.length > 1 ? `changed ${x.sizeSchedule.length - 1}×` : 'as backtested'}</div></div>
        </section>

        {x.mode === 'paper' && x.equity.length > 1 && <section className="x-card" aria-label="Equity"><div className="x-ch"><h2>Equity</h2></div><EquityChart equity={x.equity} drawdown height={220} testId="dp-equity" /></section>}

        {x.open.length > 0 && (
          <section className="x-card" aria-label="Open positions" data-testid="dp-open">
            <div className="x-ch"><h2>Open positions</h2></div>
            <table className="x-tbl trd-tbl sc-tbl"><thead><tr><th>Market</th><th>Side</th><th className="r">Entry</th><th className="r">Stop</th><th className="r">Target</th><th className="r">Open P&amp;L</th><th>Since</th></tr></thead>
              <tbody>{x.open.map((p, k) => <tr key={k}><td><b>{p.symbol}</b></td><td data-label="Side"><span className={`x-side x-side--${p.side}`}>{p.side === 'long' ? 'Long' : 'Short'}</span></td><td className="r m" data-label="Entry">{fmtPrice(p.entryPrice)}</td><td className="r m" data-label="Stop">{fmtPrice(p.stop)}</td><td className="r m" data-label="Target">{fmtPrice(p.target)}</td><td className={`r m ${tone(p.unrealized)}`} data-label="Open P&L">{x.mode === 'paper' ? usd(p.unrealized) : 'on exchange'}</td><td data-label="Since">{ago(new Date(p.entryTime).toISOString())}</td></tr>)}</tbody></table>
          </section>
        )}

        <div className="dp-cols">
          <section className="x-card" aria-label="Activity" data-testid="dp-feed">
            <div className="x-ch">
              <h2>Activity</h2>
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Show">{(['all', 'actions', 'checks'] as const).map(f => <button key={f} type="button" role="radio" aria-checked={feed === f} onClick={() => setFeed(f)} data-testid={`dp-feed-${f}`}>{f === 'all' ? 'All' : f === 'actions' ? 'Actions' : 'Checks'}</button>)}</div>
            </div>
            {lastCheck && feed !== 'actions' && (
              <div className="dp-last" data-testid="dp-last-check">
                <div className="x-muted">Last check · {new Date(lastCheck.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{lastCheck.symbol ? ` · ${lastCheck.symbol}` : ''}</div>
                <ul>{lastCheck.data!.conditions!.map((c, k) => <li key={k} className={c.met ? 'pos' : 'neg'}><span aria-hidden>{c.met ? <ICheck size={13} /> : <IClose size={13} />}</span> {c.text}</li>)}</ul>
              </div>
            )}
            {!events.length ? <p className="x-muted">Nothing yet.</p> : (
              <ol className="dp-events">
                {events.map(e => (
                  <li key={e.id} className={`dp-ev dp-ev-${e.kind}`}>
                    <span className="dp-ev-t">{new Date(e.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="x-tag">{KIND_LABEL[e.kind] ?? e.kind}</span>
                    <span className="dp-ev-m">{e.symbol && <b>{e.symbol} </b>}{e.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="x-card" aria-label="Trades" data-testid="dp-trades">
            <div className="x-ch"><h2>Trades</h2><span className="x-sub">{x.trades.length}</span></div>
            {!x.trades.length ? <p className="x-muted">No closed trades yet.</p> : (
              <ul className="dpl-trades">{x.trades.slice(0, 50).map((t, k) => <li key={k}><b>{t.symbol}</b> <span className={`x-side x-side--${t.side}`}>{t.side}</span> {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)} · <span className={`m ${tone(t.pnl)}`}>{usd(t.pnl)}</span> <span className="x-muted">· {t.reason} · {new Date(t.exitTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>
            )}
          </section>
        </div>
      </div>
      {confirm && CONFIRM[confirm] && (
        <Modal title={CONFIRM[confirm]!.title} sub={CONFIRM[confirm]!.body} onClose={() => setConfirm(null)} busy={busy} testId="dp-confirm-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button><button className={`x-btn x-btn--hi ${confirm !== 'stop' ? 'cp-del' : ''}`} onClick={() => void act(confirm)} disabled={busy} data-testid="dp-confirm-go">{busy ? 'Working…' : CONFIRM[confirm]!.cta}</button></>}>
          {x.mode === 'live' && confirm !== 'stop' && <p className="cp-fine">This sends real orders to {x.mode === 'live' ? 'your exchange account' : ''}.</p>}
        </Modal>
      )}
    </AppShell>
  );
}
