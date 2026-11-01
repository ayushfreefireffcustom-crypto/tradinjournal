'use client';

// Start a strategy on paper or live (F15, F16).
import { useEffect, useState } from 'react';
import { Modal } from '@/components/v6/copy/parts';
import { ApiError, exchangesApi, type ExchangeConnection } from '@/lib/copy-api';
import { TRADING_ENABLED } from '@/lib/features';
import { deploymentsApi, type DeploymentDetail, type StrategyDetail } from '@/lib/strategies-api';

export default function DeployDialog({ strategy, onClose, onStarted }: { strategy: StrategyDetail; onClose: () => void; onStarted: (d: DeploymentDetail) => void }) {
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [capital, setCapital] = useState('10000');
  const [mult, setMult] = useState('1');
  const [conns, setConns] = useState<ExchangeConnection[] | null>(null);
  const [connectionId, setConnectionId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!TRADING_ENABLED) { setConns([]); return; }
    exchangesApi.list().then(r => { const ok = r.filter(c => c.status === 'ACTIVE' && c.canTrade); setConns(ok); if (ok[0]) setConnectionId(ok[0].id); }, () => setConns([]));
  }, []);
  const conn = conns?.find(c => c.id === connectionId);
  const realMoney = conn?.environment === 'LIVE';
  const liveIssues = [...strategy.validation.live.map(i => i.message),
    ...(strategy.spec.risk.partials.length ? ['Partial exits run on paper only for now.'] : []),
    ...(strategy.spec.advanced.entryType === 'limit' ? ['Limit entries run on paper only for now.'] : []),
    ...(strategy.spec.market.venue !== 'delta_india' ? ['Live strategies run on Delta Exchange India accounts for now.'] : [])];
  const multN = Number(mult);
  const capN = Number(capital);
  const valid = multN > 0 && multN <= 10 && (mode === 'paper' ? capN >= 100 : !!connectionId && !liveIssues.length && (!realMoney || confirm));
  async function go() {
    setBusy(true);
    setErr(null);
    try { onStarted(await deploymentsApi.create(strategy.id, mode === 'paper' ? { mode, capital: capN, sizeMultiplier: multN } : { mode, connectionId, sizeMultiplier: multN, confirmLive: realMoney ? confirm : undefined })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not start'); setBusy(false); }
  }
  return (
    <Modal title={`Run “${strategy.name}”`} sub={`Runs version ${strategy.version}. Later edits don’t change a running deployment; start a new one to use them.`} onClose={onClose} busy={busy} testId="dp-dialog"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className={`x-btn x-btn--hi ${mode === 'live' ? 'cp-del' : ''}`} onClick={() => void go()} disabled={busy || !valid} data-testid="dp-start">{busy ? 'Starting…' : mode === 'paper' ? 'Start on paper' : realMoney ? 'Start with real money' : 'Start on testnet'}</button></>}>
      <div className="x-field">
        <label>Mode</label>
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Mode">
          <button type="button" role="radio" aria-checked={mode === 'paper'} onClick={() => setMode('paper')} data-testid="dp-paper">Paper</button>
          <button type="button" role="radio" aria-checked={mode === 'live'} onClick={() => setMode('live')} disabled={!TRADING_ENABLED} data-testid="dp-live">Live</button>
        </div>
        <span className="x-help">{mode === 'paper' ? 'Simulated trades on live prices, with fees and slippage. Nothing is sent to an exchange.' : 'Real orders on your exchange account, each with its stop and target placed on the exchange.'}</span>
      </div>
      {mode === 'paper' ? (
        <div className="x-field"><label htmlFor="dp-cap">Starting capital (USDT)</label><input id="dp-cap" className="x-input m" type="number" min={100} value={capital} onChange={e => setCapital(e.target.value)} data-testid="dp-capital" /></div>
      ) : (
        <>
          <div className="x-field">
            <label htmlFor="dp-conn">Exchange account</label>
            {conns == null ? <div className="x-skel" style={{ height: 38 }} /> : !conns.length ? <p className="cp-err">No exchange account that can trade. Connect one on the Exchanges page.</p> : (
              <select id="dp-conn" className="x-select" value={connectionId} onChange={e => setConnectionId(e.target.value)} data-testid="dp-conn">
                {conns.map(c => <option key={c.id} value={c.id}>{c.label} · {c.environment === 'LIVE' ? 'real money' : 'testnet'}</option>)}
              </select>
            )}
          </div>
          {liveIssues.length > 0 && <div className="sb-issues"><div className="sb-issues-h neg">Not ready for live</div>{liveIssues.map((m, i) => <p key={i}>{m}</p>)}</div>}
          {realMoney && <label className="sb-check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} data-testid="dp-confirm" /> I understand this places real orders with real money.</label>}
          <p className="cp-fine">It acts once per {strategy.spec.session.interval} bar close. A position you already hold on the same market is left alone.</p>
        </>
      )}
      <div className="x-field"><label htmlFor="dp-mult">Size multiplier</label><input id="dp-mult" className="x-input m" type="number" min={0.01} max={10} step={0.1} value={mult} onChange={e => setMult(e.target.value)} data-testid="dp-mult" /><span className="x-help">Scales every new trade’s size; 1× is the size the backtest used.</span></div>
      {err && <p className="cp-err" data-testid="dp-error">{err}</p>}
    </Modal>
  );
}
