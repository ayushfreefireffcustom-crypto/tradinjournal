'use client';

// AI Coach — a live chatbot grounded on the user's own trading-journal data, with
// real-time web search for external/current questions. Streams the reply
// token-by-token over SSE, shows a "searching/thinking" state, renders markdown,
// cites web sources, and keeps every conversation in a switchable thread list.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ChartLineUp, Globe } from '@phosphor-icons/react';
import { SceneDisc } from '@/components/v6/ui/scene-art';
import { ContextChips, ToolsMenu, type ChipId, type ToolResult } from '@/components/coach/coach-tools';
import Link from '@/components/v6/ui/link';
import AppShell from '@/components/app-shell';
import MarkdownMessage from '@/components/coach/markdown-message';
import SourcesFooter from '@/components/coach/sources-footer';
import ConversationSidebar from '@/components/coach/conversation-sidebar';
import MessageActions from '@/components/coach/message-actions';
import { IHistory, ISend, Thinking } from '@/components/v6/ai/bits';
import { IPlus } from '@/components/v6/icons';
import { useDialog } from '@/components/v6/ui/use-dialog';
import { useAccounts } from '@/lib/use-accounts';
import { api, type AiChatMessage, type AiConversationSummary, type BrokerAccount } from '@/lib/api';
import LogoMark from '@/components/logo-mark';

