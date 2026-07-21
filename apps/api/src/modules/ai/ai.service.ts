// AI coach service: assembles the grounded prompt, provides the rule-based
// fallback used when AI is disabled/unavailable, and persists conversations.
// The controller owns the SSE transport; everything domain-shaped lives here.
import { prisma } from '@tradinjournal/db';
import type { TraderContext } from '@tradinjournal/core';
import type { AiChatInput } from '@tradinjournal/contracts';
import { loadTraderContext } from '../../lib/ai/context.js';
import { SYSTEM_PROMPT, contextMessageContent } from '../../lib/ai/prompts.js';
import type { ChatMessage } from '../../lib/ai/provider.js';

export { loadTraderContext };

/** Assemble the full message list sent to the provider: system + grounding + history. */
export function buildMessages(context: TraderContext, history: AiChatInput['messages']): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextMessageContent(context) },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];
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
}): Promise<string> {
  const { userId, brokerAccountId, conversationId, userContent, assistantContent } = params;

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
      { conversationId: convId, role: 'assistant', content: assistantContent },
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
