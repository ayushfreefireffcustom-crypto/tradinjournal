import { describe, it, expect } from 'vitest';
import { extractCompoundSources, type CompoundResponse } from '../search.js';

describe('extractCompoundSources', () => {
  it('pulls {title,url,snippet} from nested tool output objects', () => {
    const json: CompoundResponse = {
      choices: [
        {
          message: {
            content: 'summary',
            executed_tools: [
              {
                output: {
                  results: [
                    { title: 'Gold rallies', url: 'https://example.com/gold', content: 'Gold rose 2%.' },
                    { title: 'FX recap', link: 'https://example.com/fx', snippet: 'EURUSD flat.' },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
    const out = extractCompoundSources(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: 'Gold rallies', url: 'https://example.com/gold', snippet: 'Gold rose 2%.' });
    // `link` is accepted as an alias for url; `snippet` as an alias for content.
    expect(out[1]).toEqual({ title: 'FX recap', url: 'https://example.com/fx', snippet: 'EURUSD flat.' });
  });

  it('parses tool output delivered as a JSON string', () => {
    const json: CompoundResponse = {
      choices: [
        { message: { executed_tools: [{ output: JSON.stringify([{ url: 'https://a.com', title: 'A' }]) }] } },
      ],
    };
    const out = extractCompoundSources(json);
    expect(out).toEqual([{ title: 'A', url: 'https://a.com', snippet: '' }]);
  });

  it('dedupes repeated URLs and falls back to the url as title', () => {
    const json: CompoundResponse = {
      choices: [
        {
          message: {
            executed_tools: [
              { output: [{ url: 'https://dup.com' }, { url: 'https://dup.com', title: 'ignored dup' }] },
            ],
          },
        },
      ],
    };
    const out = extractCompoundSources(json);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: 'https://dup.com', url: 'https://dup.com', snippet: '' });
  });

  it('returns [] when there are no executed tools', () => {
    expect(extractCompoundSources({ choices: [{ message: { content: 'hi' } }] })).toEqual([]);
    expect(extractCompoundSources({})).toEqual([]);
  });
});
