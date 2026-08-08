'use client';

// Reusable AI chat surface — the same conversation UX the AI Coach uses
// (markdown replies, avatar bubbles, thinking indicator, textarea composer with
// Enter-to-send and a Stop control), extracted so other assistants (e.g. the
// macro desk) share one implementation instead of forking their own.
//
// Presentational + controlled: the parent owns the message list, input value and
// send/stop handlers, so the transport (which endpoint, how it streams) stays
// with the caller. Injection-safe — assistant text is rendered as markdown data.
import { useEffect, useRef } from 'react';
import { Robot, PaperPlaneRight, Stop } from '@phosphor-icons/react';
import MarkdownMessage from '@/components/coach/markdown-message';
import ThinkingIndicator from '@/components/coach/thinking-indicator';

export interface ChatVM {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversationProps {
  messages: ChatVM[];
  sending: boolean;
  /** Show the "thinking" shimmer on the trailing empty assistant bubble. */
  thinking?: boolean;
  input: string;
  onInput: (value: string) => void;
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
  starters?: string[];
  emptyTitle?: string;
  emptyText?: string;
  headerLabel?: string;
  headerRight?: React.ReactNode;
  live?: boolean;
  error?: string;
  disclaimer?: string;
  className?: string;
  'data-testid'?: string;
}

export default function ChatConversation({
  messages,
  sending,
  thinking = false,
  input,
  onInput,
  onSend,
  onStop,
  disabled = false,
  placeholder = 'Ask a question…',
  starters = [],
  emptyTitle = 'Ask away',
  emptyText,
  headerLabel,
  headerRight,
  live = false,
  error,
  disclaimer,
  className = '',
  'data-testid': testId = 'chat-conversation',
}: ChatConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  function submit() {
    const text = input.trim();
    if (!text || sending || disabled) return;
    onSend(text);
  }

  return (
    <div className={`tcard flex flex-col ${className}`} data-testid={testId}>
      {(headerLabel || headerRight) && (
        <div className="shrink-0 px-4 py-3 border-b border-border-soft flex items-center gap-2">
          {live && <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />}
          {headerLabel && <span className="text-[10px] tracking-[0.2em] text-fg-3">{headerLabel}</span>}
          {headerRight && <span className="ml-auto text-[10px] text-fg-3">{headerRight}</span>}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4" data-testid={`${testId}-messages`}>
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-profit/15 ring-1 ring-profit/25">
              <Robot size={20} weight="fill" className="text-profit" />
            </span>
            <div>
              <div className="font-display font-black text-lg tracking-tight">{emptyTitle}</div>
              {emptyText && <p className="text-[12px] text-fg-3 mt-1 max-w-sm">{emptyText}</p>}
            </div>
            {starters.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                {starters.map(s => (
                  <button
                    key={s}
                    type="button"
                    disabled={disabled || sending}
                    onClick={() => onSend(s)}
                    className="text-[11px] px-3 py-1.5 rounded-[var(--radius-pill)] border border-border text-fg-2 hover:text-fg hover:border-border-strong transition-colors disabled:opacity-50"
                    data-testid={`${testId}-starter`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => {
            const isUser = m.role === 'user';
            const isLast = i === messages.length - 1;
            return (
              <div key={i} className={isUser ? 'flex justify-end' : 'flex gap-2.5 justify-start'} data-testid={`${testId}-msg-${m.role}`}>
                {!isUser && (
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/20">
                    <Robot size={15} weight="fill" className="text-profit" />
                  </span>
                )}
                <div
                  className={
                    isUser
                      ? 'max-w-[82%] rounded-[18px] rounded-br-md bg-profit/15 border border-profit/25 px-3.5 py-2.5 text-[13px] text-fg whitespace-pre-wrap'
                      : 'max-w-[calc(100%-2.5rem)] rounded-[18px] rounded-tl-md border border-border-soft bg-surface/40 px-4 py-3'
                  }
                >
                  {isUser ? (
                    m.content
                  ) : m.content ? (
                    <MarkdownMessage content={m.content} />
                  ) : isLast && thinking ? (
                    <ThinkingIndicator phase="thinking" />
                  ) : (
                    <span className="pulse-dot inline-block w-2 h-2 rounded-full bg-profit" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && <p className="text-loss text-[12px] px-4 pb-1" data-testid={`${testId}-error`}>{error}</p>}

      <form
        onSubmit={e => { e.preventDefault(); submit(); }}
        className="shrink-0 p-3 border-t border-border-soft"
      >
        <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-border-soft bg-surface/60 px-2 py-1.5 focus-within:border-profit/45 focus-within:bg-surface transition-colors">
          <textarea
            value={input}
            onChange={e => onInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={1}
            maxLength={2000}
            placeholder={placeholder}
            disabled={disabled}
            data-testid={`${testId}-input`}
            className="flex-1 resize-none max-h-32 bg-transparent border-0 outline-none px-2 py-2 text-[13px] text-fg placeholder:text-fg-3 disabled:opacity-50"
          />
          {sending && onStop ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              data-testid={`${testId}-stop`}
              className="btn py-2 px-3 shrink-0 rounded-[var(--radius-btn)] border border-border-strong text-fg-2 hover:text-fg hover:border-loss/50 transition-colors"
            >
              <Stop size={15} weight="fill" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || sending || !input.trim()}
              aria-label="Send"
              data-testid={`${testId}-send`}
              className="btn btn-primary py-2 px-3 shrink-0 rounded-[var(--radius-btn)] disabled:opacity-40"
            >
              <PaperPlaneRight size={15} weight="fill" />
            </button>
          )}
        </div>
        {disclaimer && (
          <p className="text-center text-[9px] tracking-[0.2em] text-fg-3 mt-2">{disclaimer}</p>
        )}
      </form>
    </div>
  );
}
