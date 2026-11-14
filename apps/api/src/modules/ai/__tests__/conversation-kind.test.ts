import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiChatSchema } from '@tradinjournal/contracts';

const conv = vi.hoisted(() => ({ create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() }));
const msg = vi.hoisted(() => ({ createMany: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() }));
vi.mock('@tradinjournal/db', () => ({ prisma: { aiConversation: conv, aiMessage: msg } }));
vi.mock('../../../lib/ai/context.js', () => ({ loadTraderContext: vi.fn() }));
vi.mock('../../../lib/ai/prompts.js', () => ({ SYSTEM_PROMPT: '', contextMessageContent: () => '', webResultsMessageContent: () => '' }));
const warn = vi.hoisted(() => vi.fn());
vi.mock('@tradinjournal/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));

const svc = await import('../ai.service.js');
const colMissing = () => Object.assign(new Error('The column `ai_conversation.kind` does not exist in the current database.'), { code: 'P2022' });

beforeEach(() => { vi.clearAllMocks(); svc.resetKindWarning(); conv.create.mockResolvedValue({ id: 'c1' }); msg.createMany.mockResolvedValue({ count: 2 }); });

describe('conversation kinds', () => {
  it('chat input accepts explain | ask | draft only', () => {
    const base = { accountId: 'a', messages: [{ role: 'user', content: 'hi' }] };
    for (const kind of ['explain', 'ask', 'draft']) expect(aiChatSchema.safeParse({ ...base, kind }).success).toBe(true);
    expect(aiChatSchema.safeParse({ ...base, kind: 'other' }).success).toBe(false);
    expect(aiChatSchema.safeParse(base).success).toBe(true);
  });
  it('a new kinded conversation stores the kind', async () => {
    await svc.persistTurn({ userId: 'u', brokerAccountId: 'a', userContent: 'Explain: leaks', assistantContent: 'x', kind: 'explain' });
    expect(conv.create).toHaveBeenCalledWith({ data: { userId: 'u', brokerAccountId: 'a', title: 'Explain: leaks', kind: 'explain' } });
  });
  it('normal coach chats have no kind', async () => {
    await svc.persistTurn({ userId: 'u', brokerAccountId: 'a', userContent: 'hello', assistantContent: 'x' });
    expect(conv.create).toHaveBeenCalledWith({ data: { userId: 'u', brokerAccountId: 'a', title: 'hello' } });
  });
  it('column missing → saved like today, warned once', async () => {
    conv.create.mockRejectedValueOnce(colMissing()).mockResolvedValueOnce({ id: 'c2' }).mockRejectedValueOnce(colMissing()).mockResolvedValue({ id: 'c3' });
    expect(await svc.persistTurn({ userId: 'u', brokerAccountId: 'a', userContent: 'q', assistantContent: 'x', kind: 'ask' })).toBe('c2');
    expect(conv.create).toHaveBeenLastCalledWith({ data: { userId: 'u', brokerAccountId: 'a', title: 'q' } });
    await svc.persistTurn({ userId: 'u', brokerAccountId: 'a', userContent: 'q', assistantContent: 'x', kind: 'draft' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('other create errors still throw', async () => {
    conv.create.mockRejectedValue(new Error('boom'));
    await expect(svc.persistTurn({ userId: 'u', brokerAccountId: 'a', userContent: 'q', assistantContent: 'x', kind: 'ask' })).rejects.toThrow('boom');
  });
  it('the coach list excludes kinded conversations', async () => {
    conv.findMany.mockResolvedValue([{ id: 'c' }]);
    expect(await svc.listConversations('u')).toEqual([{ id: 'c' }]);
    expect(conv.findMany.mock.calls[0]![0].where).toEqual({ userId: 'u', kind: null });
  });
  it('column missing → the list falls back to every conversation', async () => {
    conv.findMany.mockRejectedValueOnce(colMissing()).mockResolvedValue([{ id: 'c' }, { id: 'd' }]);
    expect(await svc.listConversations('u')).toHaveLength(2);
    expect(conv.findMany.mock.calls[1]![0].where).toEqual({ userId: 'u' });
  });
});
