'use client';

// "Ask about this trade": a compact input on the trade review. Common questions
// (why this grade, what if I held, similar trades, was it oversized) are
// answered from the review's own numbers; anything else goes to the coach with
// this trade's computed facts, as a one-off 'ask' conversation (kept out of the
// coach's chat list). One short paragraph, "based on this trade + N similar".
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { AiMark } from '@/components/dashboard-v2/ui';
import { answerTradeAsk, basisLabel, shortParagraph, TRADE_ASK_CHIPS, type TradeAskExtra } from '@/lib/trade-ask';
import type { TradeReviewDTO } from '@/lib/trade-review-api';
import './ask-trade.css';

type State =
  | { status: 'idle' }
  | { status: 'loading'; q: string }
  | { status: 'text'; q: string; text: string; basis: number; done: boolean; coach: boolean }
  | { status: 'error'; q: string; error: string };

export default function AskTrade({ accountId, r, facts, extra }: { accountId: string; r: TradeReviewDTO; facts: string | null; extra: TradeAskExtra }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState<State>({ status: 'idle' });
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => { ctl.current?.abort(); setSt({ status: 'idle' }); setQ(''); }, [r.trade.positionId]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text) return;
    ctl.current?.abort();
    const a = answerTradeAsk(text, r, extra, facts);
    if (a.kind === 'answer') { setSt({ status: 'text', q: text, text: a.text, basis: a.basis, done: true, coach: false }); return; }
    if (!facts) { setSt({ status: 'error', q: text, error: 'Still loading this trade. Try again in a moment.' }); return; }
    const c = new AbortController();
    ctl.current = c;
    setSt({ status: 'loading', q: text });
    let out = '';
    try {
      await api.ai.chat({ accountId, kind: 'ask', messages: [{ role: 'user', content: a.prompt.slice(0, 3900) }] }, tok => {
        out += tok;
        if (!c.signal.aborted) setSt({ status: 'text', q: text, text: shortParagraph(out), basis: a.basis, done: false, coach: true });
      }, { signal: c.signal, onError: m => { if (!out && !c.signal.aborted) setSt({ status: 'error', q: text, error: m }); } });
      if (c.signal.aborted) return;
      const p = shortParagraph(out);
      setSt(p ? { status: 'text', q: text, text: p, basis: a.basis, done: true, coach: true } : { status: 'error', q: text, error: 'The coach had no answer. Try again.' });
    } catch (err) {
      if (!c.signal.aborted) setSt({ status: 'error', q: text, error: err instanceof Error ? err.message : 'The coach is unavailable right now.' });
    }
  };
  const close = () => { ctl.current?.abort(); setSt({ status: 'idle' }); };

  return (
    <section className="d2-card trv-ask" aria-label="Ask about this trade" data-testid="trade-ask">
      <form className="trv-ask-f" onSubmit={e => { e.preventDefault(); void ask(q); }}>
        <AiMark short />
        <input className="trv-ask-in" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask about this trade" maxLength={400} aria-label="Ask about this trade" data-testid="trade-ask-input" />
        <button type="submit" className="trv-ask-go" disabled={!q.trim() || st.status === 'loading'} aria-label="Ask" data-testid="trade-ask-go"><ArrowRight size={14} /></button>
      </form>
      {st.status === 'idle' ? (
        <div className="trv-ask-chips" role="group" aria-label="Common questions">
          {TRADE_ASK_CHIPS.map(c => <button key={c.intent} type="button" className="trv-ask-chip" onClick={() => { setQ(c.q); void ask(c.q); }} data-testid={`trade-ask-${c.intent}`}>{c.q}</button>)}
        </div>
      ) : (
        <div className="trv-ask-a" aria-live="polite" data-testid="trade-ask-answer">
          <div className="trv-ask-q"><b>{st.q}</b><button type="button" className="trv-ask-x" onClick={close} aria-label="Close answer" data-testid="trade-ask-close"><X size={13} /></button></div>
          {st.status === 'loading' && <p className="trv-ask-t trv-muted" data-testid="trade-ask-loading">Thinking…</p>}
          {st.status === 'error' && <p className="trv-ask-t dn" role="alert" data-testid="trade-ask-error">{st.error}</p>}
          {st.status === 'text' && (
            <>
              <p className="trv-ask-t" data-testid="trade-ask-text">{st.text}{!st.done && <span className="trv-ask-cur" aria-hidden />}</p>
              <span className="trv-ask-b" data-testid="trade-ask-basis">{basisLabel(st.basis)}{st.coach ? ' · coach' : ''}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