// A reply that sends nothing (no token, no status) for this long is treated as stalled.
const STALL_MS = 60_000;
// Tokens are drawn at most this often; the markdown of a long reply is re-parsed on each draw.
const DRAW_MS = 50;

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
  // H11: data the user hands the coach for the next questions.
  const [chips, setChips] = useState<ChipId[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Live stream controller, so Stop can cut the current reply short.
  const abortRef = useRef<AbortController | null>(null);
  const accountId = selected?.id ?? null;
  // Bumped on every thread or account switch; a reply that lands after a switch is dropped.
  const viewRef = useRef(0);
  // Streaming: tokens collect here and are drawn at most every DRAW_MS.
  const pendingRef = useRef('');
  const drawRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBeatRef = useRef(0);
  const stalledRef = useRef(false);

  // Follow the reply only while the reader is at the bottom; scrolling up to read stops it,
  // and a "Latest" button brings them back.
  const stickRef = useRef(true);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const onStreamScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = near;
    setAwayFromEnd(a => (a === !near ? a : !near));
  }, []);
  const toEnd = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setAwayFromEnd(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useLayoutEffect(() => {
    // The welcome screen starts at the top; a conversation follows its newest line.
    if (!messages.length) scrollRef.current?.scrollTo({ top: 0 });
    else if (stickRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
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
    // Only write when the value changes, and on the next frame: writing inside the observer
    // callback resizes what it observes, which loops ("ResizeObserver loop" warnings, jank).
    let last = '', raf = 0;
    const measure = () => {
      raf = 0;
      const v = `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`;
      if (v !== last) { last = v; el.style.setProperty('--ai-top', v); }
    };
    const fit = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement.parentElement ?? el.parentElement);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // The history drawer on phones: Esc closes it, Tab stays inside, focus returns to the toggle.
  const closeDrawer = useCallback(() => setSidebarOpen(false), []);
  const drawerRef = useDialog({ open: sidebarOpen, onClose: closeDrawer });

  // Never leave a stream running after the page goes away.
  useEffect(() => () => { abortRef.current?.abort(); if (drawRef.current) clearTimeout(drawRef.current); }, []);

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
    const view = ++viewRef.current;
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
          if (!alive || view !== viewRef.current) return;
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
      toEnd(true);

      const view = viewRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      stalledRef.current = false;
      lastBeatRef.current = Date.now();
      pendingRef.current = '';

      // Draw what has arrived so far onto the last (assistant) bubble.
      const draw = () => {
        drawRef.current = null;
        const chunk = pendingRef.current;
        if (!chunk || view !== viewRef.current) return;
        pendingRef.current = '';
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== 'assistant') return prev;
          const next = prev.slice();
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      };
      let first = true;
      const appendToAssistant = (chunk: string) => {
        lastBeatRef.current = Date.now();
        // First token means the answer is streaming — clear the working state.
        if (first) { first = false; setPhase(null); }
        pendingRef.current += chunk;
        if (!drawRef.current) drawRef.current = setTimeout(draw, DRAW_MS);
      };
      const flush = () => { if (drawRef.current) { clearTimeout(drawRef.current); drawRef.current = null; } draw(); };

      // Watchdog: a reply that goes quiet for STALL_MS is stopped, with a retry offered.
      const watch = setInterval(() => {
        if (Date.now() - lastBeatRef.current > STALL_MS) { stalledRef.current = true; controller.abort(); }
      }, 5000);

      try {
        const result = await api.ai.chat(
          { accountId, conversationId, messages: history, ...(regenerate ? { regenerate: true } : {}), ...(chips.length ? { context: chips } : {}) },
          appendToAssistant,
          {
            onError: msg => setError(msg),
            onStatus: () => { lastBeatRef.current = Date.now(); setPhase('searching'); },
            signal: controller.signal,
          },
        );
        flush();
        // Switched thread or account while this was streaming: leave the new view alone.
        if (view !== viewRef.current) return;
        if (stalledRef.current) setError('The coach stopped responding. Try again.');

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
        flush();
        if (view !== viewRef.current) return;
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
        clearInterval(watch);
        if (abortRef.current === controller) abortRef.current = null;
        setSending(false);
        setPhase(null);
      }
    },
    [accountId, sending, conversationId, loadThreads, chips, toEnd],
  );

  // A tool's result joins the conversation and is saved with it.
  const addToolResult = useCallback(async (r: ToolResult) => {
    if (!accountId) return;
    setMessages(prev => [...prev, { role: 'user', content: r.user }, { role: 'assistant', content: r.assistant }]);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/ai/tool-turn`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, conversationId, user: r.user, assistant: r.assistant }) });
      const j = (await res.json()) as { data?: { conversationId: string } };
      if (j.data?.conversationId) setConversationId(j.data.conversationId);
      void loadThreads();
    } catch { /* shown already; saving is best-effort */ }
  }, [accountId, conversationId, loadThreads]);

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
      const view = ++viewRef.current;
      setThreadLoading(true);
      setError('');
      try {
        const detail = await api.ai.conversation(id);
        if (view !== viewRef.current) return;
        setConversationId(detail.id);
        setMessages(detail.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
        stickRef.current = true;
      } catch {
        if (view === viewRef.current) setError('Could not open that conversation.');
      } finally {
        if (view === viewRef.current) setThreadLoading(false);
      }
    },
    [sending, conversationId],
  );

  const newChat = useCallback(() => {
    setSidebarOpen(false);
    if (sending) return;
    viewRef.current++;
    setThreadLoading(false);
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
        viewRef.current++;
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
      pageTitle="AI coach" pageSubtitle="Ask about your trading">
      <div className="ai-co" ref={rootRef} data-testid="coach-page">
        <ConversationSidebar {...sidebarProps} />

        {sidebarOpen && (
          <div ref={drawerRef} className="x-dialog-scrim ai-drawer" role="dialog" aria-modal="true" aria-label="Conversation history" onMouseDown={e => { if (e.target === e.currentTarget) setSidebarOpen(false); }}>
            <div className="ai-drawer-p"><ConversationSidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} /></div>
          </div>
        )}

        <section className="x-card ai-chat" aria-label="Conversation">
          <div className="ai-chat-hd">
            <button onClick={() => setSidebarOpen(true)} data-testid="coach-history-toggle" className="x-btn x-btn--sm"><IHistory size={14} /> History</button>
            <span className="ai-ell">{title}</span>
            <button onClick={newChat} disabled={sending} className="x-btn x-btn--sm x-btn--icon ai-chat-new" aria-label="New chat"><IPlus size={15} /></button>
          </div>

          <div ref={scrollRef} onScroll={onStreamScroll} className="ai-stream" data-testid="coach-messages" aria-live="polite" aria-busy={sending || threadLoading}>
            {threadLoading ? (
              <div className="ai-msgs" aria-hidden>
                <i className="x-skel x-skel--in ai-sk-u" />
                <div className="ai-sk-a">{[0, 1, 2, 3].map(k => <i key={k} className="x-skel x-skel--in" />)}</div>
              </div>
            ) : isEmpty ? (
              <div className="ai-hello" data-testid="coach-empty">
                <SceneDisc kind={accountId ? 'chat' : 'plug'} size="sm" />
                <h2>{accountId ? 'Ask your coach' : 'Connect a broker to start'}</h2>
                <p>{accountId
                  ? 'I read your closed trades, stats and journal, and can search the web for market context. No trade signals, just clarity.'
                  : 'The coach answers from your own closed trades, so it needs a connected account to read.'}</p>
                {accountId ? (
                  <div className="ai-starters">
                    {STARTERS.map(({ web, text }) => (
                      <button key={text} type="button" className="ai-starter" onClick={() => send(text)} disabled={sending} data-testid="coach-starter">
                        <span className="ai-starter-i" aria-hidden>{web ? <Globe size={16} /> : <ChartLineUp size={16} />}</span>
                        <span><b>{text}</b><small>{web ? 'Searches the web' : 'From your trades'}</small></span>
                      </button>
                    ))}
                  </div>
                ) : <Link href="/brokers" className="x-btn x-btn--hi ai-mt">Connect a broker</Link>}
              </div>
            ) : (
              <div className="ai-msgs">
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  return <MessageRow key={i} m={m} streaming={isLast && sending} phase={isLast ? phase : null} onRegenerate={isLast && !sending ? regenerate : undefined} />;
                })}
              </div>
            )}
          </div>
          {awayFromEnd && !isEmpty && !threadLoading && (
            <button type="button" className="x-btn x-btn--sm ai-latest" onClick={() => toEnd(true)} data-testid="coach-latest"><ArrowDown size={13} weight="bold" aria-hidden />{sending ? 'Follow the reply' : 'Latest'}</button>
          )}

          {error && (
            <div className="x-banner x-banner--err ai-err" data-testid="coach-error" role="alert">
              <span>{error}</span>
              {messages.length > 0 && !sending && <button type="button" className="x-btn x-btn--sm" onClick={retry} data-testid="coach-retry">Retry</button>}
            </div>
          )}

          <form onSubmit={e => { e.preventDefault(); send(input); }} className="ai-form" data-testid="coach-form">
            {accountId && (
              <div className="ai-extras">
                <ContextChips selected={chips} onChange={setChips} disabled={sending} />
                <ToolsMenu disabled={sending} onResult={r => void addToolResult(r)} />
              </div>
            )}
            <div className="ai-comp">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
                rows={1} placeholder={!accountId ? 'Connect a broker to start' : sending ? 'Type your next question…' : 'Ask about your trading, or anything market-related…'}
                disabled={!accountId} data-testid="coach-input" aria-label="Message" />
              {sending ? (
                <button type="button" onClick={stop} data-testid="coach-stop" className="x-btn ai-stop" aria-label="Stop generating"><i /></button>
              ) : (
                <button type="submit" disabled={!accountId || !input.trim()} data-testid="coach-send" className="x-btn x-btn--hi" aria-label="Send"><ISend /></button>
              )}
            </div>
            <p className="ai-fine">Not financial advice.</p>
          </form>
        </section>
      </div>
    </AppShell>
  );
}

/** One message. Memoised, so while a reply streams only the last row re-renders. */
const MessageRow = memo(function MessageRow({ m, streaming, phase, onRegenerate }: { m: AiChatMessage; streaming: boolean; phase: Phase; onRegenerate?: () => void }) {
  if (m.role === 'user') return <div className="ai-u" data-testid="coach-msg-user">{m.content}</div>;
  return (
    <div className="ai-a" data-testid="coach-msg-assistant">
      <span className="ai-av" aria-hidden><LogoMark size={20} title="" /></span>
      <div className="ai-a-bd">
        {m.content ? (
          <>
            <div className={streaming ? 'ai-caret-wrap' : undefined}><MarkdownMessage content={m.content} /></div>
            {m.sources && m.sources.length > 0 && <SourcesFooter sources={m.sources} />}
          </>
        ) : <Thinking phase={phase ?? 'thinking'} />}
        {m.content && !streaming && <MessageActions content={m.content} onRegenerate={onRegenerate} />}
      </div>
    </div>
  );
});
