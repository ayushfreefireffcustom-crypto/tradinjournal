'use client';

// Order ticket (D10, D11, D13): account and contract, side, order type, size as
// contracts / USD / risk %, prices, leverage, take-profit and stop-loss. Three
// steps: fill in → review (the server's own check of exactly this ticket) →
// sent, with a plain outcome. One request id per ticket, so a double click or a
// retry can never place a second order.
import { useEffect, useMemo, useState } from 'react';
import { Modal, useLoad } from '@/components/v6/copy/parts';
import { ApiError, exchangesApi, price, tradingApi, usd, type OrderTicket, type PlaceTicketResult, type TicketPreview, type TicketQuote, type TicketType, type TradableAccount } from '@/lib/copy-api';

// Suggestions until the account's own contract list arrives.
const SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'DOGEUSD', 'BNBUSD'];
const TYPES: Array<{ id: TicketType; label: string; help: string }> = [
  { id: 'MARKET', label: 'Market', help: 'Fills now at the best price available.' },
  { id: 'LIMIT', label: 'Limit', help: 'Waits on the book until the price reaches your limit.' },
  { id: 'STOP_MARKET', label: 'Stop', help: 'Becomes a market order when the price touches the trigger.' },
  { id: 'STOP_LIMIT', label: 'Stop limit', help: 'Becomes a limit order when the price touches the trigger.' },
];
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export default function OrderTicketDialog({ onClose, onPlaced, initial }: {
  onClose: () => void;
  onPlaced: () => void;
  initial?: { connectionId?: string; symbol?: string; side?: 'BUY' | 'SELL'; reduceOnly?: boolean };
}) {
  const accounts = useLoad(() => exchangesApi.list(), []);
  const usable = (accounts.data ?? []).filter(c => c.status === 'ACTIVE' && c.canTrade);
  const [connectionId, setConnectionId] = useState(initial?.connectionId ?? '');
  const [symbol, setSymbol] = useState(initial?.symbol ?? 'BTCUSD');
  const [side, setSide] = useState<'BUY' | 'SELL'>(initial?.side ?? 'BUY');
  const [type, setType] = useState<TicketType>('MARKET');
  const [sizeMode, setSizeMode] = useState<'contracts' | 'usd' | 'risk'>('contracts');
  const [sizeValue, setSizeValue] = useState('1');
  const [limit, setLimit] = useState('');
  const [stop, setStop] = useState('');
  const [lev, setLev] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [tif, setTif] = useState<'GTC' | 'IOC'>('GTC');
  const [postOnly, setPostOnly] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(initial?.reduceOnly ?? false);
  const [confirmLive, setConfirmLive] = useState(false);
  const [requestId] = useState(newId);
  const [step, setStep] = useState<'edit' | 'review' | 'done'>('edit');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<TicketPreview | null>(null);
  const [result, setResult] = useState<PlaceTicketResult | null>(null);
  const [quote, setQuote] = useState<TicketQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState('');

  useEffect(() => { if (!connectionId && usable[0]) setConnectionId(usable[0].id); }, [usable, connectionId]);
  const [contracts, setContracts] = useState<TradableAccount[] | null>(null);
  useEffect(() => { tradingApi.instruments().then(setContracts, () => setContracts(null)); }, []);
  const suggestions = contracts?.find(a => a.connectionId === connectionId)?.instruments.map(i => i.symbol).sort() ?? SYMBOLS;

  // Contract specs, mark and balance for the live estimate; refreshed as the account or contract changes.
  useEffect(() => {
    if (!connectionId || !symbol.trim()) return;
    let alive = true;
    setQuoteErr('');
    const t = setTimeout(() => {
      tradingApi.quote(connectionId, symbol.trim().toUpperCase())
        .then(q => { if (alive) { setQuote(q); if (!lev && q.currentLeverage) setLev(String(q.currentLeverage)); } })
        .catch(e => { if (alive) { setQuote(null); setQuoteErr(e instanceof Error ? e.message : 'Could not load this contract'); } });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, symbol]);

  const isLimit = type === 'LIMIT' || type === 'STOP_LIMIT';
  const isStop = type === 'STOP_MARKET' || type === 'STOP_LIMIT';
  const ticket: OrderTicket = {
    connectionId, symbol: symbol.trim().toUpperCase(), side, type,
    size: { mode: sizeMode, value: Number(sizeValue) },
    limitPrice: isLimit ? num(limit) : undefined,
    stopPrice: isStop ? num(stop) : undefined,
    tif: isLimit ? tif : undefined,
    postOnly: isLimit && postOnly ? true : undefined,
    reduceOnly: reduceOnly || undefined,
    leverage: !reduceOnly && num(lev) && quote && Number(lev) !== quote.currentLeverage ? Math.round(Number(lev)) : undefined,
    takeProfit: type === 'MARKET' && !reduceOnly ? num(tp) : undefined,
    stopLoss: type === 'MARKET' && !reduceOnly ? num(sl) : undefined,
    confirmLive: confirmLive || undefined,
    requestId,
  };

  // Rough live estimate; the server's preview is the real check.
  const est = useMemo(() => {
    if (!quote) return null;
    const ref = type === 'MARKET' ? quote.markPrice : type === 'STOP_MARKET' ? num(stop) : num(limit);
    if (!ref) return null;
    const per = ref * quote.contractMultiplier;
    const v = Number(sizeValue);
    if (!(v > 0)) return null;
    const qty = sizeMode === 'contracts' ? Math.floor(v) : sizeMode === 'usd' ? Math.floor(v / per) : null;
    return { per, qty, notional: qty != null ? qty * per : null };
  }, [quote, type, stop, limit, sizeValue, sizeMode]);

  const formOk = !!connectionId && !!symbol.trim() && Number(sizeValue) > 0 && (!isLimit || (num(limit) ?? 0) > 0) && (!isStop || (num(stop) ?? 0) > 0) && (!quote || quote.environment !== 'LIVE' || confirmLive);

  async function review() {
    setBusy(true); setErr('');
    try {
      setPreview(await tradingApi.preview(ticket));
      setStep('review');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not check the order. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setBusy(true); setErr('');
    try {
      const r = await tradingApi.place(ticket);
      setResult(r);
      setStep('done');
      onPlaced();
    } catch (e) {
      if (e instanceof ApiError && e.details?.ticket) { setPreview(p => (p ? { ...p, ok: false, errors: e.details!.ticket! } : p)); setErr('The order no longer passes the checks; see above. Nothing was sent.'); }
      else setErr(e instanceof ApiError ? e.message : 'Could not reach the server. Check the Open and Pending tabs before trying again.');
    } finally {
      setBusy(false);
    }
  }

  const acct = usable.find(c => c.id === connectionId);
  const title = step === 'done' ? 'Order sent' : step === 'review' ? 'Review order' : 'New order';
  const sideWord = side === 'BUY' ? 'Buy / long' : 'Sell / short';

  return (
    <Modal title={title} wide onClose={onClose} busy={busy} testId="ticket"
      sub={acct ? `${acct.label}${acct.environment === 'TESTNET' ? ' · testnet' : ' · real money'}` : undefined}
      footer={step === 'edit' ? <>
        <button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="x-btn x-btn--hi" onClick={() => void review()} disabled={busy || !formOk} data-testid="ticket-review">{busy ? 'Checking…' : 'Review'}</button>
      </> : step === 'review' ? <>
        <button className="x-btn x-btn--ghost" onClick={() => { setStep('edit'); setErr(''); }} disabled={busy} data-testid="ticket-back">Back</button>
        <button className={`x-btn x-btn--hi ${side === 'SELL' ? 'trd-sell' : 'trd-buy'}`} onClick={() => void send()} disabled={busy || !preview?.ok} data-testid="ticket-send">
          {busy ? 'Sending…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${preview?.qty ?? ''} ${preview?.symbol ?? ''}`}
        </button>
      </> : <button className="x-btn x-btn--hi" onClick={onClose} data-testid="ticket-done">Done</button>}>

      {step === 'edit' && (
        <div className="tk" data-testid="ticket-edit">
          {accounts.data && !usable.length && <p className="cp-err">No exchange account here can trade. Connect a key with trading on, on the Exchanges page.</p>}
          <div className="tk-row">
            <div className="x-field">
              <label htmlFor="tk-acct">Account</label>
              <select id="tk-acct" className="x-input" value={connectionId} onChange={e => setConnectionId(e.target.value)} data-testid="ticket-account">
                {usable.map(c => <option key={c.id} value={c.id}>{c.label}{c.environment === 'TESTNET' ? ' (testnet)' : ' (real money)'}</option>)}
              </select>
            </div>
            <div className="x-field">
              <label htmlFor="tk-sym">Contract</label>
              <input id="tk-sym" className="x-input m" list="tk-syms" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} data-testid="ticket-symbol" />
              <datalist id="tk-syms">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
            </div>
          </div>
          {quoteErr ? <p className="cp-err" data-testid="ticket-quote-error">{quoteErr}</p> : quote && (
            <p className="tk-quote x-muted" data-testid="ticket-quote">
              Mark <b className="m">{price(quote.markPrice)}</b> · 1 contract = {quote.contractMultiplier} {quote.symbol.replace(/USDT?$/, '')}{est ? <> ≈ {usd(est.per)}</> : null} · available <b className="m">{usd(quote.availableUsd)}</b>
              {quote.position !== 0 && <> · holding <b className="m">{quote.position > 0 ? 'long' : 'short'} {Math.abs(quote.position)}</b></>}
            </p>
          )}

          <div className="x-seg tk-side" role="radiogroup" aria-label="Side">
            {(['BUY', 'SELL'] as const).map(s => <button key={s} type="button" role="radio" aria-checked={side === s} className={side === s ? (s === 'BUY' ? 'on tk-buy' : 'on tk-sell') : ''} onClick={() => setSide(s)} data-testid={`ticket-side-${s}`}>{s === 'BUY' ? 'Buy / long' : 'Sell / short'}</button>)}
          </div>

          <div className="x-field">
            <label>Order type</label>
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Order type">
              {TYPES.map(t => <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => setType(t.id)} data-testid={`ticket-type-${t.id}`}>{t.label}</button>)}
            </div>
            <span className="x-help">{TYPES.find(t => t.id === type)!.help}</span>
          </div>

          {(isStop || isLimit) && (
            <div className="tk-row">
              {isStop && <div className="x-field"><label htmlFor="tk-stop">Trigger price</label><input id="tk-stop" className="x-input m" inputMode="decimal" value={stop} onChange={e => setStop(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={quote?.markPrice ? String(quote.markPrice) : ''} data-testid="ticket-stop" /></div>}
              {isLimit && <div className="x-field"><label htmlFor="tk-limit">Limit price</label><input id="tk-limit" className="x-input m" inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={quote?.markPrice ? String(quote.markPrice) : ''} data-testid="ticket-limit" /></div>}
            </div>
          )}

          <div className="x-field">
            <label htmlFor="tk-size">Size</label>
            <div className="tk-size">
              <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Size in">
                {([['contracts', 'Contracts'], ['usd', 'USD'], ['risk', 'Risk %']] as const).map(([m, l]) => <button key={m} type="button" role="radio" aria-checked={sizeMode === m} onClick={() => setSizeMode(m)} data-testid={`ticket-size-${m}`}>{l}</button>)}
              </div>
              <input id="tk-size" className="x-input m" inputMode="decimal" value={sizeValue} onChange={e => setSizeValue(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ticket-size" />
            </div>
            <span className="x-help" data-testid="ticket-size-help">
              {sizeMode === 'risk' ? 'Share of your equity you’d lose if the stop-loss is hit. Needs a stop-loss below.'
                : est?.qty != null ? <>≈ {est.qty} {est.qty === 1 ? 'contract' : 'contracts'}{est.notional != null ? <>, {usd(est.notional)} position</> : null}. Delta trades whole contracts; sizes round down.</> : 'Delta trades whole contracts; sizes round down.'}
            </span>
          </div>

          {!reduceOnly && (
            <div className="tk-row">
              <div className="x-field">
                <label htmlFor="tk-lev">Leverage</label>
                <input id="tk-lev" className="x-input m" inputMode="numeric" value={lev} onChange={e => setLev(e.target.value.replace(/[^0-9]/g, ''))} data-testid="ticket-leverage" />
                <span className="x-help">{quote?.currentLeverage ? `Now ${quote.currentLeverage}×` : 'Current leverage unknown'}{quote?.maxLeverage ? `, up to ${quote.maxLeverage}×` : ''}. Changing it applies to the whole {symbol} position.</span>
              </div>
              {type === 'MARKET' && <>
                <div className="x-field"><label htmlFor="tk-tp">Take-profit <span className="x-dim">optional</span></label><input id="tk-tp" className="x-input m" inputMode="decimal" value={tp} onChange={e => setTp(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ticket-tp" /></div>
                <div className="x-field"><label htmlFor="tk-sl">Stop-loss <span className="x-dim">{sizeMode === 'risk' ? 'required' : 'optional'}</span></label><input id="tk-sl" className="x-input m" inputMode="decimal" value={sl} onChange={e => setSl(e.target.value.replace(/[^0-9.]/g, ''))} data-testid="ticket-sl" /></div>
              </>}
            </div>
          )}

          <details className="tk-more">
            <summary>More options</summary>
            {isLimit && (
              <div className="tk-row">
                <div className="x-field">
                  <label>Time in force</label>
                  <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Time in force">
                    <button type="button" role="radio" aria-checked={tif === 'GTC'} onClick={() => setTif('GTC')}>Good till cancelled</button>
                    <button type="button" role="radio" aria-checked={tif === 'IOC'} onClick={() => setTif('IOC')}>Fill now or cancel</button>
                  </div>
                </div>
                <label className="cp-accept"><input type="checkbox" className="x-check" checked={postOnly} onChange={e => setPostOnly(e.target.checked)} data-testid="ticket-postonly" /><span>Post-only: cancel instead of filling straight away (maker fee only)</span></label>
              </div>
            )}
            <label className="cp-accept"><input type="checkbox" className="x-check" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} data-testid="ticket-reduceonly" /><span>Reduce-only: only closes or shrinks a position, never opens or grows one</span></label>
          </details>

          {quote?.environment === 'LIVE' && (
            <label className="cp-accept"><input type="checkbox" className="x-check" checked={confirmLive} onChange={e => setConfirmLive(e.target.checked)} data-testid="ticket-live" /><span>This is a <b>real-money</b> account. I understand this order uses real funds.</span></label>
          )}
          {err && <p className="cp-err" role="alert" data-testid="ticket-error">{err}</p>}
        </div>
      )}

      {step === 'review' && preview && (
        <div className="tk" data-testid="ticket-preview">
          <div className={`tk-sum ${side === 'BUY' ? 'tk-sum--buy' : 'tk-sum--sell'}`}>
            <b>{sideWord} {preview.qty} {preview.symbol}</b>
            <span>{TYPES.find(t => t.id === preview.type)!.label}{preview.reduceOnly ? ' · reduce-only' : ''}{preview.postOnly ? ' · post-only' : ''}{preview.tif ? ` · ${preview.tif === 'GTC' ? 'good till cancelled' : 'fill now or cancel'}` : ''}</span>
          </div>
          <dl className="trd-dl">
            {preview.stopPrice != null && <div><dt>Trigger</dt><dd className="m">{price(preview.stopPrice)}</dd></div>}
            {preview.limitPrice != null && <div><dt>Limit</dt><dd className="m">{price(preview.limitPrice)}</dd></div>}
            <div><dt>{preview.type === 'MARKET' ? 'Mark now' : 'Priced at'}</dt><dd className="m">{price(preview.refPrice)}</dd></div>
            <div><dt>Position value</dt><dd className="m">{usd(preview.notionalUsd)}</dd></div>
            <div><dt>Leverage</dt><dd className="m">{preview.leverage ? `${preview.leverage}×` : '—'}{preview.leverage && preview.currentLeverage && preview.leverage !== preview.currentLeverage ? ` (changes from ${preview.currentLeverage}×)` : ''}</dd></div>
            <div><dt>Margin used</dt><dd className="m">{usd(preview.marginUsd)} of {usd(preview.availableUsd)} available</dd></div>
            {preview.takeProfit != null && <div><dt>Take-profit</dt><dd className="m">{price(preview.takeProfit)}</dd></div>}
            {preview.stopLoss != null && <div><dt>Stop-loss</dt><dd className="m">{price(preview.stopLoss)}{preview.riskUsd != null ? ` · lose about ${usd(preview.riskUsd)} if hit` : ''}</dd></div>}
          </dl>
          {preview.errors.length > 0 && <ul className="tk-msgs tk-msgs--err" data-testid="ticket-errors">{preview.errors.map(e => <li key={e}>{e}</li>)}</ul>}
          {preview.warnings.length > 0 && <ul className="tk-msgs" data-testid="ticket-warnings">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          {preview.environment === 'LIVE' && <p className="cp-err">Real-money account.</p>}
          <p className="cp-fine">Prices move: a market order fills at the best price when it reaches the exchange, which can differ from the mark shown.</p>
          {err && <p className="cp-err" role="alert" data-testid="ticket-error">{err}</p>}
        </div>
      )}

      {step === 'done' && result && (
        <div className="tk" data-testid="ticket-result">
          <p className={`tk-out tk-out--${result.outcome}`} data-testid="ticket-outcome" data-outcome={result.outcome}>{result.message}</p>
          {result.protective.map(p => <p key={p.kind} className={p.ok ? 'pos' : 'cp-err'} data-testid={`ticket-protective-${p.kind}`}>{p.message}</p>)}
          {result.order?.exchangeOrderId && <p className="x-muted m">Order ID {result.order.exchangeOrderId}</p>}
          {result.outcome === 'unconfirmed' && <p className="cp-err">Don&rsquo;t send it again until you&rsquo;ve checked the Open and Pending tabs: it may have gone through.</p>}
        </div>
      )}
    </Modal>
  );
}
