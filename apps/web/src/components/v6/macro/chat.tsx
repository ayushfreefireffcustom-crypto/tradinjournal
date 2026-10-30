'use client';

// v6 chat surface for the macro assistant: markdown replies, thinking dots,
// Enter-to-send composer. Controlled; the caller owns messages and transport.
import { useEffect, useRef } from 'react';
import MarkdownMessage from '@/components/coach/markdown-message';
import { ISend, ISpark } from './ui';

export interface ChatVM {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  messages: ChatVM[];
  sending: boolean;
  thinking?: boolean;
  input: string;
  onInput: (value: string) => void;
  onSend: (text: string) => void;
  placeholder?: string;
  starters?: string[];
  emptyTitle: string;
  emptyText?: string;
  title: string;
  sub?: string;
  error?: string;
  disclaimer?: string;
  'data-testid'?: string;
}

export default function MacroChat({
  messages, sending, thinking = false, input, onInput, onSend, placeholder = 'Ask a question', starters = [],
  emptyTitle, emptyText, title, sub, error, disclaimer, 'data-testid': testId = 'chat-conversation',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  function submit() {
    const text = input.trim();
    if (!text || sending) return;
    onSend(text);
  }

  return (
    <section className="x-card x-card--flush mc-chat" data-testid={testId}>
      <div className="mc-chat-hd"><i className="x-dot" aria-hidden /><h2>{title}</h2>{sub && <span>{sub}</span>}</div>

      <div ref={scrollRef} className="mc-chat-msgs" data-testid={`${testId}-messages`} aria-live="polite">
        {messages.length === 0 ? (
          <div className="mc-chat-empty">
            <span className="x-ic"><ISpark /></span>
            <b>{emptyTitle}</b>
            {emptyText && <p>{emptyText}</p>}
            {starters.length > 0 && (
              <div className="mc-chat-st">
                {starters.map(s => (
                  <button key={s} type="button" className="x-btn x-btn--sm" disabled={sending} onClick={() => onSend(s)} data-testid={`${testId}-starter`}>{s}</button>
                ))}
              </div>
            )}
          </div>
        ) : messages.map((m, i) => {
          const last = i === messages.length - 1;
          return (
            <div key={i} className={`mc-msg ${m.role}`} data-testid={`${testId}-msg-${m.role}`}>
              {m.role === 'user' ? m.content : m.content ? <MarkdownMessage content={m.content} /> : (
                <span className="mc-dots" aria-label={last && thinking ? 'Thinking' : 'Waiting'}><i /><i /><i /></span>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="x-banner x-banner--err mc-chat-err" data-testid={`${testId}-error`} role="alert"><span>{error}</span></div>}

      <form className="mc-chat-f" onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="mc-chat-in">
          <textarea value={input} onChange={e => onInput(e.target.value)} rows={1} maxLength={2000} placeholder={placeholder} aria-label={placeholder}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} data-testid={`${testId}-input`} />
          <button type="submit" className="x-btn x-btn--hi x-btn--icon" disabled={sending || !input.trim()} aria-label="Send" data-testid={`${testId}-send`}><ISend /></button>
        </div>
        {disclaimer && <p>{disclaimer}</p>}
      </form>
    </section>
  );
}
