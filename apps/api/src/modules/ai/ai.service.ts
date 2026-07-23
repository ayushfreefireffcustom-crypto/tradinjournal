// AI coach service: assembles the grounded prompt, provides the rule-based
// fallback used when AI is disabled/unavailable, and persists conversations.
// The controller owns the SSE transport; everything domain-shaped lives here.
import { prisma } from '@tradinjournal/db';
import type { TraderContext } from '@tradinjournal/core';
import type { AiChatInput } from '@tradinjournal/contracts';
import { loadTraderContext } from '../../lib/ai/context.js';
import { SYSTEM_PROMPT, contextMessageContent, webResultsMessageContent } from '../../lib/ai/prompts.js';
import type { ChatMessage } from '../../lib/ai/provider.js';
import type { SearchResult } from '../../lib/ai/search.js';
import type { Lane } from '../../lib/ai/router.js';

export { loadTraderContext };

/**
 * Assemble the full message list sent to the provider: system + grounding +
 * (optional) web results + history. The <WEB_RESULTS> block is only inserted when
 * a search actually returned something; personal lanes omit it entirely.
 */
export function buildMessages(
  context: TraderContext,
  history: AiChatInput['messages'],
  webResults?: SearchResult[],
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextMessageContent(context) },
  ];
  if (webResults && webResults.length > 0) {
    messages.push({ role: 'system', content: webResultsMessageContent(webResults) });
  }
  return [...messages, ...history.map(m => ({ role: m.role, content: m.content }))];
}

/** Deterministic reply when the LLM is off — surfaces the rule-based insights. */
export function fallbackReply(context: TraderContext): string {
  if (context.insights.length === 0) {
    return "The AI coach isn't available right now, and I need at least a few closed trades before I can spot patterns. Keep logging your trades and check back.";
  }
  return (
    "The AI coach isn't available right now, but here's what your data already shows:\n\n" +
    context.insights.map(i => `• ${i}`).join('\n')
  );
}

/** Persist one user→assistant turn, creating the conversation on first message. */
export async function persistTurn(params: {
  userId: string;
  brokerAccountId: string;
  conversationId?: string;
  userContent: string;
  assistantContent: string;
  /** Web citations the assistant used, if any — stored on the assistant row. */
  sources?: SearchResult[];
  /** Router lane that produced the reply — stored on the assistant row. */
  lane?: Lane;
}): Promise<string> {
  const { userId, brokerAccountId, conversationId, userContent, assistantContent, sources, lane } = params;

  let convId = conversationId;
  if (convId) {
    // Ensure the conversation exists AND belongs to this user before appending.
    const existing = await prisma.aiConversation.findFirst({ where: { id: convId, userId } });
    if (!existing) convId = undefined;
  }

  if (!convId) {
    const created = await prisma.aiConversation.create({
      data: {
        userId,
        brokerAccountId,
        // First user message becomes the conversation title (trimmed).
        title: userContent.slice(0, 80),
      },
    });
    convId = created.id;
  } else {
    await prisma.aiConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });
  }

  await prisma.aiMessage.createMany({
    data: [
      { conversationId: convId, role: 'user', content: userContent },
      {
        conversationId: convId,
        role: 'assistant',
        content: assistantContent,
        // Only the assistant row carries citations + the lane it was answered in.
        sources: sources && sources.length > 0 ? sources : undefined,
        lane: lane ?? undefined,
      },
    ],
  });

  return convId;
}

export async function listConversations(userId: string) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, brokerAccountId: true, createdAt: true, updatedAt: true },
  });
}

export async function getConversation(userId: string, id: string) {
  return prisma.aiConversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
}

/**
 * Delete one conversation. Ownership is enforced in the WHERE clause, so another
 * user's id simply deletes nothing (reported as not-found by the caller).
 * Messages go with it via the schema's `onDelete: Cascade`.
 */
export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.aiConversation.deleteMany({ where: { id, userId } });
  return count > 0;
}
