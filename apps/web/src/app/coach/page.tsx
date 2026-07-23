'use client';

// AI Coach — a live chatbot grounded on the user's own trading-journal data, with
// real-time web search for external/current questions. Streams the reply
// token-by-token over SSE, shows a "searching/thinking" state, renders markdown,
// cites web sources, and persists the conversation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Robot, PaperPlaneRight, Sparkle, Globe } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import MarkdownMessage from '@/components/coach/markdown-message';
import ThinkingIndicator from '@/components/coach/thinking-indicator';
import SourcesFooter from '@/components/coach/sources-footer';
import { useAccounts } from '@/lib/use-accounts';
import { api, type AiChatMessage, type BrokerAccount } from '@/lib/api';

const STARTERS = [
  { icon: Sparkle, text: "What's my biggest leak right now?" },
  { icon: Sparkle, text: 'Why do I lose on certain days?' },
  { icon: Sparkle, text: 'Am I cutting winners too early?' },
  { icon: Globe, text: "What's on the economic calendar this week?" },
];

type Phase = null | 'thinking' | 'searching';

export default function CoachPage() {
  const { accounts, selected, select } = useAccounts();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<Phase>(null);
  const [error, setError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const accountId = selected?.id ?? null;

  // Auto-scroll to the newest message / token.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  // Load the most recent conversation for the selected account.
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setHistoryLoading(true);
    setMessages([]);
    setConversationId(undefined);
    setError('');
    (async () => {
      try {
        const convos = await api.ai.conversations();
        const latest = convos.find(c => c.brokerAccountId === accountId);
        if (!alive) return;
        if (latest) {
          const detail = await api.ai.conversation(latest.id);
          if (!alive) return;
          setConversationId(detail.id);
          setMessages(detail.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
        }
      } catch {
        // No history is fine — start fresh.
      } finally {
        if (alive) setHistoryLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accountId]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending || !accountId) return;

      setError('');
      setInput('');
      const history: AiChatMessage[] = [...messages, { role: 'user', content }];
      // Optimistically render the user message + an empty assistant bubble to fill.
      setMessages([...history, { role: 'assistant', content: '' }]);
      setSending(true);
      setPhase('thinking');

      const appendToAssistant = (chunk: string) => {
        // First token means the answer is streaming — clear the working state.
        setPhase(null);
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      };

      try {
        const result = await api.ai.chat(
          { accountId, conversationId, messages: history },
          appendToAssistant,
          msg => setError(msg),
          () => setPhase('searching'),
        );
        if (result.conversationId) setConversationId(result.conversationId);
        // Attach any web citations to the assistant message we just streamed.
        if (result.sources && result.sources.length > 0) {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') next[next.length - 1] = { ...last, sources: result.sources };
            return next;
          });
        }
      } catch (err) {
        const e = err as Error & { code?: string };
        setError(e.message || 'The coach could not respond. Please try again.');
        // Drop the empty assistant bubble on hard failure.
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && last.content === '') next.pop();
          return next;
        });
      } finally {
        setSending(false);
        setPhase(null);
      }
    },
    [messages, sending, accountId, conversationId],
  );

  const isEmpty = messages.length === 0;

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="AI Coach"
      pageSubtitle="// TRAINED ON YOUR DATA"
    >
      <div className="flex flex-col h-[calc(100vh-var(--topbar-h,7rem))] min-h-0" data-testid="coach-page">
        {/* Message stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-5" data-testid="coach-messages">
          {isEmpty ? (
            <div className="max-w-2xl mx-auto mt-8 sm:mt-14" data-testid="coach-empty">
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-profit/15 ring-1 ring-profit/25">
                  <Robot size={20} weight="fill" className="text-profit" />
                </span>
                <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tighter">
                  ASK YOUR <span className="text-profit">COACH.</span>
                </h2>
              </div>
              <p className="text-fg-2 text-[13px] sm:text-[14px] leading-relaxed max-w-lg">
                {historyLoading
                  ? 'Loading your history…'
                  : 'I read your closed trades, stats and journal — and I can search the web for market context. Ask about your behaviour or what’s happening out there. No trade signals, just clarity.'}
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 mt-6">
                {STARTERS.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => send(text)}
                    disabled={sending || !accountId}
                    data-testid="coach-starter"
                    className="group text-left rounded-[var(--radius-card)] border border-border-soft bg-surface/50 px-4 py-3.5 text-[12.5px] text-fg-2 hover:border-profit/40 hover:bg-surface hover:text-fg transition-all flex items-center gap-2.5 disabled:opacity-50"
                  >
                    <Icon size={15} weight="fill" className="text-profit shrink-0 group-hover:scale-110 transition-transform" />
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const isUser = m.role === 'user';
                return (
                  <div key={i} className={isUser ? 'flex justify-end' : 'flex gap-2.5 justify-start'} data-testid={`coach-msg-${m.role}`}>
                    {/* Assistant avatar */}
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
                        <>
                          <MarkdownMessage content={m.content} />
                          {m.sources && m.sources.length > 0 && <SourcesFooter sources={m.sources} />}
                        </>
                      ) : isLast && phase ? (
                        <ThinkingIndicator phase={phase} />
                      ) : (
                        <span className="pulse-dot inline-block w-2 h-2 rounded-full bg-profit" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 sm:mx-4 lg:mx-6 mb-2 border border-loss/30 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-wide rounded-[var(--radius-btn)]" data-testid="coach-error">
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="px-3 sm:px-4 lg:px-6 pb-3 pt-1"
          data-testid="coach-form"
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-border-soft bg-surface/60 px-2 py-1.5 focus-within:border-profit/45 focus-within:bg-surface transition-colors">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                }}
                rows={1}
                placeholder={accountId ? 'Ask about your trading, or anything market-related…' : 'Connect a broker to start'}
                disabled={sending || !accountId}
                data-testid="coach-input"
                className="flex-1 resize-none max-h-32 bg-transparent border-0 outline-none px-2 py-2 text-[13px] text-fg placeholder:text-fg-3 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !accountId || !input.trim()}
                data-testid="coach-send"
                className="btn btn-primary py-2 px-3 shrink-0 rounded-[var(--radius-btn)] disabled:opacity-40"
                aria-label="Send"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </button>
            </div>
            <p className="text-center text-[9px] tracking-[0.2em] text-fg-3 mt-2">
              NOT FINANCIAL ADVICE · REVIEWS YOUR BEHAVIOUR · WEB ANSWERS ARE GENERAL INFO — VERIFY BEFORE ACTING
            </p>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
