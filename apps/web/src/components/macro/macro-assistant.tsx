'use client';

import { useState, type FormEvent } from 'react';
import { macroApi } from '@/lib/macro-api';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

export default function MacroAssistant() {
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setError('');
    setQ('');
    setMsgs(m => [...m, { role: 'user', text: question }, { role: 'assistant', text: '' }]);
    try {
      // Prefer stream; fall back to JSON.
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

  return (
    <div className="tcard p-4 flex flex-col min-h-[360px]" data-testid="macro-assistant">
      <div className="text-[10px] tracking-[0.2em] text-fg-3">// MACRO AI</div>
      <p className="text-[12px] text-fg-3 mt-1">
        Answers from live dashboard state only. Cites indicators. Not financial advice.
      </p>
      <div className="flex-1 overflow-y-auto mt-3 space-y-3 max-h-[420px]">
        {msgs.length === 0 && (
          <p className="text-sm text-fg-3">Ask e.g. “Why is gold’s bias elevated today?”</p>
        )}
        {msgs.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
              m.role === 'user' ? 'text-fg' : 'text-fg-2'
            }`}
            data-testid={`macro-chat-${m.role}-${i}`}
          >
            <span className="text-[10px] tracking-[0.14em] text-fg-3 uppercase block mb-1">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </span>
            {m.text || (busy ? '…' : '')}
          </div>
        ))}
      </div>
      {error && <p className="text-loss text-[12px] mt-2">{error}</p>}
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Ask a macro question…"
          maxLength={2000}
          className="flex-1 bg-surface border border-border rounded-[var(--radius-btn)] px-3 py-2 text-sm"
          data-testid="macro-assistant-input"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="px-3 py-2 text-[11px] tracking-[0.12em] uppercase rounded-[var(--radius-btn)] border border-profit/30 bg-profit/15 text-profit disabled:opacity-40"
          data-testid="macro-assistant-send"
        >
          {busy ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  );
}
