'use client';

// AI Coach — a live chatbot grounded on the user's own trading-journal data, with
// real-time web search for external/current questions. Streams the reply
// token-by-token over SSE, shows a "searching/thinking" state, renders markdown,
// cites web sources, and keeps every conversation in a switchable thread list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Robot, PaperPlaneRight, Sparkle, Globe, Stop, ClockCounterClockwise } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import MarkdownMessage from '@/components/coach/markdown-message';
import ThinkingIndicator from '@/components/coach/thinking-indicator';
import SourcesFooter from '@/components/coach/sources-footer';
import ConversationSidebar from '@/components/coach/conversation-sidebar';
import MessageActions from '@/components/coach/message-actions';
import { useAccounts } from '@/lib/use-accounts';
import { api, type AiChatMessage, type AiConversationSummary, type BrokerAccount } from '@/lib/api';

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
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<Phase>(null);
  const [error, setError] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Live stream controller, so Stop can cut the current reply short.
  const abortRef = useRef<AbortController | null>(null);
  const accountId = selected?.id ?? null;

  // Auto-scroll to the newest message / token.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  // Never leave a stream running after the page goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadThreads = useCallback(async (): Promise<AiConversationSummary[]> => {
    if (!accountId) return [];
    try {
      const all = await api.ai.conversations();
      const mine = all.filter(c => c.brokerAccountId === accountId);
      setConversations(mine);
      return mine;
    } catch {
      return [];
    }
  }, [accountId]);

  // On account switch: reload the thread list and open the most recent one.
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setListLoading(true);
    setThreadLoading(true);
    setMessages([]);
    setConversations([]);
    setConversationId(undefined);
    setError('');
    (async () => {
      try {
        const all = await api.ai.conversations();
        if (!alive) return;
        const mine = all.filter(c => c.brokerAccountId === accountId);
        setConversations(mine);
        const latest = mine[0];
        if (latest) {
          const detail = await api.ai.conversation(latest.id);
          if (!alive) return;
          setConversationId(detail.id);
          setMessages(detail.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
        }
      } catch {
        // No history is fine — start fresh.
      } finally {
        if (alive) {
          setListLoading(false);
          setThreadLoading(false);
        }
      }
    })();
    return () => { alive = false; };
  }, [accountId]);

  /**
   * Run one turn: `history` ends with the user message being answered. `regenerate`
   * tells the API to replace the previous turn instead of appending a new one.
   */
  const runTurn = useCallback(
    async (history: AiChatMessage[], regenerate = false) => {
      if (!accountId || sending) return;

      setError('');
      // Optimistically render the history + an empty assistant bubble to fill.
      setMessages([...history, { role: 'assistant', content: '' }]);
      setSending(true);
      setPhase('thinking');

      const controller = new AbortController();
      abortRef.current = controller;

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
          { accountId, conversationId, messages: history, ...(regenerate ? { regenerate: true } : {}) },
          appendToAssistant,
          {
            onError: msg => setError(msg),
            onStatus: () => setPhase('searching'),
            signal: controller.signal,
          },
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
        // Drop the placeholder bubble when Stop landed before the first token.
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant' && last.content === '') next.pop();
          return next;
        });

        const threads = await loadThreads();
        // A stopped first turn never receives the `done` event carrying the new
        // conversation id — adopt the freshest thread so the next message
        // continues it instead of starting a duplicate.
        if (!result.conversationId && !conversationId) {
          const newest = threads[0];
          if (newest) setConversationId(newest.id);
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
        abortRef.current = null;
        setSending(false);
        setPhase(null);
      }
    },
    [accountId, sending, conversationId, loadThreads],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || sending || !accountId) return;
      setInput('');
      void runTurn([...messages, { role: 'user', content }]);
    },
    [messages, sending, accountId, runTurn],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Re-run the last question. Trims back to that user message so the replaced
  // reply never becomes part of the prompt.
  const regenerate = useCallback(() => {
    if (sending) return;
    const idx = messages.map(m => m.role).lastIndexOf('user');
    if (idx === -1) return;
    void runTurn(messages.slice(0, idx + 1), Boolean(conversationId));
  }, [sending, messages, conversationId, runTurn]);

  const openThread = useCallback(
    async (id: string) => {
      setSidebarOpen(false);
      if (sending || id === conversationId) return;
      setThreadLoading(true);
      setError('');
      try {
        const detail = await api.ai.conversation(id);
        setConversationId(detail.id);
        setMessages(detail.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
      } catch {
        setError('Could not open that conversation.');
      } finally {
        setThreadLoading(false);
      }
    },
    [sending, conversationId],
  );

  const newChat = useCallback(() => {
    setSidebarOpen(false);
    if (sending) return;
    setConversationId(undefined);
    setMessages([]);
    setInput('');
    setError('');
  }, [sending]);

  const deleteThread = useCallback(
    async (id: string) => {
      if (sending) return;
      // Optimistic: the row disappears immediately, and we resync if the API says no.
      setConversations(prev => prev.filter(c => c.id !== id));
      if (id === conversationId) {
        setConversationId(undefined);
        setMessages([]);
      }
      try {
        await api.ai.deleteConversation(id);
      } catch {
        setError('Could not delete that conversation.');
        void loadThreads();
      }
    },
    [sending, conversationId, loadThreads],
  );

  const isEmpty = messages.length === 0;
  const sidebarProps = {
    conversations,
    activeId: conversationId,
    loading: listLoading,
    busy: sending,
    onSelect: (id: string) => void openThread(id),
    onNew: newChat,
    onDelete: (id: string) => void deleteThread(id),
  };

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="AI Coach"
      pageSubtitle="// TRAINED ON YOUR DATA"
    >
      <div className="flex h-full min-h-0" data-testid="coach-page">
        {/* Thread list — fixed column from lg up */}
        <div className="hidden lg:flex w-60 shrink-0 border-r border-border-soft">
          <ConversationSidebar {...sidebarProps} />
        </div>

        {/* Thread list — slide-in drawer below lg */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex" role="dialog" aria-label="Conversation history">
            <button
              className="absolute inset-0 bg-black/55"
              aria-label="Close history"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative w-[78%] max-w-[290px] h-full bg-app border-r border-border-strong">
              <ConversationSidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        )}

        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="lg:hidden flex items-center gap-2 px-3 py-2 border-b border-border-soft">
            <button
              onClick={() => setSidebarOpen(true)}
              data-testid="coach-history-toggle"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-border-soft px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-fg-2 hover:text-fg hover:border-profit/40 transition-colors"
            >
              <ClockCounterClockwise size={12} weight="bold" />
              History
            </button>
            <span className="truncate text-[11px] text-fg-3">
              {conversations.find(c => c.id === conversationId)?.title?.trim() ?? 'New chat'}
            </span>
          </div>

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
                  {threadLoading
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
                            {/* Hidden only on the reply currently streaming. */}
                            {(!isLast || !sending) && (
                              <MessageActions content={m.content} onRegenerate={isLast ? regenerate : undefined} />
                            )}
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
                {sending ? (
                  <button
                    type="button"
                    onClick={stop}
                    data-testid="coach-stop"
                    className="btn py-2 px-3 shrink-0 rounded-[var(--radius-btn)] border border-border-strong text-fg-2 hover:text-fg hover:border-loss/50 transition-colors"
                    aria-label="Stop generating"
                  >
                    <Stop size={15} weight="fill" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!accountId || !input.trim()}
                    data-testid="coach-send"
                    className="btn btn-primary py-2 px-3 shrink-0 rounded-[var(--radius-btn)] disabled:opacity-40"
                    aria-label="Send"
                  >
                    <PaperPlaneRight size={15} weight="fill" />
                  </button>
                )}
              </div>
              <p className="text-center text-[9px] tracking-[0.2em] text-fg-3 mt-2">
                NOT FINANCIAL ADVICE · REVIEWS YOUR BEHAVIOUR · WEB ANSWERS ARE GENERAL INFO — VERIFY BEFORE ACTING
              </p>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
