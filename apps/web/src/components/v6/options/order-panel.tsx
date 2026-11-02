'use client';

// Send the builder's option legs to a connected Delta account (G11). The
// review step shows each leg's price and cost and the account's balance;
// legs go out one at a time and stop at the first one the exchange refuses.
import Link from '@/components/v6/ui/link';
import { useEffect, useState } from 'react';
import Modal from '@/components/v6/ui/modal';
import { ApiError, exchangesApi, type ExchangeConnection } from '@/lib/copy-api';
import { TRADING_ENABLED } from '@/lib/features';
import { fmtNum, fmtUsd, optionsApi, type BasketLeg, type BasketPlan, type BasketResult, type LegInput, type OptionsCtx, type Pricing } from '@/lib/options-api';
import '@/styles/v6/kit.css';

const PRICING: Array<[Pricing, string]> = [['touch', 'Limit at best price'], ['mark', 'Limit at mark'], ['market', 'Market']];
const OUTCOME: Record<string, string> = { filled: 'Filled', partial: 'Part filled', resting: 'Waiting', rejected: 'Refused', unconfirmed: 'Not confirmed', skipped: 'Not sent' };

export default function OrderPanel({ ctx, setCtx, legs }: { ctx: OptionsCtx; setCtx: (c: OptionsCtx) => void; legs: LegInput[] }) {
  const [conns, setConns] = useState<ExchangeConnection[] | null>(null);
  const [connId, setConnId] = useState('');
  const [pricing, setPricing] = useState<Pricing>('touch');
  const [review, setReview] = useState<{ requestId: string; plan: BasketPlan | null; error: string | null; result: BasketResult | null; sending: boolean } | null>(null);
  useEffect(() => {
    if (!TRADING_ENABLED) return;
    exchangesApi.list().then((cs) => { const ok = cs.filter((c) => c.exchange === 'DELTA_INDIA' && c.status === 'ACTIVE' && c.canTrade); setConns(ok); setConnId((v) => v || ok[0]?.id || ''); }, () => setConns([]));
  }, []);
  if (!TRADING_ENABLED) return null;
  const conn = conns?.find((c) => c.id === connId);
  const connEnv = conn ? (conn.environment === 'TESTNET' ? 'testnet' : 'live') : null;
  const options = legs.filter((l): l is LegInput & { kind: 'call' | 'put'; strike: number; expiry: string } => l.kind !== 'future' && l.strike != null && !!l.expiry);
  const basket: BasketLeg[] = options.map((l) => ({ kind: l.kind, side: l.side, qty: l.qty, strike: l.strike, expiry: l.expiry }));
  const body = (requestId: string) => ({ connectionId: connId, requestId, underlying: ctx.underlying, legs: basket, pricing });
  async function open() {
    const requestId = crypto.randomUUID();
    setReview({ requestId, plan: null, error: null, result: null, sending: false });
    try { const plan = await optionsApi.orderPreview(body(requestId)); setReview((r) => (r ? { ...r, plan } : r)); }
    catch (e) { setReview((r) => (r ? { ...r, error: e instanceof ApiError ? e.message : 'Could not price this order.' } : r)); }
  }
  async function send() {
    if (!review) return;
    setReview({ ...review, sending: true });
    try { const result = await optionsApi.orderPlace(body(review.requestId)); setReview((r) => (r ? { ...r, result, sending: false } : r)); }
    catch (e) { setReview((r) => (r ? { ...r, sending: false, error: e instanceof ApiError ? e.message : 'Could not send the order.' } : r)); }
  }
  return (
    <section className="x-card" aria-label="Place the order" data-testid="op-order">
      <div className="x-ch"><h2>Place on Delta</h2></div>
      {!conns ? <div className="x-skel" style={{ height: 60 }} /> : !conns.length ? (
        <p className="x-muted">Connect a Delta account that can trade on the <Link className="x-link" href="/exchanges">Exchanges</Link> page to send these legs.</p>
      ) : (
        <>
          <div className="op-order-row">
            <label className="op-inline">Account <select className="x-input" value={connId} onChange={(e) => setConnId(e.target.value)} data-testid="op-order-conn">{conns.map((c) => <option key={c.id} value={c.id}>{c.label} · {c.environment === 'TESTNET' ? 'testnet' : 'live'}</option>)}</select></label>
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Pricing">{PRICING.map(([p, l]) => <button key={p} type="button" role="radio" aria-checked={pricing === p} onClick={() => setPricing(p)} data-testid={`op-order-${p}`}>{l}</button>)}</div>
          </div>
          {connEnv && connEnv !== ctx.env ? (
            <p className="cp-err" data-testid="op-order-env">This account trades on {connEnv === 'testnet' ? 'the testnet' : 'Delta live'}, but the prices above are from {ctx.env === 'testnet' ? 'the testnet' : 'Delta live'}. <button type="button" className="x-btn x-btn--sm" onClick={() => setCtx({ ...ctx, env: connEnv })} data-testid="op-order-switch">Use {connEnv === 'testnet' ? 'testnet' : 'live'} prices</button></p>
          ) : (
            <button type="button" className="x-btn x-btn--hi" disabled={!basket.length} onClick={() => void open()} data-testid="op-order-review">Review {basket.length} leg{basket.length === 1 ? '' : 's'}</button>
          )}
          {legs.some((l) => l.kind === 'future') && <p className="x-muted op-fine">Futures legs aren’t sent with the options; place them from the trading desk.</p>}
        </>
      )}
      {review && (
        <Modal title={review.result ? 'Order sent' : 'Review the order'} sub={conn ? `${conn.label} · ${conn.environment === 'TESTNET' ? 'testnet' : 'live money'}` : undefined} onClose={() => setReview(null)} busy={review.sending} wide testId="op-order-dialog"
          footer={review.result ? <><Link className="x-btn" href="/trading">Open the desk</Link><button className="x-btn x-btn--hi" onClick={() => setReview(null)}>Done</button></>
            : <><button className="x-btn" onClick={() => setReview(null)} disabled={review.sending}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void send()} disabled={!review.plan || review.sending} data-testid="op-order-send">{review.sending ? 'Sending…' : `Send ${review.plan?.legs.length ?? ''} leg${review.plan?.legs.length === 1 ? '' : 's'}`}</button></>}>
          {review.error && <p className="cp-err" data-testid="op-order-error">{review.error}</p>}
          {!review.plan && !review.error && <div className="x-skel" style={{ height: 120 }} />}
          {review.plan && !review.result && (
            <>
              <table className="x-tbl op-tbl" data-testid="op-order-plan">
                <thead><tr><th>Contract</th><th>Side</th><th className="r">Contracts</th><th>Order</th><th className="r">Cost</th></tr></thead>
                <tbody>{review.plan.legs.map((l, i) => <tr key={i}><td className="m">{l.symbol}</td><td className={l.side === 'BUY' ? 'pos' : 'neg'}>{l.side === 'BUY' ? 'Buy' : 'Sell'}</td><td className="r m">{l.qty}</td><td className="m">{l.type === 'MARKET' ? `Market (≈${fmtNum(l.refPrice, 1)})` : `Limit ${fmtNum(l.limitPrice, 1)}`}</td><td className={`r m ${(l.cost ?? 0) > 0 ? 'neg' : 'pos'}`}>{l.cost == null ? '—' : `${l.cost > 0 ? 'pay ' : 'receive '}${fmtUsd(Math.abs(l.cost))}`}</td></tr>)}</tbody>
              </table>
              <p className="op-fine" data-testid="op-order-net">Net: <b className="m">{review.plan.netCost == null ? '—' : `${review.plan.netCost > 0 ? 'pay' : 'receive'} ${fmtUsd(Math.abs(review.plan.netCost))}`}</b> · available {fmtUsd(review.plan.availableUsd)} of {fmtUsd(review.plan.equityUsd)}. Fees and margin are set by Delta.</p>
              {review.plan.warnings.map((w, i) => <p key={i} className="x-muted op-fine">{w}</p>)}
            </>
          )}
          {review.result && (
            <>
              <p data-testid="op-order-result">{review.result.message}</p>
              <ul className="op-order-out">{review.result.legs.map((l, i) => <li key={i}><span className="m">{l.symbol}</span> <span className={`x-tag ${l.outcome === 'filled' ? 'x-tag--g' : l.outcome === 'rejected' ? 'x-tag--r' : ''}`}>{OUTCOME[l.outcome]}</span> <span className="x-muted">{l.message}</span></li>)}</ul>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
