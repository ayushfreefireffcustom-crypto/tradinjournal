import { describe, it, expect } from 'vitest';
import { classifyLane } from '../router.js';
import type { AiProvider, ChatMessage } from '../provider.js';

// A stub provider whose complete() returns a scripted string (or throws), so we
// exercise classifyLane's parsing + fail-safe behaviour without hitting a model.
function stubProvider(reply: string | Error): AiProvider {
  return {
    model: 'stub',
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<string> {
      throw new Error('not used');
    },
    async complete(_messages: ChatMessage[]): Promise<string> {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

describe('classifyLane', () => {
  it('returns personal for own-history questions', async () => {
    const lane = await classifyLane('why do I lose on Fridays?', stubProvider('{"lane":"personal"}'));
    expect(lane).toBe('personal');
  });

  it('returns web for external/current-fact questions', async () => {
    const lane = await classifyLane("what's on the economic calendar this week?", stubProvider('{"lane":"web"}'));
    expect(lane).toBe('web');
  });

  it('returns hybrid when both are needed', async () => {
    const lane = await classifyLane('given my NFP losses, what is coming up this week?', stubProvider('{"lane":"hybrid"}'));
    expect(lane).toBe('hybrid');
  });

  it('tolerates code fences / surrounding prose', async () => {
    const lane = await classifyLane('q', stubProvider('Sure!\n```json\n{"lane":"web"}\n```'));
    expect(lane).toBe('web');
  });

  it('defaults to personal on malformed output', async () => {
    expect(await classifyLane('q', stubProvider('not json at all'))).toBe('personal');
    expect(await classifyLane('q', stubProvider('{"lane":"nonsense"}'))).toBe('personal');
  });

  it('defaults to personal when the classifier throws (timeout/abort)', async () => {
    const lane = await classifyLane('q', stubProvider(new Error('aborted')));
    expect(lane).toBe('personal');
  });

  it('returns personal for empty input without calling the model', async () => {
    const lane = await classifyLane('   ', stubProvider(new Error('should not be called')));
    expect(lane).toBe('personal');
  });
});
