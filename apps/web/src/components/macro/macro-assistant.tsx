'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { macroApi } from '@/lib/macro-api';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

const STARTERS = [
  'Why is gold’s bias bearish today?',
  'What’s driving the confluence net bias?',
  'Explain the current liquidity backdrop.',
  'Which asset has the strongest macro alignment?',
];

export default function MacroAssistant() {
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);

  async function send(question: string) {
    if (!question || busy) return;
    setBusy(true);
    setError('');
    setQ('');
    setMsgs(m => [...m, { role: 'user', text: question }, { role: 'assistant', text: '' }]);
    try {
      const streamed = await macroApi.assistantStream(question, chunk => {
        setMsgs(m => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, text: last.text + chunk };
          return copy;
        });
      });
      if (!streamed) {
        const res = await macroApi.assistant(question);
        setMsgs(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', text: res.answer };
          return copy;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant failed');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(q.trim());
  }

  return (
    <div className="tcard flex flex-col h-[min(70vh,620px)]" data-testid="macro-assistant">
      <div className="shrink-0 px-4 py-3 border-b border-border-soft flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
        <span className="text-[10px] tracking-[0.2em] text-fg-3">// MACRO AI</span>
        <span className="ml-auto text-[10px] text-fg-3">Grounded on live state · not financial advice</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {msgs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <div>
              <div className="font-display font-black text-lg tracking-tight">Ask the macro desk</div>
              <p className="text-[12px] text-fg-3 mt-1 max-w-sm">
                Answers cite the dashboard’s own indicators, regime and confluence scores.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
              {STARTERS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="text-[11px] px-3 py-1.5 rounded-[var(--radius-pill)] border border-border text-fg-2 hover:text-fg hover:border-border-strong transition-colors"
                  data-testid="macro-assistant-starter"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) => (
            <div key={`${m.role}-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                data-testid={`macro-chat-${m.role}-${i}`}
                className={`max-w-[85%] rounded-[var(--radius-card)] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-surface-hover text-fg border border-border'
                    : 'bg-profit/5 text-fg-2 border border-profit/15'
                }`}
              >
                {m.text || (busy && m.role === 'assistant' ? <span className="text-fg-3">▍</span> : '')}
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-loss text-[12px] px-4 pb-1">{error}</p>}

      <form onSubmit={onSubmit} className="shrink-0 p-3 border-t border-border-soft flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Ask a macro question…"
          maxLength={2000}
          className="flex-1 bg-surface border border-border rounded-[var(--radius-btn)] px-3 py-2 text-sm focus-ring"
          data-testid="macro-assistant-input"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="px-4 py-2 text-[11px] tracking-[0.12em] uppercase rounded-[var(--radius-btn)] border border-profit/30 bg-profit/15 text-profit disabled:opacity-40"
          data-testid="macro-assistant-send"
        >
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
