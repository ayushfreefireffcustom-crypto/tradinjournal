'use client';

// Start copying a leader, or edit a running copy (C4.4): account, sizing,
// optional caps, and the risk notice that must be accepted to start.
import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/v6/ui/link';
import Modal from '@/components/v6/ui/modal';
import { exchangesApi, followsApi, usd, venueName, type ExchangeConnection, type ExchangeEnvironment, type Follow, type FollowSettings, type SizingMode } from '@/lib/copy-api';
import '@/styles/v6/dialogs.css';
import '@/styles/v6/kit.css';

const MODES: Array<{ id: SizingMode; label: string; help: string }> = [
  { id: 'PROPORTIONAL', label: 'Match my balance', help: 'Your size is the leader’s size scaled by your balance over theirs. Multiplier 1 copies the same share of your account.' },
  { id: 'FIXED_NOTIONAL', label: 'Fixed amount', help: 'Each new trade opens about this much position value, in USD.' },
  { id: 'MULTIPLIER', label: 'Multiple of size', help: 'Your contracts are the leader’s contracts times this number.' },
];

export const RISK_POINTS = [
  'Copies are placed after the leader’s order fills, so your price can be worse than theirs, and a fast market can fill you partly or not at all.',
  'If the exchange or our service is down, trades can be missed or closed late.',
  'Leveraged positions can be liquidated. You can lose all the margin on your account.',
  'Past results don’t predict future ones. Nobody, including TRADElogs, guarantees a profit.',
  'You’re responsible for the trades placed on your account and for the exchange’s fees.',
];

type Num = string;
const toNum = (s: Num): number | null => (s.trim() === '' ? null : Number(s));

interface Props {
  leader: { id: string; displayName: string; exchange: string; environment: ExchangeEnvironment; recommendedMarginUsd?: number | null; openPositions?: Array<{ symbol: string; side: 'LONG' | 'SHORT' }> };
  /** Edit mode when given. */
  follow?: Follow;
  onClose: () => void;
  onDone: (f: Follow) => void;
}

