import { describe, it, expect } from 'vitest';
import { routeQuery } from '../router.js';
import type { AiCallOptions, AiProvider } from '../provider.js';

// A stub provider whose json() returns the scripted reply parsed (or throws), so
// we exercise routeQuery's validation + fail-safe behaviour without a model.
function stubProvider(reply: string | Error, seen: AiCallOptions[] = []): AiProvider {
  return {
    model: 'stub',
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<string> {
      throw new Error('not used');
    },
    async complete(): Promise<string> {
      throw new Error('not used');
    },
    async json(_messages, _schema, opts): Promise<unknown> {
      seen.push(opts ?? {});
      if (reply instanceof Error) throw reply;
      return JSON.parse(reply);
    },
  };
}

describe('routeQuery', () => {
  it('returns personal (no search query) for own-history questions', async () => {
    const r = await routeQuery('why do I lose on Fridays?', stubProvider('{"lane":"personal","searchQuery":""}'));
    expect(r.lane).toBe('personal');
    expect(r.searchQuery).toBe('');
  });

  it('returns web with a focused search query for external questions', async () => {
    const r = await routeQuery(
      "what's on the economic calendar this week?",
      stubProvider('{"lane":"web","searchQuery":"economic calendar this week high impact events"}'),
    );
    expect(r.lane).toBe('web');
    expect(r.searchQuery).toContain('economic calendar');
  });

  it('returns hybrid when both are needed', async () => {
    const r = await routeQuery(
      'given my NFP losses, what is coming up this week?',
      stubProvider('{"lane":"hybrid","searchQuery":"NFP economic calendar this week"}'),
    );
    expect(r.lane).toBe('hybrid');
    expect(r.searchQuery).toContain('calendar');
  });

  it('routes on the fast tier with reasoning off', async () => {
    const seen: AiCallOptions[] = [];
    await routeQuery('q', stubProvider('{"lane":"personal","searchQuery":""}', seen));
    expect(seen[0]).toMatchObject({ tier: 'fast', thinking: false });
  });

  it('falls back to the raw question when a web lane has no query', async () => {
    const r = await routeQuery('what happened to gold?', stubProvider('{"lane":"web","searchQuery":""}'));
    expect(r.lane).toBe('web');
    expect(r.searchQuery).toBe('what happened to gold?');
  });

  it('defaults to personal on malformed output', async () => {
    expect((await routeQuery('q', stubProvider('not json at all'))).lane).toBe('personal');
    expect((await routeQuery('q', stubProvider('{"lane":"nonsense"}'))).lane).toBe('personal');
  });

  it('defaults to personal when the router throws (timeout/abort)', async () => {
    const r = await routeQuery('q', stubProvider(new Error('aborted')));
    expect(r).toEqual({ lane: 'personal', searchQuery: '' });
  });

  it('returns personal for empty input without calling the model', async () => {
    const r = await routeQuery('   ', stubProvider(new Error('should not be called')));
    expect(r.lane).toBe('personal');
  });
});
