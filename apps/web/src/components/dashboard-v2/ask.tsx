'use client';

// "Ask your journal": a question box that answers chart-first. Known question
// types get a chart + one computed line from /api/insights/ask; anything else
// (and every "Explain") goes to the AI coach for one short paragraph.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChatCircleText, X } from '@phosphor-icons/react';
import type { DashboardAskDTO } from '@/lib/dashboard-v2-api';
import { fmtAi } from '@/lib/dashboard-v2-format';
import { AskBars } from './charts';
import { AiMark } from './ui';

export type AskState =
  | { status: 'idle' }
  | { status: 'loading'; q: string }
  | { status: 'chart'; q: string; a: Extract<DashboardAskDTO, { kind: 'chart' }> }
  | { status: 'text'; q: string; text: string; used: number; done: boolean }
  | { status: 'error'; q: string; error: string };

export function AskBox({ state, onAsk, onClose, placement }: { state: AskState; onAsk: (q: string) => void; onClose: () => void; placement: 'top' | 'bar' | 'page' }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const open = state.status !== 'idle';

  // "/" focuses the box from anywhere (not while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        if (!input.current || input.current.offsetParent === null) return;
        e.preventDefault();
        input.current.focus();
      }
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Click outside closes the floating answer (top bar only).
  useEffect(() => {
    if (!open || placement === 'page') return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, placement, onClose]);
  useEffect(() => { if (state.status !== 'idle' && 'q' in state && state.q !== q && document.activeElement !== input.current) setQ(state.q); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (text: string) => { const t = text.trim(); if (t) onAsk(t); };
  return (
    <div ref={wrap} className={`d2-ask d2-ask--${placement}${open ? ' open' : ''}`} data-testid={`ask-${placement}`}>
      <form className="d2-askk" onSubmit={e => { e.preventDefault(); submit(q); }} role="search">
        <ChatCircleText size={15} aria-hidden />
        <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask your journal…" aria-label="Ask your journal" maxLength={300} enterKeyHint="send" />
        <kbd aria-hidden>/</kbd>
      </form>
      {open && (
        <div className="d2-pop" role="dialog" aria-label="Answer" data-testid="ask-answer">
          <div className="d2-pq">
            <AiMark />
            <span className="d2-dim">{state.status === 'chart' ? `${state.a.used} trades` : state.status === 'text' ? 'AI coach' : ''}</span>
            <button type="button" className="d2-x" onClick={onClose} aria-label="Close answer"><X size={14} /></button>
          </div>
          {state.status === 'loading' && <div className="d2-pa d2-loading" aria-busy>Reading your trades…</div>}
          {state.status === 'error' && (
            <div className="d2-pa"><span className="dn">{state.error}</span> <button type="button" className="d2-link" onClick={() => onAsk(state.q)}>Retry</button></div>
          )}
          {state.status === 'chart' && (
            <>
              <div className="d2-pa">{state.a.title.text} {state.a.title.value != null && state.a.title.fmt !== 'text' && <span className={`d2-n mny ${state.a.title.tone === 'dn' ? 'dn' : state.a.title.tone === 'up' ? 'up' : ''}`}>{fmtAi(state.a.title)}</span>}{state.a.title.suffix ? ` ${state.a.title.suffix}` : ''}</div>
              {state.a.bars.length > 0 && <AskBars bars={state.a.bars} />}
              {state.a.followups.length > 0 && <div className="d2-sg">{state.a.followups.map(f => <button key={f} type="button" onClick={() => onAsk(f)}>{f}</button>)}</div>}
              <div className="d2-pf"><span>{state.a.note ?? ''}</span><span className="d2-used">{state.a.used} trades used</span></div>
            </>
          )}
          {state.status === 'text' && (
            <>
              <p className="d2-pt">{state.text || '…'}</p>
              <div className="d2-pf"><span>{state.done ? 'Answered by the AI coach' : 'Writing…'}</span><Link href="/coach" className="d2-used">{state.used} trades used<ArrowRight size={11} /></Link></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
