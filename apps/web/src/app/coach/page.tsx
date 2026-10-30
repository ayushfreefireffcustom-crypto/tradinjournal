'use client';

// AI Coach — a live chatbot grounded on the user's own trading-journal data, with
// real-time web search for external/current questions. Streams the reply
// token-by-token over SSE, shows a "searching/thinking" state, renders markdown,
// cites web sources, and keeps every conversation in a switchable thread list.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import MarkdownMessage from '@/components/coach/markdown-message';
import SourcesFooter from '@/components/coach/sources-footer';
import ConversationSidebar from '@/components/coach/conversation-sidebar';
import MessageActions from '@/components/coach/message-actions';
import { IHistory, ISend, Thinking } from '@/components/v6/ai/bits';
import { IPlus } from '@/components/v3/icons';
import { useAccounts } from '@/lib/use-accounts';
import { api, type AiChatMessage, type AiConversationSummary, type BrokerAccount } from '@/lib/api';

const STARTERS = [
  { web: false, text: 'What’s my biggest leak right now?' },
  { web: false, text: 'Why do I lose on certain days?' },
  { web: false, text: 'Am I cutting winners too early?' },
  { web: true, text: 'What’s on the economic calendar this week?' },
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
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Live stream controller, so Stop can cut the current reply short.
  const abortRef = useRef<AbortController | null>(null);
  const accountId = selected?.id ?? null;

  // Auto-scroll to the newest message / token.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  // Grow the composer with its content (capped by CSS max-height).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Size the chat to the viewport below the top bar, so the composer stays
  // pinned on screen (and above the phone tab bar).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => el.style.setProperty('--ai-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement.parentElement ?? el.parentElement);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  // Esc closes the history drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

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

  // Error banner retry: re-send an unanswered question, otherwise regenerate the last reply.
  const retry = useCallback(() => {
    if (sending) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    if (last.role === 'user') void runTurn(messages);
    else regenerate();
  }, [sending, messages, runTurn, regenerate]);

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
  const title = conversations.find(c => c.id === conversationId)?.title?.trim() || 'New chat';

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="AI coach" pageSubtitle="Reads your trades and journal, searches the web when it helps">
      <div className="ai-co" ref={rootRef} data-testid="coach-page">
        <ConversationSidebar {...sidebarProps} />

        {sidebarOpen && (
          <div className="x-dialog-scrim ai-drawer" role="dialog" aria-modal="true" aria-label="Conversation history" onMouseDown={e => { if (e.target === e.currentTarget) setSidebarOpen(false); }}>
            <div className="ai-drawer-p"><ConversationSidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} /></div>
          </div>
        )}

        <section className="x-card ai-chat" aria-label="Conversation">
          <div className="ai-chat-hd">
            <button onClick={() => setSidebarOpen(true)} data-testid="coach-history-toggle" className="x-btn x-btn--sm"><IHistory size={14} /> History</button>
            <span className="ai-ell">{title}</span>
            <button onClick={newChat} disabled={sending} className="x-btn x-btn--sm x-btn--icon ai-chat-new" aria-label="New chat"><IPlus size={15} /></button>
          </div>

          <div ref={scrollRef} className="ai-stream" data-testid="coach-messages" aria-live="polite" aria-busy={sending || threadLoading}>
            {threadLoading ? (
              <div className="ai-msgs" aria-hidden>
                <i className="x-skel x-skel--in ai-sk-u" />
                <div className="ai-sk-a">{[0, 1, 2, 3].map(k => <i key={k} className="x-skel x-skel--in" />)}</div>
              </div>
            ) : isEmpty ? (
              <div className="ai-hello" data-testid="coach-empty">
                <span className="ai-av">TL</span>
                <h2>Ask your coach</h2>
                <p>{accountId
                  ? 'I read your closed trades, stats and journal, and can search the web for market context. Ask about your behaviour or what\u2019s happening out there. No trade signals, just clarity.'
                  : 'Connect a broker account first. The coach answers from your own closed trades, so it needs some to read.'}</p>
                {accountId ? (
                  <div className="ai-starters">
                    {STARTERS.map(({ web, text }) => (
                      <button key={text} className="x-tag" onClick={() => send(text)} disabled={sending} data-testid="coach-starter">
                        <i>{web ? 'Web' : 'Your data'}</i>{text}
                      </button>
                    ))}
                  </div>
                ) : <Link href="/brokers" className="x-btn x-btn--hi ai-mt">Connect a broker</Link>}
              </div>
            ) : (
              <div className="ai-msgs">
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  if (m.role === 'user') return <div key={i} className="ai-u" data-testid="coach-msg-user">{m.content}</div>;
                  const streaming = isLast && sending && !!m.content;
                  return (
                    <div key={i} className="ai-a" data-testid="coach-msg-assistant">
                      <span className="ai-av" aria-hidden>TL</span>
                      <div className="ai-a-bd">
                        {m.content ? (
                          <>
                            <div className={streaming ? 'ai-caret-wrap' : undefined}><MarkdownMessage content={m.content} /></div>
                            {m.sources && m.sources.length > 0 && <SourcesFooter sources={m.sources} />}
                          </>
                        ) : <Thinking phase={isLast && phase ? phase : 'thinking'} />}
                        {m.content && (!isLast || !sending) && <MessageActions content={m.content} onRegenerate={isLast ? regenerate : undefined} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="x-banner x-banner--err ai-err" data-testid="coach-error" role="alert">
              <span>{error}</span>
              {messages.length > 0 && !sending && <button type="button" className="x-btn x-btn--sm" onClick={retry} data-testid="coach-retry">Retry</button>}
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); send(input); }} className="ai-form" data-testid="coach-form">
            <div className="ai-comp">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
                rows={1} placeholder={accountId ? 'Ask about your trading, or anything market-related…' : 'Connect a broker to start'}
                disabled={sending || !accountId} data-testid="coach-input" aria-label="Message" />
              {sending ? (
                <button type="button" onClick={stop} data-testid="coach-stop" className="x-btn ai-stop" aria-label="Stop generating"><i /></button>
              ) : (
                <button type="submit" disabled={!accountId || !input.trim()} data-testid="coach-send" className="x-btn x-btn--hi" aria-label="Send"><ISend /></button>
              )}
            </div>
            <p className="ai-fine">Not financial advice.<span> The coach reviews your behaviour; web answers are general info, so verify before acting.</span></p>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
