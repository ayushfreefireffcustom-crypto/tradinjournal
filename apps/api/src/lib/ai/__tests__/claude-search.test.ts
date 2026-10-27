import { describe, it, expect, vi } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: {} }));
vi.mock('@tradinjournal/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const { claudeSearchResults } = await import('../search.js');

const result = (url: string, title = url) => ({ type: 'web_search_result', url, title, encrypted_content: 'x', page_age: null });
const cite = (url: string, cited_text: string) => ({ type: 'web_search_result_location', url, cited_text, title: null, encrypted_index: 'x' });

describe('claudeSearchResults', () => {
  it('ranks cited sources first and joins their passages without repeats', () => {
    const out = claudeSearchResults({
      content: [
        { type: 'web_search_tool_result', tool_use_id: 't', content: [result('https://a.com', 'A'), result('https://b.com', 'B')] },
        { type: 'text', text: 'x', citations: [cite('https://b.com', 'CPI on Thursday.'), cite('https://b.com', 'CPI on Thursday.'), cite('https://b.com', 'PCE Friday.')] },
      ],
    } as never);
    expect(out.map(r => r.url)).toEqual(['https://b.com', 'https://a.com']);
    expect(out[0]!.snippet).toBe('CPI on Thursday. … PCE Friday.');
    expect(out[1]!.snippet).toBe('');
  });

  it('returns nothing for a search error block', () => {
    const out = claudeSearchResults({
      content: [{ type: 'web_search_tool_result', tool_use_id: 't', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }],
    } as never);
    expect(out).toEqual([]);
  });
});