export default function FollowDialog({ leader, follow, onClose, onDone }: Props) {
  const edit = !!follow;
  const [conns, setConns] = useState<ExchangeConnection[] | null>(null);
  const [connectionId, setConnectionId] = useState(follow?.connection.id ?? '');
  const [mode, setMode] = useState<SizingMode>(follow?.sizingMode ?? 'PROPORTIONAL');
  const [value, setValue] = useState<Num>(String(follow?.sizingValue ?? 1));
  const [lossCap, setLossCap] = useState<Num>(follow?.dailyLossLimitUsd != null ? String(follow.dailyLossLimitUsd) : '');
  const [profitCap, setProfitCap] = useState<Num>(follow?.maxProfitUsd != null ? String(follow.maxProfitUsd) : '');
  const [maxPos, setMaxPos] = useState<Num>(follow?.maxPositionUsd != null ? String(follow.maxPositionUsd) : '');
  const [leverage, setLeverage] = useState<Num>(follow?.leverage != null ? String(follow.leverage) : '');
  const [reverse, setReverse] = useState(follow?.copyReverse ?? false);
  const [more, setMore] = useState(!!(follow?.maxPositionUsd || follow?.leverage || follow?.copyReverse));
  const [accepted, setAccepted] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const leaderOpen = leader.openPositions ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (edit) return;
    exchangesApi.list().then(setConns).catch(() => setConns([]));
  }, [edit]);

  // Accounts that can copy this leader: same exchange and environment, working, not a leader account.
  const usable = useMemo(() => (conns ?? []).filter(c => c.exchange === leader.exchange && c.environment === leader.environment && c.status === 'ACTIVE' && c.canTrade && !c.isLeader), [conns, leader]);
  useEffect(() => {
    if (!connectionId && usable.length) setConnectionId((usable.find(c => c.activeFollows === 0) ?? usable[0])!.id);
  }, [usable, connectionId]);

  const v = Number(value);
  const valueErr = !Number.isFinite(v) || v <= 0 ? 'Enter a number above zero.'
    : mode === 'FIXED_NOTIONAL' ? (v < 1 || v > 1_000_000 ? 'Between $1 and $1,000,000.' : null)
      : v < 0.01 || v > 100 ? 'Between 0.01× and 100×.' : null;
  const capErr = (s: Num) => (s.trim() === '' ? null : !(Number(s) > 0) ? 'Leave empty or enter an amount above zero.' : null);
  const levErr = leverage.trim() === '' ? null : !Number.isInteger(Number(leverage)) || Number(leverage) < 1 || Number(leverage) > 100 ? 'A whole number from 1 to 100.' : null;
  const invalid = !!(valueErr || capErr(lossCap) || capErr(profitCap) || capErr(maxPos) || levErr);
  const canSubmit = !busy && !invalid && (edit || (!!connectionId && accepted));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const settings: FollowSettings = {
      sizingMode: mode,
      sizingValue: v,
      dailyLossLimitUsd: toNum(lossCap),
      maxProfitUsd: toNum(profitCap),
      maxPositionUsd: toNum(maxPos),
      leverage: toNum(leverage),
      copyReverse: reverse,
    };
    try {
      onDone(edit ? await followsApi.update(follow!.id, settings) : await followsApi.create({ ...settings, leaderId: leader.id, connectionId, copyOpenTrades: copyOpen && leaderOpen.length > 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const env = leader.environment === 'TESTNET' ? ' testnet' : '';
  return (
    <Modal title={edit ? 'Copy settings' : `Copy ${leader.displayName}`} sub={edit ? 'Changes apply to the leader’s next trade.' : `New trades the leader opens from now on are copied to your account.${leaderOpen.length ? '' : ' They have nothing open right now.'}`} onClose={onClose} busy={busy} wide testId="follow-dialog">
      <form className="cp-form" onSubmit={submit}>
        {!edit && (
          <div className="x-field">
            <label htmlFor="fd-acct">Copy onto</label>
            {conns == null ? <i className="x-skel cp-skel-input" /> : usable.length === 0 ? (
              <div className="x-banner" role="status" data-testid="follow-no-account">
                <span>Connect a {venueName(leader.exchange)}{env} account to copy this leader.</span>
                <Link href="/exchanges" className="x-link">Connect exchange</Link>
              </div>
            ) : (
              <select id="fd-acct" className="x-select" value={connectionId} onChange={e => setConnectionId(e.target.value)} data-testid="follow-account">
                {usable.map(c => <option key={c.id} value={c.id} disabled={c.activeFollows > 0}>{c.label} · ···{c.keyLast4}{c.activeFollows > 0 ? ' (already copying someone)' : ''}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="x-field">
          <span className="x-label">Trade size</span>
          <div className="x-seg x-seg--in cp-modes" role="radiogroup" aria-label="Trade size">
            {MODES.map(m => <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => { setMode(m.id); setValue(m.id === 'FIXED_NOTIONAL' ? '100' : '1'); }}>{m.label}</button>)}
          </div>
          <span className="x-help">{MODES.find(m => m.id === mode)!.help}</span>
        </div>
        <div className="x-field">
          <label htmlFor="fd-val">{mode === 'FIXED_NOTIONAL' ? 'Amount per trade (USD)' : 'Multiplier'}</label>
          <div className="cp-stepper">
            {mode !== 'FIXED_NOTIONAL' && <button type="button" className="x-btn x-btn--sm" onClick={() => setValue(String(Math.max(0.1, Math.round((v - 0.5) * 10) / 10)))} aria-label="Less">−</button>}
            <input id="fd-val" className="x-input m" inputMode="decimal" value={value} onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="follow-value" />
            {mode !== 'FIXED_NOTIONAL' && <button type="button" className="x-btn x-btn--sm" onClick={() => setValue(String(Math.min(100, Math.round((v + 0.5) * 10) / 10)))} aria-label="More">+</button>}
          </div>
          {valueErr && <span className="x-err">{valueErr}</span>}
          {mode === 'PROPORTIONAL' && leader.recommendedMarginUsd != null && <span className="x-help">Suggested balance at 1×: <b className="m">{usd(leader.recommendedMarginUsd, 0)}</b>. With less, smaller trades round down to nothing and are skipped.</span>}
        </div>

        <div className="cp-two">
          <div className="x-field">
            <label htmlFor="fd-loss">Daily loss limit (USD)</label>
            <input id="fd-loss" className="x-input m" inputMode="decimal" placeholder="No limit" value={lossCap} onChange={e => setLossCap(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="follow-loss" />
            {capErr(lossCap) ? <span className="x-err">{capErr(lossCap)}</span> : <span className="x-help">Pauses new copies for the day; exits still copy.</span>}
          </div>
          <div className="x-field">
            <label htmlFor="fd-profit">Profit target (USD)</label>
            <input id="fd-profit" className="x-input m" inputMode="decimal" placeholder="No target" value={profitCap} onChange={e => setProfitCap(e.target.value.replace(/[^0-9.]/g, ''))} />
            {capErr(profitCap) ? <span className="x-err">{capErr(profitCap)}</span> : <span className="x-help">Pauses new copies once this follow is up this much.</span>}
          </div>
        </div>

        <button type="button" className="x-link cp-more" onClick={() => setMore(m => !m)} aria-expanded={more}>{more ? 'Fewer options' : 'More options'}</button>
        {more && (
          <div className="cp-two">
            <div className="x-field">
              <label htmlFor="fd-max">Max position (USD)</label>
              <input id="fd-max" className="x-input m" inputMode="decimal" placeholder="No cap" value={maxPos} onChange={e => setMaxPos(e.target.value.replace(/[^0-9.]/g, ''))} />
              {capErr(maxPos) && <span className="x-err">{capErr(maxPos)}</span>}
            </div>
            <div className="x-field">
              <label htmlFor="fd-lev">Leverage</label>
              <input id="fd-lev" className="x-input m" inputMode="numeric" placeholder="Keep my account’s" value={leverage} onChange={e => setLeverage(e.target.value.replace(/[^0-9]/g, ''))} />
              {levErr && <span className="x-err">{levErr}</span>}
            </div>
            <label className="cp-toggle">
              <button type="button" className="x-switch" role="switch" aria-checked={reverse} onClick={() => setReverse(r => !r)} aria-label="Reverse copy" />
              <span><b>Reverse copy</b><small>Open the opposite side of every trade.</small></span>
            </label>
          </div>
        )}

        {!edit && leaderOpen.length > 0 && (
          <label className="cp-toggle" data-testid="follow-copy-open">
            <button type="button" className="x-switch" role="switch" aria-checked={copyOpen} onClick={() => setCopyOpen(v => !v)} aria-label="Also copy their open trades" />
            <span>
              <b>Also copy their {leaderOpen.length} open {leaderOpen.length === 1 ? 'trade' : 'trades'} now</b>
              <small>{leaderOpen.map(p => `${p.side === 'LONG' ? 'Long' : 'Short'} ${p.symbol}`).join(', ')}. Opened at today’s market price, not the leader’s entry, so your result on these can differ from theirs.</small>
            </span>
          </label>
        )}

        {!edit && (
          <div className="x-inset cp-risk" data-testid="follow-risk">
            <b>Before you start</b>
            <ul>{RISK_POINTS.map(p => <li key={p}>{p}</li>)}</ul>
            <label className="cp-accept">
              <input type="checkbox" className="x-check" checked={accepted} onChange={e => setAccepted(e.target.checked)} data-testid="follow-accept" />
              <span>I understand these risks and want to copy {leader.displayName} on my account.</span>
            </label>
          </div>
        )}

        {error && <div className="x-banner x-banner--err" role="alert" data-testid="follow-error">{error}</div>}
        <footer className="ac-dlg-ft">
          <button type="button" className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="x-btn x-btn--hi" disabled={!canSubmit} data-testid="follow-submit">{busy ? 'Saving…' : edit ? 'Save settings' : 'Start copying'}</button>
        </footer>
      </form>
    </Modal>
  );
}
